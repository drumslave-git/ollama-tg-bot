import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "@llm-tg-bot/modules-utils";
import { registerLinkFetchMcpTools, FETCH_LINK_TOOL_NAME } from "../src/mcp-tools.js";

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
    });
    await registry.finishRegistration();
    registry.setEnabledToolNames([FETCH_LINK_TOOL_NAME]);

    const text = await registry.callTool(FETCH_LINK_TOOL_NAME, {
      url: "https://example.com/article",
    });
    expect(text).toContain("Article body");
    expect(fetchPages).toHaveBeenCalledWith(["https://example.com/article"]);
  });
});
