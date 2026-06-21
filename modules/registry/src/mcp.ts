import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Registers MCP tools on the shared in-process server instance. */
export type McpToolRegistrar = (server: McpServer) => void;

export interface ModuleMcpToolsMeta {
  /** workflowSteps entry that enables this module's MCP tools (e.g. "links"). */
  workflowStepId: string;
  /** OpenAI tool names exposed when the step is enabled. */
  toolNames: string[];
}
