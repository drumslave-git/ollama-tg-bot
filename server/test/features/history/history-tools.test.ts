import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "../../../src/shared/index.js";
import {
  appendMessage,
  bindHistoryDatabase,
} from "../../../src/features/history/db/history.js";
import {
  HISTORY_GET_IN_RANGE_TOOL_NAME,
  HISTORY_TODAY_GET_LATEST_TOOL_NAME,
  HISTORY_SEARCH_TOOL_NAME,
  HISTORY_TOOL_NAMES,
  registerHistoryMcpTools,
} from "../../../src/features/history/mcp-tools.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";

const ENTITY = "777";

async function buildRegistry(): Promise<BotMcpRegistry> {
  const registry = new BotMcpRegistry();
  registry.registerTools(
    (server: McpServer) => registerHistoryMcpTools(server, {}),
    { getSecret: () => "", logging: {} },
  );
  await registry.finishRegistration();
  registry.setEnabledToolNames(HISTORY_TOOL_NAMES);
  return registry;
}

interface HistoryToolStructured {
  ok: boolean;
  count: number;
  messages: { role: string; content: string; at: string }[];
}

describe.skipIf(!hasTestDb)("history MCP tools (Postgres)", () => {
  beforeAll(async () => {
    await dropTables("chat_messages");
    await bindHistoryDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("chat_messages"));

  it("history_today_get_latest returns recent messages as transcript + structured content", async () => {
    await appendMessage(ENTITY, "user:alice:1", "hello");
    await appendMessage(ENTITY, "user:alice:1", "world");
    const registry = await buildRegistry();

    const result = await registry.callTool(HISTORY_TODAY_GET_LATEST_TOOL_NAME, {
      entity_id: ENTITY,
      count: 5,
    });

    expect(result.text).toContain("hello");
    expect(result.text).toContain("world");
    const structured = result.structuredContent as HistoryToolStructured;
    expect(structured.ok).toBe(true);
    expect(structured.count).toBe(2);
  });

  it("history_search matches content via full-text", async () => {
    await appendMessage(ENTITY, "user:alice:1", "The Finals is a shooter");
    await appendMessage(ENTITY, "user:alice:1", "unrelated");
    const registry = await buildRegistry();

    const result = await registry.callTool(HISTORY_SEARCH_TOOL_NAME, {
      entity_id: ENTITY,
      query: "finals",
    });

    const structured = result.structuredContent as HistoryToolStructured;
    expect(structured.count).toBe(1);
    expect(structured.messages[0]!.content).toContain("Finals");
  });

  it("replaces pending base64 media with a placeholder", async () => {
    await appendMessage(
      ENTITY,
      "user:alice:1",
      "[sent image]: data:image/jpeg;base64,QUJDREVGR0hJSktM",
    );
    const registry = await buildRegistry();

    const result = await registry.callTool(HISTORY_TODAY_GET_LATEST_TOOL_NAME, {
      entity_id: ENTITY,
      count: 5,
    });

    expect(result.text).not.toContain("base64");
    expect(result.text).toContain("[image not yet described]");
  });

  it("history_get_in_range rejects an invalid range", async () => {
    const registry = await buildRegistry();
    const result = await registry.callTool(HISTORY_GET_IN_RANGE_TOOL_NAME, {
      entity_id: ENTITY,
      from: "not-a-date",
      to: "2026-06-22T00:00:00Z",
    });
    expect(result.text.toLowerCase()).toContain("invalid range");
  });
});
