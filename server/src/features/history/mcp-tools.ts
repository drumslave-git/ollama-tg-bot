import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ModuleLogging } from "../../shared/index.js";
import {
  getLatestMessages,
  getMessagesInRange,
  searchMessages,
} from "./db/history.js";
import {
  formatStoredMessageLine,
  isBase64MediaHistoryContent,
  parseBase64MediaHistoryContent,
} from "./format.js";
import type { StoredMessage } from "./types.js";

export const HISTORY_GET_LATEST_TOOL_NAME = "history_get_latest";
export const HISTORY_SEARCH_TOOL_NAME = "history_search";
export const HISTORY_GET_IN_RANGE_TOOL_NAME = "history_get_in_range";

export const HISTORY_TOOL_NAMES = [
  HISTORY_GET_LATEST_TOOL_NAME,
  HISTORY_SEARCH_TOOL_NAME,
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
  log?: ModuleLogging;
}

/** Replace not-yet-described base64 media with a short placeholder so tool output never dumps base64. */
function sanitizeForTool(message: StoredMessage): StoredMessage {
  if (!isBase64MediaHistoryContent(message.content)) return message;
  const parsed = parseBase64MediaHistoryContent(message.content);
  const kind = parsed?.mediaKind ?? "media";
  const prefix = parsed?.prefix ?? `[sent ${kind}]`;
  return { ...message, content: `${prefix}: [${kind} not yet described]` };
}

function isoFromStored(message: StoredMessage): string {
  if (message.createdAt == null) return "";
  return new Date(message.createdAt * 1000).toISOString();
}

function buildResult(messages: StoredMessage[]) {
  const sanitized = messages.map(sanitizeForTool);
  const structuredMessages = sanitized.map((m) => ({
    role: m.role,
    content: m.content,
    at: isoFromStored(m),
  }));

  const transcript =
    sanitized.length === 0
      ? "(no matching messages)"
      : sanitized
          .map((m) => {
            const at = isoFromStored(m);
            const line = formatStoredMessageLine(m);
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

export function registerHistoryMcpTools(
  server: McpServer,
  config: HistoryMcpConfig = {},
): void {
  server.registerTool(
    HISTORY_GET_LATEST_TOOL_NAME,
    {
      title: "Get latest history",
      description:
        "Return the most recent stored messages for a chat. " +
        "Use to recall what was just said when you need conversation context. " +
        "entity_id is the chat id given in the [SESSION] block.",
      inputSchema: z.object({
        entity_id: z
          .string()
          .min(1)
          .describe("The chat id from the [SESSION] block"),
        count: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(20)
          .describe("How many of the most recent messages to return (max 200)"),
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
      const messages = getLatestMessages(entity_id, count ?? 20);
      config.log?.logEvent?.("history_tool_get_latest", {
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

  server.registerTool(
    HISTORY_SEARCH_TOOL_NAME,
    {
      title: "Search history",
      description:
        "Case-insensitive substring search over stored message content for a chat. " +
        "Use to find when a topic, name, or fact was mentioned earlier. " +
        "entity_id is the chat id given in the [SESSION] block.",
      inputSchema: z.object({
        entity_id: z
          .string()
          .min(1)
          .describe("The chat id from the [SESSION] block"),
        query: z
          .string()
          .min(1)
          .describe("Substring to look for in message content"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum number of matches to return (max 200)"),
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
      const messages = searchMessages(entity_id, query, limit ?? 50);
      config.log?.logEvent?.("history_tool_search", {
        entityId: entity_id,
        query,
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
        "Use for time-scoped recall like 'today' or 'this week' — derive the bounds from the " +
        "current time in the [SESSION] block. entity_id is the chat id from that block.",
      inputSchema: z.object({
        entity_id: z
          .string()
          .min(1)
          .describe("The chat id from the [SESSION] block"),
        from: z
          .string()
          .min(1)
          .describe("Start of the range, ISO-8601 datetime (inclusive)"),
        to: z
          .string()
          .min(1)
          .describe("End of the range, ISO-8601 datetime (inclusive)"),
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
      const messages = getMessagesInRange(entity_id, fromTs, toTs);
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
