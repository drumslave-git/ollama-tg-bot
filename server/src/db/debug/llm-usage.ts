import type { SqlDatabase } from "../../contracts/index.js";

/**
 * Per-call LLM token usage, the source for the dashboard's token panels.
 * One row per chat completion, tagged with the domain (message/task/job) and
 * the call label (e.g. "main reply", "vision describe") so the overview can
 * break spend down by call type over a time window. Detailed rows are pruned by
 * age; the lifetime grand totals live in the `stats` KV table so they survive
 * pruning (see {@link bumpLifetimeTokenStats}).
 */

let db: SqlDatabase | null = null;

/** Detailed per-call rows older than this are pruned at startup. */
const RETENTION_DAYS = 60;

export interface LlmUsageInput {
  domain: string;
  label: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function bindLlmUsageDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS llm_usage (
      id BIGSERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      label TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS llm_usage_created
      ON llm_usage (created_at);
  `);
  await db.query(
    `DELETE FROM llm_usage WHERE created_at < now() - make_interval(days => $1)`,
    [RETENTION_DAYS],
  );
}

/** Lifetime token counters kept in the shared `stats` KV table. */
async function bumpLifetimeTokenStats(input: LlmUsageInput): Promise<void> {
  if (!db) return;
  const deltas: Array<[string, number]> = [
    ["llmCalls", 1],
    ["llmPromptTokens", input.promptTokens],
    ["llmCompletionTokens", input.completionTokens],
    ["llmTotalTokens", input.totalTokens],
  ];
  for (const [key, delta] of deltas) {
    await db.query(
      `INSERT INTO stats (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = stats.value + excluded.value`,
      [key, delta],
    );
  }
}

/**
 * Record one LLM call's token usage. Fire-and-forget by design: a lost usage
 * sample must never slow down or fail the turn that produced it, so errors are
 * swallowed and callers do not await.
 */
export function recordLlmUsage(input: LlmUsageInput): void {
  if (!db) return;
  void (async () => {
    await db!.query(
      `INSERT INTO llm_usage
         (domain, label, model, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.domain,
        input.label,
        input.model,
        Math.max(0, Math.round(input.promptTokens)),
        Math.max(0, Math.round(input.completionTokens)),
        Math.max(0, Math.round(input.totalTokens)),
      ],
    );
    await bumpLifetimeTokenStats(input);
  })().catch(() => {});
}

export interface LlmUsageBreakdownRow {
  label: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmUsageWindow {
  days: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byLabel: LlmUsageBreakdownRow[];
}

/** Token usage over the last `days` days, with a per-call-type breakdown. */
export async function getLlmUsageWindow(days: number): Promise<LlmUsageWindow> {
  const empty: LlmUsageWindow = {
    days,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    byLabel: [],
  };
  if (!db) return empty;
  const { rows } = await db.query<{
    label: string;
    calls: number;
    prompt: string | number;
    completion: string | number;
    total: string | number;
  }>(
    `SELECT label,
            COUNT(*)::int AS calls,
            SUM(prompt_tokens) AS prompt,
            SUM(completion_tokens) AS completion,
            SUM(total_tokens) AS total
       FROM llm_usage
      WHERE created_at >= now() - make_interval(days => $1)
      GROUP BY label
      ORDER BY total DESC`,
    [days],
  );
  const byLabel: LlmUsageBreakdownRow[] = rows.map((row) => ({
    label: row.label,
    calls: row.calls,
    promptTokens: Number(row.prompt),
    completionTokens: Number(row.completion),
    totalTokens: Number(row.total),
  }));
  return {
    days,
    calls: byLabel.reduce((sum, row) => sum + row.calls, 0),
    promptTokens: byLabel.reduce((sum, row) => sum + row.promptTokens, 0),
    completionTokens: byLabel.reduce((sum, row) => sum + row.completionTokens, 0),
    totalTokens: byLabel.reduce((sum, row) => sum + row.totalTokens, 0),
    byLabel,
  };
}
