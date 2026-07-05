import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";

let db: SqlDatabase;

export type BrowserAgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface BrowserAgentRun {
  id: number;
  goal: string;
  chatId: number;
  entityId: string;
  messageThreadId: number | null;
  createdByUserId: string;
  /** Whether the starter was the owner — gates browser_download inside the run. */
  isOwner: boolean;
  status: BrowserAgentRunStatus;
  stepCount: number;
  /** Final report text or error summary. */
  result: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserAgentRunInput {
  goal: string;
  chatId: number;
  entityId: string;
  messageThreadId?: number | null;
  createdByUserId: string;
  isOwner: boolean;
}

interface RunRow {
  id: number;
  goal: string;
  chat_id: number;
  entity_id: string;
  message_thread_id: number | null;
  created_by_user_id: string;
  is_owner: number;
  status: string;
  step_count: number;
  result: string;
  created_at: number;
  updated_at: number;
}

export async function bindBrowserAgentRunsDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS browser_agent_runs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      goal TEXT NOT NULL,
      chat_id BIGINT NOT NULL,
      entity_id TEXT NOT NULL,
      message_thread_id BIGINT,
      created_by_user_id TEXT NOT NULL DEFAULT '',
      is_owner INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      step_count INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_browser_runs_status ON browser_agent_runs (status, id);`,
  );
}

function rowToRun(row: RunRow): BrowserAgentRun {
  return {
    id: row.id,
    goal: row.goal,
    chatId: row.chat_id,
    entityId: row.entity_id,
    messageThreadId: row.message_thread_id,
    createdByUserId: row.created_by_user_id,
    isOwner: row.is_owner !== 0,
    status: row.status as BrowserAgentRunStatus,
    stepCount: row.step_count,
    result: row.result,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
  };
}

function notifyRunsChanged(): void {
  getFeatureLiveHooks().emitDataUpdated?.(["browser_agent_runs"]);
}

export async function createBrowserAgentRun(
  input: BrowserAgentRunInput,
): Promise<BrowserAgentRun> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO browser_agent_runs (
       goal, chat_id, entity_id, message_thread_id, created_by_user_id, is_owner
     ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      input.goal,
      input.chatId,
      input.entityId,
      input.messageThreadId ?? null,
      input.createdByUserId,
      input.isOwner ? 1 : 0,
    ],
  );
  notifyRunsChanged();
  return (await getBrowserAgentRun(rows[0]!.id))!;
}

export async function setBrowserAgentRunStatus(
  id: number,
  status: BrowserAgentRunStatus,
  patch?: { result?: string; stepCount?: number },
): Promise<void> {
  await db.query(
    `UPDATE browser_agent_runs
        SET status = $2,
            result = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE result END,
            step_count = COALESCE($4, step_count),
            updated_at = extract(epoch from now())::bigint
      WHERE id = $1`,
    [id, status, patch?.result ?? null, patch?.stepCount ?? null],
  );
  notifyRunsChanged();
}

export async function getBrowserAgentRun(
  id: number,
): Promise<BrowserAgentRun | null> {
  const { rows } = await db.query<RunRow>(
    `SELECT * FROM browser_agent_runs WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToRun(rows[0]) : null;
}

export async function listBrowserAgentRuns(
  limit = 50,
): Promise<BrowserAgentRun[]> {
  const { rows } = await db.query<RunRow>(
    `SELECT * FROM browser_agent_runs ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map(rowToRun);
}

/** Queued runs in FIFO order — the worker's pending queue. */
export async function listQueuedBrowserAgentRuns(): Promise<BrowserAgentRun[]> {
  const { rows } = await db.query<RunRow>(
    `SELECT * FROM browser_agent_runs WHERE status = 'queued' ORDER BY id ASC`,
  );
  return rows.map(rowToRun);
}

/**
 * On startup, mark any run left mid-flight by a crash as failed so the worker
 * does not think it is still running and the queue can drain cleanly.
 */
export async function failStaleRunningRuns(): Promise<void> {
  await db.query(
    `UPDATE browser_agent_runs
        SET status = 'failed',
            result = CASE WHEN result = '' THEN 'Interrupted by restart' ELSE result END,
            updated_at = extract(epoch from now())::bigint
      WHERE status = 'running'`,
  );
  notifyRunsChanged();
}
