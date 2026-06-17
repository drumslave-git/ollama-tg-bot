import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMessageReport } = vi.hoisted(() => ({
  upsertMessageReport: vi.fn(),
}));

vi.mock("../../src/db/debug/traces.js", () => ({
  upsertMessageReport,
}));

import { beginMessageReport } from "../../src/debug/message-report.js";

describe("beginMessageReport", () => {
  beforeEach(() => {
    upsertMessageReport.mockClear();
  });

  it("persists a processing trace immediately so in-flight turns are visible", () => {
    const session = beginMessageReport({
      turnId: 42,
      chatId: 1001,
      userId: "7",
      chatType: "private",
      messageId: 99,
      messagePreview: "hello",
    });

    expect(upsertMessageReport).toHaveBeenCalledTimes(1);
    expect(upsertMessageReport.mock.calls[0]?.[0]).toMatchObject({
      id: 42,
      status: "processing",
      messagePreview: "hello",
    });
    expect(upsertMessageReport.mock.calls[0]?.[0].report.routing).toEqual({
      decision: "pending",
      pendingLabel: "Message received",
    });
    expect(upsertMessageReport.mock.calls[0]?.[0].report.phases).toEqual([
      expect.objectContaining({
        id: "intake",
        title: "Message received",
        status: "ok",
      }),
    ]);
    expect(upsertMessageReport.mock.calls[0]?.[0].report.headline).toBe(
      "Processing · Message received",
    );

    session.okPhase("address", "Address check", "Addressed");
    expect(upsertMessageReport).toHaveBeenCalledTimes(2);
    expect(upsertMessageReport.mock.calls[1]?.[0].report.headline).toBe(
      "Processing · Address check",
    );

    session.finishIgnored("not_addressed");
    expect(upsertMessageReport.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "ignored",
    });
  });

  it("re-persists on tick while processing for live dashboard duration", () => {
    const session = beginMessageReport({
      turnId: 11,
      chatId: 3003,
      userId: "1",
      chatType: "private",
      messageId: 2,
      messagePreview: "tick",
    });
    upsertMessageReport.mockClear();

    session.tick();
    expect(upsertMessageReport).toHaveBeenCalledTimes(1);
    expect(upsertMessageReport.mock.calls[0]?.[0].status).toBe("processing");
  });

  it("shows a waiting LLM phase and headline while the provider has not replied", () => {
    const session = beginMessageReport({
      turnId: 7,
      chatId: 2002,
      userId: "3",
      chatType: "private",
      messageId: 1,
      messagePreview: "ping",
    });

    session.beginLlmWait("main reply", "test-model", 120);
    const waitingPersist = upsertMessageReport.mock.calls.at(-1)?.[0];
    expect(waitingPersist?.report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "llm-main-reply",
          status: "waiting",
          summary: "Waiting for LLM · test-model · up to 120s",
        }),
      ]),
    );
    expect(waitingPersist?.report.headline).toBe("Waiting for LLM · Main reply");

    session.recordLlmCall(
      "main reply",
      "test-model",
      512,
      [{ role: "user", content: "ping" }],
      { message: { content: '{"reply":"pong"}' } },
      undefined,
      undefined,
      undefined,
      undefined,
      1500,
    );
    const donePersist = upsertMessageReport.mock.calls.at(-1)?.[0];
    expect(donePersist?.report.phases).toHaveLength(2);
    expect(donePersist?.report.phases[1]).toMatchObject({
      id: "llm-main-reply",
      status: "ok",
      durationMs: 1500,
    });
  });
});
