import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";

/** Most recent task events kept for the debug page. */
export const MAX_TASK_EVENTS = 50;

export type TaskEventKind =
  | "created"
  | "updated"
  | "deleted"
  | "fired"
  | "fire_failed";

export interface TaskEventRecord {
  id: number;
  taskId: number | null;
  kind: TaskEventKind;
  chatId: number | null;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskEventInput {
  taskId?: number | null;
  kind: TaskEventKind;
  chatId?: number | null;
  summary: string;
  detail?: Record<string, unknown> | null;
}

interface TaskEventRow {
  id: number;
  task_id: number | null;
  kind: string;
  chat_id: number | null;
  summary: string;
  detail: string | null;
  created_at: number;
}

let db: SqlDatabase;

export async function bindTaskEventsDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS task_events (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      task_id BIGINT,
      kind TEXT NOT NULL,
      chat_id BIGINT,
      summary TEXT NOT NULL,
      detail TEXT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_task_events_created ON task_events (id DESC);`,
  );
}

function rowToRecord(row: TaskEventRow): TaskEventRecord {
  let detail: Record<string, unknown> | null = null;
  if (row.detail) {
    try {
      detail = JSON.parse(row.detail) as Record<string, unknown>;
    } catch {
      detail = { raw: row.detail };
    }
  }
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind as TaskEventKind,
    chatId: row.chat_id,
    summary: row.summary,
    detail,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

/** Record a task lifecycle event, trimming the log to the newest {@link MAX_TASK_EVENTS}. */
export async function recordTaskEvent(event: TaskEventInput): Promise<void> {
  if (!db) return;
  await db.query(
    `INSERT INTO task_events (task_id, kind, chat_id, summary, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      event.taskId ?? null,
      event.kind,
      event.chatId ?? null,
      event.summary,
      event.detail ? JSON.stringify(event.detail) : null,
    ],
  );
  await db.query(
    `DELETE FROM task_events
     WHERE id NOT IN (SELECT id FROM task_events ORDER BY id DESC LIMIT $1)`,
    [MAX_TASK_EVENTS],
  );
  getFeatureLiveHooks().emitDataUpdated?.(["task_events"]);
}

export async function listTaskEvents(
  limit = MAX_TASK_EVENTS,
): Promise<TaskEventRecord[]> {
  const { rows } = await db.query<TaskEventRow>(
    `SELECT * FROM task_events ORDER BY id DESC LIMIT $1`,
    [Math.min(limit, MAX_TASK_EVENTS)],
  );
  return rows.map(rowToRecord);
}

export async function clearTaskEvents(): Promise<void> {
  await db.query(`DELETE FROM task_events`);
  getFeatureLiveHooks().emitDataUpdated?.(["task_events"]);
}
