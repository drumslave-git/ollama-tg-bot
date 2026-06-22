import type { DatabaseSync } from "node:sqlite";
import { getModuleLiveHooks } from "../../../contracts/index.js";
import { ASSISTANT_ROLE, type StoredMessage } from "../index.js";

let db: DatabaseSync;

/** Hard cap on rows returned by any single history tool query. */
const MAX_QUERY_ROWS = 200;
/** Cap on rows returned by a range query (can span a wide window). */
const MAX_RANGE_ROWS = 500;

export function bindHistoryDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id  TEXT    NOT NULL,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      message_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_entity_time
       ON chat_messages(entity_id, created_at);`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_entity_msgid
       ON chat_messages(entity_id, message_id);`,
  );
  // History moved from a per-chat JSON blob to a row-per-message table.
  // Start fresh: the old blob carried no per-message timestamps.
  db.exec(`DROP TABLE IF EXISTS chat_history;`);
}

interface MessageRow {
  id: number;
  role: string;
  content: string;
  message_id: number | null;
  created_at: number;
}

const SELECT_COLUMNS =
  "id, role, content, message_id, created_at";

function rowToStored(row: MessageRow): StoredMessage {
  const stored: StoredMessage = {
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
  if (row.message_id != null) stored.messageId = row.message_id;
  return stored;
}

function clampCount(count: number, max: number): number {
  if (!Number.isFinite(count)) return Math.min(50, max);
  return Math.max(1, Math.min(Math.floor(count), max));
}

/** Entity ids with stored history, most-recently-active first. */
export function listHistoryChatKeys(limit = 100): string[] {
  const rows = db
    .prepare(
      `SELECT entity_id, MAX(created_at) AS last_at
         FROM chat_messages
        GROUP BY entity_id
        ORDER BY last_at DESC
        LIMIT ?`,
    )
    .all(limit) as { entity_id: string }[];
  return rows.map((row) => row.entity_id);
}

export function listDistinctHistoryChatIds(): number[] {
  const rows = db
    .prepare(`SELECT DISTINCT entity_id FROM chat_messages`)
    .all() as { entity_id: string }[];
  return rows
    .map((row) => Number(row.entity_id))
    .filter((chatId) => Number.isFinite(chatId));
}

/** All stored messages for an entity, oldest first. */
export function getHistory(entityId: string): StoredMessage[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages
        WHERE entity_id = ? ORDER BY id`,
    )
    .all(entityId) as unknown as MessageRow[];
  return rows.map(rowToStored);
}

/** Latest N messages for an entity, returned oldest first. */
export function getLatestMessages(
  entityId: string,
  count: number,
): StoredMessage[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages
        WHERE entity_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(entityId, clampCount(count, MAX_QUERY_ROWS)) as unknown as MessageRow[];
  return rows.reverse().map(rowToStored);
}

/** Case-insensitive substring search over message content, oldest first. */
export function searchMessages(
  entityId: string,
  query: string,
  limit = 50,
): StoredMessage[] {
  const q = query.trim();
  if (!q) return [];
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages
        WHERE entity_id = ? AND instr(lower(content), lower(?)) > 0
        ORDER BY id DESC LIMIT ?`,
    )
    .all(entityId, q, clampCount(limit, MAX_QUERY_ROWS)) as unknown as MessageRow[];
  return rows.reverse().map(rowToStored);
}

/** Messages whose created_at falls within [fromTs, toTs] (epoch seconds), oldest first. */
export function getMessagesInRange(
  entityId: string,
  fromTs: number,
  toTs: number,
): StoredMessage[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages
        WHERE entity_id = ? AND created_at >= ? AND created_at <= ?
        ORDER BY id LIMIT ?`,
    )
    .all(entityId, fromTs, toTs, MAX_RANGE_ROWS) as unknown as MessageRow[];
  return rows.map(rowToStored);
}

export function appendMessage(
  entityId: string,
  role: string,
  content: string,
  options?: { messageId?: number },
): void {
  const trimmed = content.trim();
  if (!trimmed) return;

  db.prepare(
    `INSERT INTO chat_messages (entity_id, role, content, message_id)
     VALUES (?, ?, ?, ?)`,
  ).run(entityId, role, trimmed, options?.messageId ?? null);
  getModuleLiveHooks().emitDataUpdated?.(["chat_messages"]);
}

export function appendAssistantMessage(
  entityId: string,
  assistantText: string,
): void {
  appendMessage(
    entityId,
    ASSISTANT_ROLE,
    `[assistant said]: ${assistantText.trim()}`,
  );
}

export function clearHistory(entityId: string): void {
  db.prepare(`DELETE FROM chat_messages WHERE entity_id = ?`).run(entityId);
  getModuleLiveHooks().emitDataUpdated?.(["chat_messages"]);
}

/** Scan an entity's rows and replace base64 media content using the mapper (vision backfill). */
export function mapHistoryBase64Media(
  entityId: string,
  isBase64Media: (content: string) => boolean,
  replace: (content: string) => string | null,
): number {
  const rows = db
    .prepare(`SELECT id, content FROM chat_messages WHERE entity_id = ?`)
    .all(entityId) as { id: number; content: string }[];
  let updated = 0;

  for (const row of rows) {
    if (!isBase64Media(row.content)) continue;
    const next = replace(row.content);
    if (!next || next === row.content) continue;
    db.prepare(`UPDATE chat_messages SET content = ? WHERE id = ?`).run(
      next,
      row.id,
    );
    updated++;
  }

  if (updated > 0) {
    getModuleLiveHooks().emitDataUpdated?.(["chat_messages"]);
  }
  return updated;
}
