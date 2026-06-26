import type { SqlDatabase } from "../../../contracts/index.js";

let db: SqlDatabase;

export async function bindSummariesJobStateDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS summaries_job_state (
      chat_id TEXT PRIMARY KEY,
      last_summarized_date DATE NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
}

/** Most recent date (YYYY-MM-DD) a chat has been summarized through, or null. */
export async function getLastSummarizedDate(
  chatId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ last_summarized_date: unknown }>(
    `SELECT last_summarized_date FROM summaries_job_state WHERE chat_id = $1`,
    [chatId],
  );
  const value = rows[0]?.last_summarized_date;
  if (value == null) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

export async function setLastSummarizedDate(
  chatId: string,
  date: string,
): Promise<void> {
  await db.query(
    `INSERT INTO summaries_job_state (chat_id, last_summarized_date, updated_at)
     VALUES ($1, $2, extract(epoch from now())::bigint)
     ON CONFLICT (chat_id) DO UPDATE SET
       last_summarized_date = excluded.last_summarized_date,
       updated_at = excluded.updated_at`,
    [chatId, date],
  );
}
