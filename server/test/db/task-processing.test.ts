import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bindTasksDatabase } from "../../src/features/tasks/db/tasks.js";
import {
  DELETED_TASK_GROUP,
  MAX_FIRES_PER_TASK,
  appendTaskEntry,
  bindTaskProcessingDatabase,
  createTaskProcessing,
  getTaskProcessingDetail,
  listProcessingsForTask,
  listTaskGroups,
  setTaskProcessingStatus,
} from "../../src/db/debug/task-processing.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../helpers/pg.js";

async function makeTask(instruction = "say hi"): Promise<number> {
  const { rows } = await testDb.query<{ id: number }>(
    `INSERT INTO tasks
       (chat_id, entity_id, created_by_user_id, instruction,
        schedule_kind, time_of_day, timezone)
     VALUES (10, '10', '1', $1, 'daily', '09:00', 'UTC')
     RETURNING id`,
    [instruction],
  );
  return rows[0]!.id;
}

describe.skipIf(!hasTestDb)("task processing store (Postgres)", () => {
  beforeAll(async () => {
    await dropTables(
      "task_processing_entries",
      "task_processings",
      "tasks",
    );
    await bindTasksDatabase(testDb);
    await bindTaskProcessingDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() =>
    truncateTables("task_processing_entries", "task_processings", "tasks"),
  );

  it("records a fire with ordered entries and a summary", async () => {
    const taskId = await makeTask("remind to drink water");
    const pid = await createTaskProcessing(taskId);
    expect(pid).not.toBeNull();
    await appendTaskEntry(pid!, "Fired", "text", "remind to drink water");
    await appendTaskEntry(pid!, "LLM request · task fire", "json", "{}");
    await setTaskProcessingStatus(pid!, "processed", {
      totalTimeSpentMs: 800,
      summary: "drink some water!",
    });

    const list = await listProcessingsForTask(taskId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      status: "processed",
      totalTimeSpent: 800,
      summary: "drink some water!",
      entryCount: 2,
    });

    const detail = await getTaskProcessingDetail(pid!);
    expect(detail?.taskInstruction).toBe("remind to drink water");
    expect(detail?.entries.map((e) => e.title)).toEqual([
      "Fired",
      "LLM request · task fire",
    ]);
  });

  it("keeps the fire but nulls task_id when the task is deleted (SET NULL)", async () => {
    const taskId = await makeTask();
    const pid = await createTaskProcessing(taskId);
    await appendTaskEntry(pid!, "Fired", "text", "hi");

    await testDb.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

    const { rows } = await testDb.query<{ task_id: number | null }>(
      `SELECT task_id FROM task_processings WHERE id = $1`,
      [pid],
    );
    expect(rows[0]?.task_id).toBeNull();

    // The orphaned fire surfaces under the "deleted task" group.
    const deleted = await listProcessingsForTask(DELETED_TASK_GROUP);
    expect(deleted.map((p) => p.id)).toContain(pid);
    const groups = await listTaskGroups();
    expect(groups.find((g) => g.taskId === DELETED_TASK_GROUP)?.label).toBe(
      "(deleted task)",
    );
  });

  it("trims to the newest N fires per task", async () => {
    const taskId = await makeTask();
    const overflow = MAX_FIRES_PER_TASK + 3;
    for (let i = 0; i < overflow; i++) {
      const pid = await createTaskProcessing(taskId);
      await appendTaskEntry(pid!, "Fired", "text", `fire ${i}`);
    }
    const list = await listProcessingsForTask(taskId);
    expect(list).toHaveLength(MAX_FIRES_PER_TASK);
    const groups = await listTaskGroups();
    expect(groups.find((g) => g.taskId === taskId)?.fireCount).toBe(
      MAX_FIRES_PER_TASK,
    );
  });
});
