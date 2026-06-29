import { zonedDate } from "../tasks/schedule.js";
import type { MemoryConfig } from "./config.js";

export interface MemorySchedulerDeps {
  /** Polling interval in ms (default 15 min). */
  tickMs?: number;
  timezone: string;
  getConfig: () => Promise<MemoryConfig>;
  /** Skip while the message queue is busy. */
  getQueueSize: () => number;
  /** Run one full consolidation pass over all entities with pending entries. */
  consolidate: () => Promise<{ entities: number; changed: number; consumed: number }>;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
  logEventError?: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

/** Current wall-clock hour (0–23) in `timeZone`. */
function zonedHour(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  return Number(
    dtf.formatToParts(instant).find((p) => p.type === "hour")?.value ?? "0",
  );
}

/**
 * Daily memory-consolidation scheduler. Polls on an interval; once per local day
 * (after the configured hour, while the message queue is idle) it folds every
 * entity's pending `memory_entry` notes into its embedded `memory` record.
 */
export function createMemoryScheduler(deps: MemorySchedulerDeps) {
  const tickMs = deps.tickMs ?? 15 * 60_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let lastRunDate: string | null = null;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const config = await deps.getConfig();
      if (!config.enabled) return;
      if (deps.getQueueSize() > 0) return;

      const now = new Date();
      if (zonedHour(now, deps.timezone) < config.runHour) return;

      const today = dateStr(zonedDate(now, deps.timezone));
      if (lastRunDate === today) return;

      try {
        const result = await deps.consolidate();
        lastRunDate = today;
        deps.logEvent?.("memory_consolidation_done", {
          date: today,
          entities: result.entities,
          changed: result.changed,
          consumed: result.consumed,
        });
      } catch (err) {
        deps.logEventError?.("memory_consolidation_failed", err, { date: today });
      }
    } catch (err) {
      deps.logEventError?.("memory_consolidation_tick_failed", err);
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      deps.logEvent?.("memory_scheduler_started", { tickMs });
      timer = setInterval(() => void tick(), tickMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    /** Run one tick immediately (used by tests / manual trigger). */
    runOnce(): Promise<void> {
      return tick();
    },
  };
}

export type MemoryScheduler = ReturnType<typeof createMemoryScheduler>;
