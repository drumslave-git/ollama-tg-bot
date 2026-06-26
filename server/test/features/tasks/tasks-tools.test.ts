import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotMcpRegistry } from "../../../src/shared/index.js";
import { bindModuleDatabase } from "../../../src/features/tasks/db/index.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";
import {
  TASKS_TOOL_NAMES,
  registerTasksMcpTools,
} from "../../../src/features/tasks/mcp-tools.js";
import {
  clearTaskTurnContext,
  setTaskTurnContext,
  type TaskTurnContext,
} from "../../../src/features/tasks/turn-context.js";

async function buildRegistry(): Promise<BotMcpRegistry> {
  const registry = new BotMcpRegistry();
  registry.registerTools(
    (server: McpServer) => registerTasksMcpTools(server, {}),
    { getSecret: () => "", logging: {} },
  );
  await registry.finishRegistration();
  registry.setEnabledToolNames(TASKS_TOOL_NAMES);
  return registry;
}

function turn(overrides: Partial<TaskTurnContext> = {}): TaskTurnContext {
  return {
    chatId: 555,
    entityId: "555",
    userId: "777",
    isOwner: true,
    inGroup: false,
    messageThreadId: null,
    repliedTaskId: null,
    ...overrides,
  };
}

interface CreateStructured {
  ok: boolean;
  task: { id: number; schedule_kind: string; enabled: boolean };
}

interface ListStructured {
  ok: boolean;
  count: number;
  tasks: { id: number }[];
}

const TABLES = ["tasks", "task_messages", "task_events"];

beforeAll(async () => {
  if (!hasTestDb) return;
  await dropTables(...TABLES);
  await bindModuleDatabase(testDb);
});
afterAll(async () => {
  if (hasTestDb) await closeTestPool();
});
beforeEach(async () => {
  if (hasTestDb) await truncateTables(...TABLES);
  clearTaskTurnContext();
});

describe.skipIf(!hasTestDb)("tasks MCP tools — owner gating", () => {
  it("rejects creation when the speaker is not the owner", async () => {
    const registry = await buildRegistry();
    setTaskTurnContext(turn({ isOwner: false }));

    const result = await registry.callTool("tasks_create", {
      instruction: "ask how I'm doing",
      schedule_kind: "daily",
      time: "17:00",
    });
    expect(result.structuredContent).toBeUndefined();
    expect(result.text).toContain("Only the owner");
  });

  it("rejects management with no turn context", async () => {
    const registry = await buildRegistry();
    const result = await registry.callTool("tasks_list", {});
    expect(result.text).toContain("Only the owner");
  });
});

describe.skipIf(!hasTestDb)("tasks MCP tools — happy path", () => {
  it("creates a task bound to the turn's chat", async () => {
    const registry = await buildRegistry();
    setTaskTurnContext(turn());

    const created = (
      await registry.callTool("tasks_create", {
        instruction: "ask how I'm doing",
        schedule_kind: "daily",
        time: "17:00",
      })
    ).structuredContent as CreateStructured;

    expect(created.ok).toBe(true);
    expect(created.task.schedule_kind).toBe("daily");

    const get = await registry.callTool("tasks_get", { id: created.task.id });
    expect((get.structuredContent as { ok: boolean }).ok).toBe(true);
  });

  it("validates weekly tasks need weekdays", async () => {
    const registry = await buildRegistry();
    setTaskTurnContext(turn());
    const result = await registry.callTool("tasks_create", {
      instruction: "drinks?",
      schedule_kind: "weekly",
      time: "18:00",
      weekdays: [],
    });
    expect(result.structuredContent).toBeUndefined();
    expect(result.text.toLowerCase()).toContain("weekday");
  });

  it("scopes list/get/delete to the current chat", async () => {
    const registry = await buildRegistry();

    setTaskTurnContext(turn({ chatId: 1, entityId: "1" }));
    const inChatOne = (
      await registry.callTool("tasks_create", {
        instruction: "task in chat one",
        schedule_kind: "daily",
        time: "08:00",
      })
    ).structuredContent as CreateStructured;

    setTaskTurnContext(turn({ chatId: 2, entityId: "2" }));
    await registry.callTool("tasks_create", {
      instruction: "task in chat two",
      schedule_kind: "daily",
      time: "08:00",
    });

    // Listing in chat two sees only its own task.
    const listTwo = (await registry.callTool("tasks_list", {}))
      .structuredContent as ListStructured;
    expect(listTwo.count).toBe(1);

    // Chat two cannot read or delete chat one's task.
    const crossGet = await registry.callTool("tasks_get", {
      id: inChatOne.task.id,
    });
    expect(crossGet.text).toContain(`No task #${inChatOne.task.id}`);

    const crossDelete = await registry.callTool("tasks_delete", {
      id: inChatOne.task.id,
    });
    expect(crossDelete.text).toContain(`No task #${inChatOne.task.id}`);
  });

  it("updates and cancels a task", async () => {
    const registry = await buildRegistry();
    setTaskTurnContext(turn());

    const created = (
      await registry.callTool("tasks_create", {
        instruction: "ask at 16:00",
        schedule_kind: "daily",
        time: "16:00",
      })
    ).structuredContent as CreateStructured;

    const updated = await registry.callTool("tasks_update", {
      id: created.task.id,
      time: "18:00",
    });
    expect((updated.structuredContent as { ok: boolean }).ok).toBe(true);
    expect(updated.text).toContain("18:00");

    const deleted = await registry.callTool("tasks_delete", {
      id: created.task.id,
    });
    expect((deleted.structuredContent as { ok: boolean }).ok).toBe(true);
  });
});
