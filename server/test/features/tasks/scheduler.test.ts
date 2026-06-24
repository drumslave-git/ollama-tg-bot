import { describe, expect, it } from "vitest";
import { createTaskScheduler } from "../../../src/features/tasks/scheduler.js";
import type { TaskRecord } from "../../../src/features/tasks/db/index.js";

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 1,
    chatId: 42,
    messageThreadId: null,
    entityId: "42",
    createdByUserId: "7",
    instruction: "do a thing",
    scheduleKind: "daily",
    timeOfDay: "09:00",
    weekdays: null,
    runDate: null,
    timezone: "UTC",
    enabled: true,
    lastRunAt: null,
    nextRunAt: "2026-01-15T09:00:00.000Z",
    createdAt: "2026-01-15T08:00:00.000Z",
    updatedAt: "2026-01-15T08:00:00.000Z",
    ...overrides,
  };
}

describe("task scheduler tick", () => {
  it("advances a recurring task and removes a spent one-shot", async () => {
    const fired: number[] = [];
    const advanced: { id: number; next: string }[] = [];
    const removed: number[] = [];

    const due: TaskRecord[] = [
      makeTask({ id: 1, scheduleKind: "daily", timeOfDay: "09:00" }),
      makeTask({
        id: 2,
        scheduleKind: "once",
        timeOfDay: "09:00",
        runDate: "2000-01-01", // already in the past → no future run
      }),
    ];

    const scheduler = createTaskScheduler({
      timezone: "UTC",
      canFire: () => true,
      listDueTasks: () => due,
      fireTask: async (task) => {
        fired.push(task.id);
        return true;
      },
      markTaskRun: (id, _last, next) => advanced.push({ id, next }),
      removeTask: (id) => removed.push(id),
    });

    await scheduler.runOnce();

    expect(fired).toEqual([1, 2]);
    expect(advanced.map((a) => a.id)).toEqual([1]); // daily re-scheduled
    expect(removed).toEqual([2]); // spent one-shot removed, not disabled
  });

  it("does not fire while firing is paused", async () => {
    let fires = 0;
    const scheduler = createTaskScheduler({
      timezone: "UTC",
      canFire: () => false,
      listDueTasks: () => [makeTask()],
      fireTask: async () => {
        fires += 1;
        return true;
      },
      markTaskRun: () => {},
      removeTask: () => {},
    });

    await scheduler.runOnce();
    expect(fires).toBe(0);
  });
});
