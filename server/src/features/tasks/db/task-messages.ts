import type { SqlDatabase } from "../../../contracts/index.js";

let db: SqlDatabase;

/**
 * Maps a delivered bot message back to the task that produced it, so a reply to
 * one of those messages can be linked to the task for verbal edit/cancel.
 * Mirrors the reply→processing link in `server/src/db/debug/message-processing.ts`.
 */
export async function bindTaskMessagesDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS task_messages (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      task_id BIGINT NOT NULL,
      chat_id TEXT NOT NULL,
      message_id BIGINT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_task_messages_lookup
       ON task_messages (chat_id, message_id);`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_task_messages_task
       ON task_messages (task_id);`,
  );
}

export async function recordTaskMessage(
  taskId: number,
  chatId: string,
  messageId: number,
): Promise<void> {
  await db.query(
    `INSERT INTO task_messages (task_id, chat_id, message_id) VALUES ($1, $2, $3)`,
    [taskId, chatId, messageId],
  );
}

/**
 * Most recent delivered texts for a task, newest first — read by joining the
 * existing `task_messages` link to the stored reply content in `chat_messages`
 * (no duplicated copy of the text). Fed back into the fire prompt for recurring
 * tasks so the model varies its wording instead of repeating itself. Requires
 * the assistant row to carry the Telegram `message_id` (see appendAssistantMessage
 * in the fire path); split replies join on the first chunk, so this yields one
 * row per fire.
 */
export async function getRecentTaskMessageTexts(
  taskId: number,
  entityId: string,
  limit: number,
): Promise<string[]> {
  const { rows } = await db.query<{ content: string }>(
    `SELECT cm.content
       FROM task_messages tm
       JOIN chat_messages cm
         ON cm.entity_id = $2 AND cm.message_id = tm.message_id
       WHERE tm.task_id = $1 AND cm.role = 'assistant'
       ORDER BY tm.id DESC
       LIMIT $3`,
    [taskId, entityId, limit],
  );
  return rows.map((r) => r.content);
}

/** Task id for a bot message the user replied to, or null when unrelated. */
export async function getTaskIdByMessage(
  chatId: string,
  messageId: number,
): Promise<number | null> {
  const { rows } = await db.query<{ task_id: number }>(
    `SELECT task_id FROM task_messages
       WHERE chat_id = $1 AND message_id = $2
       ORDER BY id DESC LIMIT 1`,
    [chatId, messageId],
  );
  return rows[0]?.task_id ?? null;
}

/** Remove link rows for a deleted task (best-effort cleanup). */
export async function deleteTaskMessages(taskId: number): Promise<void> {
  await db.query(`DELETE FROM task_messages WHERE task_id = $1`, [taskId]);
}
