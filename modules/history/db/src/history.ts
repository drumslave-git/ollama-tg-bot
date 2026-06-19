import type { DatabaseSync } from "node:sqlite";
import { getModuleLiveHooks } from "@llm-tg-bot/modules-registry";
import {
  ASSISTANT_ROLE,
  insertIndexAfterMessageId,
  type StoredMessage,
} from "@llm-tg-bot/modules-history";

let db: DatabaseSync;
let readHistoryMaxReplyChars: () => number = () => 4000;

export function bindHistoryDatabase(database: DatabaseSync): void {
  db = database;
  const tableInfo = db.prepare("PRAGMA table_info(chat_history)").all() as {
    name: string;
  }[];
  const hasCompressedAt = tableInfo.some((c) => c.name === "compressed_at");
  if (tableInfo.length > 0 && !hasCompressedAt) {
    db.exec("ALTER TABLE chat_history ADD COLUMN compressed_at INTEGER");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      chat_key TEXT PRIMARY KEY,
      messages TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      compressed_at INTEGER
    );
  `);
}

export function configureHistoryAccess(getLimits: () => {
  historyMaxReplyChars: number;
}): void {
  readHistoryMaxReplyChars = () => getLimits().historyMaxReplyChars;
}

export function listHistoryChatKeys(limit = 100): string[] {
  const rows = db
    .prepare(
      `SELECT chat_key FROM chat_history ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as { chat_key: string }[];
  return rows.map((row) => row.chat_key);
}

export function listDistinctHistoryChatIds(): number[] {
  const rows = db
    .prepare(`SELECT DISTINCT chat_key FROM chat_history`)
    .all() as { chat_key: string }[];
  return rows
    .map((row) => Number(row.chat_key))
    .filter((chatId) => Number.isFinite(chatId));
}

export function getHistory(chatKey: string): StoredMessage[] {
  const row = db
    .prepare(`SELECT messages FROM chat_history WHERE chat_key = ?`)
    .get(chatKey) as { messages: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.messages) as StoredMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredMessage =>
        m != null &&
        typeof m.role === "string" &&
        typeof m.content === "string" &&
        (m.messageId == null || typeof m.messageId === "number"),
    );
  } catch {
    return [];
  }
}

function writeHistory(
  chatKey: string,
  messages: StoredMessage[],
  isCompression = false,
): void {
  if (isCompression) {
    db.prepare(
      `INSERT INTO chat_history (chat_key, messages, updated_at, compressed_at)
       VALUES (?, ?, unixepoch(), unixepoch())
       ON CONFLICT(chat_key) DO UPDATE SET
         messages = excluded.messages,
         updated_at = excluded.updated_at,
         compressed_at = excluded.compressed_at`,
    ).run(chatKey, JSON.stringify(messages));
  } else {
    db.prepare(
      `INSERT INTO chat_history (chat_key, messages, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(chat_key) DO UPDATE SET
         messages = excluded.messages,
         updated_at = excluded.updated_at`,
    ).run(chatKey, JSON.stringify(messages));
  }
  getModuleLiveHooks().emitDataUpdated?.(["chat_history"]);
}

export function appendMessage(
  chatKey: string,
  role: string,
  content: string,
  options?: { messageId?: number },
): void {
  const trimmed = content.trim();
  if (!trimmed) return;

  let stored = trimmed;
  if (role === ASSISTANT_ROLE) {
    const historyMaxReplyChars = readHistoryMaxReplyChars();
    if (stored.length > historyMaxReplyChars) {
      stored = `${stored.slice(0, historyMaxReplyChars)}…`;
    }
  }

  const messages = getHistory(chatKey);
  const row: StoredMessage = { role, content: stored };
  if (options?.messageId != null) {
    row.messageId = options.messageId;
  }
  messages.push(row);
  writeHistory(chatKey, messages);
}

export function clearHistory(chatKey: string): void {
  db.prepare(`DELETE FROM chat_history WHERE chat_key = ?`).run(chatKey);
  getModuleLiveHooks().emitDataUpdated?.(["chat_history"]);
}

export function replaceHistory(
  chatKey: string,
  messages: StoredMessage[],
  isCompression = false,
): void {
  const cleaned = messages
    .map((m) => ({
      role: m.role,
      content: m.content.trim(),
      messageId: m.messageId,
      compressedAt: m.compressedAt,
    }))
    .filter((m) => m.content);
  writeHistory(chatKey, cleaned, isCompression);
}

export function appendAssistantMessage(
  chatKey: string,
  assistantText: string,
): void {
  appendMessage(
    chatKey,
    ASSISTANT_ROLE,
    `[assistant said]: ${assistantText.trim()}`,
  );
}

/** Insert assistant reply immediately after the anchored Telegram message rows. */
export function insertAssistantAfterMessage(
  chatKey: string,
  anchorMessageId: number,
  assistantText: string,
): boolean {
  const trimmed = assistantText.trim();
  if (!trimmed) return false;

  let stored = `[assistant said]: ${trimmed}`;
  const historyMaxReplyChars = readHistoryMaxReplyChars();
  if (stored.length > historyMaxReplyChars) {
    stored = `${stored.slice(0, historyMaxReplyChars)}…`;
  }

  const messages = getHistory(chatKey);
  const insertAt = insertIndexAfterMessageId(messages, anchorMessageId);
  messages.splice(insertAt, 0, { role: ASSISTANT_ROLE, content: stored });
  writeHistory(chatKey, messages);
  return true;
}

/** Replace one history row by index (used after vision backfill). */
export function replaceHistoryMessageAt(
  chatKey: string,
  index: number,
  content: string,
): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;

  const messages = getHistory(chatKey);
  if (index < 0 || index >= messages.length) return false;

  messages[index] = { ...messages[index]!, content: trimmed };
  writeHistory(chatKey, messages);
  return true;
}

/** Scan history and replace base64 media lines using the provided mapper. */
export function mapHistoryBase64Media(
  chatKey: string,
  isBase64Media: (content: string) => boolean,
  replace: (content: string) => string | null,
): number {
  const messages = getHistory(chatKey);
  let updated = 0;

  for (let i = 0; i < messages.length; i++) {
    const row = messages[i]!;
    if (!isBase64Media(row.content)) continue;
    const next = replace(row.content);
    if (!next || next === row.content) continue;
    messages[i] = { ...row, content: next };
    updated++;
  }

  if (updated > 0) {
    writeHistory(chatKey, messages);
  }
  return updated;
}
