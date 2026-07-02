import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolHostContext } from "../../shared/index.js";
import { registerImageGenMcpTools } from "./mcp-tools.js";

export function registerMcpTools(
  server: McpServer,
  context: McpToolHostContext,
): void {
  // The image host always resolves (IMAGE_GENERATION_BASE_URL falls back to
  // LLM_BASE_URL), so the tool is always registered; it is gated by the
  // "images" workflow step and errors at call time when no image model is set.
  registerImageGenMcpTools(server, { log: context.logging });
}
