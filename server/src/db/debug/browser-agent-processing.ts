import type { SqlDatabase } from "../../contracts/index.js";
import {
  type EntriesTableConfig,
  type EntryType,
  type ProcessingEntry,
  type ProcessingStatus,
  type TokenCounts,
  addTokenColumns,
  createEntriesTable,
  insertEntry,
  listEntries,
  readTokenCounts,
} from "./processing-entries.js";

let db: SqlDatabase;

const ENTRIES: EntriesTableConfig = {
  entriesTable: "browser_agent_processing_entries",
  processingsTable: "browser_agent_processings",
  fkColumn: "browser_agent_processing_id",
};

export interface BrowserAgentProcessingDetail {
  id: number;
  runId: number | null;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  createdAt: string;
  entries: ProcessingEntry[];
}

export async function bindBrowserAgentProcessingDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS browser_agent_processings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      run_id BIGINT REFERENCES browser_agent_runs (id) ON DELETE CASCADE,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'processing',
      total_time_spent BIGINT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await addTokenColumns(db, "browser_agent_processings");
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_browser_processings_run
       ON browser_agent_processings (run_id, id DESC);`,
  );
  await createEntriesTable(db, ENTRIES);
}

function emit(): void {
  void import("../../dashboard/live-events.js").then(({ emitDataUpdated }) => {
    emitDataUpdated([
      "browser_agent_processings",
      "browser_agent_processing_entries",
    ]);
  });
}

/** Open the single processing for one run and return its id. */
export async function createBrowserAgentProcessing(
  runId: number,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO browser_agent_processings (run_id) VALUES ($1) RETURNING id`,
    [runId],
  );
  const id = rows[0]?.id ?? null;
  if (id != null) emit();
  return id;
}

export async function appendBrowserAgentEntry(
  processingId: number,
  title: string,
  type: EntryType,
  content: string,
): Promise<void> {
  await insertEntry(db, ENTRIES, processingId, title, type, content);
  emit();
}

export async function setBrowserAgentProcessingStatus(
  processingId: number,
  status: ProcessingStatus,
  options?: { totalTimeSpentMs?: number; tokens?: TokenCounts; summary?: string },
): Promise<void> {
  await db.query(
    `UPDATE browser_agent_processings
        SET status = $2,
            total_time_spent = COALESCE($3, total_time_spent),
            summary = CASE
              WHEN $4::text IS NOT NULL AND $4 <> '' THEN $4 ELSE summary
            END,
            prompt_tokens = $5,
            completion_tokens = $6,
            total_tokens = $7
      WHERE id = $1`,
    [
      processingId,
      status,
      options?.totalTimeSpentMs ?? null,
      options?.summary ?? null,
      options?.tokens?.promptTokens ?? 0,
      options?.tokens?.completionTokens ?? 0,
      options?.tokens?.totalTokens ?? 0,
    ],
  );
  emit();
}

/** The processing (with its entries) for one run, for the dashboard detail view. */
export async function getBrowserAgentProcessingForRun(
  runId: number,
): Promise<BrowserAgentProcessingDetail | null> {
  const { rows } = await db.query<{
    id: number;
    run_id: number | null;
    summary: string;
    status: ProcessingStatus;
    total_time_spent: number | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    created_at: number;
  }>(
    `SELECT id, run_id, summary, status, total_time_spent,
            prompt_tokens, completion_tokens, total_tokens, created_at
       FROM browser_agent_processings
      WHERE run_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [runId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    summary: row.summary,
    status: row.status,
    totalTimeSpent: row.total_time_spent,
    tokens: readTokenCounts(row),
    createdAt: new Date(row.created_at * 1000).toISOString(),
    entries: await listEntries(db, ENTRIES, row.id),
  };
}
