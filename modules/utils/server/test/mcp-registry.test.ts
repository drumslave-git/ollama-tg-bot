import { describe, expect, it } from "vitest";
import { BotMcpRegistry } from "../src/mcp/bot-mcp-registry.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const testContext = {
  getSecret: () => "",
  logging: {},
};

describe("BotMcpRegistry", () => {
  it("lists and calls a registered tool", async () => {
    const registry = new BotMcpRegistry();
    registry.registerTools((server: McpServer) => {
      server.registerTool(
        "echo",
        {
          title: "Echo",
          description: "Echo input",
          inputSchema: z.object({
            text: z.string(),
          }),
        },
        async ({ text }) => ({
          content: [{ type: "text", text: `echo:${text}` }],
        }),
      );
    }, testContext);
    await registry.finishRegistration();

    registry.setEnabledToolNames(["echo"]);
    const tools = await registry.listOpenAiTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.type).toBe("function");
    if (tools[0]?.type === "function") {
      expect(tools[0].function.name).toBe("echo");
    }

    await expect(registry.callTool("echo", { text: "hi" })).resolves.toEqual({
      text: "echo:hi",
      structuredContent: undefined,
    });
  });

  it("blocks disabled tools", async () => {
    const registry = new BotMcpRegistry();
    registry.registerTools((server: McpServer) => {
      server.registerTool(
        "secret",
        {
          description: "hidden",
          inputSchema: z.object({}),
        },
        async () => ({ content: [{ type: "text", text: "ok" }] }),
      );
    }, testContext);
    await registry.finishRegistration();
    registry.setEnabledToolNames([]);
    await expect(
      registry.callTool("secret", {}),
    ).rejects.toThrow(/not enabled/i);
  });
});

describe("callToolResultToText", () => {
  it("joins text blocks", async () => {
    const { callToolResultToText } = await import("../src/mcp/openai-tools.js");
    expect(
      callToolResultToText({
        content: [{ type: "text", text: "a" }, { type: "text", text: "b" }],
      }),
    ).toBe("a\n\nb");
  });
});
