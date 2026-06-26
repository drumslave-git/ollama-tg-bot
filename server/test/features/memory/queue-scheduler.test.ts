import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryQueueScheduler,
  type MemoryQueueSchedulerDeps,
} from "../../../src/features/memory/index.js";

function makeDeps(
  overrides: Partial<MemoryQueueSchedulerDeps> = {},
): { deps: MemoryQueueSchedulerDeps; cleanupCalls: () => number } {
  const fingerprints = new Map<string, string>();
  let cleanupCalls = 0;
  const deps: MemoryQueueSchedulerDeps = {
    getQueueSize: () => 0,
    getConfig: async () => ({ maintenanceDebounceSec: 5 }),
    listUserMemories: async () => [],
    listGroupMemories: async () => [],
    getGeneralContent: async () => "",
    getRecordFingerprint: async (key) => fingerprints.get(key) ?? null,
    setRecordFingerprint: async (key, fp) => void fingerprints.set(key, fp),
    writeUserMemory: async () => {},
    writeGroupMemory: async () => {},
    writeGeneralMemory: async () => {},
    buildCleanupConfig: async () => ({
      model: "stub",
      llmTimeoutSec: 30,
      llm: {
        baseUrl: "",
        model: "stub",
        chatComplete: async () => {
          cleanupCalls += 1;
          return '{"memory":"Likes tea.\\nLives in Lisbon."}';
        },
      },
    }),
    ...overrides,
  };
  return { deps, cleanupCalls: () => cleanupCalls };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("memory maintenance scheduler", () => {
  it("cleans a changed record, then skips it while unchanged", async () => {
    let stored = "Likes tea.\nLikes tea.\nLives in Lisbon.";
    const writes: string[][] = [];
    const { deps, cleanupCalls } = makeDeps({
      listUserMemories: async () => [{ id: "1", content: stored }],
      writeUserMemory: async (_id, lines) => {
        writes.push(lines);
        stored = lines.join("\n");
      },
    });

    const scheduler = createMemoryQueueScheduler(deps);

    // First idle window: the record changed since (no) last run → cleaned.
    scheduler.onQueueActivity();
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toEqual([["Likes tea.", "Lives in Lisbon."]]);
    expect(cleanupCalls()).toBe(1);

    // Second idle window: content now matches the stored fingerprint → skipped.
    scheduler.onQueueActivity();
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toHaveLength(1);
    expect(cleanupCalls()).toBe(1);
  });
});
