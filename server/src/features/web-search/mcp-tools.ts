import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { runWebSearch, type WebSearchConfig } from "./search.js";
import type { WebSearchSource } from "./types.js";
import { SEARCH_WEB_DESCRIPTION } from "./guidance.js";

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
  log?: FeatureLogging;
}

export function registerWebSearchMcpTools(
  server: McpServer,
  config: WebSearchMcpConfig,
): void {
  server.registerTool(
    SEARCH_WEB_TOOL_NAME,
    {
      title: "Search Web",
      description: SEARCH_WEB_DESCRIPTION,
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
