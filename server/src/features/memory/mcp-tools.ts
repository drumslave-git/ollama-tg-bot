import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { embedOne } from "../../llm/embeddings.js";
import {
  addMemoryEntry,
  getEntriesFor,
  searchEntries,
  type MemoryType,
} from "./db/entries.js";
import { getMemoryRecord, searchMemory } from "./db/memory.js";

export const MEMORY_GET_TOOL_NAME = "memory_get";
export const MEMORY_SEARCH_TOOL_NAME = "memory_search";
export const MEMORY_SAVE_TOOL_NAME = "memory_save";
export const MEMORY_ENTRIES_SEARCH_TOOL_NAME = "memory_entries_search";
export const MEMORY_ENTRIES_GET_TOOL_NAME = "memory_entries_get";

export const MEMORY_TOOL_NAMES = [
  MEMORY_GET_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_ENTRIES_SEARCH_TOOL_NAME,
  MEMORY_ENTRIES_GET_TOOL_NAME,
];

const memoryScope = z.enum(["user", "general"]);

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
        "type 'general' returns cross-chat knowledge (id is ignored). " +
        "Note: facts just saved with memory_save are folded in by a daily job — until then " +
        "use memory_entries_get to see them. Use before claiming you do not know something durable.",
      inputSchema: z.object({
        type: memoryScope.describe("Which memory scope to read"),
        id: z
          .string()
          .default("")
          .describe("The user id (type 'user'). Ignored for 'general'."),
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
        "(user and general). Use to recall a durable fact when you do not know which person " +
        "or scope it belongs to — each result is tagged with its type and id. If this finds " +
        "nothing, the fact may be newly saved and not yet consolidated — fall back to memory_entries_search.",
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
      return toSearchResult(results);
    },
  );

  server.registerTool(
    MEMORY_ENTRIES_SEARCH_TOOL_NAME,
    {
      title: "Search pending memory notes",
      description:
        "Keyword search over raw, not-yet-consolidated memory notes (the queue memory_save writes to). " +
        "Use as a fallback when memory_search finds nothing, since a fact saved earlier this " +
        "conversation may not be in the consolidated record until the next daily job. " +
        "Each result is tagged with its type and id.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Keyword(s) to look for in pending notes"),
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
      const entries = await searchEntries(query, limit ?? 8);
      config.log?.logEvent?.("memory_tool_entries_search", {
        query,
        returned: entries.length,
      });
      return toSearchResult(
        entries.map((e) => ({ type: e.type, id: e.entityId, content: e.content })),
      );
    },
  );

  server.registerTool(
    MEMORY_ENTRIES_GET_TOOL_NAME,
    {
      title: "Get pending memory notes",
      description:
        "List the raw, not-yet-consolidated memory notes for a scope. " +
        "type 'user' (id = that user's numeric id) or 'general' (id ignored). " +
        "Use as a fallback to memory_get when a fact was saved recently and has not been " +
        "folded into the consolidated record yet.",
      inputSchema: z.object({
        type: memoryScope.describe("Which memory scope to read pending notes for"),
        id: z
          .string()
          .default("")
          .describe("The user id (type 'user'). Ignored for 'general'."),
      }),
      outputSchema: searchOutputSchema,
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
              text: `memory_entries_get requires an id for type '${type}'.`,
            },
          ],
          isError: true,
        };
      }
      const entries = await getEntriesFor(type as MemoryType, scopeId);
      config.log?.logEvent?.("memory_tool_entries_get", {
        type,
        id: scopeId ?? undefined,
        returned: entries.length,
      });
      return toSearchResult(
        entries.map((e) => ({ type: e.type, id: e.entityId, content: e.content })),
      );
    },
  );

  server.registerTool(
    MEMORY_SAVE_TOOL_NAME,
    {
      title: "Save memory",
      description:
        "Record a durable fact for long-term memory. " +
        "Save ONLY information that stays useful across future conversations — a person's stable " +
        "preferences, identity, boundaries, or a lasting lesson about how to behave. " +
        "Do NOT save passing chit-chat or one-off requests. The note is queued and merged into " +
        "the consolidated record by a daily job (duplicates are resolved then, so just write the fact). " +
        "type 'user' (id = the user's numeric id) or 'general' (cross-chat knowledge, id ignored). " +
        "Write one concise fact per call.",
      inputSchema: z.object({
        type: memoryScope.describe("Which memory scope to record under"),
        id: z
          .string()
          .default("")
          .describe("The user id (type 'user'). Ignored for 'general'."),
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

/** Shared formatter for the search-shaped tool results. */
function toSearchResult(
  results: Array<{ type: string; id: string | null; content: string }>,
) {
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
}
