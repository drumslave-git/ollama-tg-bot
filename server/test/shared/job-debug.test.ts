import { describe, expect, it } from "vitest";
import { createModuleJobDebug } from "../../src/shared/job-debug.js";

describe("createModuleJobDebug", () => {
  it("records scheduled, running, and completed runs with steps", () => {
    const store = createModuleJobDebug({ moduleId: "memory", maxRuns: 5 });

    store.scheduleRun();
    expect(store.snapshot().status).toBe("scheduled");
    expect(store.snapshot().currentRun?.status).toBe("scheduled");

    store.startRun();
    store.addStep("Scan chats", { chatCount: 2 });
    store.addStep("Extract memories", { convKey: "123" });
    store.completeRun();

    const snapshot = store.snapshot();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.currentRun).toBeNull();
    expect(snapshot.recentRuns).toHaveLength(1);
    expect(snapshot.recentRuns[0]?.status).toBe("completed");
    expect(snapshot.recentRuns[0]?.steps).toHaveLength(2);
  });

  it("records failed runs", () => {
    const store = createModuleJobDebug({ moduleId: "vision", maxRuns: 5 });
    store.startRun();
    store.failRun(new Error("provider timeout"));

    const run = store.snapshot().recentRuns[0];
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("provider timeout");
  });
});
