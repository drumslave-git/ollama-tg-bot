import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { normalizeQueries, queryField } from "../../shared/index.js";
import { embedOne } from "../../llm/embeddings.js";
import { searchSummaries, type SummaryMatch } from "./db/summaries.js";

export const HISTORY_SUMMARIES_SEARCH_TOOL_NAME = "history_summaries_search";

export const SUMMARIES_TOOL_NAMES = [HISTORY_SUMMARIES_SEARCH_TOOL_NAME];

const topicSchema = z.object({
  date: z.string(),
  content: z.string(),
  message_ids: z.array(z.number()),
});

const summariesOutputSchema = z.object({
  ok: z.boolean(),
  count: z.number(),
  topics: z.array(topicSchema),
});

export interface SummariesMcpConfig {
  log?: FeatureLogging;
}

export function registerSummariesMcpTools(
  server: McpServer,
  config: SummariesMcpConfig = {},
): void {
  server.registerTool(
    HISTORY_SUMMARIES_SEARCH_TOOL_NAME,
    {
      title: "Search history summaries",
      description:
        "Semantic (vector + keyword) search over daily summaries of this chat's past conversations. " +
        "Use this for older recall AFTER checking today's messages with history_today_search: it finds " +
        "the topic/day a subject was discussed. Each result has a date and the message_ids that belong " +
        "to that topic — pass those ids to history_get_messages to read the exact original messages. " +
        "Pass an array of queries to search several topics/phrasings in one call. " +
        "entity_id is the chat id from the [SESSION] block.",
      inputSchema: z.object({
        entity_id: z
          .string()
          .min(1)
          .describe("The chat id from the [SESSION] block"),
        query: queryField(
          "What to look for — a topic, question, name, or fact; a single string, or an array of strings to search several at once",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe("Maximum topics to return per query (max 20)"),
      }),
      outputSchema: summariesOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entity_id, query, limit }) => {
      const queries = normalizeQueries(query);
      let matches: SummaryMatch[];
      try {
        const collected = new Map<string, SummaryMatch>();
        for (const q of queries) {
          const vector = await embedOne(q);
          for (const match of await searchSummaries(entity_id, vector, q, limit ?? 8)) {
            const key = `${match.summaryDate}|${match.content}`;
            if (!collected.has(key)) collected.set(key, match);
          }
        }
        matches = [...collected.values()];
      } catch (err) {
        config.log?.logEventError?.("summaries_tool_embed_failed", err, {
          entityId: entity_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: "Summary search is unavailable (embedding model not reachable).",
            },
          ],
          isError: true,
        };
      }

      config.log?.logEvent?.("summaries_tool_search", {
        entityId: entity_id,
        query: queries.join(" | "),
        queryCount: queries.length,
        returned: matches.length,
      });

      const text =
        matches.length === 0
          ? "(no matching summaries)"
          : matches
              .map(
                (m) =>
                  `[${m.summaryDate}] ${m.content}\n  message_ids: ${m.messageIds.join(", ") || "(none)"}`,
              )
              .join("\n\n");

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          ok: true,
          count: matches.length,
          topics: matches.map((m) => ({
            date: m.summaryDate,
            content: m.content,
            message_ids: m.messageIds,
          })),
        },
      };
    },
  );
}
