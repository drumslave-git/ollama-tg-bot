import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bindDebugTracesDatabase,
  getTraceIdByReplyMessage,
  upsertMessageReport,
  type MessageReportRecord,
} from "../../src/db/debug/traces.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../helpers/pg.js";

const CHAT = "12345";

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

async function upsert(
  id: number,
  chatId: string,
  replyMessageIds: number[],
): Promise<void> {
  await upsertMessageReport({
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

describe.skipIf(!hasTestDb)("debug trace reply-message linkage (Postgres)", () => {
  beforeAll(async () => {
    await dropTables("debug_traces");
    await bindDebugTracesDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("debug_traces"));

  it("resolves any of a trace's reply chunk ids back to the trace id", async () => {
    await upsert(100, CHAT, [501, 502]);

    expect(await getTraceIdByReplyMessage(CHAT, 501)).toBe(100);
    expect(await getTraceIdByReplyMessage(CHAT, 502)).toBe(100);
  });

  it("returns null for unknown ids, other chats, and traces with no reply ids", async () => {
    await upsert(100, CHAT, [501]);
    await upsert(101, "999", [777]);
    await upsert(102, CHAT, []);

    expect(await getTraceIdByReplyMessage(CHAT, 999)).toBeNull();
    expect(await getTraceIdByReplyMessage(CHAT, 777)).toBeNull(); // belongs to chat 999
    expect(await getTraceIdByReplyMessage("nope", 501)).toBeNull();
  });

  it("keeps the link after the trace row is re-upserted (status progression)", async () => {
    await upsert(100, CHAT, [501]);
    // Re-upsert the same turn (e.g. processing -> processed) keeps the ids.
    await upsert(100, CHAT, [501]);

    expect(await getTraceIdByReplyMessage(CHAT, 501)).toBe(100);
  });
});
