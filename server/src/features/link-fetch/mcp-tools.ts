import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkFetchConfig } from "./fetch.js";
import { fetchLink } from "./fetch-link.js";

export const READ_PAGE_TOOL_NAME = "read_page";

export function registerLinkFetchMcpTools(
  server: McpServer,
  config: LinkFetchConfig = {},
): void {
  server.registerTool(
    READ_PAGE_TOOL_NAME,
    {
      title: "Read Page",
      description:
        "Read ONE public web page and return its readable TEXT so you can answer from it. " +
        "It only reads a single page — it cannot download files (videos, archives, images) and " +
        "cannot work through a batch of links; for that use browse_web. Call it when the user " +
        "shares a single URL or asks about page content you do not already have.",
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
