import type { DatabaseSync } from "node:sqlite";

let db: DatabaseSync;

export function bindMemoryJobStateDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_job_chat_state (
      conv_key TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );
  `);
}

export function getMemoryChatFingerprint(convKey: string): string | null {
  const row = db
    .prepare(
      `SELECT fingerprint FROM memory_job_chat_state WHERE conv_key = ?`,
    )
    .get(convKey) as { fingerprint: string } | undefined;
  return row?.fingerprint ?? null;
}

export function setMemoryChatFingerprint(
  convKey: string,
  fingerprint: string,
): void {
  db.prepare(
    `INSERT INTO memory_job_chat_state (conv_key, fingerprint, processed_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(conv_key) DO UPDATE SET
       fingerprint = excluded.fingerprint,
       processed_at = excluded.processed_at`,
  ).run(convKey, fingerprint);
}
