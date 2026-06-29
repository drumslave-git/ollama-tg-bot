import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { embedOne } from "../../llm/embeddings.js";
import { addMemoryEntry, type MemoryType } from "./db/entries.js";
import { getMemoryRecord, searchMemory } from "./db/memory.js";

export const MEMORY_GET_TOOL_NAME = "memory_get";
export const MEMORY_SEARCH_TOOL_NAME = "memory_search";
export const MEMORY_SAVE_TOOL_NAME = "memory_save";

export const MEMORY_TOOL_NAMES = [
  MEMORY_GET_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
  MEMORY_SAVE_TOOL_NAME,
];

const memoryScope = z.enum(["user", "group", "general"]);

const getOutputSchema = z.object({
  ok: z.boolean(),
  type: z.string(),
  id: z.string().nullable(),
  content: z.string(),
});

const searchResultSchema = z.object({
  type: z.string(),
  id: z.string().nullable(),
  content: z.string(),
});

const searchOutputSchema = z.object({
  ok: z.boolean(),
  count: z.number(),
  results: z.array(searchResultSchema),
});

const saveOutputSchema = z.object({
  ok: z.boolean(),
  type: z.string(),
  id: z.string().nullable(),
  saved: z.boolean(),
});

export interface MemoryMcpConfig {
  log?: FeatureLogging;
}

export function registerMemoryMcpTools(
  server: McpServer,
  config: MemoryMcpConfig = {},
): void {
  server.registerTool(
    MEMORY_GET_TOOL_NAME,
    {
      title: "Get memory",
      description:
        "Read the consolidated long-term memory for a scope. " +
        "type 'user' returns durable facts about one person (id = that user's numeric id, " +
        "from the [SESSION] block or [user:name:id] history tags); " +
        "type 'group' returns this chat's norms (id = the group id from the [SESSION] block); " +
        "type 'general' returns cross-chat knowledge (id is ignored). " +
        "Note: facts you just saved with memory_save are folded in by a daily job — " +
        "they may not appear here until then. Use before claiming you do not know " +
        "something durable about a person or this chat.",
      inputSchema: z.object({
        type: memoryScope.describe("Which memory scope to read"),
        id: z
          .string()
          .default("")
          .describe(
            "The user id (type 'user') or group id (type 'group'). Ignored for 'general'.",
          ),
      }),
      outputSchema: getOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ type, id }) => {
      const scopeId = type === "general" ? null : id?.trim() || "";
      if (type !== "general" && !scopeId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `memory_get requires an id for type '${type}'.`,
            },
          ],
          isError: true,
        };
      }
      const record = await getMemoryRecord(type as MemoryType, scopeId);
      const content = record?.content ?? "";
      config.log?.logEvent?.("memory_tool_get", {
        type,
        id: scopeId ?? undefined,
        chars: content.length,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: content || `(no ${type} memory stored)`,
          },
        ],
        structuredContent: { ok: true, type, id: scopeId, content },
      };
    },
  );

  server.registerTool(
    MEMORY_SEARCH_TOOL_NAME,
    {
      title: "Search memory",
      description:
        "Semantic (vector + keyword) search across all consolidated long-term memory " +
        "(user, group, and general). Use to recall a durable fact when you do not know " +
        "which person or scope it belongs to — each result is tagged with its type and id.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("What to look for — a topic, preference, name, or fact"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe("Maximum matches to return (max 20)"),
      }),
      outputSchema: searchOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      let vector: number[];
      try {
        vector = await embedOne(query);
      } catch (err) {
        config.log?.logEventError?.("memory_tool_embed_failed", err, {});
        return {
          content: [
            {
              type: "text" as const,
              text: "Memory search is unavailable (embedding model not reachable).",
            },
          ],
          isError: true,
        };
      }

      const matches = await searchMemory(vector, query, limit ?? 8);
      config.log?.logEvent?.("memory_tool_search", {
        query,
        returned: matches.length,
      });

      const results = matches.map((m) => ({
        type: m.type,
        id: m.entityId,
        content: m.content,
      }));
      const text =
        results.length === 0
          ? "(no matching memory)"
          : results
              .map((r) => `[${r.type}${r.id ? ` ${r.id}` : ""}] ${r.content}`)
              .join("\n");

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ok: true, count: results.length, results },
      };
    },
  );

  server.registerTool(
    MEMORY_SAVE_TOOL_NAME,
    {
      title: "Save memory",
      description:
        "Record a durable fact for long-term memory. " +
        "Save ONLY information that stays useful across future conversations — a person's stable " +
        "preferences, identity, boundaries, group norms, or a lasting lesson about how to behave. " +
        "Do NOT save passing chit-chat or one-off requests. The note is queued and merged into " +
        "the consolidated record by a daily job (duplicates are resolved then, so just write the fact). " +
        "type 'user' (id = the user's numeric id), 'group' (id = the group id from [SESSION]), " +
        "or 'general' (cross-chat knowledge, id ignored). Write one concise fact per call.",
      inputSchema: z.object({
        type: memoryScope.describe("Which memory scope to record under"),
        id: z
          .string()
          .default("")
          .describe(
            "The user id (type 'user') or group id (type 'group'). Ignored for 'general'.",
          ),
        content: z
          .string()
          .min(2)
          .describe("The durable fact to remember, as a single concise line"),
      }),
      outputSchema: saveOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ type, id, content }) => {
      const scopeId = type === "general" ? null : id?.trim() || "";
      if (type !== "general" && !scopeId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `memory_save requires an id for type '${type}'.`,
            },
          ],
          isError: true,
        };
      }
      const entry = await addMemoryEntry(type as MemoryType, scopeId, content);
      const saved = entry != null;
      config.log?.logEvent?.("memory_tool_save", {
        type,
        id: scopeId ?? undefined,
        saved,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: saved
              ? `Noted for ${type} memory${scopeId ? ` (${scopeId})` : ""} — will be merged on the next daily consolidation.`
              : `Nothing saved to ${type} memory.`,
          },
        ],
        structuredContent: { ok: true, type, id: scopeId, saved },
      };
    },
  );
}
