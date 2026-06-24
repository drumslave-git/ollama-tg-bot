import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  bindModuleDatabase,
  createTask,
  deleteTask,
  getTaskById,
  getTaskIdByMessage,
  listDueTasks,
  listTasks,
  listTaskEvents,
  markTaskRun,
  MAX_TASK_EVENTS,
  recordTaskEvent,
  recordTaskMessage,
  retimeTask,
  searchTasks,
  updateTask,
  type TaskInput,
} from "../../../src/features/tasks/db/index.js";

function sampleInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    chatId: -100123,
    entityId: "-100123",
    createdByUserId: "777",
    instruction: "ask the team about standup",
    scheduleKind: "daily",
    timeOfDay: "09:00",
    timezone: "UTC",
    nextRunAt: "2026-01-15T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  bindModuleDatabase(new DatabaseSync(":memory:"));
});

describe("tasks db CRUD", () => {
  it("creates and reads a task back", () => {
    const task = createTask(sampleInput());
    expect(task.id).toBeGreaterThan(0);
    const fetched = getTaskById(task.id);
    expect(fetched?.instruction).toBe("ask the team about standup");
    expect(fetched?.scheduleKind).toBe("daily");
    expect(fetched?.enabled).toBe(true);
    expect(fetched?.weekdays).toBeNull();
  });

  it("round-trips weekly weekdays", () => {
    const task = createTask(
      sampleInput({ scheduleKind: "weekly", weekdays: [1, 3, 5] }),
    );
    expect(getTaskById(task.id)?.weekdays).toEqual([1, 3, 5]);
  });

  it("updates fields", () => {
    const task = createTask(sampleInput());
    const updated = updateTask(task.id, {
      instruction: "ask about lunch",
      timeOfDay: "12:30",
    });
    expect(updated?.instruction).toBe("ask about lunch");
    expect(updated?.timeOfDay).toBe("12:30");
  });

  it("filters list and search by chat", () => {
    createTask(sampleInput({ chatId: 1, instruction: "water the plants" }));
    createTask(sampleInput({ chatId: 2, instruction: "feed the cat" }));
    expect(listTasks(1)).toHaveLength(1);
    expect(listTasks()).toHaveLength(2);
    expect(searchTasks("cat")).toHaveLength(1);
    expect(searchTasks("cat", 1)).toHaveLength(0);
  });

  it("deletes a task", () => {
    const task = createTask(sampleInput());
    expect(deleteTask(task.id)).toBe(true);
    expect(getTaskById(task.id)).toBeNull();
  });
});

describe("listDueTasks", () => {
  it("returns only enabled tasks due at or before now", () => {
    const due = createTask(sampleInput({ nextRunAt: "2026-01-15T09:00:00.000Z" }));
    createTask(sampleInput({ nextRunAt: "2026-01-15T11:00:00.000Z" })); // future
    createTask(sampleInput({ nextRunAt: null, enabled: false })); // disabled

    const rows = listDueTasks("2026-01-15T10:00:00.000Z");
    expect(rows.map((t) => t.id)).toEqual([due.id]);
  });

  it("markTaskRun with null next_run disables the task", () => {
    const task = createTask(sampleInput());
    markTaskRun(task.id, "2026-01-15T09:00:00.000Z", null);
    const after = getTaskById(task.id);
    expect(after?.enabled).toBe(false);
    expect(after?.nextRunAt).toBeNull();
    expect(after?.lastRunAt).toBe("2026-01-15T09:00:00.000Z");
  });
});

describe("retimeTask", () => {
  it("repins timezone and next run, disabling on a null next run", () => {
    const task = createTask(sampleInput({ timezone: "UTC" }));
    retimeTask(task.id, "Europe/Kyiv", "2026-01-15T20:10:00.000Z");
    const after = getTaskById(task.id);
    expect(after?.timezone).toBe("Europe/Kyiv");
    expect(after?.nextRunAt).toBe("2026-01-15T20:10:00.000Z");
    expect(after?.enabled).toBe(true);

    retimeTask(task.id, "Europe/Kyiv", null);
    expect(getTaskById(task.id)?.enabled).toBe(false);
  });
});

describe("task message linking", () => {
  it("maps a delivered message back to its task", () => {
    const task = createTask(sampleInput());
    recordTaskMessage(task.id, "-100123", 555);
    expect(getTaskIdByMessage("-100123", 555)).toBe(task.id);
    expect(getTaskIdByMessage("-100123", 999)).toBeNull();
    expect(getTaskIdByMessage("-100999", 555)).toBeNull();
  });
});

describe("task events log", () => {
  it("records events newest-first and parses detail", () => {
    recordTaskEvent({
      taskId: 1,
      kind: "fired",
      chatId: 42,
      summary: "hi there",
      detail: { message: "hi there", messageIds: [9] },
    });
    const events = listTaskEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("fired");
    expect(events[0]?.detail).toEqual({ message: "hi there", messageIds: [9] });
  });

  it(`caps the log at ${MAX_TASK_EVENTS} events`, () => {
    for (let i = 0; i < MAX_TASK_EVENTS + 10; i += 1) {
      recordTaskEvent({ kind: "created", summary: `event ${i}` });
    }
    const events = listTaskEvents(1000);
    expect(events).toHaveLength(MAX_TASK_EVENTS);
    // Newest first — the last inserted survives, the oldest is pruned.
    expect(events[0]?.summary).toBe(`event ${MAX_TASK_EVENTS + 9}`);
    expect(events.some((e) => e.summary === "event 0")).toBe(false);
  });
});
