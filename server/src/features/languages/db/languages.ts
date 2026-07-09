import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";

export const DEFAULT_CHAT_LANGUAGE = "English";

let db: SqlDatabase;

export interface ChatLanguageRecord {
  chatId: number;
  language: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatLanguageRow {
  chat_id: number;
  language: string;
  created_at: number;
  updated_at: number;
}

export async function bindLanguagesDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_languages (
      chat_id BIGINT PRIMARY KEY,
      language TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
}

function rowToRecord(row: ChatLanguageRow): ChatLanguageRecord {
  return {
    chatId: Number(row.chat_id),
    language: row.language,
    createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
    updatedAt: new Date(Number(row.updated_at) * 1000).toISOString(),
  };
}

export function normalizeChatLanguage(language: string): string {
  return language.replace(/\s+/g, " ").trim();
}

function notifyLanguagesChanged(): void {
  getFeatureLiveHooks().emitDataUpdated?.(["chat_languages"]);
}

export async function listChatLanguages(): Promise<ChatLanguageRecord[]> {
  const { rows } = await db.query<ChatLanguageRow>(
    `SELECT chat_id, language, created_at, updated_at
       FROM chat_languages
      ORDER BY chat_id ASC`,
  );
  return rows.map(rowToRecord);
}

export async function getChatLanguage(
  chatId: number,
): Promise<ChatLanguageRecord | null> {
  const { rows } = await db.query<ChatLanguageRow>(
    `SELECT chat_id, language, created_at, updated_at
       FROM chat_languages
      WHERE chat_id = $1`,
    [chatId],
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getRequiredLanguage(
  chatId: number | null | undefined,
): Promise<string> {
  if (!db) return DEFAULT_CHAT_LANGUAGE;
  if (chatId == null || !Number.isFinite(chatId)) return DEFAULT_CHAT_LANGUAGE;
  return (await getChatLanguage(chatId))?.language ?? DEFAULT_CHAT_LANGUAGE;
}

export async function upsertChatLanguage(
  chatId: number,
  language: string,
): Promise<ChatLanguageRecord> {
  const normalized = normalizeChatLanguage(language);
  if (!Number.isFinite(chatId)) {
    throw new Error("chatId is required");
  }
  if (!normalized) {
    throw new Error("language is required");
  }

  const { rows } = await db.query<ChatLanguageRow>(
    `INSERT INTO chat_languages (chat_id, language)
       VALUES ($1, $2)
     ON CONFLICT (chat_id) DO UPDATE SET
       language = EXCLUDED.language,
       updated_at = extract(epoch from now())::bigint
     RETURNING chat_id, language, created_at, updated_at`,
    [chatId, normalized],
  );
  notifyLanguagesChanged();
  return rowToRecord(rows[0]!);
}

export async function deleteChatLanguage(chatId: number): Promise<boolean> {
  const result = await db.query(`DELETE FROM chat_languages WHERE chat_id = $1`, [
    chatId,
  ]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) notifyLanguagesChanged();
  return deleted;
}
