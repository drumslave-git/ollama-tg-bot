import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "../../../src/shared/index.js";
import { registerLinkFetchMcpTools, FETCH_LINK_TOOL_NAME } from "../../../src/features/link-fetch/mcp-tools.js";

describe("registerLinkFetchMcpTools", () => {
  it("registers fetch_link and returns page context", async () => {
    const registry = new BotMcpRegistry();
    const fetchPages = vi.fn(async () => [
      {
        url: "https://example.com/article",
        title: "Article",
        text: "Article body",
      },
    ]);

    registry.registerTools((server: McpServer) => {
      registerLinkFetchMcpTools(server, { fetchPages });
    }, { getSecret: () => "", logging: {} });
    await registry.finishRegistration();
    registry.setEnabledToolNames([FETCH_LINK_TOOL_NAME]);

    const result = await registry.callTool(FETCH_LINK_TOOL_NAME, {
      url: "https://example.com/article",
    });
    expect(result.text).toContain("Article body");
    expect(fetchPages).toHaveBeenCalledWith(["https://example.com/article"]);
  });
});
