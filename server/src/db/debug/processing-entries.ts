import type { SqlDatabase } from "../../contracts/index.js";

/**
 * Shared "<domain>_processing_entries" store. Every debug domain (messages,
 * tasks, scheduled jobs) records an append-only, ordered stream of entries with
 * the same shape; only the owning `<domain>_processings` table differs. This
 * feature owns the entries table DDL + CRUD so each domain reuses it.
 */

export type EntryType = "text" | "json" | "image";

/** Token totals stored on a processing row, summed across its LLM calls. */
export interface TokenCounts {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export const ZERO_TOKENS: TokenCounts = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

/**
 * Add the shared token columns to a `<domain>_processings` table. Idempotent
 * via ADD COLUMN IF NOT EXISTS so it doubles as the migration for existing DBs.
 */
export async function addTokenColumns(
  db: SqlDatabase,
  processingsTable: string,
): Promise<void> {
  await db.query(`
    ALTER TABLE ${processingsTable}
      ADD COLUMN IF NOT EXISTS prompt_tokens BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS completion_tokens BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;
  `);
}

/** Read the three token columns off a processing row into a {@link TokenCounts}. */
export function readTokenCounts(row: {
  prompt_tokens?: number | string | null;
  completion_tokens?: number | string | null;
  total_tokens?: number | string | null;
}): TokenCounts {
  return {
    promptTokens: Number(row.prompt_tokens ?? 0),
    completionTokens: Number(row.completion_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
  };
}

/** Lifecycle of a unit of work, shared across all debug domains. */
export type ProcessingStatus = "processing" | "processed" | "ignored" | "error";

export interface ProcessingEntry {
  id: number;
  title: string;
  type: EntryType;
  content: string;
  createdAt: string;
}

export interface EntriesTableConfig {
  /** e.g. "message_processing_entries". */
  entriesTable: string;
  /** The owning processings table this entries table cascades from, e.g. "message_processings". */
  processingsTable: string;
  /** FK column on the entries table, e.g. "message_processing_id". */
  fkColumn: string;
}

export async function createEntriesTable(
  db: SqlDatabase,
  cfg: EntriesTableConfig,
): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${cfg.entriesTable} (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ${cfg.fkColumn} BIGINT NOT NULL
        REFERENCES ${cfg.processingsTable} (id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_${cfg.entriesTable}_proc
       ON ${cfg.entriesTable} (${cfg.fkColumn}, id);`,
  );
}

export async function insertEntry(
  db: SqlDatabase,
  cfg: EntriesTableConfig,
  processingId: number,
  title: string,
  type: EntryType,
  content: string,
): Promise<void> {
  await db.query(
    `INSERT INTO ${cfg.entriesTable} (${cfg.fkColumn}, title, type, content)
     VALUES ($1, $2, $3, $4)`,
    [processingId, title, type, content],
  );
}

export async function listEntries(
  db: SqlDatabase,
  cfg: EntriesTableConfig,
  processingId: number,
): Promise<ProcessingEntry[]> {
  const { rows } = await db.query<{
    id: number;
    title: string;
    type: EntryType;
    content: string;
    created_at: number;
  }>(
    `SELECT id, title, type, content, created_at
       FROM ${cfg.entriesTable}
      WHERE ${cfg.fkColumn} = $1
      ORDER BY id ASC`,
    [processingId],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  }));
}
