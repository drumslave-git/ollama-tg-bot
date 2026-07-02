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

/** Keep at most this many fire records per task; older ones (and entries) are trimmed. */
export const MAX_FIRES_PER_TASK = 20;

/** Sentinel task id for the "deleted task" group (real task ids are >= 1). */
export const DELETED_TASK_GROUP = 0;

const ENTRIES: EntriesTableConfig = {
  entriesTable: "task_processing_entries",
  processingsTable: "task_processings",
  fkColumn: "task_processing_id",
};

export interface TaskGroupSummary {
  taskId: number;
  label: string;
  fireCount: number;
  latestAt: string | null;
}

export interface TaskProcessingListItem {
  id: number;
  taskId: number | null;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  entryCount: number;
  createdAt: string;
}

export interface TaskProcessingDetail {
  id: number;
  taskId: number | null;
  taskInstruction: string | null;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  createdAt: string;
  entries: ProcessingEntry[];
}

export async function bindTaskProcessingDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS task_processings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      task_id BIGINT REFERENCES tasks (id) ON DELETE SET NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'processing',
      total_time_spent BIGINT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await addTokenColumns(db, "task_processings");
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_task_processings_task
       ON task_processings (task_id, id DESC);`,
  );
  await createEntriesTable(db, ENTRIES);
}

function emit(): void {
  void import("../../dashboard/live-events.js").then(({ emitDataUpdated }) => {
    emitDataUpdated(["task_processings", "task_processing_entries"]);
  });
}

function clip(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function trimFiresForTask(taskId: number): Promise<void> {
  await db.query(
    `DELETE FROM task_processings
      WHERE task_id = $1
        AND id NOT IN (
          SELECT id FROM task_processings
           WHERE task_id = $1 ORDER BY id DESC LIMIT $2
        )`,
    [taskId, MAX_FIRES_PER_TASK],
  );
}

/** Open a processing for one task fire and return its id. */
export async function createTaskProcessing(
  taskId: number,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO task_processings (task_id) VALUES ($1) RETURNING id`,
    [taskId],
  );
  const id = rows[0]?.id ?? null;
  if (id != null) {
    await trimFiresForTask(taskId);
    emit();
  }
  return id;
}

export async function appendTaskEntry(
  processingId: number,
  title: string,
  type: EntryType,
  content: string,
): Promise<void> {
  await insertEntry(db, ENTRIES, processingId, title, type, content);
  emit();
}

export async function setTaskProcessingStatus(
  processingId: number,
  status: ProcessingStatus,
  options?: { totalTimeSpentMs?: number; tokens?: TokenCounts; summary?: string },
): Promise<void> {
  await db.query(
    `UPDATE task_processings
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

/** Tasks (and a "deleted task" bucket) that have fire records, most recent first. */
export async function listTaskGroups(): Promise<TaskGroupSummary[]> {
  const { rows } = await db.query<{
    task_id: number | null;
    instruction: string | null;
    fire_count: number;
    latest_at: number | null;
  }>(
    `SELECT tp.task_id,
            MAX(t.instruction) AS instruction,
            COUNT(*)::int AS fire_count,
            MAX(tp.created_at) AS latest_at
       FROM task_processings tp
       LEFT JOIN tasks t ON tp.task_id = t.id
      GROUP BY tp.task_id
      ORDER BY latest_at DESC`,
  );
  return rows.map((row) => ({
    taskId: row.task_id ?? DELETED_TASK_GROUP,
    label: row.instruction
      ? clip(row.instruction)
      : row.task_id == null
        ? "(deleted task)"
        : `Task ${row.task_id}`,
    fireCount: row.fire_count,
    latestAt:
      row.latest_at != null
        ? new Date(row.latest_at * 1000).toISOString()
        : null,
  }));
}

type ListRow = {
  id: number;
  task_id: number | null;
  summary: string;
  status: ProcessingStatus;
  total_time_spent: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  entry_count: number;
  created_at: number;
};

function toListItem(row: ListRow): TaskProcessingListItem {
  return {
    id: row.id,
    taskId: row.task_id,
    summary: row.summary,
    status: row.status,
    totalTimeSpent: row.total_time_spent,
    tokens: readTokenCounts(row),
    entryCount: row.entry_count,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

export async function listProcessingsForTask(
  taskId: number,
): Promise<TaskProcessingListItem[]> {
  const whereTask =
    taskId === DELETED_TASK_GROUP ? "tp.task_id IS NULL" : "tp.task_id = $1";
  const params = taskId === DELETED_TASK_GROUP ? [] : [taskId];
  const { rows } = await db.query<ListRow>(
    `SELECT tp.id, tp.task_id, tp.summary, tp.status, tp.total_time_spent,
            tp.prompt_tokens, tp.completion_tokens, tp.total_tokens,
            tp.created_at,
            (SELECT COUNT(*)::int FROM task_processing_entries e
               WHERE e.task_processing_id = tp.id) AS entry_count
       FROM task_processings tp
      WHERE ${whereTask}
      ORDER BY tp.id DESC
      LIMIT ${MAX_FIRES_PER_TASK}`,
    params,
  );
  return rows.map(toListItem);
}

export async function getTaskProcessingDetail(
  processingId: number,
): Promise<TaskProcessingDetail | null> {
  const { rows } = await db.query<ListRow & { instruction: string | null }>(
    `SELECT tp.id, tp.task_id, tp.summary, tp.status, tp.total_time_spent,
            tp.prompt_tokens, tp.completion_tokens, tp.total_tokens,
            tp.created_at, t.instruction, 0 AS entry_count
       FROM task_processings tp
       LEFT JOIN tasks t ON tp.task_id = t.id
      WHERE tp.id = $1`,
    [processingId],
  );
  const row = rows[0];
  if (!row) return null;
  const item = toListItem(row);
  return {
    id: item.id,
    taskId: item.taskId,
    taskInstruction: row.instruction,
    summary: item.summary,
    status: item.status,
    totalTimeSpent: item.totalTimeSpent,
    tokens: item.tokens,
    createdAt: item.createdAt,
    entries: await listEntries(db, ENTRIES, item.id),
  };
}
