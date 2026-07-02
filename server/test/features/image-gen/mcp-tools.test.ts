import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "../../../src/shared/index.js";
import {
  registerImageGenMcpTools,
  IMAGE_GENERATE_TOOL_NAME,
  readGeneratedImages,
} from "../../../src/features/image-gen/mcp-tools.js";

describe("registerImageGenMcpTools", () => {
  it("registers image_generate and returns the base64 images in structured content", async () => {
    const registry = new BotMcpRegistry();
    const generate = vi.fn(async () => ["QUJD"]);

    registry.registerTools(
      (server: McpServer) => {
        registerImageGenMcpTools(server, { generate });
      },
      { getSecret: () => "", logging: {} },
    );
    await registry.finishRegistration();
    registry.setEnabledToolNames([IMAGE_GENERATE_TOOL_NAME]);

    const result = await registry.callTool(IMAGE_GENERATE_TOOL_NAME, {
      prompt: "a red cat",
      size: [512, 512],
    });

    expect(generate).toHaveBeenCalledWith("a red cat", [512, 512]);
    expect(result.text).toContain("a red cat");
    expect(readGeneratedImages(result.structuredContent)).toEqual(["QUJD"]);
  });

  it("defaults size to 1024x1024 when omitted", async () => {
    const registry = new BotMcpRegistry();
    const generate = vi.fn(async () => ["QUJD"]);

    registry.registerTools(
      (server: McpServer) => {
        registerImageGenMcpTools(server, { generate });
      },
      { getSecret: () => "", logging: {} },
    );
    await registry.finishRegistration();
    registry.setEnabledToolNames([IMAGE_GENERATE_TOOL_NAME]);

    await registry.callTool(IMAGE_GENERATE_TOOL_NAME, { prompt: "a blue dog" });

    expect(generate).toHaveBeenCalledWith("a blue dog", [1024, 1024]);
  });

  it("reports failure and yields no images when generation throws", async () => {
    const registry = new BotMcpRegistry();
    const generate = vi.fn(async () => {
      throw new Error("no model configured");
    });

    registry.registerTools(
      (server: McpServer) => {
        registerImageGenMcpTools(server, { generate });
      },
      { getSecret: () => "", logging: {} },
    );
    await registry.finishRegistration();
    registry.setEnabledToolNames([IMAGE_GENERATE_TOOL_NAME]);

    const result = await registry.callTool(IMAGE_GENERATE_TOOL_NAME, {
      prompt: "a cat",
    });

    expect(result.text).toContain("could not generate");
    expect(readGeneratedImages(result.structuredContent)).toEqual([]);
  });
});

describe("readGeneratedImages", () => {
  it("returns empty for failed generations", () => {
    expect(
      readGeneratedImages({ ok: false, count: 0, size: [1, 1], images: [] }),
    ).toEqual([]);
  });
});
