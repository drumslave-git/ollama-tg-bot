import type { SqlDatabase } from "../../../contracts/index.js";
import { getModuleLiveHooks } from "../../../contracts/index.js";
import type { ScheduleKind } from "../schedule.js";
import { normalizeWeekdays } from "../schedule.js";

let db: SqlDatabase;

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

export async function bindTasksDatabase(database: SqlDatabase): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      message_thread_id BIGINT,
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
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks (chat_id);`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (enabled, next_run_at);`,
  );
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

export async function createTask(input: TaskInput): Promise<TaskRecord> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO tasks (
         chat_id, message_thread_id, entity_id, created_by_user_id, instruction,
         schedule_kind, time_of_day, weekdays, run_date, timezone, enabled, next_run_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
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
    ],
  );
  notifyTasksChanged();
  return (await getTaskById(rows[0]!.id))!;
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

export async function updateTask(
  id: number,
  patch: TaskUpdate,
): Promise<TaskRecord | null> {
  const current = await getTaskById(id);
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

  await db.query(
    `UPDATE tasks SET
       instruction = $1, schedule_kind = $2, time_of_day = $3, weekdays = $4,
       run_date = $5, enabled = $6, next_run_at = $7,
       updated_at = extract(epoch from now())::bigint
     WHERE id = $8`,
    [
      next.instruction,
      next.scheduleKind,
      next.timeOfDay,
      serializeWeekdays(next.weekdays),
      next.runDate ?? null,
      next.enabled ? 1 : 0,
      next.nextRunAt,
      id,
    ],
  );
  notifyTasksChanged();
  return getTaskById(id);
}

/** Record a firing: stamp last_run_at and the recomputed next_run_at (null disables). */
export async function markTaskRun(
  id: number,
  lastRunAt: string,
  nextRunAt: string | null,
): Promise<void> {
  await db.query(
    `UPDATE tasks SET
       last_run_at = $1, next_run_at = $2, enabled = $3,
       updated_at = extract(epoch from now())::bigint
     WHERE id = $4`,
    [lastRunAt, nextRunAt, nextRunAt ? 1 : 0, id],
  );
  notifyTasksChanged();
}

/**
 * Reassign a task's timezone and next-run instant. Used by startup
 * reconciliation when the configured `TZ` changes, so stored tasks fire in the
 * current zone instead of the one captured at creation.
 */
export async function retimeTask(
  id: number,
  timezone: string,
  nextRunAt: string | null,
): Promise<void> {
  await db.query(
    `UPDATE tasks SET timezone = $1, next_run_at = $2, enabled = $3,
       updated_at = extract(epoch from now())::bigint
     WHERE id = $4`,
    [timezone, nextRunAt, nextRunAt ? 1 : 0, id],
  );
  notifyTasksChanged();
}

export async function deleteTask(id: number): Promise<boolean> {
  const result = await db.query(`DELETE FROM tasks WHERE id = $1`, [id]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) notifyTasksChanged();
  return deleted;
}

export async function getTaskById(id: number): Promise<TaskRecord | null> {
  const { rows } = await db.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [
    id,
  ]);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function listTasks(chatId?: number): Promise<TaskRecord[]> {
  const { rows } =
    chatId == null
      ? await db.query<TaskRow>(`SELECT * FROM tasks ORDER BY id DESC`)
      : await db.query<TaskRow>(
          `SELECT * FROM tasks WHERE chat_id = $1 ORDER BY id DESC`,
          [chatId],
        );
  return rows.map(rowToRecord);
}

export async function searchTasks(
  query: string,
  chatId?: number,
): Promise<TaskRecord[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } =
    chatId == null
      ? await db.query<TaskRow>(
          `SELECT * FROM tasks WHERE instruction ILIKE '%' || $1 || '%'
             ORDER BY id DESC`,
          [q],
        )
      : await db.query<TaskRow>(
          `SELECT * FROM tasks WHERE chat_id = $1
               AND instruction ILIKE '%' || $2 || '%'
             ORDER BY id DESC`,
          [chatId, q],
        );
  return rows.map(rowToRecord);
}

/** Enabled tasks whose next_run_at is due (<= nowIso). */
export async function listDueTasks(nowIso: string): Promise<TaskRecord[]> {
  const { rows } = await db.query<TaskRow>(
    `SELECT * FROM tasks
       WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= $1
       ORDER BY next_run_at ASC`,
    [nowIso],
  );
  return rows.map(rowToRecord);
}
