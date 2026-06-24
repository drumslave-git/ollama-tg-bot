import { config } from "../../config/index.js";
import {
  computeNextRun,
  describeSchedule,
  normalizeTimeOfDay,
  normalizeWeekdays,
  parseRunDate,
  type ScheduleKind,
  type TaskSchedule,
} from "./schedule.js";
import {
  createTask,
  deleteTask,
  getTaskById,
  updateTask,
  type TaskRecord,
} from "./db/tasks.js";
import { deleteTaskMessages } from "./db/task-messages.js";

/** Raised on invalid schedule input; callers surface the message to the user. */
export class TaskValidationError extends Error {}

const SCHEDULE_KINDS: ScheduleKind[] = ["once", "daily", "weekly"];

export interface CreateTaskParams {
  chatId: number;
  messageThreadId?: number | null;
  entityId: string;
  createdByUserId: string;
  instruction: string;
  scheduleKind: ScheduleKind;
  timeOfDay: string;
  weekdays?: number[] | null;
  runDate?: string | null;
  enabled?: boolean;
}

export interface UpdateTaskParams {
  instruction?: string;
  scheduleKind?: ScheduleKind;
  timeOfDay?: string;
  weekdays?: number[] | null;
  runDate?: string | null;
  enabled?: boolean;
}

interface NormalizedSchedule {
  scheduleKind: ScheduleKind;
  timeOfDay: string;
  weekdays: number[] | null;
  runDate: string | null;
}

function normalizeSchedule(input: {
  scheduleKind: ScheduleKind;
  timeOfDay: string;
  weekdays?: number[] | null;
  runDate?: string | null;
}): NormalizedSchedule {
  if (!SCHEDULE_KINDS.includes(input.scheduleKind)) {
    throw new TaskValidationError(
      `schedule_kind must be one of: ${SCHEDULE_KINDS.join(", ")}`,
    );
  }
  const timeOfDay = normalizeTimeOfDay(input.timeOfDay ?? "");
  if (!timeOfDay) {
    throw new TaskValidationError("time must be in HH:MM 24-hour form");
  }

  if (input.scheduleKind === "weekly") {
    const weekdays = normalizeWeekdays(input.weekdays ?? []);
    if (weekdays.length === 0) {
      throw new TaskValidationError(
        "weekly tasks need at least one weekday (0=Sunday .. 6=Saturday)",
      );
    }
    return { scheduleKind: "weekly", timeOfDay, weekdays, runDate: null };
  }

  if (input.scheduleKind === "once") {
    if (!input.runDate || !parseRunDate(input.runDate)) {
      throw new TaskValidationError("once tasks need a date in YYYY-MM-DD form");
    }
    return {
      scheduleKind: "once",
      timeOfDay,
      weekdays: null,
      runDate: input.runDate.trim(),
    };
  }

  return { scheduleKind: "daily", timeOfDay, weekdays: null, runDate: null };
}

function computeNext(schedule: NormalizedSchedule): string | null {
  const spec: TaskSchedule = {
    scheduleKind: schedule.scheduleKind,
    timeOfDay: schedule.timeOfDay,
    weekdays: schedule.weekdays,
    runDate: schedule.runDate,
  };
  return computeNextRun(spec, new Date(), config.timezone);
}

export function createTaskValidated(params: CreateTaskParams): TaskRecord {
  const instruction = params.instruction.trim();
  if (instruction.length < 2) {
    throw new TaskValidationError("instruction is required");
  }
  const schedule = normalizeSchedule(params);
  const nextRunAt = computeNext(schedule);
  if (schedule.scheduleKind === "once" && !nextRunAt) {
    throw new TaskValidationError("that date and time is already in the past");
  }

  return createTask({
    chatId: params.chatId,
    messageThreadId: params.messageThreadId ?? null,
    entityId: params.entityId,
    createdByUserId: params.createdByUserId,
    instruction,
    scheduleKind: schedule.scheduleKind,
    timeOfDay: schedule.timeOfDay,
    weekdays: schedule.weekdays,
    runDate: schedule.runDate,
    timezone: config.timezone,
    enabled: params.enabled,
    nextRunAt,
  });
}

export function updateTaskValidated(
  id: number,
  patch: UpdateTaskParams,
): TaskRecord | null {
  const current = getTaskById(id);
  if (!current) return null;

  const schedule = normalizeSchedule({
    scheduleKind: patch.scheduleKind ?? current.scheduleKind,
    timeOfDay: patch.timeOfDay ?? current.timeOfDay,
    weekdays: patch.weekdays !== undefined ? patch.weekdays : current.weekdays,
    runDate: patch.runDate !== undefined ? patch.runDate : current.runDate,
  });

  const enabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
  const nextRunAt = enabled ? computeNext(schedule) : null;
  if (enabled && schedule.scheduleKind === "once" && !nextRunAt) {
    throw new TaskValidationError("that date and time is already in the past");
  }

  const instruction =
    patch.instruction !== undefined ? patch.instruction.trim() : current.instruction;
  if (instruction.length < 2) {
    throw new TaskValidationError("instruction is required");
  }

  return updateTask(id, {
    instruction,
    scheduleKind: schedule.scheduleKind,
    timeOfDay: schedule.timeOfDay,
    weekdays: schedule.weekdays,
    runDate: schedule.runDate,
    enabled,
    nextRunAt,
  });
}

export function deleteTaskValidated(id: number): boolean {
  deleteTaskMessages(id);
  return deleteTask(id);
}

/** One-line summary for tool confirmations and dashboard display. */
export function summarizeTask(task: TaskRecord): string {
  const status = task.enabled ? "" : " (disabled)";
  const next = task.nextRunAt ? ` — next ${task.nextRunAt}` : "";
  return `#${task.id} ${describeSchedule(task)}${status}: ${task.instruction}${next}`;
}
