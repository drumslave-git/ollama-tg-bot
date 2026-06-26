import type { SqlDatabase } from "../../contracts/index.js";

let db: SqlDatabase;

const MAX_ENTRIES = 100;

export interface ErrorLogRecord {
  id: number;
  message: string;
  chatId: string | null;
  userId: string | null;
  createdAt: string;
}

export interface ErrorLogInput {
  message: string;
  stack?: string;
  chatId?: number;
  userId?: string;
}

export async function bindErrorLogDatabase(database: SqlDatabase): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS error_log (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      chat_id TEXT,
      user_id TEXT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
}

export async function appendErrorLog(input: ErrorLogInput): Promise<void> {
  await db.query(
    `INSERT INTO error_log (message, stack, chat_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [
      input.message.slice(0, 2000),
      input.stack?.slice(0, 4000) ?? null,
      input.chatId != null ? String(input.chatId) : null,
      input.userId ?? null,
    ],
  );

  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM error_log`,
  );
  const excess = (rows[0]?.n ?? 0) - MAX_ENTRIES;
  if (excess > 0) {
    await db.query(
      `DELETE FROM error_log WHERE id IN (
         SELECT id FROM error_log ORDER BY id ASC LIMIT $1
       )`,
      [excess],
    );
  }
}

export async function clearErrorLog(): Promise<number> {
  const result = await db.query(`DELETE FROM error_log`);
  return result.rowCount ?? 0;
}

export async function listRecentErrors(limit = 20): Promise<ErrorLogRecord[]> {
  const { rows } = await db.query<{
    id: number;
    message: string;
    chat_id: string | null;
    user_id: string | null;
    created_at: number;
  }>(
    `SELECT id, message, chat_id, user_id, created_at
       FROM error_log
       ORDER BY id DESC
       LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    chatId: r.chat_id,
    userId: r.user_id,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  }));
}
