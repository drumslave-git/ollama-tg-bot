import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bindHistoryDatabase } from "../../src/features/history/db/history.js";
import {
  bindKnownChatsDatabase,
  listKnownChats,
  rememberTelegramChat,
} from "../../src/db/chats/known-chats.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../helpers/pg.js";

describe.skipIf(!hasTestDb)("known chats store (Postgres)", () => {
  beforeAll(async () => {
    await dropTables("known_chats", "chat_messages");
    await bindHistoryDatabase(testDb);
    await bindKnownChatsDatabase(testDb);
  });

  afterAll(closeTestPool);

  beforeEach(() => truncateTables("known_chats", "chat_messages"));

  it("stores private and group chats with display labels", async () => {
    await rememberTelegramChat({
      id: 111,
      type: "private",
      first_name: "Ada",
      last_name: "Lovelace",
      username: "CountessAda",
    });
    await rememberTelegramChat({
      id: -222,
      type: "supergroup",
      title: "Engine Room",
      username: "engine_room",
    });

    const chats = await listKnownChats();

    expect(chats).toHaveLength(2);
    expect(chats.map((chat) => chat.chatId).sort()).toEqual(["-222", "111"]);
    expect(chats.find((chat) => chat.chatId === "111")?.label).toBe(
      "Ada Lovelace (@countessada)",
    );
    expect(chats.find((chat) => chat.chatId === "-222")?.label).toBe(
      "Engine Room",
    );
  });

  it("reports message counts and last message time from chat history", async () => {
    await rememberTelegramChat({
      id: -222,
      type: "group",
      title: "Engine Room",
    });
    await testDb.query(
      `INSERT INTO chat_messages (entity_id, role, content, created_at)
       VALUES ($1, 'user:ada:1', 'first', 1000),
              ($1, 'user:ada:1', 'second', 2000)`,
      ["-222"],
    );

    const [chat] = await listKnownChats();

    expect(chat?.messageCount).toBe(2);
    expect(chat?.lastMessageAt).toBe("1970-01-01T00:33:20.000Z");
  });

  it("includes historical chat ids before Telegram metadata is observed", async () => {
    await testDb.query(
      `INSERT INTO chat_messages (entity_id, role, content, created_at)
       VALUES ($1, 'user:ada:1', 'hello', 3000)`,
      ["333"],
    );

    const [chat] = await listKnownChats();

    expect(chat?.chatId).toBe("333");
    expect(chat?.type).toBe("private");
    expect(chat?.label).toBe("Private chat 333");
    expect(chat?.messageCount).toBe(1);
    expect(chat?.updatedAt).toBe("1970-01-01T00:50:00.000Z");
  });
});
