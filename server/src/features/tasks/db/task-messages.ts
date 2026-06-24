import type { DatabaseSync } from "node:sqlite";

let db: DatabaseSync;

/**
 * Maps a delivered bot message back to the task that produced it, so a reply to
 * one of those messages can be linked to the task for verbal edit/cancel.
 * Mirrors the reply→trace link in `server/src/db/debug/traces.ts`.
 */
export function bindTaskMessagesDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_task_messages_lookup
      ON task_messages (chat_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_task_messages_task
      ON task_messages (task_id);
  `);
}

export function recordTaskMessage(
  taskId: number,
  chatId: string,
  messageId: number,
): void {
  db.prepare(
    `INSERT INTO task_messages (task_id, chat_id, message_id) VALUES (?, ?, ?)`,
  ).run(taskId, chatId, messageId);
}

/** Task id for a bot message the user replied to, or null when unrelated. */
export function getTaskIdByMessage(
  chatId: string,
  messageId: number,
): number | null {
  const row = db
    .prepare(
      `SELECT task_id FROM task_messages
       WHERE chat_id = ? AND message_id = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(chatId, messageId) as { task_id: number } | undefined;
  return row?.task_id ?? null;
}

/** Remove link rows for a deleted task (best-effort cleanup). */
export function deleteTaskMessages(taskId: number): void {
  db.prepare(`DELETE FROM task_messages WHERE task_id = ?`).run(taskId);
}
