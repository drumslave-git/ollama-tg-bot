import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  appendAssistantMessage,
  bindFeatureDatabase as bindHistoryDatabase,
} from "../../../src/features/history/db/index.js";
import {
  bindFeatureDatabase,
  createTask,
  deleteTask,
  getRecentTaskMessageTexts,
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
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";

function sampleInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    chatId: -100123,
    entityId: FIXTURE_ENTITY_ID,
    createdByUserId: "777",
    instruction: "ask the team about standup",
    scheduleKind: "daily",
    timeOfDay: "09:00",
    timezone: "UTC",
    nextRunAt: "2026-01-15T09:00:00.000Z",
    ...overrides,
  };
}

const TABLES = ["tasks", "task_messages", "task_events"];

/** Synthetic fixture chat used by every test here — never a real Telegram id. */
const FIXTURE_ENTITY_ID = "-100123";

describe.skipIf(!hasTestDb)("tasks db (Postgres)", () => {
  beforeAll(async () => {
    await dropTables(...TABLES);
    await bindFeatureDatabase(testDb);
    // chat_messages is the history feature's table; bind so it exists (the
    // recent-texts query joins it). We never drop/truncate the whole table —
    // that would wipe real history on the shared local DB.
    await bindHistoryDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(async () => {
    await truncateTables(...TABLES);
    // `tasks` truncates with RESTART IDENTITY, so task ids (and the message ids
    // this file derives from them) repeat every run. chat_messages has no unique
    // (entity_id, message_id) constraint — production allows duplicates — and is
    // never truncated, so without this the fixture chat accumulates duplicate
    // rows across runs and the recent-texts join fans out. Clear only the
    // synthetic fixture entity; real history for other entities is untouched.
    await testDb.query(`DELETE FROM chat_messages WHERE entity_id = $1`, [
      FIXTURE_ENTITY_ID,
    ]);
  });

  describe("tasks db CRUD", () => {
    it("creates and reads a task back", async () => {
      const task = await createTask(sampleInput());
      expect(task.id).toBeGreaterThan(0);
      const fetched = await getTaskById(task.id);
      expect(fetched?.instruction).toBe("ask the team about standup");
      expect(fetched?.scheduleKind).toBe("daily");
      expect(fetched?.enabled).toBe(true);
      expect(fetched?.weekdays).toBeNull();
    });

    it("round-trips weekly weekdays", async () => {
      const task = await createTask(
        sampleInput({ scheduleKind: "weekly", weekdays: [1, 3, 5] }),
      );
      expect((await getTaskById(task.id))?.weekdays).toEqual([1, 3, 5]);
    });

    it("updates fields", async () => {
      const task = await createTask(sampleInput());
      const updated = await updateTask(task.id, {
        instruction: "ask about lunch",
        timeOfDay: "12:30",
      });
      expect(updated?.instruction).toBe("ask about lunch");
      expect(updated?.timeOfDay).toBe("12:30");
    });

    it("filters list and search by chat", async () => {
      await createTask(sampleInput({ chatId: 1, instruction: "water the plants" }));
      await createTask(sampleInput({ chatId: 2, instruction: "feed the cat" }));
      expect(await listTasks(1)).toHaveLength(1);
      expect(await listTasks()).toHaveLength(2);
      expect(await searchTasks("cat")).toHaveLength(1);
      expect(await searchTasks("cat", 1)).toHaveLength(0);
    });

    it("deletes a task", async () => {
      const task = await createTask(sampleInput());
      expect(await deleteTask(task.id)).toBe(true);
      expect(await getTaskById(task.id)).toBeNull();
    });
  });

  describe("listDueTasks", () => {
    it("returns only enabled tasks due at or before now", async () => {
      const due = await createTask(
        sampleInput({ nextRunAt: "2026-01-15T09:00:00.000Z" }),
      );
      await createTask(sampleInput({ nextRunAt: "2026-01-15T11:00:00.000Z" })); // future
      await createTask(sampleInput({ nextRunAt: null, enabled: false })); // disabled

      const rows = await listDueTasks("2026-01-15T10:00:00.000Z");
      expect(rows.map((t) => t.id)).toEqual([due.id]);
    });

    it("markTaskRun with null next_run disables the task", async () => {
      const task = await createTask(sampleInput());
      await markTaskRun(task.id, "2026-01-15T09:00:00.000Z", null);
      const after = await getTaskById(task.id);
      expect(after?.enabled).toBe(false);
      expect(after?.nextRunAt).toBeNull();
      expect(after?.lastRunAt).toBe("2026-01-15T09:00:00.000Z");
    });
  });

  describe("retimeTask", () => {
    it("repins timezone and next run, disabling on a null next run", async () => {
      const task = await createTask(sampleInput({ timezone: "UTC" }));
      await retimeTask(task.id, "Europe/Kyiv", "2026-01-15T20:10:00.000Z");
      const after = await getTaskById(task.id);
      expect(after?.timezone).toBe("Europe/Kyiv");
      expect(after?.nextRunAt).toBe("2026-01-15T20:10:00.000Z");
      expect(after?.enabled).toBe(true);

      await retimeTask(task.id, "Europe/Kyiv", null);
      expect((await getTaskById(task.id))?.enabled).toBe(false);
    });
  });

  describe("task message linking", () => {
    it("maps a delivered message back to its task", async () => {
      const task = await createTask(sampleInput());
      await recordTaskMessage(task.id, "-100123", 555);
      expect(await getTaskIdByMessage("-100123", 555)).toBe(task.id);
      expect(await getTaskIdByMessage("-100123", 999)).toBeNull();
      expect(await getTaskIdByMessage("-100999", 555)).toBeNull();
    });

    it("recalls recent delivered texts newest-first by joining stored history", async () => {
      const task = await createTask(sampleInput()); // entityId "-100123"
      // chat_messages is shared and not truncated, so derive collision-proof
      // Telegram ids from the (fresh) task id. Each fire stores the reply in
      // chat_messages with its id and a task_messages link; getRecentTaskMessageTexts
      // joins the two — no duplicated copy of the text.
      const mid = (n: number) => task.id * 1000 + n;
      for (const [n, text] of [
        [1, "first delivery"],
        [2, "second delivery"],
        [3, "third delivery"],
      ] as const) {
        await appendAssistantMessage(task.entityId, text, mid(n));
        await recordTaskMessage(task.id, task.entityId, mid(n));
      }

      expect(await getRecentTaskMessageTexts(task.id, task.entityId, 2)).toEqual([
        "third delivery",
        "second delivery",
      ]);
      expect(
        await getRecentTaskMessageTexts(task.id, task.entityId, 10),
      ).toEqual(["third delivery", "second delivery", "first delivery"]);

      // Another task's history is not mixed in.
      const other = await createTask(sampleInput());
      expect(await getRecentTaskMessageTexts(other.id, other.entityId, 5)).toEqual(
        [],
      );
    });
  });

  describe("task events log", () => {
    it("records events newest-first and parses detail", async () => {
      await recordTaskEvent({
        taskId: 1,
        kind: "fired",
        chatId: 42,
        summary: "hi there",
        detail: { message: "hi there", messageIds: [9] },
      });
      const events = await listTaskEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.kind).toBe("fired");
      expect(events[0]?.detail).toEqual({ message: "hi there", messageIds: [9] });
    });

    it(`caps the log at ${MAX_TASK_EVENTS} events`, async () => {
      for (let i = 0; i < MAX_TASK_EVENTS + 10; i += 1) {
        await recordTaskEvent({ kind: "created", summary: `event ${i}` });
      }
      const events = await listTaskEvents(1000);
      expect(events).toHaveLength(MAX_TASK_EVENTS);
      // Newest first — the last inserted survives, the oldest is pruned.
      expect(events[0]?.summary).toBe(`event ${MAX_TASK_EVENTS + 9}`);
      expect(events.some((e) => e.summary === "event 0")).toBe(false);
    });
  });
});
