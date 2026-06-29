import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryScheduler } from "../../../src/features/memory/scheduler.js";
import type { MemoryConfig } from "../../../src/features/memory/config.js";

interface Harness {
  calls: number;
  queueSize: number;
  config: MemoryConfig;
}

function makeScheduler(h: Harness) {
  return createMemoryScheduler({
    timezone: "UTC",
    getConfig: async () => h.config,
    getQueueSize: () => h.queueSize,
    consolidate: async () => {
      h.calls += 1;
      return { entities: 1, changed: 1, consumed: 1 };
    },
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createMemoryScheduler", () => {
  it("consolidates when enabled, past the run hour, and idle", async () => {
    vi.setSystemTime(new Date("2026-06-28T10:00:00Z"));
    const h: Harness = { calls: 0, queueSize: 0, config: { enabled: true, runHour: 4 } };
    await makeScheduler(h).runOnce();
    expect(h.calls).toBe(1);
  });

  it("skips when disabled", async () => {
    vi.setSystemTime(new Date("2026-06-28T10:00:00Z"));
    const h: Harness = { calls: 0, queueSize: 0, config: { enabled: false, runHour: 4 } };
    await makeScheduler(h).runOnce();
    expect(h.calls).toBe(0);
  });

  it("skips while the message queue is busy", async () => {
    vi.setSystemTime(new Date("2026-06-28T10:00:00Z"));
    const h: Harness = { calls: 0, queueSize: 3, config: { enabled: true, runHour: 4 } };
    await makeScheduler(h).runOnce();
    expect(h.calls).toBe(0);
  });

  it("skips before the configured run hour", async () => {
    vi.setSystemTime(new Date("2026-06-28T02:00:00Z"));
    const h: Harness = { calls: 0, queueSize: 0, config: { enabled: true, runHour: 4 } };
    await makeScheduler(h).runOnce();
    expect(h.calls).toBe(0);
  });

  it("runs at most once per local day", async () => {
    vi.setSystemTime(new Date("2026-06-28T10:00:00Z"));
    const h: Harness = { calls: 0, queueSize: 0, config: { enabled: true, runHour: 4 } };
    const scheduler = makeScheduler(h);

    await scheduler.runOnce();
    await scheduler.runOnce();
    expect(h.calls).toBe(1);

    vi.setSystemTime(new Date("2026-06-29T10:00:00Z"));
    await scheduler.runOnce();
    expect(h.calls).toBe(2);
  });
});
