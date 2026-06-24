import type { DatabaseSync } from "node:sqlite";
import { getModuleLiveHooks } from "../../../contracts/index.js";

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

let db: DatabaseSync;

export function bindTaskEventsDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      kind TEXT NOT NULL,
      chat_id INTEGER,
      summary TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_task_events_created ON task_events (id DESC);
  `);
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
export function recordTaskEvent(event: TaskEventInput): void {
  if (!db) return;
  db.prepare(
    `INSERT INTO task_events (task_id, kind, chat_id, summary, detail)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    event.taskId ?? null,
    event.kind,
    event.chatId ?? null,
    event.summary,
    event.detail ? JSON.stringify(event.detail) : null,
  );
  db.prepare(
    `DELETE FROM task_events
     WHERE id NOT IN (SELECT id FROM task_events ORDER BY id DESC LIMIT ?)`,
  ).run(MAX_TASK_EVENTS);
  getModuleLiveHooks().emitDataUpdated?.(["task_events"]);
}

export function listTaskEvents(limit = MAX_TASK_EVENTS): TaskEventRecord[] {
  const rows = db
    .prepare(`SELECT * FROM task_events ORDER BY id DESC LIMIT ?`)
    .all(Math.min(limit, MAX_TASK_EVENTS)) as unknown as TaskEventRow[];
  return rows.map(rowToRecord);
}

export function clearTaskEvents(): void {
  db.prepare(`DELETE FROM task_events`).run();
  getModuleLiveHooks().emitDataUpdated?.(["task_events"]);
}
