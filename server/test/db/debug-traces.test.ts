import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bindDebugTracesDatabase,
  getDebugTraceById,
  getTraceIdByReplyMessage,
  listDebugChats,
  upsertMessageReport,
  type MessageReportRecord,
} from "../../src/db/debug/traces.js";
import { bindKnownUsersDatabase } from "../../src/db/users/known-users.js";
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
    await dropTables("debug_traces", "known_users");
    await bindDebugTracesDatabase(testDb);
    // listDebugChats resolves private-chat labels from known_users.
    await bindKnownUsersDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("debug_traces", "known_users"));

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

  it("ignores a stale (lower-seq) write so the final status is not clobbered", async () => {
    const base = {
      id: 300,
      chatId: CHAT,
      convKey: CHAT,
      userId: null,
      chatType: "private",
      messageId: 1,
      messagePreview: "hi",
      listSummary: { headline: "x", badges: [] },
      report: makeReport(),
      replyMessageIds: [],
      durationMs: 10,
    };
    // Final "processed" write lands first with a high seq...
    await upsertMessageReport({ ...base, status: "processed", seq: 5 });
    // ...then a late, out-of-order "processing" write with a lower seq arrives.
    await upsertMessageReport({ ...base, status: "processing", seq: 3 });

    expect((await getDebugTraceById(300))?.status).toBe("processed");
  });

  it("groups chats with a per-chat trace count (Postgres GROUP BY)", async () => {
    await upsert(100, CHAT, [501]);
    await upsert(101, CHAT, [502]);
    await upsert(200, "999", [777]);

    const chats = await listDebugChats();
    expect(Array.isArray(chats)).toBe(true);
    const mine = chats.find((c) => c.chatId === CHAT);
    expect(mine?.traceCount).toBe(2);
    expect(mine?.chatType).toBe("private");
    expect(chats.find((c) => c.chatId === "999")?.traceCount).toBe(1);
  });
});
