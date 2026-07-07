import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkFetchConfig } from "./fetch.js";
import { fetchLink } from "./fetch-link.js";
import { READ_PAGE_DESCRIPTION } from "./guidance.js";

export const READ_PAGE_TOOL_NAME = "read_page";

export function registerLinkFetchMcpTools(
  server: McpServer,
  config: LinkFetchConfig = {},
): void {
  server.registerTool(
    READ_PAGE_TOOL_NAME,
    {
      title: "Read Page",
      description: READ_PAGE_DESCRIPTION,
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
