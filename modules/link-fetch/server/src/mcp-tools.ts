import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkFetchConfig } from "./fetch.js";
import { fetchLink } from "./fetch-link.js";

export const FETCH_LINK_TOOL_NAME = "fetch_link";

export function registerLinkFetchMcpTools(
  server: McpServer,
  config: LinkFetchConfig = {},
): void {
  server.registerTool(
    FETCH_LINK_TOOL_NAME,
    {
      title: "Fetch Link",
      description:
        "Fetch a public web page and return its readable text content. " +
        "Use when the user shares a URL or asks about page content you do not already have.",
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe("Public http(s) URL to fetch with Playwright"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url }) => {
      const result = await fetchLink(url, config);
      return {
        content: [{ type: "text", text: result.context }],
        ...(result.resolved ? {} : { isError: true }),
      };
    },
  );
}
