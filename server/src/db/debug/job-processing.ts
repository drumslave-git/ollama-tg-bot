import type { SqlDatabase } from "../../contracts/index.js";
import {
  type EntriesTableConfig,
  type EntryType,
  type ProcessingEntry,
  type ProcessingStatus,
  createEntriesTable,
  insertEntry,
  listEntries,
} from "./processing-entries.js";

let db: SqlDatabase;

/** Keep at most this many run records per job module; older ones (and entries) are trimmed. */
export const MAX_RUNS_PER_MODULE = 25;

const ENTRIES: EntriesTableConfig = {
  entriesTable: "job_processing_entries",
  processingsTable: "job_processings",
  fkColumn: "job_processing_id",
};

export interface JobModuleSummary {
  moduleId: string;
  runCount: number;
  latestAt: string | null;
}

export interface JobProcessingListItem {
  id: number;
  moduleId: string;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  entryCount: number;
  createdAt: string;
}

export interface JobProcessingDetail {
  id: number;
  moduleId: string;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  createdAt: string;
  entries: ProcessingEntry[];
}

export async function bindJobProcessingDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS job_processings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      module_id TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'processing',
      total_time_spent BIGINT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_job_processings_module
       ON job_processings (module_id, id DESC);`,
  );
  await createEntriesTable(db, ENTRIES);
}

function emit(): void {
  void import("../../dashboard/live-events.js").then(({ emitDataUpdated }) => {
    emitDataUpdated(["job_processings", "job_processing_entries"]);
  });
}

async function trimRunsForModule(moduleId: string): Promise<void> {
  await db.query(
    `DELETE FROM job_processings
      WHERE module_id = $1
        AND id NOT IN (
          SELECT id FROM job_processings
           WHERE module_id = $1 ORDER BY id DESC LIMIT $2
        )`,
    [moduleId, MAX_RUNS_PER_MODULE],
  );
}

/** Open a processing for one job run and return its id. */
export async function createJobProcessing(
  moduleId: string,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO job_processings (module_id) VALUES ($1) RETURNING id`,
    [moduleId],
  );
  const id = rows[0]?.id ?? null;
  if (id != null) {
    await trimRunsForModule(moduleId);
    emit();
  }
  return id;
}

export async function appendJobEntry(
  processingId: number,
  title: string,
  type: EntryType,
  content: string,
): Promise<void> {
  await insertEntry(db, ENTRIES, processingId, title, type, content);
  emit();
}

export async function setJobProcessingStatus(
  processingId: number,
  status: ProcessingStatus,
  options?: { totalTimeSpentMs?: number; summary?: string },
): Promise<void> {
  await db.query(
    `UPDATE job_processings
        SET status = $2,
            total_time_spent = COALESCE($3, total_time_spent),
            summary = CASE
              WHEN $4::text IS NOT NULL AND $4 <> '' THEN $4 ELSE summary
            END
      WHERE id = $1`,
    [processingId, status, options?.totalTimeSpentMs ?? null, options?.summary ?? null],
  );
  emit();
}

export async function listJobModules(): Promise<JobModuleSummary[]> {
  const { rows } = await db.query<{
    module_id: string;
    run_count: number;
    latest_at: number | null;
  }>(
    `SELECT module_id, COUNT(*)::int AS run_count, MAX(created_at) AS latest_at
       FROM job_processings
      GROUP BY module_id
      ORDER BY latest_at DESC`,
  );
  return rows.map((row) => ({
    moduleId: row.module_id,
    runCount: row.run_count,
    latestAt:
      row.latest_at != null
        ? new Date(row.latest_at * 1000).toISOString()
        : null,
  }));
}

type ListRow = {
  id: number;
  module_id: string;
  summary: string;
  status: ProcessingStatus;
  total_time_spent: number | null;
  entry_count: number;
  created_at: number;
};

function toListItem(row: ListRow): JobProcessingListItem {
  return {
    id: row.id,
    moduleId: row.module_id,
    summary: row.summary,
    status: row.status,
    totalTimeSpent: row.total_time_spent,
    entryCount: row.entry_count,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

export async function listProcessingsForModule(
  moduleId: string,
): Promise<JobProcessingListItem[]> {
  const { rows } = await db.query<ListRow>(
    `SELECT jp.id, jp.module_id, jp.summary, jp.status, jp.total_time_spent,
            jp.created_at,
            (SELECT COUNT(*)::int FROM job_processing_entries e
               WHERE e.job_processing_id = jp.id) AS entry_count
       FROM job_processings jp
      WHERE jp.module_id = $1
      ORDER BY jp.id DESC
      LIMIT ${MAX_RUNS_PER_MODULE}`,
    [moduleId],
  );
  return rows.map(toListItem);
}

export async function getJobProcessingDetail(
  processingId: number,
): Promise<JobProcessingDetail | null> {
  const { rows } = await db.query<ListRow>(
    `SELECT id, module_id, summary, status, total_time_spent, created_at,
            0 AS entry_count
       FROM job_processings
      WHERE id = $1`,
    [processingId],
  );
  const row = rows[0];
  if (!row) return null;
  const item = toListItem(row);
  return {
    id: item.id,
    moduleId: item.moduleId,
    summary: item.summary,
    status: item.status,
    totalTimeSpent: item.totalTimeSpent,
    createdAt: item.createdAt,
    entries: await listEntries(db, ENTRIES, item.id),
  };
}
