import type { SqlDatabase } from "../../contracts/index.js";
import { redactBase64MediaForDisplay } from "../../features/history/format.js";
import {
  type EntriesTableConfig,
  type EntryType,
  type ProcessingEntry,
  type ProcessingStatus,
  createEntriesTable,
  insertEntry,
  listEntries,
} from "./processing-entries.js";

export type { EntryType, ProcessingStatus } from "./processing-entries.js";

let db: SqlDatabase;

/** Keep at most this many processings per chat; older ones (and their entries) are trimmed. */
export const MAX_PROCESSINGS_PER_CHAT = 50;

/** Entries table wiring for the message-processing domain. */
const ENTRIES: EntriesTableConfig = {
  entriesTable: "message_processing_entries",
  processingsTable: "message_processings",
  fkColumn: "message_processing_id",
};

export type MessageProcessingEntry = ProcessingEntry;

export interface MessageProcessingListItem {
  id: number;
  chatMessageId: number;
  messageId: number | null;
  messagePreview: string;
  userLabel: string | null;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  entryCount: number;
  createdAt: string;
}

export interface ProcessingChatSummary {
  entityId: string;
  label: string;
  processingCount: number;
  latestAt: string | null;
}

export interface MessageProcessingDetail {
  id: number;
  entityId: string;
  chatMessageId: number;
  messageId: number | null;
  messagePreview: string;
  userLabel: string | null;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  createdAt: string;
  entries: MessageProcessingEntry[];
}

export async function bindMessageProcessingDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS message_processings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      chat_message_id BIGINT NOT NULL UNIQUE
        REFERENCES chat_messages (id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'processing',
      total_time_spent BIGINT,
      reply_message_ids BIGINT[] NOT NULL DEFAULT '{}',
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await createEntriesTable(db, ENTRIES);
}

/** First line of a stored message, with any pending base64 media redacted. */
function messagePreview(content: string): string {
  const redacted = redactBase64MediaForDisplay(content) ?? content;
  return redacted.split("\n")[0]?.slice(0, 200) ?? "";
}

function emitProcessingUpdate(entityId: string, processingId: number): void {
  void import("../../dashboard/live-events.js").then(
    ({ emitDebugUpdated, emitDataUpdated }) => {
      emitDebugUpdated({ entityId, processingId });
      emitDataUpdated(["message_processings", "message_processing_entries"]);
    },
  );
}

/** Resolve the chat (entity) a processing belongs to via its chat message. */
async function entityForChatMessage(
  chatMessageId: number,
): Promise<string | null> {
  const { rows } = await db.query<{ entity_id: string }>(
    `SELECT entity_id FROM chat_messages WHERE id = $1`,
    [chatMessageId],
  );
  return rows[0]?.entity_id ?? null;
}

/**
 * Ensure a processing row exists for a stored chat message, returning its id.
 * Idempotent — the unique chat_message_id makes repeat calls a no-op.
 */
