import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { normalizeQueries, queryField } from "../../shared/index.js";
import { config } from "../../config/index.js";
import { zonedDate, zonedWallClockToUtc } from "../tasks/schedule.js";
import {
  getLatestMessagesSince,
  getMessagesByMessageIds,
  getMessagesInRange,
  searchMessages,
  searchMessagesSince,
} from "./db/history.js";
import {
  collectMessageIds,
  formatStoredMessageLine,
  redactBase64MediaForDisplay,
} from "./format.js";
import type { StoredMessage } from "./types.js";

export const HISTORY_TODAY_SEARCH_TOOL_NAME = "history_today_search";
export const HISTORY_TODAY_GET_LATEST_TOOL_NAME = "history_today_get_latest";
export const HISTORY_SEARCH_TOOL_NAME = "history_search";
export const HISTORY_GET_MESSAGES_TOOL_NAME = "history_get_messages";
export const HISTORY_GET_IN_RANGE_TOOL_NAME = "history_get_in_range";

export const HISTORY_TOOL_NAMES = [
  HISTORY_TODAY_SEARCH_TOOL_NAME,
  HISTORY_TODAY_GET_LATEST_TOOL_NAME,
  HISTORY_SEARCH_TOOL_NAME,
  HISTORY_GET_MESSAGES_TOOL_NAME,
  HISTORY_GET_IN_RANGE_TOOL_NAME,
];

const messageOutputSchema = z.object({
  role: z.string(),
  content: z.string(),
  at: z.string(),
});

const historyOutputSchema = z.object({
  ok: z.boolean(),
  count: z.number(),
  messages: z.array(messageOutputSchema),
});

export interface HistoryMcpConfig {
  log?: FeatureLogging;
}

/** Epoch seconds for the start of the current day in the server timezone. */
function startOfTodayEpoch(): number {
  const today = zonedDate(new Date(), config.timezone);
  const start = zonedWallClockToUtc(
    today.year,
    today.month,
    today.day,
    0,
    0,
    config.timezone,
  );
  return Math.floor(start.getTime() / 1000);
}

/** Replace not-yet-described base64 media with a short placeholder so tool output never dumps base64. */
function sanitizeForTool(message: StoredMessage): StoredMessage {
  const redacted = redactBase64MediaForDisplay(message.content);
  return redacted == null ? message : { ...message, content: redacted };
}

function isoFromStored(message: StoredMessage): string {
  if (message.createdAt == null) return "";
  return new Date(message.createdAt * 1000).toISOString();
}

/** De-dup key for a stored message, so overlapping multi-query results merge cleanly. */
function storedMessageKey(message: StoredMessage): string {
  return `${message.messageId ?? ""}|${message.createdAt ?? ""}|${message.role}|${message.content}`;
}

/**
 * Run a search for each query and merge the results into one chronologically
 * ordered, de-duplicated list — so the model can pass several phrasings/terms in
 * a single tool call instead of looping one query per round.
 */
async function searchAcrossQueries(
  queries: string[],
  run: (query: string) => Promise<StoredMessage[]>,
): Promise<StoredMessage[]> {
  const collected = new Map<string, StoredMessage>();
  for (const query of queries) {
    for (const message of await run(query)) {
      const key = storedMessageKey(message);
      if (!collected.has(key)) collected.set(key, message);
    }
  }
  return [...collected.values()].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );
}

function buildResult(messages: StoredMessage[]) {
  const sanitized = messages.map(sanitizeForTool);
  const structuredMessages = sanitized.map((m) => ({
    role: m.role,
    content: m.content,
    at: isoFromStored(m),
  }));

  // Reply pointers resolve against the ids present in this same result batch.
  const resolvableReplyIds = collectMessageIds(sanitized);
  const transcript =
    sanitized.length === 0
      ? "(no matching messages)"
      : sanitized
          .map((m) => {
            const at = isoFromStored(m);
            const line = formatStoredMessageLine(m, resolvableReplyIds);
            return at ? `[${at}] ${line}` : line;
          })
          .filter(Boolean)
          .join("\n");

  return {
    text: transcript,
    structuredContent: {
      ok: true,
      count: sanitized.length,
      messages: structuredMessages,
    },
  };
}

