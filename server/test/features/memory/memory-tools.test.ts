import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "../../../src/shared/index.js";
import { EMBEDDING_DIM } from "../../../src/llm/embeddings.js";
import {
  bindMemoryEntriesDatabase,
  bindMemoryDatabase,
  getEntriesFor,
  upsertMemory,
} from "../../../src/features/memory/db/index.js";
import {
  closeTestPool,
  dropTables,
  ensureVectorExtension,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";
import {
  MEMORY_GET_TOOL_NAME,
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_ENTRIES_GET_TOOL_NAME,
  MEMORY_ENTRIES_SEARCH_TOOL_NAME,
  MEMORY_TOOL_NAMES,
  registerMemoryMcpTools,
} from "../../../src/features/memory/mcp-tools.js";

// NOTE: memory_search is covered at the DB layer in memory-db.test.ts
// (searchMemory). The tool itself embeds the query via the live model, which
// isn't available in tests — mirroring how the summaries feature tests only its
// DB search, not the embed-dependent tool path.

function basisVector(index: number): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[index] = 1;
  return v;
}

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

describe.skipIf(!hasTestDb)("memory MCP tools (Postgres)", () => {
  beforeAll(async () => {
    await ensureVectorExtension();
    await dropTables("memory", "memory_entry");
    await bindMemoryEntriesDatabase(testDb);
    await bindMemoryDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("memory", "memory_entry"));

  it("memory_save records a raw entry awaiting consolidation", async () => {
    const registry = await buildRegistry();

    const save = await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "user",
      id: "42",
      content: "Prefers short answers.",
    });
    expect((save.structuredContent as SaveStructured).saved).toBe(true);

    const entries = await getEntriesFor("user", "42");
    expect(entries.map((e) => e.content)).toEqual(["Prefers short answers."]);
  });

  it("memory_get reads the consolidated record", async () => {
    const registry = await buildRegistry();
    await upsertMemory({
      type: "user",
      entityId: "42",
      content: "Prefers short answers.",
      embedding: basisVector(0),
    });

    const get = await registry.callTool(MEMORY_GET_TOOL_NAME, {
      type: "user",
      id: "42",
    });
    const structured = get.structuredContent as GetStructured;
    expect(structured.content).toContain("Prefers short answers.");
    expect(structured.id).toBe("42");
  });

  it("memory_get for general ignores id", async () => {
    const registry = await buildRegistry();
    await upsertMemory({
      type: "general",
      entityId: null,
      content: "MTTR means mean time to recovery.",
      embedding: basisVector(0),
    });

    const get = await registry.callTool(MEMORY_GET_TOOL_NAME, { type: "general" });
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

  it("memory_entries_get lists pending notes for an entity", async () => {
    const registry = await buildRegistry();
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "user",
      id: "42",
      content: "Prefers short answers.",
    });

    const result = await registry.callTool(MEMORY_ENTRIES_GET_TOOL_NAME, {
      type: "user",
      id: "42",
    });
    const structured = result.structuredContent as {
      count: number;
      results: { type: string; id: string | null; content: string }[];
    };
    expect(structured.count).toBe(1);
    expect(structured.results[0]!.content).toContain("Prefers short answers.");
    expect(structured.results[0]!.id).toBe("42");
  });

  it("memory_entries_search finds pending notes by keyword", async () => {
    const registry = await buildRegistry();
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "user",
      id: "1",
      content: "Loves chess puzzles.",
    });
    await registry.callTool(MEMORY_SAVE_TOOL_NAME, {
      type: "general",
      content: "Office closed on Mondays.",
    });

    const result = await registry.callTool(MEMORY_ENTRIES_SEARCH_TOOL_NAME, {
      query: "chess",
    });
    const structured = result.structuredContent as {
      count: number;
      results: { type: string; id: string | null; content: string }[];
    };
    expect(structured.count).toBe(1);
    expect(structured.results[0]!.type).toBe("user");
    expect(structured.results[0]!.content).toContain("chess");
  });
});
