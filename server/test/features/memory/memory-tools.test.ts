import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "../../../src/shared/index.js";
import {
  bindGeneralMemoryDatabase,
  bindGroupMemoryDatabase,
  bindUserMemoryDatabase,
} from "../../../src/features/memory/db/index.js";
import {
  MEMORY_GET_TOOL_NAME,
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
  MEMORY_TOOL_NAMES,
  registerMemoryMcpTools,
} from "../../../src/features/memory/mcp-tools.js";

async function buildRegistry(): Promise<BotMcpRegistry> {
  const registry = new BotMcpRegistry();
  registry.registerTools(
    (server: McpServer) => registerMemoryMcpTools(server, {}),
    { getSecret: () => "", logging: {} },
  );
  await registry.finishRegistration();
  registry.setEnabledToolNames(MEMORY_TOOL_NAMES);
  return registry;
}

interface GetStructured {
  ok: boolean;
  type: string;
  id: string | null;
  content: string;
}

interface SaveStructured {
  ok: boolean;
  type: string;
  id: string | null;
  saved: boolean;
}

interface SearchStructured {
  ok: boolean;
  count: number;
  results: { type: string; id: string | null; content: string }[];
}

beforeEach(() => {
  const db = new DatabaseSync(":memory:");
  bindUserMemoryDatabase(db);
  bindGroupMemoryDatabase(db);
  bindGeneralMemoryDatabase(db);
});

describe("memory MCP tools", () => {
  it("memory_save appends a user fact and memory_get reads it back", async () => {
    const registry = await buildRegistry();

    const save = await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "user",
      id: "42",
      content: "Prefers short answers.",
    });
    expect((save.structuredContent as SaveStructured).saved).toBe(true);

    const get = await registry.callTool(MEMORY_GET_TOOL_NAME, {
      type: "user",
      id: "42",
    });
    const structured = get.structuredContent as GetStructured;
    expect(structured.content).toContain("Prefers short answers.");
    expect(structured.id).toBe("42");
  });

  it("memory_save deduplicates identical lines", async () => {
    const registry = await buildRegistry();
    const args = { type: "user", id: "42", content: "Lives in Lisbon." };

    const first = await registry.callTool(MEMORY_SAVE_TOOL_NAME, args);
    const second = await registry.callTool(MEMORY_SAVE_TOOL_NAME, args);

    expect((first.structuredContent as SaveStructured).saved).toBe(true);
    expect((second.structuredContent as SaveStructured).saved).toBe(false);
  });

  it("memory_search finds matches across all scopes", async () => {
    const registry = await buildRegistry();
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "user",
      id: "1",
      content: "Loves chess puzzles.",
    });
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "group",
      id: "g9",
      content: "The group plays chess on Fridays.",
    });
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "general",
      content: "Chess is a board game.",
    });

    const result = await registry.callTool(MEMORY_SEARCH_TOOL_NAME, {
      query: "chess",
    });
    const structured = result.structuredContent as SearchStructured;
    expect(structured.count).toBe(3);
    expect(structured.results.map((r) => r.type).sort()).toEqual([
      "general",
      "group",
      "user",
    ]);
  });

  it("memory_get for general ignores id", async () => {
    const registry = await buildRegistry();
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "general",
      content: "MTTR means mean time to recovery.",
    });

    const get = await registry.callTool(MEMORY_GET_TOOL_NAME, {
      type: "general",
    });
    const structured = get.structuredContent as GetStructured;
    expect(structured.id).toBeNull();
    expect(structured.content).toContain("MTTR");
  });

  it("memory_get requires an id for user scope", async () => {
    const registry = await buildRegistry();
    const result = await registry.callTool(MEMORY_GET_TOOL_NAME, {
      type: "user",
      id: "",
    });
    expect(result.text.toLowerCase()).toContain("requires an id");
  });
});
