import { describe, expect, it } from "vitest";
import { createVisionJobDebug } from "../../../src/features/vision/job-report.js";

describe("createVisionJobDebug", () => {
  it("records scheduled run with runAt and phases on completion", () => {
    const store = createVisionJobDebug({ moduleId: "vision", maxRuns: 5 });
    const runAt = new Date(Date.now() + 60_000);

    store.scheduleRun(runAt);
    const scheduled = store.snapshot({ pendingMediaRows: 2, chatsWithPending: 1 });
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.scheduledRunAt).toBe(runAt.toISOString());
    expect(scheduled.currentRun?.runAt).toBe(runAt.toISOString());
    expect(scheduled.pendingMediaRows).toBe(2);

    const session = store.startRun();
    session.setScanSummary(2);
    session.recordBackfill("chat:a", "photo", 120);
    session.recordDescribeFailed("chat:b", "sticker");
    store.completeRun();

    const snapshot = store.snapshot({ pendingMediaRows: 0, chatsWithPending: 0 });
    expect(snapshot.status).toBe("idle");
    expect(snapshot.recentRuns).toHaveLength(1);
    expect(snapshot.recentRuns[0]?.mediaBackfilled).toBe(1);
    expect(snapshot.recentRuns[0]?.mediaFailed).toBe(1);

    const detail = store.getRunDetail(snapshot.recentRuns[0]!.id);
    expect(detail?.report.phases.some((p) => p.status === "failed")).toBe(true);
  });

  it("records failed runs", () => {
    const store = createVisionJobDebug({ moduleId: "vision", maxRuns: 5 });
    store.startRun();
    store.failRun(new Error("provider timeout"));

    const run = store.snapshot({ pendingMediaRows: 0, chatsWithPending: 0 })
      .recentRuns[0];
    expect(run?.status).toBe("failed");
    expect(store.getRunDetail(run!.id)?.report.error).toBe("provider timeout");
  });
});
