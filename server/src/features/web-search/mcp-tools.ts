import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ModuleLogging } from "../../shared/index.js";
import { runWebSearch, type WebSearchConfig } from "./search.js";
import type { WebSearchSource } from "./types.js";

export const SEARCH_WEB_TOOL_NAME = "search_web";

const searchWebOutputSchema = z.object({
  ok: z.boolean(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
    }),
  ),
});

export interface WebSearchMcpConfig
  extends Pick<WebSearchConfig, "maxResults" | "fetch"> {
  apiKey: string;
  log?: ModuleLogging;
}

export function registerWebSearchMcpTools(
  server: McpServer,
  config: WebSearchMcpConfig,
): void {
  server.registerTool(
    SEARCH_WEB_TOOL_NAME,
    {
      title: "Search Web",
      description:
        "Search the public web via Tavily and return a summary with sources. " +
        "ONLY call when the user explicitly asks you to search the web, look something up online, " +
        "verify a claim, or check current facts. " +
        "Do NOT use for casual chat, general knowledge, opinions, or fact-checking the user did not request.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "Short search-engine query in the user's language when obvious",
          ),
      }),
      outputSchema: searchWebOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ query }) => {
      const result = await runWebSearch(
        { query },
        {
          apiKey: config.apiKey,
          maxResults: config.maxResults,
          fetch: config.fetch,
          log: config.log,
        },
      );
      const structuredContent = {
        ok: result.ok,
        sources: result.sources,
      };
      return {
        content: [{ type: "text", text: result.context }],
        structuredContent,
        ...(result.ok ? {} : { isError: true }),
      };
    },
  );
}

export function readSearchWebSources(
  structuredContent: unknown,
): WebSearchSource[] {
  const parsed = searchWebOutputSchema.safeParse(structuredContent);
  if (!parsed.success || !parsed.data.ok) return [];
  return parsed.data.sources;
}
