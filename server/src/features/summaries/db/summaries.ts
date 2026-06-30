import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";
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
  getFeatureLiveHooks().emitDataUpdated?.(["chat_summaries"]);
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

export interface SummaryChatStat {
  chatId: string;
  messageCount: number;
  /** ISO timestamp of the most recent stored message. */
  lastMessageAt: string;
  topicCount: number;
  summaryDays: number;
  /** YYYY-MM-DD of the latest summarized day, or null if never summarized. */
  lastSummaryDate: string | null;
}

/**
 * Every chat that has stored history, newest-active first, annotated with how
 * many summary topics/days it has. Drives the History page chat list. Joins
 * across `chat_messages` (history feature) — both tables share this database.
 */
export async function listSummaryChats(): Promise<SummaryChatStat[]> {
  const { rows } = await db.query<{
    chat_id: string;
    message_count: number;
    last_message_at: number;
    topic_count: number;
    summary_days: number;
    last_summary_date: unknown;
  }>(`
    SELECT m.entity_id AS chat_id,
           COUNT(*)::int AS message_count,
           MAX(m.created_at)::bigint AS last_message_at,
           COALESCE(s.topic_count, 0) AS topic_count,
           COALESCE(s.summary_days, 0) AS summary_days,
           s.last_summary_date::text AS last_summary_date
      FROM chat_messages m
      LEFT JOIN (
        SELECT chat_id,
               COUNT(*)::int AS topic_count,
               COUNT(DISTINCT summary_date)::int AS summary_days,
               MAX(summary_date) AS last_summary_date
          FROM chat_summaries
         GROUP BY chat_id
      ) s ON s.chat_id = m.entity_id
     GROUP BY m.entity_id, s.topic_count, s.summary_days, s.last_summary_date
     ORDER BY MAX(m.created_at) DESC
  `);
  return rows.map((row) => ({
    chatId: row.chat_id,
    messageCount: Number(row.message_count),
    lastMessageAt: new Date(Number(row.last_message_at) * 1000).toISOString(),
    topicCount: Number(row.topic_count),
    summaryDays: Number(row.summary_days),
    lastSummaryDate: row.last_summary_date
      ? toIsoDate(row.last_summary_date)
      : null,
  }));
}

export interface SummaryTopicRecord {
  id: number;
  content: string;
  messageIds: number[];
}

export interface SummaryDayGroup {
  summaryDate: string;
  topics: SummaryTopicRecord[];
}

/** All stored topics for a chat, grouped by day (newest day first). */
export async function listSummaryDaysForChat(
  chatId: string,
): Promise<SummaryDayGroup[]> {
  const { rows } = await db.query<{
    id: number;
    summary_date: unknown;
    content: string;
    message_ids: unknown;
  }>(
    `SELECT id, summary_date::text AS summary_date, content, message_ids
       FROM chat_summaries
       WHERE chat_id = $1
       ORDER BY summary_date DESC, id ASC`,
    [chatId],
  );

  const days: SummaryDayGroup[] = [];
  let current: SummaryDayGroup | null = null;
  for (const row of rows) {
    const summaryDate = toIsoDate(row.summary_date);
    if (!current || current.summaryDate !== summaryDate) {
      current = { summaryDate, topics: [] };
      days.push(current);
    }
    current.topics.push({
      id: Number(row.id),
      content: row.content,
      messageIds: toNumberIds(row.message_ids),
    });
  }
  return days;
}

export interface SummaryTopicDetail extends SummaryTopicRecord {
  chatId: string;
  summaryDate: string;
}

/** A single topic by primary key, with its chat and source message ids. */
export async function getSummaryTopicById(
  id: number,
): Promise<SummaryTopicDetail | null> {
  const { rows } = await db.query<{
    id: number;
    chat_id: string;
    summary_date: unknown;
    content: string;
    message_ids: unknown;
  }>(
    `SELECT id, chat_id, summary_date::text AS summary_date, content, message_ids
       FROM chat_summaries WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    summaryDate: toIsoDate(row.summary_date),
    content: row.content,
    messageIds: toNumberIds(row.message_ids),
  };
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
