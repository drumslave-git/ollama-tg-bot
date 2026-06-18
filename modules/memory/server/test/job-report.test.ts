import { describe, expect, it } from "vitest";
import { createMemoryJobDebug } from "../src/job-report.js";

describe("createMemoryJobDebug", () => {
  it("records scheduled run with runAt and phases on completion", () => {
    const store = createMemoryJobDebug({ moduleId: "memory", maxRuns: 5 });
    const runAt = new Date(Date.now() + 60_000);

    store.scheduleRun(runAt);
    const scheduled = store.snapshot();
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.scheduledRunAt).toBe(runAt.toISOString());
    expect(scheduled.currentRun?.runAt).toBe(runAt.toISOString());

    const session = store.startRun();
    session.setScanSummary(2);
    session.skipChat("chat:a", "Unchanged since last successful run");
    store.completeRun();

    const snapshot = store.snapshot();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.recentRuns).toHaveLength(1);
    expect(snapshot.recentRuns[0]?.chatsSkipped).toBe(1);

    const detail = store.getRunDetail(snapshot.recentRuns[0]!.id);
    expect(detail?.report.phases.some((p) => p.status === "skipped")).toBe(
      true,
    );
  });

  it("records failed runs", () => {
    const store = createMemoryJobDebug({ moduleId: "memory", maxRuns: 5 });
    store.startRun();
    store.failRun(new Error("provider timeout"));

    const run = store.snapshot().recentRuns[0];
    expect(run?.status).toBe("failed");
    expect(store.getRunDetail(run!.id)?.report.error).toBe("provider timeout");
  });
});
