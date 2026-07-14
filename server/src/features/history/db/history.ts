import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";
import { ASSISTANT_ROLE, type StoredMessage } from "../types.js";

let db: SqlDatabase;

/** Hard cap on rows returned by any single history tool query. */
const MAX_QUERY_ROWS = 200;
/** Cap on rows returned by a range query (can span a wide window). */
const MAX_RANGE_ROWS = 500;

export async function bindHistoryDatabase(database: SqlDatabase): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entity_id  TEXT    NOT NULL,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      message_id BIGINT,
      created_at BIGINT  NOT NULL DEFAULT extract(epoch from now())::bigint,
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
    );
  `);
  // Reply pointer: the Telegram message_id this row replied to (null when it
  // was not a reply). Added after the fact, so ADD COLUMN IF NOT EXISTS.
  await db.query(
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT;`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_entity_time
       ON chat_messages(entity_id, created_at);`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_entity_msgid
       ON chat_messages(entity_id, message_id);`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_tsv
       ON chat_messages USING GIN(tsv);`,
  );
}

interface MessageRow {
  id: number;
  role: string;
  content: string;
  message_id: number | null;
  reply_to_message_id: number | null;
  created_at: number;
}

const SELECT_COLUMNS =
  "id, role, content, message_id, reply_to_message_id, created_at";

function rowToStored(row: MessageRow): StoredMessage {
  const stored: StoredMessage = {
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
  if (row.message_id != null) stored.messageId = row.message_id;
  if (row.reply_to_message_id != null) {
    stored.replyToMessageId = row.reply_to_message_id;
  }
  return stored;
}

function clampCount(count: number, max: number): number {
  if (!Number.isFinite(count)) return Math.min(50, max);
  return Math.max(1, Math.min(Math.floor(count), max));
}

/** Entity ids with stored history, most-recently-active first. */
export async function listHistoryChatKeys(limit = 100): Promise<string[]> {
  const { rows } = await db.query<{ entity_id: string }>(
    `SELECT entity_id, MAX(created_at) AS last_at
       FROM chat_messages
      GROUP BY entity_id
      ORDER BY last_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((row) => row.entity_id);
}

export async function listDistinctHistoryChatIds(): Promise<number[]> {
  const { rows } = await db.query<{ entity_id: string }>(
    `SELECT DISTINCT entity_id FROM chat_messages`,
  );
  return rows
    .map((row) => Number(row.entity_id))
    .filter((chatId) => Number.isFinite(chatId));
}

/** All stored messages for an entity, oldest first. */
export async function getHistory(entityId: string): Promise<StoredMessage[]> {
  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 ORDER BY id`,
    [entityId],
  );
  return rows.map(rowToStored);
}

/** Latest N messages for an entity, returned oldest first. */
export async function getLatestMessages(
  entityId: string,
  count: number,
): Promise<StoredMessage[]> {
  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 ORDER BY id DESC LIMIT $2`,
    [entityId, clampCount(count, MAX_QUERY_ROWS)],
  );
  return rows.reverse().map(rowToStored);
}

/**
 * Latest N messages stored strictly before row `beforeId`, oldest first. Used
 * to build the live recent-conversation window for a turn without re-including
 * the current message (which intake already persisted).
 */
export async function getLatestMessagesBefore(
  entityId: string,
  beforeId: number,
  count: number,
): Promise<StoredMessage[]> {
  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3`,
    [entityId, beforeId, clampCount(count, MAX_QUERY_ROWS)],
  );
  return rows.reverse().map(rowToStored);
}

/**
 * Full-text search over message content for an entity, oldest first. Uses
 * Postgres FTS (`websearch_to_tsquery`); when that matches nothing, falls back
 * to a case-insensitive substring scan so single-word/name lookups still work.
 */
export async function searchMessages(
  entityId: string,
  query: string,
  limit = 50,
): Promise<StoredMessage[]> {
  const q = query.trim();
  if (!q) return [];
  const cappedLimit = clampCount(limit, MAX_QUERY_ROWS);

  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
       ORDER BY id DESC LIMIT $3`,
    [entityId, q, cappedLimit],
  );
  if (rows.length > 0) return rows.reverse().map(rowToStored);

  const { rows: fallback } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND content ILIKE '%' || $2 || '%'
       ORDER BY id DESC LIMIT $3`,
    [entityId, q, cappedLimit],
  );
  return fallback.reverse().map(rowToStored);
}

/**
 * Full-text search restricted to messages on/after `sinceTs` (epoch seconds),
 * oldest first. Used by the "today" history tool. FTS with an ILIKE fallback,
 * mirroring {@link searchMessages}.
 */
export async function searchMessagesSince(
  entityId: string,
  query: string,
  sinceTs: number,
  limit = 50,
): Promise<StoredMessage[]> {
  const q = query.trim();
  if (!q) return [];
  const cappedLimit = clampCount(limit, MAX_QUERY_ROWS);

  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND created_at >= $2
         AND tsv @@ websearch_to_tsquery('simple', $3)
       ORDER BY id DESC LIMIT $4`,
    [entityId, sinceTs, q, cappedLimit],
  );
  if (rows.length > 0) return rows.reverse().map(rowToStored);

  const { rows: fallback } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND created_at >= $2
         AND content ILIKE '%' || $3 || '%'
       ORDER BY id DESC LIMIT $4`,
    [entityId, sinceTs, q, cappedLimit],
  );
  return fallback.reverse().map(rowToStored);
}

/** Latest N messages on/after `sinceTs` (epoch seconds), oldest first. */
export async function getLatestMessagesSince(
  entityId: string,
  sinceTs: number,
  count: number,
): Promise<StoredMessage[]> {
  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND created_at >= $2
       ORDER BY id DESC LIMIT $3`,
    [entityId, sinceTs, clampCount(count, MAX_QUERY_ROWS)],
  );
  return rows.reverse().map(rowToStored);
}

