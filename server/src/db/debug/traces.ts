import type { SqlDatabase } from "../../contracts/index.js";

let db: SqlDatabase;

export const MAX_TRACES_PER_CHAT = 50;

export type ReportStatus = "ignored" | "processing" | "processed" | "error";
export type PhaseStatus = "skipped" | "ok" | "failed" | "waiting";

export interface ReportDetailFields {
  type: "fields";
  fields: Array<{ label: string; value: string }>;
}

export interface ReportDetailText {
  type: "text";
  title: string;
  body: string;
}

export interface ReportDetailLlm {
  type: "llm";
  model: string;
  sampling?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  sections: Array<{ title: string; body: string }>;
  output: {
    content: string;
    reasoning?: string;
    meta?: string;
    toolCalls?: Array<{ name: string; arguments: string }>;
  };
}

export interface ReportDetailMood {
  type: "mood";
  traits: Record<string, number>;
}

export type ReportDetail =
  | ReportDetailFields
  | ReportDetailText
  | ReportDetailLlm
  | ReportDetailMood;

export interface ReportPhase {
  id: string;
  title: string;
  status: PhaseStatus;
  durationMs?: number;
  summary: string;
  detail?: ReportDetail;
}

export interface MessageReportRecord {
  status: ReportStatus;
  headline: string;
  durationMs: number;
  intake: {
    messagePreview: string;
    hasMedia: boolean;
    mediaKind?: string;
  };
  routing:
    | {
        decision: "pending";
        pendingLabel: string;
      }
    | {
        decision: "ignored";
        ignoreReason: string;
        ignoreLabel: string;
        addressSource?: string;
      }
    | {
        decision: "accepted";
        trigger: "addressed" | "random" | "image";
        triggerLabel: string;
        addressSource?: string;
      }
    | {
        decision: "queued";
        position: number;
        queueLabel: string;
      };
  phases: ReportPhase[];
  result: {
    replyChars?: number;
    chunks?: number;
    sticker?: string;
    error?: string;
  };
}

export type MessageReport = MessageReportRecord;

export interface MessageReportListSummary {
  headline: string;
  badges: string[];
  trigger?: "addressed" | "random" | "image";
  ignoreLabel?: string;
}

export interface DebugChatSummary {
  chatId: string;
  chatType: string;
  label: string;
  traceCount: number;
  latestAt: string | null;
}

export interface MessageReportListItem {
  id: number;
  chatId: string;
  userId: string | null;
  userLabel: string | null;
  messagePreview: string;
  status: ReportStatus;
  headline: string;
  badges: string[];
  durationMs: number | null;
  createdAt: string;
}

export interface MessageReportDetail {
  id: number;
  chatId: string;
  convKey: string;
  userId: string | null;
  chatType: string;
  messageId: number | null;
  messagePreview: string;
  status: ReportStatus;
  durationMs: number | null;
  createdAt: string;
  report: MessageReportRecord;
}

export async function bindDebugTracesDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS debug_traces (
      id BIGINT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      conv_key TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      chat_type TEXT NOT NULL,
      message_id BIGINT,
      message_preview TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      reply_message_ids BIGINT[] NOT NULL DEFAULT '{}',
      duration_ms BIGINT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_debug_traces_chat
       ON debug_traces (chat_id, id DESC);`,
  );
}

function parseListSummary(raw: string): MessageReportListSummary | null {
  try {
    const parsed = JSON.parse(raw) as MessageReportListSummary;
    return parsed.headline ? parsed : null;
  } catch {
    return null;
  }
}

function parseReport(raw: string): MessageReportRecord | null {
  try {
    const parsed = JSON.parse(raw) as MessageReportRecord;
    return parsed.headline ? parsed : null;
  } catch {
    return null;
  }
}

async function trimTracesForChat(chatId: string): Promise<void> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM debug_traces WHERE chat_id = $1`,
    [chatId],
  );
  const excess = (rows[0]?.n ?? 0) - MAX_TRACES_PER_CHAT;
  if (excess > 0) {
    await db.query(
      `DELETE FROM debug_traces WHERE id IN (
         SELECT id FROM debug_traces
         WHERE chat_id = $1
         ORDER BY id ASC
         LIMIT $2
       )`,
      [chatId, excess],
    );
  }
}

/**
 * Resolve a bot reply's Telegram message id back to the trace that produced it.
 * Reply ids are stored as a Postgres array on each trace row.
 */
