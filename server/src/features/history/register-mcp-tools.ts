import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolHostContext } from "../../shared/index.js";
import { registerHistoryMcpTools } from "./mcp-tools.js";

export function registerMcpTools(
  server: McpServer,
  context: McpToolHostContext,
): void {
  registerHistoryMcpTools(server, { log: context.logging });
}
