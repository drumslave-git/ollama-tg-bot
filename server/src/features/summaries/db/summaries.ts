import type { SqlDatabase } from "../../../contracts/index.js";
import { getModuleLiveHooks } from "../../../contracts/index.js";
import { EMBEDDING_DIM, toVectorLiteral } from "../../../llm/embeddings.js";

let db: SqlDatabase;

export interface SummaryTopic {
  summaryDate: string;
  content: string;
  messageIds: number[];
}

export interface SummaryMatch extends SummaryTopic {
  /** Reciprocal-rank-fusion score (higher = more relevant). */
  score: number;
}

export interface InsertSummaryInput {
  chatId: string;
  summaryDate: string;
  messageIds: number[];
  content: string;
  embedding: number[];
}

export async function bindSummariesDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_summaries (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      chat_id TEXT NOT NULL,
      summary_date DATE NOT NULL,
      message_ids BIGINT[] NOT NULL DEFAULT '{}',
      content TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIM}),
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_chat_summaries_chat_date
       ON chat_summaries (chat_id, summary_date);`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_chat_summaries_tsv
       ON chat_summaries USING GIN (tsv);`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_chat_summaries_embedding
       ON chat_summaries USING hnsw (embedding vector_cosine_ops);`,
  );
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// node-postgres returns BIGINT[] columns as string[] (the scalar int8 parser
// does not apply to array elements), so coerce message ids back to numbers.
function toNumberIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

/** Replace any existing summaries for a chat/date, then insert the new topics. */
export async function replaceSummariesForDate(
  chatId: string,
  summaryDate: string,
  topics: InsertSummaryInput[],
): Promise<void> {
  await db.query(
    `DELETE FROM chat_summaries WHERE chat_id = $1 AND summary_date = $2`,
    [chatId, summaryDate],
  );
  for (const topic of topics) {
    await db.query(
      `INSERT INTO chat_summaries (chat_id, summary_date, message_ids, content, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [
        topic.chatId,
        topic.summaryDate,
        topic.messageIds,
        topic.content,
        toVectorLiteral(topic.embedding),
      ],
    );
  }
  getModuleLiveHooks().emitDataUpdated?.(["chat_summaries"]);
}

interface SummaryRow {
  summary_date: unknown;
  content: string;
  message_ids: unknown;
}

const RRF_K = 60;

/**
 * Hybrid summary search: blends cosine-distance vector ranking with full-text
 * ranking via reciprocal rank fusion. Returns topics most relevant to the query.
 */
export async function searchSummaries(
  chatId: string,
  queryVector: number[],
  queryText: string,
  limit = 8,
): Promise<SummaryMatch[]> {
  const poolSize = Math.max(limit * 4, 20);

  const { rows: vectorRows } = await db.query<SummaryRow>(
    `SELECT summary_date, content, message_ids
       FROM chat_summaries
       WHERE chat_id = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
    [chatId, toVectorLiteral(queryVector), poolSize],
  );

  const ftsQuery = queryText.trim();
  const { rows: ftsRows } = ftsQuery
    ? await db.query<SummaryRow>(
        `SELECT summary_date, content, message_ids
           FROM chat_summaries
           WHERE chat_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
           ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $2)) DESC
           LIMIT $3`,
        [chatId, ftsQuery, poolSize],
      )
    : { rows: [] as SummaryRow[] };

  const fused = new Map<string, SummaryMatch>();
  const fuse = (rows: SummaryRow[]) => {
    rows.forEach((row, index) => {
      const summaryDate = toIsoDate(row.summary_date);
      const key = `${summaryDate}::${row.content}`;
      const contribution = 1 / (RRF_K + index + 1);
      const existing = fused.get(key);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(key, {
          summaryDate,
          content: row.content,
          messageIds: toNumberIds(row.message_ids),
          score: contribution,
        });
      }
    });
  };
  fuse(vectorRows);
  fuse(ftsRows);

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** All stored summary topics for a chat on a given date, for inspection/backfill. */
export async function getSummariesForDate(
  chatId: string,
  summaryDate: string,
): Promise<SummaryTopic[]> {
  const { rows } = await db.query<SummaryRow>(
    `SELECT summary_date, content, message_ids
       FROM chat_summaries
       WHERE chat_id = $1 AND summary_date = $2
       ORDER BY id`,
    [chatId, summaryDate],
  );
  return rows.map((row) => ({
    summaryDate: toIsoDate(row.summary_date),
    content: row.content,
    messageIds: toNumberIds(row.message_ids),
  }));
}
