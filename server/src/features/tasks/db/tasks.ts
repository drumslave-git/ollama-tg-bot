import type { DatabaseSync } from "node:sqlite";
import { getModuleLiveHooks } from "../../../contracts/index.js";
import type { ScheduleKind } from "../schedule.js";
import { normalizeWeekdays } from "../schedule.js";

let db: DatabaseSync;

export interface TaskRecord {
  id: number;
  chatId: number;
  messageThreadId: number | null;
  entityId: string;
  createdByUserId: string;
  instruction: string;
  scheduleKind: ScheduleKind;
  timeOfDay: string;
  weekdays: number[] | null;
  runDate: string | null;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  chatId: number;
  messageThreadId?: number | null;
  entityId: string;
  createdByUserId: string;
  instruction: string;
  scheduleKind: ScheduleKind;
  timeOfDay: string;
  weekdays?: number[] | null;
  runDate?: string | null;
  timezone: string;
  enabled?: boolean;
  nextRunAt: string | null;
}

interface TaskRow {
  id: number;
  chat_id: number;
  message_thread_id: number | null;
  entity_id: string;
  created_by_user_id: string;
  instruction: string;
  schedule_kind: string;
  time_of_day: string;
  weekdays: string | null;
  run_date: string | null;
  timezone: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: number;
  updated_at: number;
}

export function bindTasksDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      message_thread_id INTEGER,
      entity_id TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      instruction TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      time_of_day TEXT NOT NULL,
      weekdays TEXT,
      run_date TEXT,
      timezone TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks (chat_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (enabled, next_run_at);
  `);
}

function rowToRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    messageThreadId: row.message_thread_id,
    entityId: row.entity_id,
    createdByUserId: row.created_by_user_id,
    instruction: row.instruction,
    scheduleKind: row.schedule_kind as ScheduleKind,
    timeOfDay: row.time_of_day,
    weekdays: parseWeekdays(row.weekdays),
    runDate: row.run_date,
    timezone: row.timezone,
    enabled: row.enabled !== 0,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
  };
}

function parseWeekdays(value: string | null): number[] | null {
  if (!value) return null;
  const days = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n));
  return days.length > 0 ? normalizeWeekdays(days) : null;
}

function serializeWeekdays(weekdays: number[] | null | undefined): string | null {
  if (!weekdays || weekdays.length === 0) return null;
  return normalizeWeekdays(weekdays).join(",");
}

function notifyTasksChanged(): void {
  getModuleLiveHooks().emitDataUpdated?.(["tasks"]);
}

export function createTask(input: TaskInput): TaskRecord {
  const result = db
    .prepare(
      `INSERT INTO tasks (
         chat_id, message_thread_id, entity_id, created_by_user_id, instruction,
         schedule_kind, time_of_day, weekdays, run_date, timezone, enabled, next_run_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.chatId,
      input.messageThreadId ?? null,
      input.entityId,
      input.createdByUserId,
      input.instruction,
      input.scheduleKind,
      input.timeOfDay,
      serializeWeekdays(input.weekdays),
      input.runDate ?? null,
      input.timezone,
      input.enabled === false ? 0 : 1,
      input.nextRunAt,
    );
  notifyTasksChanged();
  return getTaskById(Number(result.lastInsertRowid))!;
}

export interface TaskUpdate {
  instruction?: string;
  scheduleKind?: ScheduleKind;
  timeOfDay?: string;
  weekdays?: number[] | null;
  runDate?: string | null;
  enabled?: boolean;
  nextRunAt?: string | null;
}

export function updateTask(id: number, patch: TaskUpdate): TaskRecord | null {
  const current = getTaskById(id);
  if (!current) return null;

  const next: TaskInput & { enabled: boolean } = {
    chatId: current.chatId,
    messageThreadId: current.messageThreadId,
    entityId: current.entityId,
    createdByUserId: current.createdByUserId,
    instruction: patch.instruction ?? current.instruction,
    scheduleKind: patch.scheduleKind ?? current.scheduleKind,
    timeOfDay: patch.timeOfDay ?? current.timeOfDay,
    weekdays: patch.weekdays !== undefined ? patch.weekdays : current.weekdays,
    runDate: patch.runDate !== undefined ? patch.runDate : current.runDate,
    timezone: current.timezone,
    enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
    nextRunAt: patch.nextRunAt !== undefined ? patch.nextRunAt : current.nextRunAt,
  };

  db.prepare(
    `UPDATE tasks SET
       instruction = ?, schedule_kind = ?, time_of_day = ?, weekdays = ?,
       run_date = ?, enabled = ?, next_run_at = ?, updated_at = unixepoch()
     WHERE id = ?`,
  ).run(
    next.instruction,
    next.scheduleKind,
    next.timeOfDay,
    serializeWeekdays(next.weekdays),
    next.runDate ?? null,
    next.enabled ? 1 : 0,
    next.nextRunAt,
    id,
  );
  notifyTasksChanged();
  return getTaskById(id);
}

/** Record a firing: stamp last_run_at and the recomputed next_run_at (null disables). */
export function markTaskRun(
  id: number,
  lastRunAt: string,
  nextRunAt: string | null,
): void {
  db.prepare(
    `UPDATE tasks SET
       last_run_at = ?, next_run_at = ?, enabled = ?, updated_at = unixepoch()
     WHERE id = ?`,
  ).run(lastRunAt, nextRunAt, nextRunAt ? 1 : 0, id);
  notifyTasksChanged();
}

/**
 * Reassign a task's timezone and next-run instant. Used by startup
 * reconciliation when the configured `TZ` changes, so stored tasks fire in the
 * current zone instead of the one captured at creation.
 */
export function retimeTask(
  id: number,
  timezone: string,
  nextRunAt: string | null,
): void {
  db.prepare(
    `UPDATE tasks SET timezone = ?, next_run_at = ?, enabled = ?, updated_at = unixepoch()
     WHERE id = ?`,
  ).run(timezone, nextRunAt, nextRunAt ? 1 : 0, id);
  notifyTasksChanged();
}

export function deleteTask(id: number): boolean {
  const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  if (result.changes > 0) notifyTasksChanged();
  return result.changes > 0;
}

export function getTaskById(id: number): TaskRecord | null {
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
    | TaskRow
    | undefined;
  return row ? rowToRecord(row) : null;
}

export function listTasks(chatId?: number): TaskRecord[] {
  const rows = (
    chatId == null
      ? db.prepare(`SELECT * FROM tasks ORDER BY id DESC`).all()
      : db
          .prepare(`SELECT * FROM tasks WHERE chat_id = ? ORDER BY id DESC`)
          .all(chatId)
  ) as unknown as TaskRow[];
  return rows.map(rowToRecord);
}

export function searchTasks(query: string, chatId?: number): TaskRecord[] {
  const q = query.trim();
  if (!q) return [];
  const rows = (
    chatId == null
      ? db
          .prepare(
            `SELECT * FROM tasks WHERE instr(lower(instruction), lower(?)) > 0
             ORDER BY id DESC`,
          )
          .all(q)
      : db
          .prepare(
            `SELECT * FROM tasks WHERE chat_id = ?
               AND instr(lower(instruction), lower(?)) > 0
             ORDER BY id DESC`,
          )
          .all(chatId, q)
  ) as unknown as TaskRow[];
  return rows.map(rowToRecord);
}

/** Enabled tasks whose next_run_at is due (<= nowIso). */
export function listDueTasks(nowIso: string): TaskRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM tasks
       WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
    )
    .all(nowIso) as unknown as TaskRow[];
  return rows.map(rowToRecord);
}
