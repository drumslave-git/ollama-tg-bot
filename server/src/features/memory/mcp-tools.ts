import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ModuleLogging } from "../../shared/index.js";
import {
  addGeneralFacts,
  addGroupFacts,
  addUserFacts,
  getGeneralFacts,
  getGroupMemoryContent,
  getUserMemoryContent,
  searchGeneralFacts,
  searchGroupMemories,
  searchUserMemories,
} from "./db/index.js";

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
  log?: ModuleLogging;
}

/** Read the stored memory document for a scope. */
async function readMemory(
  type: "user" | "group" | "general",
  id: string,
): Promise<string> {
  switch (type) {
    case "user":
      return getUserMemoryContent(id);
    case "group":
      return getGroupMemoryContent(id);
    case "general":
      return (await getGeneralFacts()).join("\n");
  }
}

/** Append content to a scope; returns whether anything new was stored. */
async function saveMemory(
  type: "user" | "group" | "general",
  id: string,
  content: string,
): Promise<boolean> {
  switch (type) {
    case "user":
      return (await addUserFacts(id, [content])) > 0;
    case "group":
      return (await addGroupFacts(id, [content])) > 0;
    case "general":
      return (await addGeneralFacts([content])) > 0;
  }
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
        "Read stored long-term memory for a scope. " +
        "type 'user' returns durable facts about one person (id = that user's numeric id, " +
        "from the [SESSION] block or [user:name:id] history tags); " +
        "type 'group' returns this chat's norms (id = the group id from the [SESSION] block); " +
        "type 'general' returns cross-chat knowledge (id is ignored). " +
        "Use before claiming you do not know something durable about a person or this chat.",
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
      const scopeId = type === "general" ? null : (id?.trim() || "");
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
      const content = await readMemory(type, scopeId ?? "");
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
        structuredContent: {
          ok: true,
          type,
          id: scopeId,
          content,
        },
      };
    },
  );

  server.registerTool(
    MEMORY_SEARCH_TOOL_NAME,
    {
      title: "Search memory",
      description:
        "Case-insensitive substring search across all stored memory (user, group, and general). " +
        "Use to find which person or scope a remembered fact belongs to when you do not know the id.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Substring to look for in stored memory"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Maximum matches to return across all scopes (max 100)"),
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
      const cap = limit ?? 50;
      const [userMatches, groupMatches, generalMatches] = await Promise.all([
        searchUserMemories(query, cap),
        searchGroupMemories(query, cap),
        searchGeneralFacts(query, cap),
      ]);
      const results: Array<{ type: string; id: string | null; content: string }> = [
        ...userMatches.map((m) => ({
          type: "user",
          id: m.userId,
          content: m.content,
        })),
        ...groupMatches.map((m) => ({
          type: "group",
          id: m.groupId,
          content: m.content,
        })),
        ...generalMatches.map((m) => ({
          type: "general",
          id: null,
          content: m.fact,
        })),
      ].slice(0, cap);

      config.log?.logEvent?.("memory_tool_search", {
        query,
        returned: results.length,
      });

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
        "Append a durable fact to long-term memory. " +
        "Save ONLY information that stays useful across future conversations — a person's stable " +
        "preferences, identity, boundaries, group norms, or a lasting lesson about how to behave. " +
        "Do NOT save passing chit-chat, one-off requests, or anything already stored. " +
        "type 'user' (id = the user's numeric id), 'group' (id = the group id from [SESSION]), " +
        "or 'general' (cross-chat knowledge, id ignored). Write one concise fact per call.",
      inputSchema: z.object({
        type: memoryScope.describe("Which memory scope to append to"),
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
      const scopeId = type === "general" ? null : (id?.trim() || "");
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
      const saved = await saveMemory(type, scopeId ?? "", content);
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
              ? `Saved to ${type} memory${scopeId ? ` (${scopeId})` : ""}.`
              : `Already stored — nothing added to ${type} memory.`,
          },
        ],
        structuredContent: { ok: true, type, id: scopeId, saved },
      };
    },
  );
}
