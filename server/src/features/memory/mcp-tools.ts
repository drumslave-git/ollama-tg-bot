import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { normalizeQueries, queryField } from "../../shared/index.js";
import { embedOne } from "../../llm/embeddings.js";
import {
  addMemoryEntry,
  getEntriesFor,
  searchEntries,
  type MemoryType,
} from "./db/entries.js";
import { getMemoryRecord, searchMemory } from "./db/memory.js";
import {
  MEMORY_ENTRIES_GET_DESCRIPTION,
  MEMORY_ENTRIES_SEARCH_DESCRIPTION,
  MEMORY_GET_DESCRIPTION,
  MEMORY_SAVE_TOOL_DESCRIPTION,
  MEMORY_SEARCH_DESCRIPTION,
} from "./guidance.js";

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
      description: MEMORY_GET_DESCRIPTION,
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
      description: MEMORY_SEARCH_DESCRIPTION,
      inputSchema: z.object({
        query: queryField(
          "What to look for — a topic, preference, name, or fact; a single string, or an array of strings to search several at once",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe("Maximum matches to return per query (max 20)"),
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
      const queries = normalizeQueries(query);
      const collected = new Map<string, { type: string; id: string | null; content: string }>();
      try {
        for (const q of queries) {
          const vector = await embedOne(q);
          for (const m of await searchMemory(vector, q, limit ?? 8)) {
            const key = `${m.type}|${m.entityId ?? ""}|${m.content}`;
            if (!collected.has(key)) {
              collected.set(key, { type: m.type, id: m.entityId, content: m.content });
            }
          }
        }
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

      config.log?.logEvent?.("memory_tool_search", {
        query: queries.join(" | "),
        queryCount: queries.length,
        returned: collected.size,
      });

      return toSearchResult([...collected.values()]);
    },
  );

  server.registerTool(
    MEMORY_ENTRIES_SEARCH_TOOL_NAME,
    {
      title: "Search pending memory notes",
      description: MEMORY_ENTRIES_SEARCH_DESCRIPTION,
      inputSchema: z.object({
        query: queryField(
          "Keyword(s) to look for in pending notes — a single string, or an array of strings to search several at once",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe("Maximum matches to return per query (max 20)"),
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
      const queries = normalizeQueries(query);
      const collected = new Map<string, { type: string; id: string | null; content: string }>();
      for (const q of queries) {
        for (const e of await searchEntries(q, limit ?? 8)) {
          const key = `${e.type}|${e.entityId ?? ""}|${e.content}`;
          if (!collected.has(key)) {
            collected.set(key, { type: e.type, id: e.entityId, content: e.content });
          }
        }
      }
      config.log?.logEvent?.("memory_tool_entries_search", {
        query: queries.join(" | "),
        queryCount: queries.length,
        returned: collected.size,
      });
      return toSearchResult([...collected.values()]);
    },
  );

  server.registerTool(
    MEMORY_ENTRIES_GET_TOOL_NAME,
    {
      title: "Get pending memory notes",
      description: MEMORY_ENTRIES_GET_DESCRIPTION,
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
      description: MEMORY_SAVE_TOOL_DESCRIPTION,
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
