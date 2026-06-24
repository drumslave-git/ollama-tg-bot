import { computeNextRun, type TaskSchedule } from "./schedule.js";
import type { TaskRecord } from "./db/tasks.js";

export interface TaskSchedulerDeps {
  /** Polling interval in ms (default 30s). */
  tickMs?: number;
  timezone: string;
  /** Whether firing is currently allowed (e.g. false during maintenance mode). */
  canFire: () => boolean;
  listDueTasks: (nowIso: string) => TaskRecord[];
  fireTask: (task: TaskRecord) => Promise<boolean>;
  markTaskRun: (id: number, lastRunAt: string, nextRunAt: string) => void;
  /** Remove a task that has no future run (a fired one-shot). */
  removeTask: (id: number) => void;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
  logEventError?: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

function scheduleOf(task: TaskRecord): TaskSchedule {
  return {
    scheduleKind: task.scheduleKind,
    timeOfDay: task.timeOfDay,
    weekdays: task.weekdays,
    runDate: task.runDate,
  };
}

/**
 * Wall-clock task scheduler. Independent of the message queue: it polls for due
 * tasks on a fixed interval, fires each, then advances `next_run_at` (a spent
 * `once` task gets `null`, which disables it).
 */
export function createTaskScheduler(deps: TaskSchedulerDeps) {
  const tickMs = deps.tickMs ?? 30_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return; // skip overlapping ticks (a slow LLM fire)
    running = true;
    try {
      if (!deps.canFire()) return;
      const nowIso = new Date().toISOString();
      const due = deps.listDueTasks(nowIso);
      for (const task of due) {
        try {
          await deps.fireTask(task);
        } catch (err) {
          deps.logEventError?.("task_fire_failed", err, { taskId: task.id });
        }
        // Advance regardless of fire success so a failing task doesn't busy-loop.
        const next = computeNextRun(scheduleOf(task), new Date(), deps.timezone);
        if (next === null) {
          // No future run (a spent one-shot) — remove it rather than leave a
          // disabled row behind.
          deps.removeTask(task.id);
        } else {
          deps.markTaskRun(task.id, nowIso, next);
        }
      }
    } catch (err) {
      deps.logEventError?.("task_scheduler_tick_failed", err);
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      deps.logEvent?.("task_scheduler_started", { tickMs });
      timer = setInterval(() => void tick(), tickMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    /** Run one tick immediately (used by tests). */
    runOnce(): Promise<void> {
      return tick();
    },
  };
}

export type TaskScheduler = ReturnType<typeof createTaskScheduler>;