/** Parse an ISO-8601 datetime to epoch seconds, or null when invalid. */
function parseIsoToEpochSeconds(value: string): number | null {
  const ms = Date.parse(value.trim());
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

const entityIdField = z
  .string()
  .min(1)
  .describe("The chat id from the [SESSION] block");

export function registerHistoryMcpTools(
  server: McpServer,
  config: HistoryMcpConfig = {},
): void {
  // ---- Tier 1: today (raw messages from the current day) ----
  server.registerTool(
    HISTORY_TODAY_SEARCH_TOOL_NAME,
    {
      title: "Search today's messages",
      description:
        "Full-text search over THIS chat's messages from today only. " +
        "Start here for recall — most questions are about something said today. " +
        "Pass an array of queries to search several terms/phrasings in one call. " +
        "If you find nothing relevant, escalate to history_summaries_search for older days.",
      inputSchema: z.object({
        entity_id: entityIdField,
        query: queryField(
          "Words/phrase to look for in today's messages — a single string, or an array of strings to search several at once",
        ),
        limit: z.number().int().min(1).max(200).default(50).describe("Max matches per query (max 200)"),
      }),
      outputSchema: historyOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entity_id, query, limit }) => {
      const queries = normalizeQueries(query);
      const since = startOfTodayEpoch();
      const messages = await searchAcrossQueries(queries, (q) =>
        searchMessagesSince(entity_id, q, since, limit ?? 50),
      );
      config.log?.logEvent?.("history_tool_today_search", {
        entityId: entity_id,
        query: queries.join(" | "),
        queryCount: queries.length,
        returned: messages.length,
      });
      const result = buildResult(messages);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.structuredContent,
      };
    },
  );

  server.registerTool(
    HISTORY_TODAY_GET_LATEST_TOOL_NAME,
    {
      title: "Get today's latest messages",
      description:
        "Return the most recent messages from THIS chat today. " +
        "Use to recall what was just said when you need immediate conversation context.",
      inputSchema: z.object({
        entity_id: entityIdField,
        count: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(20)
          .describe("How many of today's most recent messages to return (max 200)"),
      }),
      outputSchema: historyOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entity_id, count }) => {
      const messages = await getLatestMessagesSince(
        entity_id,
        startOfTodayEpoch(),
        count ?? 20,
      );
      config.log?.logEvent?.("history_tool_today_get_latest", {
        entityId: entity_id,
        count: count ?? 20,
        returned: messages.length,
      });
      const result = buildResult(messages);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.structuredContent,
      };
    },
  );

  // ---- Tier 3: regular (all raw history) ----
  server.registerTool(
    HISTORY_GET_MESSAGES_TOOL_NAME,
    {
      title: "Get messages by id",
      description:
        "Fetch the exact original messages for a list of message ids — typically the message_ids " +
        "returned by history_summaries_search for a topic. This is how you read the real wording " +
        "behind a summary. entity_id is the chat id from the [SESSION] block.",
      inputSchema: z.object({
        entity_id: entityIdField,
        message_ids: z
          .array(z.number().int())
          .min(1)
          .describe("Message ids to fetch (e.g. from a summary topic)"),
      }),
      outputSchema: historyOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entity_id, message_ids }) => {
      const messages = await getMessagesByMessageIds(entity_id, message_ids);
      config.log?.logEvent?.("history_tool_get_messages", {
        entityId: entity_id,
        requested: message_ids.length,
        returned: messages.length,
      });
      const result = buildResult(messages);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.structuredContent,
      };
    },
  );

  server.registerTool(
    HISTORY_SEARCH_TOOL_NAME,
    {
      title: "Search all history",
      description:
        "Full-text search over ALL of THIS chat's stored messages (every day). " +
        "Use as a fallback when history_summaries_search found no relevant topic, or for a direct " +
        "keyword/name lookup across the whole history. Pass an array of queries to search several " +
        "terms/phrasings in one call. entity_id is the chat id from the [SESSION] block.",
      inputSchema: z.object({
        entity_id: entityIdField,
        query: queryField(
          "Words/phrase to look for in message content — a single string, or an array of strings to search several at once",
        ),
        limit: z.number().int().min(1).max(200).default(50).describe("Max matches per query (max 200)"),
      }),
      outputSchema: historyOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entity_id, query, limit }) => {
      const queries = normalizeQueries(query);
      const messages = await searchAcrossQueries(queries, (q) =>
        searchMessages(entity_id, q, limit ?? 50),
      );
      config.log?.logEvent?.("history_tool_search", {
        entityId: entity_id,
        query: queries.join(" | "),
        queryCount: queries.length,
        returned: messages.length,
      });
      const result = buildResult(messages);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.structuredContent,
      };
    },
  );

  server.registerTool(
    HISTORY_GET_IN_RANGE_TOOL_NAME,
    {
      title: "Get history in date range",
      description:
        "Return messages stored within a datetime range (ISO-8601, e.g. 2026-06-22T00:00:00Z). " +
        "Use to read a whole day once history_summaries_search points you to a date — pass that " +
        "day's start and end. entity_id is the chat id from the [SESSION] block.",
      inputSchema: z.object({
        entity_id: entityIdField,
        from: z.string().min(1).describe("Start of the range, ISO-8601 datetime (inclusive)"),
        to: z.string().min(1).describe("End of the range, ISO-8601 datetime (inclusive)"),
      }),
      outputSchema: historyOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entity_id, from, to }) => {
      const fromTs = parseIsoToEpochSeconds(from);
      const toTs = parseIsoToEpochSeconds(to);
      if (fromTs == null || toTs == null || fromTs > toTs) {
        config.log?.logEvent?.("history_tool_get_in_range_invalid", {
          entityId: entity_id,
          from,
          to,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: "Invalid range: provide ISO-8601 'from' and 'to' datetimes where from <= to.",
            },
          ],
          isError: true,
        };
      }
      const messages = await getMessagesInRange(entity_id, fromTs, toTs);
      config.log?.logEvent?.("history_tool_get_in_range", {
        entityId: entity_id,
        from,
        to,
        returned: messages.length,
      });
      const result = buildResult(messages);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.structuredContent,
      };
    },
  );
}
