import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage } from "../llm/client.js";
import {
  stripAssistantHistoryEnvelope,
  parseUserRole,
} from "../bot/history-format.js";
import type { Settings } from "./database.js";
import {
  APPROX_CHARS_PER_TOKEN,
  getHistoryLimits,
} from "../settings-limits.js";

export const ASSISTANT_ROLE = "assistant";
export const COMPRESSED_ROLE = "compressed";

let readSettings: () => Settings = () => {
  throw new Error("History module not initialized");
};

export function configureHistoryAccess(getSettings: () => Settings): void {
  readSettings = getSettings;
}

export interface StoredMessage {
  role: string;
  content: string;
  compressedAt?: number;
}

export function isCompressedRole(role: string): boolean {
  return role === COMPRESSED_ROLE;
}

let db: DatabaseSync;

export function bindHistoryDatabase(database: DatabaseSync): void {
  db = database;
  // Migration: Add compressed_at column if it doesn't exist
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

/** Chat id for DM or group. Forum topics share the group key (no thread suffix). */
export function conversationKey(chatId: number): string {
  return String(chatId);
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
        typeof m.content === "string",
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
  void import("../live-events.js").then(({ emitDataUpdated }) => {
    emitDataUpdated(["chat_history"]);
  });
}

export function appendMessage(
  chatKey: string,
  role: string,
  content: string,
): void {
  const trimmed = content.trim();
  if (!trimmed) return;

  let stored = trimmed;
  if (role === ASSISTANT_ROLE) {
    const { historyMaxReplyChars } = getHistoryLimits(readSettings());
    if (stored.length > historyMaxReplyChars) {
      stored = `${stored.slice(0, historyMaxReplyChars)}…`;
    }
  }

  const messages = getHistory(chatKey);
  messages.push({ role, content: stored });
  writeHistory(chatKey, messages);
}

export function clearHistory(chatKey: string): void {
  db.prepare(`DELETE FROM chat_history WHERE chat_key = ?`).run(chatKey);
  void import("../live-events.js").then(({ emitDataUpdated }) => {
    emitDataUpdated(["chat_history"]);
  });
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
      compressedAt: m.compressedAt,
    }))
    .filter((m) => m.content);
  writeHistory(chatKey, cleaned, isCompression);
}

export function historyTotalChars(history: StoredMessage[]): number {
  return history.reduce((n, m) => n + m.content.length, 0);
}

export function historyTotalTokens(history: StoredMessage[]): number {
  if (history.length === 0) return 0;
  return Math.ceil(historyTotalChars(history) / APPROX_CHARS_PER_TOKEN);
}

export function historyToChatMessages(history: StoredMessage[]): ChatMessage[] {
  return history.map((m) => {
    const role = m.role === ASSISTANT_ROLE ? "assistant" : "user";
    const isAssistant = role === "assistant";
    const parsedUser = parseUserRole(m.role);

    let content = m.content;
    let name: string | undefined;

    if (isCompressedRole(m.role)) {
      content = m.content;
      name = "narrative_summary";
    } else if (isAssistant) {
      content = stripAssistantHistoryEnvelope(m.content);
    } else if (parsedUser) {
      // Use sanitized username for the 'name' field
      name = parsedUser.username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
      content = m.content;
    }

    return { role, content, name };
  });
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
