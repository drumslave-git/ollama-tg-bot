import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  appendAssistantMessage,
  appendMessage,
  bindHistoryDatabase,
  getHistory,
  getLatestMessages,
  getMessagesInRange,
  listHistoryChatKeys,
  searchMessages,
} from "../../../src/features/history/db/history.js";

const ENTITY = "12345";
let db: DatabaseSync;

function insertAt(entityId: string, content: string, createdAt: number): void {
  db.prepare(
    `INSERT INTO chat_messages (entity_id, role, content, created_at)
     VALUES (?, 'user:a:1', ?, ?)`,
  ).run(entityId, content, createdAt);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  bindHistoryDatabase(db);
});

describe("history storage", () => {
  it("appends and reads back chronologically with timestamps", () => {
    appendMessage(ENTITY, "user:alice:1", "first");
    appendMessage(ENTITY, "user:bob:2", "second");
    appendAssistantMessage(ENTITY, "reply");

    const all = getHistory(ENTITY);
    expect(all.map((m) => m.content)).toEqual([
      "first",
      "second",
      "[assistant said]: reply",
    ]);
    expect(typeof all[0]!.createdAt).toBe("number");
  });

  it("ignores blank content", () => {
    appendMessage(ENTITY, "user:a:1", "   ");
    expect(getHistory(ENTITY)).toHaveLength(0);
  });

  it("getLatestMessages returns the last N, oldest first", () => {
    for (let i = 1; i <= 5; i += 1) appendMessage(ENTITY, "user:a:1", `m${i}`);
    expect(getLatestMessages(ENTITY, 2).map((m) => m.content)).toEqual([
      "m4",
      "m5",
    ]);
  });

  it("searchMessages does case-insensitive substring match", () => {
    appendMessage(ENTITY, "user:a:1", "Hello World");
    appendMessage(ENTITY, "user:a:1", "goodbye");
    expect(searchMessages(ENTITY, "world").map((m) => m.content)).toEqual([
      "Hello World",
    ]);
    expect(searchMessages(ENTITY, "missing")).toHaveLength(0);
  });

  it("getMessagesInRange filters inclusively by created_at", () => {
    insertAt(ENTITY, "old", 1000);
    insertAt(ENTITY, "mid", 2000);
    insertAt(ENTITY, "new", 3000);
    expect(getMessagesInRange(ENTITY, 1500, 2500).map((m) => m.content)).toEqual(
      ["mid"],
    );
    expect(getMessagesInRange(ENTITY, 1000, 3000)).toHaveLength(3);
  });

  it("isolates messages per entity and lists distinct keys", () => {
    appendMessage(ENTITY, "user:a:1", "mine");
    appendMessage("999", "user:b:2", "theirs");
    expect(getHistory(ENTITY).map((m) => m.content)).toEqual(["mine"]);
    expect(listHistoryChatKeys().sort()).toEqual(["12345", "999"]);
  });
});
