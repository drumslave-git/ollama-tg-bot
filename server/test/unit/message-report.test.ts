import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureMessageProcessing, reportMessageProcessing, setMessageProcessingStatus } =
  vi.hoisted(() => ({
    ensureMessageProcessing: vi.fn(async (..._args: unknown[]) => 1),
    reportMessageProcessing: vi.fn(async (..._args: unknown[]) => {}),
    setMessageProcessingStatus: vi.fn(async (..._args: unknown[]) => {}),
  }));

vi.mock("../../src/db/debug/message-processing.js", () => ({
  ensureMessageProcessing,
  reportMessageProcessing,
  setMessageProcessingStatus,
}));

import {
  beginMessageReport,
  linkProcessingMessage,
} from "../../src/debug/message-report.js";

describe("message processing report", () => {
  beforeEach(() => {
    ensureMessageProcessing.mockClear();
    reportMessageProcessing.mockClear();
    setMessageProcessingStatus.mockClear();
  });

  it("buffers entries until the chat message is linked, then flushes in order", async () => {
    const session = beginMessageReport({ turnId: 1 });

    // Before linking, nothing is written.
    session.okPhase("address", "Address check", "Addressed");
    expect(reportMessageProcessing).not.toHaveBeenCalled();

    linkProcessingMessage(1, 555);
    await session.flush();
    expect(ensureMessageProcessing).toHaveBeenCalledWith(555);
    expect(reportMessageProcessing).toHaveBeenCalledWith(
      555,
      "Address check",
      "text",
      "Addressed",
    );
  });

  it("splits an LLM call into request, waiting and response entries in order", async () => {
    const session = beginMessageReport({ turnId: 2 });
    linkProcessingMessage(2, 7);

    session.beginLlmWait("main reply", "test-model", 120, { foo: 1 }, "temp=0.7");
    session.recordLlmCall(
      "main reply",
      "test-model",
      512,
      [{ role: "user", content: "ping" }],
      { message: { content: '{"reply":"pong"}' }, finishReason: "stop" },
      undefined,
      undefined,
      undefined,
      { ok: true },
      1500,
    );
    await session.flush();

    const titles = reportMessageProcessing.mock.calls.map((c) => c[1]);
    expect(titles).toEqual([
      "LLM request · Main reply",
      "Waiting for LLM · Main reply",
      "LLM response · Main reply",
      "LLM result · Main reply",
    ]);
    // request + response carry JSON bodies; the rest are text.
    const types = reportMessageProcessing.mock.calls.map((c) => c[2]);
    expect(types).toEqual(["json", "text", "json", "text"]);
  });

  it("records an ignored terminal status", async () => {
    const session = beginMessageReport({ turnId: 3 });
    linkProcessingMessage(3, 9);

    session.finishIgnored("not_addressed");
    await session.flush();
    expect(reportMessageProcessing).toHaveBeenCalledWith(
      9,
      "Ignored",
      "text",
      "Not addressed to the bot",
    );
    expect(setMessageProcessingStatus).toHaveBeenCalledWith(
      9,
      "ignored",
      expect.objectContaining({ totalTimeSpentMs: expect.any(Number) }),
    );
  });

  it("stores reply message ids on processed turns", async () => {
    const session = beginMessageReport({ turnId: 4 });
    linkProcessingMessage(4, 11);

    session.finalizeProcessed({ replyChars: 42, replyMessageIds: [100, 101] });
    await session.flush();
    expect(setMessageProcessingStatus).toHaveBeenCalledWith(
      11,
      "processed",
      expect.objectContaining({ replyMessageIds: [100, 101] }),
    );
  });
});