/** Messages whose created_at falls within [fromTs, toTs] (epoch seconds), oldest first. */
export async function getMessagesInRange(
  entityId: string,
  fromTs: number,
  toTs: number,
): Promise<StoredMessage[]> {
  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY id LIMIT $4`,
    [entityId, fromTs, toTs, MAX_RANGE_ROWS],
  );
  return rows.map(rowToStored);
}

/**
 * Background readers should not silently drop the tail of a busy day. Iterate a
 * range in bounded DB pages so callers can keep chunking for the model while
 * still covering every stored row.
 */
export async function* getMessagesInRangeBatches(
  entityId: string,
  fromTs: number,
  toTs: number,
  pageSize = MAX_RANGE_ROWS,
): AsyncGenerator<StoredMessage[]> {
  const limit = clampCount(pageSize, MAX_RANGE_ROWS);
  let lastId = 0;

  while (true) {
    const { rows } = await db.query<MessageRow>(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages
         WHERE entity_id = $1
           AND created_at >= $2
           AND created_at <= $3
           AND id > $4
         ORDER BY id LIMIT $5`,
      [entityId, fromTs, toTs, lastId, limit],
    );
    if (rows.length === 0) break;

    yield rows.map(rowToStored);
    lastId = Number(rows[rows.length - 1]!.id);
    if (rows.length < limit) break;
  }
}

/**
 * Iterate an entity's entire stored history oldest-first in bounded DB pages.
 * Used by the export route, which must cover every row without loading a
 * potentially huge chat into memory at once.
 */
export async function* getHistoryBatches(
  entityId: string,
  pageSize = MAX_RANGE_ROWS,
): AsyncGenerator<StoredMessage[]> {
  const limit = clampCount(pageSize, MAX_RANGE_ROWS);
  let lastId = 0;

  while (true) {
    const { rows } = await db.query<MessageRow>(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages
         WHERE entity_id = $1 AND id > $2
         ORDER BY id LIMIT $3`,
      [entityId, lastId, limit],
    );
    if (rows.length === 0) break;

    yield rows.map(rowToStored);
    lastId = Number(rows[rows.length - 1]!.id);
    if (rows.length < limit) break;
  }
}

/** Fetch specific messages by their Telegram message_id, oldest first. */
export async function getMessagesByMessageIds(
  entityId: string,
  messageIds: number[],
): Promise<StoredMessage[]> {
  const ids = [...new Set(messageIds.filter((n) => Number.isFinite(n)))];
  if (ids.length === 0) return [];
  const { rows } = await db.query<MessageRow>(
    `SELECT ${SELECT_COLUMNS} FROM chat_messages
       WHERE entity_id = $1 AND message_id = ANY($2)
       ORDER BY id LIMIT $3`,
    [entityId, ids, MAX_RANGE_ROWS],
  );
  return rows.map(rowToStored);
}

export async function appendMessage(
  entityId: string,
  role: string,
  content: string,
  options?: { messageId?: number; replyToMessageId?: number },
): Promise<number | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO chat_messages (entity_id, role, content, message_id, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      entityId,
      role,
      trimmed,
      options?.messageId ?? null,
      options?.replyToMessageId ?? null,
    ],
  );
  getFeatureLiveHooks().emitDataUpdated?.(["chat_messages"]);
  return rows[0]?.id ?? null;
}

export async function appendAssistantMessage(
  entityId: string,
  assistantText: string,
  options?: { messageId?: number; replyToMessageId?: number },
): Promise<void> {
  // The `assistant` role already identifies the speaker; the human-readable
  // `[assistant said]` tag is added at format time (see formatStoredMessageLine),
  // so the stored content stays clean. `messageId` (the delivered Telegram id) is
  // stored when the caller knows it — e.g. task fires join task_messages back to
  // this row to recall prior wording. `replyToMessageId` is the message this
  // reply threads to, so history renders the bot's reply link like any other.
  await appendMessage(entityId, ASSISTANT_ROLE, assistantText.trim(), {
    ...(options?.messageId != null ? { messageId: options.messageId } : {}),
    ...(options?.replyToMessageId != null
      ? { replyToMessageId: options.replyToMessageId }
      : {}),
  });
}

export async function clearHistory(entityId: string): Promise<void> {
  await db.query(`DELETE FROM chat_messages WHERE entity_id = $1`, [entityId]);
  getFeatureLiveHooks().emitDataUpdated?.(["chat_messages"]);
}

/** Scan an entity's rows and replace base64 media content using the mapper (vision backfill). */
export async function mapHistoryBase64Media(
  entityId: string,
  isBase64Media: (content: string) => boolean,
  replace: (content: string) => string | null,
): Promise<number> {
  const { rows } = await db.query<{ id: number; content: string }>(
    `SELECT id, content FROM chat_messages WHERE entity_id = $1`,
    [entityId],
  );
  let updated = 0;

  for (const row of rows) {
    if (!isBase64Media(row.content)) continue;
    const next = replace(row.content);
    if (!next || next === row.content) continue;
    await db.query(`UPDATE chat_messages SET content = $1 WHERE id = $2`, [
      next,
      row.id,
    ]);
    updated++;
  }

  if (updated > 0) {
    getFeatureLiveHooks().emitDataUpdated?.(["chat_messages"]);
  }
  return updated;
}
