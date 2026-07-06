import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "../../../src/features/tasks/db/index.js";

// Capture the recorder phase vocabulary the fire path emits so we can assert the
// trace is as rich as message processing (phase-by-phase, not just start/end).
const h = vi.hoisted(() => {
  const phases: string[] = [];
  const recorder = {
    traceId: 1,
    note: (title: string) => {
      phases.push(`note:${title}`);
    },
    okPhase: (_id: string, title: string) => {
      phases.push(`ok:${title}`);
    },
    failPhase: (_id: string, title: string) => {
      phases.push(`fail:${title}`);
    },
    complete: (status: string) => {
      phases.push(`complete:${status}`);
    },
  };
  return {
    phases,
    recorder,
    generateOutOfBandReplyRaw: vi.fn(async (_opts: { userMessage: string }) =>
      '{"reply":"hello"}',
    ),
    extractTelegramReply: vi.fn((_raw: string) => "hello"),
    sendMessage: vi.fn(async () => ({ message_id: 123 })),
    beginTaskProcessing: vi.fn(async () => recorder),
    getRecentTaskMessageTexts: vi.fn(
      async (_id: number, _entityId: string, _n: number) => [] as string[],
    ),
  };
});

vi.mock("../../../src/pipeline/out-of-band-reply.js", () => ({
  generateOutOfBandReplyRaw: h.generateOutOfBandReplyRaw,
}));
vi.mock("../../../src/features/completions/index.js", () => ({
  extractTelegramReply: h.extractTelegramReply,
}));
vi.mock("../../../src/bot/index.js", () => ({
  getBot: () => ({ api: { sendMessage: h.sendMessage } }),
}));
vi.mock("../../../src/bot/replies/delivery.js", () => ({
  splitTelegramMessage: (s: string) => [s],
}));
vi.mock("../../../src/telegram/html.js", () => ({
  prepareTelegramHtml: (s: string) => s,
  visibleTelegramText: (s: string) => s,
}));
vi.mock("../../../src/features/history/db/index.js", () => ({
  appendAssistantMessage: vi.fn(async () => {}),
}));
vi.mock("../../../src/db/index.js", () => ({
  recordReply: vi.fn(async () => {}),
}));
vi.mock("../../../src/logging/event-log.js", () => ({
  logEvent: vi.fn(),
  logEventError: vi.fn(),
}));
vi.mock("../../../src/logging/index.js", () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
vi.mock("../../../src/features/tasks/db/task-messages.js", () => ({
  recordTaskMessage: vi.fn(async () => {}),
  getRecentTaskMessageTexts: h.getRecentTaskMessageTexts,
}));
vi.mock("../../../src/features/tasks/db/task-events.js", () => ({
  recordTaskEvent: vi.fn(async () => {}),
}));
vi.mock("../../../src/debug/task-report.js", () => ({
  beginTaskProcessing: h.beginTaskProcessing,
}));

import { fireTask } from "../../../src/features/tasks/fire.js";

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

describe("task fire trace", () => {
  beforeEach(() => {
    h.phases.length = 0;
    h.generateOutOfBandReplyRaw.mockReset();
    h.generateOutOfBandReplyRaw.mockResolvedValue('{"reply":"hello"}');
    h.extractTelegramReply.mockReset();
    h.extractTelegramReply.mockReturnValue("hello");
    h.sendMessage.mockReset();
    h.sendMessage.mockResolvedValue({ message_id: 123 });
    h.getRecentTaskMessageTexts.mockReset();
    h.getRecentTaskMessageTexts.mockResolvedValue([]);
  });

  it("records phase-by-phase entries for a successful fire", async () => {
    const ok = await fireTask(makeTask());
    expect(ok).toBe(true);
    expect(h.phases).toEqual([
      "note:Fired",
      "ok:Reply parsed",
      "ok:Formatted for Telegram",
      "ok:Delivered",
      "ok:History recorded",
      "complete:processed",
    ]);
  });

  it("fails the reply-parse phase when the reply has no visible content", async () => {
    h.extractTelegramReply.mockReturnValue("…");
    const ok = await fireTask(makeTask());
    expect(ok).toBe(false);
    expect(h.phases).toEqual(["note:Fired", "fail:Reply parsed", "complete:error"]);
  });

  it("feeds recent deliveries into a recurring task's prompt to vary wording", async () => {
    h.getRecentTaskMessageTexts.mockResolvedValue(["older one", "newer one"]);
    const ok = await fireTask(makeTask({ scheduleKind: "daily" }));
    expect(ok).toBe(true);
    expect(h.getRecentTaskMessageTexts).toHaveBeenCalledWith(1, "42", 5);
    const userMessage = h.generateOutOfBandReplyRaw.mock.calls[0][0].userMessage;
    expect(userMessage).toContain("older one");
    expect(userMessage).toContain("newer one");
    expect(userMessage).toMatch(/DIFFERENT way/);
    expect(h.phases).toContain("note:Variation context");
  });

  it("excludes runaway-sized prior deliveries from the variation context", async () => {
    // A leaked thinking-runaway (thousands of chars) once got posted and stored;
    // feeding it back primes another loop, so it must be filtered out while the
    // clean short nudge is still fed in.
    const runaway = "Wait, I'll just use: hi. ".repeat(200);
    h.getRecentTaskMessageTexts.mockResolvedValue([runaway, "clean nudge"]);
    const ok = await fireTask(makeTask({ scheduleKind: "daily" }));
    expect(ok).toBe(true);
    const userMessage = h.generateOutOfBandReplyRaw.mock.calls[0][0].userMessage;
    expect(userMessage).toContain("clean nudge");
    expect(userMessage).not.toContain(runaway);
    expect(h.phases).toContain("note:Variation context");
  });

  it("does not pull previous messages for a one-shot task", async () => {
    const ok = await fireTask(makeTask({ scheduleKind: "once" }));
    expect(ok).toBe(true);
    expect(h.getRecentTaskMessageTexts).not.toHaveBeenCalled();
    expect(h.phases).not.toContain("note:Variation context");
  });

  it("fails the generation phase when the model call throws", async () => {
    h.generateOutOfBandReplyRaw.mockRejectedValue(new Error("boom"));
    const ok = await fireTask(makeTask());
    expect(ok).toBe(false);
    expect(h.phases).toEqual([
      "note:Fired",
      "fail:LLM generation",
      "complete:error",
    ]);
  });
});
