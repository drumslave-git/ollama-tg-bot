import type { ModuleLogging } from "../logging.js";

/** Host-supplied secrets and logging passed when registering MCP tools. */
export interface McpToolHostContext {
  getSecret: (name: "tavily" | "openai") => string;
  logging: ModuleLogging;
}

/** Registers MCP tools on the shared in-process server instance. */
export type McpToolRegistrar = (
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  context: McpToolHostContext,
) => void;
