import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  appendAssistantMessage,
  appendMessage,
  bindHistoryDatabase,
  getHistory,
  getHistoryBatches,
  getLatestMessages,
  getMessagesByMessageIds,
  getMessagesInRange,
  getMessagesInRangeBatches,
  listHistoryChatKeys,
  searchMessages,
} from "../../../src/features/history/db/history.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";

const ENTITY = "12345";

async function insertAt(
  entityId: string,
  content: string,
  createdAt: number,
): Promise<void> {
  await testDb.query(
    `INSERT INTO chat_messages (entity_id, role, content, created_at)
     VALUES ($1, 'user:a:1', $2, $3)`,
    [entityId, content, createdAt],
  );
}

describe.skipIf(!hasTestDb)("history storage (Postgres)", () => {
  beforeAll(async () => {
    await dropTables("chat_messages");
    await bindHistoryDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("chat_messages"));

  it("appends and reads back chronologically with timestamps", async () => {
    await appendMessage(ENTITY, "user:alice:1", "first");
    await appendMessage(ENTITY, "user:bob:2", "second");
    await appendAssistantMessage(ENTITY, "reply");

    const all = await getHistory(ENTITY);
    expect(all.map((m) => m.content)).toEqual([
      "first",
      "second",
      "reply",
    ]);
    expect(typeof all[0]!.createdAt).toBe("number");
  });

  it("ignores blank content", async () => {
    await appendMessage(ENTITY, "user:a:1", "   ");
    expect(await getHistory(ENTITY)).toHaveLength(0);
  });

  it("getLatestMessages returns the last N, oldest first", async () => {
    for (let i = 1; i <= 5; i += 1)
      await appendMessage(ENTITY, "user:a:1", `m${i}`);
    expect((await getLatestMessages(ENTITY, 2)).map((m) => m.content)).toEqual([
      "m4",
      "m5",
    ]);
  });

  it("searchMessages matches by full-text and substring fallback", async () => {
    await appendMessage(ENTITY, "user:a:1", "Hello World");
    await appendMessage(ENTITY, "user:a:1", "goodbye");
    expect((await searchMessages(ENTITY, "world")).map((m) => m.content)).toEqual([
      "Hello World",
    ]);
    expect(await searchMessages(ENTITY, "missing")).toHaveLength(0);
  });

  it("getMessagesInRange filters inclusively by created_at", async () => {
    await insertAt(ENTITY, "old", 1000);
    await insertAt(ENTITY, "mid", 2000);
    await insertAt(ENTITY, "new", 3000);
    expect(
      (await getMessagesInRange(ENTITY, 1500, 2500)).map((m) => m.content),
    ).toEqual(["mid"]);
    expect(await getMessagesInRange(ENTITY, 1000, 3000)).toHaveLength(3);
  });

  it("getMessagesInRangeBatches paginates through the full range", async () => {
    await insertAt(ENTITY, "old", 1000);
    await insertAt(ENTITY, "one", 2000);
    await insertAt(ENTITY, "two", 2100);
    await insertAt(ENTITY, "three", 2200);
    await insertAt(ENTITY, "new", 3000);

    const batches: string[][] = [];
    for await (const batch of getMessagesInRangeBatches(ENTITY, 1500, 2500, 2)) {
      batches.push(batch.map((m) => m.content));
    }

    expect(batches).toEqual([["one", "two"], ["three"]]);
  });

  it("getHistoryBatches paginates through the entire history", async () => {
    for (let i = 1; i <= 5; i += 1)
      await appendMessage(ENTITY, "user:a:1", `m${i}`);
    await appendMessage("999", "user:b:2", "other chat");

    const batches: string[][] = [];
    for await (const batch of getHistoryBatches(ENTITY, 2)) {
      batches.push(batch.map((m) => m.content));
    }

    expect(batches).toEqual([["m1", "m2"], ["m3", "m4"], ["m5"]]);
  });

  it("getMessagesByMessageIds fetches specific telegram ids", async () => {
    await appendMessage(ENTITY, "user:a:1", "one", { messageId: 101 });
    await appendMessage(ENTITY, "user:a:1", "two", { messageId: 102 });
    await appendMessage(ENTITY, "user:a:1", "three", { messageId: 103 });
    expect(
      (await getMessagesByMessageIds(ENTITY, [101, 103])).map((m) => m.content),
    ).toEqual(["one", "three"]);
  });

  it("isolates messages per entity and lists distinct keys", async () => {
    await appendMessage(ENTITY, "user:a:1", "mine");
    await appendMessage("999", "user:b:2", "theirs");
    expect((await getHistory(ENTITY)).map((m) => m.content)).toEqual(["mine"]);
    expect((await listHistoryChatKeys()).sort()).toEqual(["12345", "999"]);
  });
});