export async function getTraceIdByReplyMessage(
  chatId: string,
  messageId: number,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM debug_traces
        WHERE chat_id = $1
          AND $2 = ANY(reply_message_ids)
        ORDER BY id DESC
        LIMIT 1`,
    [chatId, messageId],
  );
  return rows[0]?.id ?? null;
}

export async function getMaxDebugTraceId(): Promise<number> {
  const { rows } = await db.query<{ max_id: number }>(
    `SELECT COALESCE(MAX(id), 0) AS max_id FROM debug_traces`,
  );
  return rows[0]?.max_id ?? 0;
}

export async function upsertMessageReport(input: {
  id: number;
  chatId: string;
  convKey: string;
  userId: string | null;
  chatType: string;
  messageId: number | null;
  messagePreview: string;
  status: ReportStatus;
  listSummary: MessageReportListSummary;
  report: MessageReportRecord;
  replyMessageIds?: number[];
  durationMs: number | null;
}): Promise<void> {
  await db.query(
    `INSERT INTO debug_traces (
       id, chat_id, conv_key, user_id, chat_type, message_id,
       message_preview, status, summary_json, details_json,
       reply_message_ids, duration_ms
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       conv_key = excluded.conv_key,
       status = excluded.status,
       summary_json = excluded.summary_json,
       details_json = excluded.details_json,
       reply_message_ids = excluded.reply_message_ids,
       duration_ms = excluded.duration_ms`,
    [
      input.id,
      input.chatId,
      input.convKey,
      input.userId,
      input.chatType,
      input.messageId,
      input.messagePreview.slice(0, 500),
      input.status,
      JSON.stringify(input.listSummary),
      JSON.stringify(input.report),
      input.replyMessageIds ?? [],
      input.durationMs,
    ],
  );
  await trimTracesForChat(input.chatId);
  void import("../../dashboard/live-events.js").then(
    async ({ emitDataUpdated, emitDebugUpdated }) => {
      emitDebugUpdated(await buildDebugLivePayload(input.id));
      emitDataUpdated(["debug_traces"]);
    },
  );
}

type DebugTraceListRow = {
  id: number;
  chat_id: string;
  user_id: string | null;
  message_preview: string;
  status: ReportStatus;
  summary_json: string;
  duration_ms: number | null;
  created_at: number;
};

async function rowToListItem(
  row: DebugTraceListRow,
): Promise<MessageReportListItem | null> {
  const list = parseListSummary(row.summary_json);
  if (!list) return null;
  return {
    id: row.id,
    chatId: row.chat_id,
    userId: row.user_id,
    userLabel: await formatUserLabel(row.user_id),
    messagePreview: row.message_preview,
    status: row.status,
    headline: list.headline,
    badges: list.badges,
    durationMs: row.duration_ms,
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

export async function getDebugTraceListItem(
  id: number,
): Promise<MessageReportListItem | null> {
  const { rows } = await db.query<DebugTraceListRow>(
    `SELECT id, chat_id, user_id, message_preview, status,
              summary_json, duration_ms, created_at
       FROM debug_traces
       WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  return rowToListItem(rows[0]);
}

export async function buildDebugLivePayload(traceId: number): Promise<{
  chatId: string;
  traceId: number;
  listItem: MessageReportListItem | null;
  trace: MessageReportDetail | null;
} | null> {
  const trace = await getDebugTraceById(traceId);
  if (!trace) return null;
  return {
    chatId: trace.chatId,
    traceId,
    listItem: await getDebugTraceListItem(traceId),
    trace,
  };
}

export async function listDebugChats(): Promise<DebugChatSummary[]> {
  const { rows } = await db.query<{
    chat_id: string;
    chat_type: string;
    trace_count: number;
    latest_at: number | null;
  }>(
    `SELECT chat_id, chat_type, COUNT(*)::int AS trace_count, MAX(created_at) AS latest_at
       FROM debug_traces
       GROUP BY chat_id
       ORDER BY latest_at DESC`,
  );

  return Promise.all(
    rows.map(async (row) => ({
      chatId: row.chat_id,
      chatType: row.chat_type,
      label: await formatChatLabel(row.chat_id, row.chat_type),
      traceCount: row.trace_count,
      latestAt:
        row.latest_at != null
          ? new Date(row.latest_at * 1000).toISOString()
          : null,
    })),
  );
}

type UserNameRow = {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

async function lookupUserNameRow(userId: string): Promise<UserNameRow | null> {
  const { rows } = await db.query<UserNameRow>(
    `SELECT username, first_name, last_name FROM known_users WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function formatChatLabel(
  chatId: string,
  chatType: string,
): Promise<string> {
  if (chatType === "private") {
    const user = await lookupUserNameRow(chatId);
    if (user) {
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
      if (name && user.username) return `${name} (@${user.username})`;
      if (name) return name;
      if (user.username) return `@${user.username}`;
    }
    return `Private chat ${chatId}`;
  }
  return `Group ${chatId}`;
}

async function formatUserLabel(
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const user = await lookupUserNameRow(userId);
  if (!user) return `User ${userId}`;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (name && user.username) return `${name} (@${user.username})`;
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return `User ${userId}`;
}

export async function listDebugTracesForChat(
  chatId: string,
): Promise<MessageReportListItem[]> {
  const { rows } = await db.query<DebugTraceListRow>(
    `SELECT id, chat_id, user_id, message_preview, status,
              summary_json, duration_ms, created_at
       FROM debug_traces
       WHERE chat_id = $1
       ORDER BY id DESC
       LIMIT $2`,
    [chatId, MAX_TRACES_PER_CHAT],
  );

  const items = await Promise.all(rows.map((row) => rowToListItem(row)));
  return items.filter((item): item is MessageReportListItem => item !== null);
}

export async function getDebugTraceById(
  id: number,
): Promise<MessageReportDetail | null> {
  const { rows } = await db.query<{
    id: number;
    chat_id: string;
    conv_key: string;
    user_id: string | null;
    chat_type: string;
    message_id: number | null;
    message_preview: string;
    status: ReportStatus;
    summary_json: string;
    details_json: string;
    duration_ms: number | null;
    created_at: number;
  }>(
    `SELECT id, chat_id, conv_key, user_id, chat_type, message_id,
              message_preview, status, summary_json, details_json,
              duration_ms, created_at
       FROM debug_traces
       WHERE id = $1`,
    [id],
  );

  const row = rows[0];
  if (!row) return null;

  const report = parseReport(row.details_json);
  if (!report) return null;

  return {
    id: row.id,
    chatId: row.chat_id,
    convKey: row.conv_key,
    userId: row.user_id,
    chatType: row.chat_type,
    messageId: row.message_id,
    messagePreview: row.message_preview,
    status: row.status,
    durationMs: row.duration_ms,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    report,
  };
}
