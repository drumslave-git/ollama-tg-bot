import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolHostContext } from "@llm-tg-bot/modules-utils";
import { registerWebSearchMcpTools } from "./mcp-tools.js";

export function registerMcpTools(
  server: McpServer,
  context: McpToolHostContext,
): void {
  const apiKey = context.getSecret("tavily").trim();
  if (!apiKey) return;

  registerWebSearchMcpTools(server, {
    apiKey,
    log: context.logging,
  });
}
