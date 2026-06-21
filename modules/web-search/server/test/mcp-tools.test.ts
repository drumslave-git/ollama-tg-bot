import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "@llm-tg-bot/modules-utils";
import {
  registerWebSearchMcpTools,
  SEARCH_WEB_TOOL_NAME,
  readSearchWebSources,
} from "../src/mcp-tools.js";

describe("registerWebSearchMcpTools", () => {
  it("registers search_web and returns formatted context with sources", async () => {
    const registry = new BotMcpRegistry();
    const fetch = vi.fn(async () =>
      Response.json({
        answer: "Sunny",
        results: [
          {
            title: "Forecast",
            url: "https://weather.test",
            content: "Clear skies",
          },
        ],
      }),
    );

    registry.registerTools((server: McpServer) => {
      registerWebSearchMcpTools(server, {
        apiKey: "test-key",
        fetch,
      });
    }, { getSecret: () => "", logging: {} });
    await registry.finishRegistration();
    registry.setEnabledToolNames([SEARCH_WEB_TOOL_NAME]);

    const result = await registry.callTool(SEARCH_WEB_TOOL_NAME, {
      query: "weather today",
    });
    expect(result.text).toContain("Sunny");
    expect(readSearchWebSources(result.structuredContent)).toEqual([
      { title: "Forecast", url: "https://weather.test" },
    ]);
  });
});

describe("readSearchWebSources", () => {
  it("returns empty for failed searches", () => {
    expect(readSearchWebSources({ ok: false, sources: [] })).toEqual([]);
  });
});
