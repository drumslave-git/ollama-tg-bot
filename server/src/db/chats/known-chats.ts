import type { Chat } from "@grammyjs/types";
import type { SqlDatabase } from "../../contracts/index.js";

let db: SqlDatabase;

export interface KnownChatRecord {
  chatId: string;
  type: string;
  title: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  label: string;
  messageCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

type KnownChatRow = {
  chat_id: string;
  type: string;
  title: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  message_count: number;
  last_message_at: number | null;
  updated_at: number;
};

export async function bindKnownChatsDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS known_chats (
      chat_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_known_chats_type_updated
      ON known_chats (type, updated_at DESC);
  `);
}

function chatStringProp(chat: Chat, key: string): string | null {
  const value = (chat as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function formatChatLabel(row: {
  chat_id: string;
  type: string;
  title: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (row.type === "private") {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
    if (name && row.username) return `${name} (@${row.username})`;
    if (name) return name;
    if (row.username) return `@${row.username}`;
    return `Private chat ${row.chat_id}`;
  }

  if (row.title) return row.title;
  if (row.username) return `@${row.username}`;
  return `Chat ${row.chat_id}`;
}

function isoFromEpochSeconds(value: number | null): string | null {
  return value == null ? null : new Date(value * 1000).toISOString();
}

function rowToRecord(row: KnownChatRow): KnownChatRecord {
  return {
    chatId: row.chat_id,
    type: row.type,
    title: row.title,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    label: formatChatLabel(row),
    messageCount: Number(row.message_count ?? 0),
    lastMessageAt: isoFromEpochSeconds(row.last_message_at),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
  };
}

export async function rememberTelegramChat(
  chat: Chat | undefined,
): Promise<void> {
  if (!chat?.id) return;

  await db.query(
    `INSERT INTO known_chats (
       chat_id, type, title, username, first_name, last_name, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, extract(epoch from now())::bigint)
     ON CONFLICT (chat_id) DO UPDATE SET
       type = excluded.type,
       title = excluded.title,
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       updated_at = extract(epoch from now())::bigint`,
    [
      String(chat.id),
      chat.type,
      chatStringProp(chat, "title"),
      chatStringProp(chat, "username")?.toLowerCase() ?? null,
      chatStringProp(chat, "first_name"),
      chatStringProp(chat, "last_name"),
    ],
  );

  void import("../../dashboard/live-events.js").then(({ emitDataUpdated }) => {
    emitDataUpdated(["known_chats"]);
  });
}

export async function listKnownChats(): Promise<KnownChatRecord[]> {
  const { rows } = await db.query<KnownChatRow>(
    `WITH history AS (
       SELECT entity_id AS chat_id,
              COUNT(*)::int AS message_count,
              MAX(created_at) AS last_message_at
         FROM chat_messages
        GROUP BY entity_id
     )
     SELECT COALESCE(kc.chat_id, h.chat_id) AS chat_id,
            COALESCE(
              kc.type,
              CASE WHEN h.chat_id LIKE '-%' THEN 'group' ELSE 'private' END
            ) AS type,
            kc.title,
            kc.username,
            kc.first_name,
            kc.last_name,
            COALESCE(h.message_count, 0)::int AS message_count,
            h.last_message_at,
            COALESCE(kc.updated_at, h.last_message_at) AS updated_at
       FROM known_chats kc
       FULL OUTER JOIN history h ON h.chat_id = kc.chat_id
      ORDER BY COALESCE(kc.updated_at, h.last_message_at) DESC,
               COALESCE(kc.chat_id, h.chat_id)`,
  );

  return rows.map(rowToRecord);
}
