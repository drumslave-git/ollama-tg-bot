import { config } from "../config/index.js";
import { getSettings } from "../db/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import {
  computeNextRun,
  createTaskScheduler,
  fireTask,
  type TaskScheduler,
} from "../features/tasks/index.js";
import {
  listDueTasks,
  listTasks,
  markTaskRun,
  retimeTask,
} from "../features/tasks/db/index.js";

let scheduler: TaskScheduler | null = null;

/**
 * Re-pin every enabled task to the current `TZ` and recompute its next run.
 * Self-heals tasks created under a different timezone (e.g. before `TZ` was set)
 * so they fire at the intended wall-clock time without manual recreation.
 */
function reconcileTaskTimezones(): void {
  for (const task of listTasks()) {
    if (!task.enabled) continue;
    if (task.timezone === config.timezone) continue;
    const nextRunAt = computeNextRun(
      {
        scheduleKind: task.scheduleKind,
        timeOfDay: task.timeOfDay,
        weekdays: task.weekdays,
        runDate: task.runDate,
      },
      new Date(),
      config.timezone,
    );
    retimeTask(task.id, config.timezone, nextRunAt);
    logEvent("task_timezone_reconciled", {
      taskId: task.id,
      from: task.timezone,
      to: config.timezone,
      nextRunAt,
    });
  }
}

/** Start the wall-clock task scheduler. Called once at startup. */
export function startTaskScheduler(): void {
  if (scheduler) return;
  reconcileTaskTimezones();
  scheduler = createTaskScheduler({
    timezone: config.timezone,
    // Tasks are owner-driven proactive messages; pause them in maintenance mode.
    canFire: () => !getSettings().maintenanceModeEnabled,
    listDueTasks,
    fireTask,
    markTaskRun,
    logEvent: (event, fields) => logEvent(event, fields as never),
    logEventError: (event, err, fields) =>
      logEventError(event, err, fields as never),
  });
  scheduler.start();
}

export function stopTaskScheduler(): void {
  scheduler?.stop();
  scheduler = null;
}
