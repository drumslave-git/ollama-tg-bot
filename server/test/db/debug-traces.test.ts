import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  bindDebugTracesDatabase,
  getTraceIdByReplyMessage,
  upsertMessageReport,
  type MessageReportRecord,
} from "../../src/db/debug/traces.js";

const CHAT = "12345";
let db: DatabaseSync;

function makeReport(): MessageReportRecord {
  return {
    status: "processed",
    headline: "Reply sent",
    durationMs: 10,
    intake: { messagePreview: "hi", hasMedia: false },
    routing: { decision: "accepted", trigger: "addressed", triggerLabel: "Addressed" },
    phases: [],
    result: { replyChars: 5, chunks: 1 },
  };
}

function upsert(id: number, chatId: string, replyMessageIds: number[]): void {
  upsertMessageReport({
    id,
    chatId,
    convKey: chatId,
    userId: null,
    chatType: "private",
    messageId: 1,
    messagePreview: "hi",
    status: "processed",
    listSummary: { headline: "Reply sent", badges: [] },
    report: makeReport(),
    replyMessageIds,
    durationMs: 10,
  });
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  bindDebugTracesDatabase(db);
});

describe("debug trace reply-message linkage", () => {
  it("resolves any of a trace's reply chunk ids back to the trace id", () => {
    upsert(100, CHAT, [501, 502]);

    expect(getTraceIdByReplyMessage(CHAT, 501)).toBe(100);
    expect(getTraceIdByReplyMessage(CHAT, 502)).toBe(100);
  });

  it("returns null for unknown ids, other chats, and traces with no reply ids", () => {
    upsert(100, CHAT, [501]);
    upsert(101, "999", [777]);
    upsert(102, CHAT, []);

    expect(getTraceIdByReplyMessage(CHAT, 999)).toBeNull();
    expect(getTraceIdByReplyMessage(CHAT, 777)).toBeNull(); // belongs to chat 999
    expect(getTraceIdByReplyMessage("nope", 501)).toBeNull();
  });

  it("keeps the link after the trace row is re-upserted (status progression)", () => {
    upsert(100, CHAT, [501]);
    // Re-upsert the same turn (e.g. processing -> processed) keeps the ids.
    upsert(100, CHAT, [501]);

    expect(getTraceIdByReplyMessage(CHAT, 501)).toBe(100);
  });
});
