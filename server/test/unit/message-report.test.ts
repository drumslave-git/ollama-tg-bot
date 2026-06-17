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
});
