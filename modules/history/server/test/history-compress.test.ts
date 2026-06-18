import { describe, expect, it, vi } from "vitest";
import {
  compressHistoryChat,
  scheduleHistoryCompression,
  type HistoryCompressDeps,
} from "../src/compress.js";
import { COMPRESSED_ROLE, type StoredMessage } from "../src/types.js";

function makeDeps(
  history: StoredMessage[],
  overrides: Partial<HistoryCompressDeps> = {},
): HistoryCompressDeps & { replaceCalls: StoredMessage[][] } {
  let stored = [...history];
  const replaceCalls: StoredMessage[][] = [];

  return {
    replaceCalls,
    getHistory: () => stored,
    replaceHistory: (_chatKey, messages, _isCompression) => {
      replaceCalls.push(messages);
      stored = messages;
    },
    chatComplete: vi.fn().mockResolvedValue("Summary of the chat."),
    getHistoryLimits: () => ({ historyMaxTokens: 10_000 }),
    ...overrides,
  };
}

describe("compressHistoryChat", () => {
  it("skips empty history", async () => {
    const deps = makeDeps([]);
    const result = await compressHistoryChat("123", deps, { force: true });
    expect(result).toEqual({ ok: true, skipped: true, reason: "empty" });
    expect(deps.chatComplete).not.toHaveBeenCalled();
  });

  it("skips when within budget unless forced", async () => {
    const deps = makeDeps([{ role: "user:alice:1", content: "hello" }]);
    const result = await compressHistoryChat("123", deps);
    expect(result).toEqual({ ok: true, skipped: true, reason: "within_budget" });
    expect(deps.chatComplete).not.toHaveBeenCalled();
  });

  it("compresses when forced even if within budget", async () => {
    const chatComplete = vi.fn().mockResolvedValue("Summary of the chat.");
    const deps = makeDeps(
      [
        { role: "user:alice:1", content: "hello" },
        { role: "assistant", content: "[assistant said]: hi" },
      ],
      { chatComplete },
    );
    const result = await compressHistoryChat("123", deps, { force: true });

    expect(result.ok).toBe(true);
    expect(result.messageCount).toBe(2);
    expect(deps.replaceCalls).toHaveLength(1);
    expect(deps.replaceCalls[0]).toEqual([
      expect.objectContaining({
        role: COMPRESSED_ROLE,
        content: "Summary of the chat.",
      }),
    ]);
  });

  it("includes participant tags from stored roles in the compression prompt", async () => {
    const chatComplete = vi.fn().mockResolvedValue("Summary.");
    const deps = makeDeps(
      [
        { role: "user:alice:424242", content: "hello there" },
        { role: "assistant", content: "[assistant said]: hi back" },
      ],
      { chatComplete },
    );
    await compressHistoryChat("-100123", deps, { force: true });

    const userMessage = chatComplete.mock.calls[0]?.[0]?.find(
      (message: { role: string }) => message.role === "user",
    );
    expect(userMessage?.content).toContain(
      "[user:alice:424242]: hello there",
    );
    expect(userMessage?.content).toContain("[assistant said]: hi back");
  });

  it("returns failure when the model returns empty summary", async () => {
    const deps = makeDeps([{ role: "user:alice:1", content: "hello" }], {
      chatComplete: vi.fn().mockResolvedValue("   "),
    });
    const result = await compressHistoryChat("123", deps, { force: true });
    expect(result).toEqual({ ok: false, reason: "empty_summary" });
    expect(deps.replaceCalls).toHaveLength(0);
  });

  it("deduplicates in-flight compression for the same chat", async () => {
    let resolveComplete: ((value: string) => void) | undefined;
    const chatComplete = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveComplete = resolve;
        }),
    );
    const deps = makeDeps([{ role: "user:alice:1", content: "hello" }], {
      chatComplete,
    });

    const first = scheduleHistoryCompression("123", deps, { force: true });
    const second = scheduleHistoryCompression("123", deps, { force: true });
    expect(second).toBe(first);
    resolveComplete?.("Done.");
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(chatComplete).toHaveBeenCalledTimes(1);
  });
});
