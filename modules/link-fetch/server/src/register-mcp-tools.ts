import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolHostContext } from "@llm-tg-bot/modules-utils";
import { registerLinkFetchMcpTools } from "./mcp-tools.js";

export function registerMcpTools(
  server: McpServer,
  _context: McpToolHostContext,
): void {
  registerLinkFetchMcpTools(server);
}
