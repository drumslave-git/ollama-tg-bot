import type { SqlDatabase } from "../../../contracts/index.js";

let db: SqlDatabase;

export async function bindMemoryJobStateDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS memory_job_chat_state (
      conv_key TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );
  `);
}

export async function getMemoryChatFingerprint(
  convKey: string,
): Promise<string | null> {
  const { rows } = await db.query<{ fingerprint: string }>(
    `SELECT fingerprint FROM memory_job_chat_state WHERE conv_key = $1`,
    [convKey],
  );
  return rows[0]?.fingerprint ?? null;
}

export async function setMemoryChatFingerprint(
  convKey: string,
  fingerprint: string,
): Promise<void> {
  await db.query(
    `INSERT INTO memory_job_chat_state (conv_key, fingerprint, processed_at)
     VALUES ($1, $2, now()::text)
     ON CONFLICT (conv_key) DO UPDATE SET
       fingerprint = excluded.fingerprint,
       processed_at = excluded.processed_at`,
    [convKey, fingerprint],
  );
}