export async function ensureMessageProcessing(
  chatMessageId: number,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO message_processings (chat_message_id)
       VALUES ($1)
     ON CONFLICT (chat_message_id) DO UPDATE
       SET chat_message_id = excluded.chat_message_id
     RETURNING id`,
    [chatMessageId],
  );
  return rows[0]?.id ?? null;
}

async function trimProcessingsForEntity(entityId: string): Promise<void> {
  await db.query(
    `DELETE FROM message_processings mp
        USING chat_messages cm
       WHERE mp.chat_message_id = cm.id
         AND cm.entity_id = $1
         AND mp.id NOT IN (
           SELECT mp2.id
             FROM message_processings mp2
             JOIN chat_messages cm2 ON mp2.chat_message_id = cm2.id
            WHERE cm2.entity_id = $1
            ORDER BY mp2.id DESC
            LIMIT $2
         )`,
    [entityId, MAX_PROCESSINGS_PER_CHAT],
  );
}

/**
 * Append one entry to a message's processing, creating the processing row on the
 * first call. `id` is the chat_messages.id of the triggering message.
 */
export async function reportMessageProcessing(
  chatMessageId: number,
  title: string,
  type: EntryType,
  content: string,
): Promise<void> {
  const processingId = await ensureMessageProcessing(chatMessageId);
  if (processingId == null) return;

  await insertEntry(db, ENTRIES, processingId, title, type, content);

  const entityId = await entityForChatMessage(chatMessageId);
  if (entityId) {
    await trimProcessingsForEntity(entityId);
    emitProcessingUpdate(entityId, processingId);
  }
}

/** Set the terminal status (and elapsed time / bot reply ids) of a processing. */
export async function setMessageProcessingStatus(
  chatMessageId: number,
  status: ProcessingStatus,
  options?: { totalTimeSpentMs?: number; replyMessageIds?: number[] },
): Promise<void> {
  await ensureMessageProcessing(chatMessageId);
  await db.query(
    `UPDATE message_processings
        SET status = $2,
            total_time_spent = COALESCE($3, total_time_spent),
            reply_message_ids = CASE
              WHEN $4::bigint[] IS NOT NULL AND array_length($4::bigint[], 1) > 0
                THEN $4::bigint[]
              ELSE reply_message_ids
            END
      WHERE chat_message_id = $1`,
    [
      chatMessageId,
      status,
      options?.totalTimeSpentMs ?? null,
      options?.replyMessageIds ?? null,
    ],
  );
  const entityId = await entityForChatMessage(chatMessageId);
  if (entityId) emitProcessingUpdate(entityId, chatMessageId);
}

type UserNameRow = {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

async function lookupUserLabel(entityOrUserId: string): Promise<string | null> {
  const { rows } = await db.query<UserNameRow>(
    `SELECT username, first_name, last_name FROM known_users WHERE user_id = $1`,
    [entityOrUserId],
  );
  const user = rows[0];
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (name && user.username) return `${name} (@${user.username})`;
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return null;
}

/** Distinct chats with stored processings, most-recent first. */
export async function listProcessingChats(): Promise<ProcessingChatSummary[]> {
  const { rows } = await db.query<{
    entity_id: string;
    processing_count: number;
    latest_at: number | null;
  }>(
    `SELECT cm.entity_id,
            COUNT(*)::int AS processing_count,
            MAX(mp.created_at) AS latest_at
       FROM message_processings mp
       JOIN chat_messages cm ON mp.chat_message_id = cm.id
      GROUP BY cm.entity_id
      ORDER BY latest_at DESC`,
  );

  return Promise.all(
    rows.map(async (row) => ({
      entityId: row.entity_id,
      label: (await lookupUserLabel(row.entity_id)) ?? `Chat ${row.entity_id}`,
      processingCount: row.processing_count,
      latestAt:
        row.latest_at != null
          ? new Date(row.latest_at * 1000).toISOString()
          : null,
    })),
  );
}

type ProcessingListRow = {
  id: number;
  chat_message_id: number;
  message_id: number | null;
  content: string;
  role: string;
  status: ProcessingStatus;
  total_time_spent: number | null;
  entry_count: number;
  created_at: number;
};

function roleUserId(role: string): string | null {
  // Stored user roles look like `user:name:<id>`.
  const parts = role.split(":");
  return parts[0] === "user" ? (parts.at(-1) ?? null) : null;
}

async function toListItem(
  row: ProcessingListRow,
): Promise<MessageProcessingListItem> {
  const userId = roleUserId(row.role);
  return {
    id: row.id,
    chatMessageId: row.chat_message_id,
    messageId: row.message_id,
    messagePreview: messagePreview(row.content),
    userLabel: userId ? await lookupUserLabel(userId) : null,
    status: row.status,
    totalTimeSpent: row.total_time_spent,
    entryCount: row.entry_count,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

export async function listProcessingsForChat(
  entityId: string,
): Promise<MessageProcessingListItem[]> {
  const { rows } = await db.query<ProcessingListRow>(
    `SELECT mp.id, mp.chat_message_id, cm.message_id, cm.content, cm.role,
            mp.status, mp.total_time_spent, mp.created_at,
            (SELECT COUNT(*)::int FROM message_processing_entries e
               WHERE e.message_processing_id = mp.id) AS entry_count
       FROM message_processings mp
       JOIN chat_messages cm ON mp.chat_message_id = cm.id
      WHERE cm.entity_id = $1
      ORDER BY mp.id DESC
      LIMIT $2`,
    [entityId, MAX_PROCESSINGS_PER_CHAT],
  );
  return Promise.all(rows.map(toListItem));
}

function getEntries(processingId: number): Promise<MessageProcessingEntry[]> {
  return listEntries(db, ENTRIES, processingId);
}

export async function getProcessingDetail(
  processingId: number,
): Promise<MessageProcessingDetail | null> {
  const { rows } = await db.query<ProcessingListRow & { entity_id: string }>(
    `SELECT mp.id, mp.chat_message_id, cm.entity_id, cm.message_id, cm.content,
            cm.role, mp.status, mp.total_time_spent, mp.created_at, 0 AS entry_count
       FROM message_processings mp
       JOIN chat_messages cm ON mp.chat_message_id = cm.id
      WHERE mp.id = $1`,
    [processingId],
  );
  const row = rows[0];
  if (!row) return null;
  const item = await toListItem(row);
  return {
    id: item.id,
    entityId: row.entity_id,
    chatMessageId: item.chatMessageId,
    messageId: item.messageId,
    messagePreview: item.messagePreview,
    userLabel: item.userLabel,
    status: item.status,
    totalTimeSpent: item.totalTimeSpent,
    createdAt: item.createdAt,
    entries: await getEntries(item.id),
  };
}

/**
 * Resolve the processing whose bot reply included `messageId` in the given chat
 * — used by /explain when a user replies to one of the bot's messages.
 */
export async function getProcessingByReplyMessage(
  entityId: string,
  messageId: number,
): Promise<MessageProcessingDetail | null> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT mp.id
       FROM message_processings mp
       JOIN chat_messages cm ON mp.chat_message_id = cm.id
      WHERE cm.entity_id = $1
        AND $2 = ANY(mp.reply_message_ids)
      ORDER BY mp.id DESC
      LIMIT 1`,
    [entityId, messageId],
  );
  return rows[0] ? getProcessingDetail(rows[0].id) : null;
}
