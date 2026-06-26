import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  appendMessage,
  bindHistoryDatabase,
} from "../../src/features/history/db/history.js";
import {
  MAX_PROCESSINGS_PER_CHAT,
  bindMessageProcessingDatabase,
  getProcessingByReplyMessage,
  getProcessingDetail,
  listProcessingChats,
  listProcessingsForChat,
  reportMessageProcessing,
  setMessageProcessingStatus,
} from "../../src/db/debug/message-processing.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../helpers/pg.js";

const ENTITY = "5005";

describe.skipIf(!hasTestDb)("message processing store (Postgres)", () => {
  beforeAll(async () => {
    await dropTables(
      "message_processing_entries",
      "message_processings",
      "chat_messages",
    );
    await bindHistoryDatabase(testDb);
    await bindMessageProcessingDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() =>
    truncateTables(
      "message_processing_entries",
      "message_processings",
      "chat_messages",
    ),
  );

  async function storeMessage(content = "hello"): Promise<number> {
    const id = await appendMessage(ENTITY, "user:alice:1", content, {
      messageId: 42,
    });
    if (id == null) throw new Error("expected chat message id");
    return id;
  }

  it("creates one processing per message and appends ordered entries", async () => {
    const chatMessageId = await storeMessage();
    await reportMessageProcessing(chatMessageId, "Step one", "text", "first");
    await reportMessageProcessing(chatMessageId, "Step two", "json", "{}");

    const list = await listProcessingsForChat(ENTITY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      chatMessageId,
      messageId: 42,
      status: "processing",
      entryCount: 2,
    });

    const detail = await getProcessingDetail(list[0]!.id);
    expect(detail?.entries.map((e) => e.title)).toEqual(["Step one", "Step two"]);
    expect(detail?.entries.map((e) => e.type)).toEqual(["text", "json"]);
  });

  it("sets terminal status, elapsed time and reply ids", async () => {
    const chatMessageId = await storeMessage();
    await reportMessageProcessing(chatMessageId, "Working", "text", "…");
    await setMessageProcessingStatus(chatMessageId, "processed", {
      totalTimeSpentMs: 1234,
      replyMessageIds: [900, 901],
    });

    const list = await listProcessingsForChat(ENTITY);
    expect(list[0]).toMatchObject({ status: "processed", totalTimeSpent: 1234 });

    const found = await getProcessingByReplyMessage(ENTITY, 901);
    expect(found?.chatMessageId).toBe(chatMessageId);
    expect(await getProcessingByReplyMessage(ENTITY, 7777)).toBeNull();
  });

  it("cascades deletes from chat_messages through entries", async () => {
    const chatMessageId = await storeMessage();
    await reportMessageProcessing(chatMessageId, "Step", "text", "x");

    await testDb.query(`DELETE FROM chat_messages WHERE id = $1`, [
      chatMessageId,
    ]);

    const { rows: procs } = await testDb.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM message_processings`,
    );
    const { rows: entries } = await testDb.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM message_processing_entries`,
    );
    expect(procs[0]?.n).toBe(0);
    expect(entries[0]?.n).toBe(0);
  });

  it("trims to the newest N processings per chat", async () => {
    const overflow = MAX_PROCESSINGS_PER_CHAT + 5;
    for (let i = 0; i < overflow; i++) {
      const id = await appendMessage(ENTITY, "user:alice:1", `m${i}`, {
        messageId: 1000 + i,
      });
      await reportMessageProcessing(id!, "Step", "text", `entry ${i}`);
    }

    const list = await listProcessingsForChat(ENTITY);
    expect(list).toHaveLength(MAX_PROCESSINGS_PER_CHAT);
    // Oldest five message ids should have been trimmed away.
    const messageIds = list.map((item) => item.messageId);
    expect(messageIds).not.toContain(1000);
    expect(messageIds).toContain(1000 + overflow - 1);

    const chats = await listProcessingChats();
    expect(chats.find((c) => c.entityId === ENTITY)?.processingCount).toBe(
      MAX_PROCESSINGS_PER_CHAT,
    );
  });
});
