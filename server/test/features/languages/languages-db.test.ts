import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_LANGUAGE,
  bindFeatureDatabase,
  deleteChatLanguage,
  getChatLanguage,
  getRequiredLanguage,
  listChatLanguages,
  normalizeChatLanguage,
  upsertChatLanguage,
} from "../../../src/features/languages/db/index.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";

const TABLES = ["chat_languages"];

describe.skipIf(!hasTestDb)("languages db (Postgres)", () => {
  beforeAll(async () => {
    await dropTables(...TABLES);
    await bindFeatureDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(async () => {
    await truncateTables(...TABLES);
  });

  it("defaults chats to English when no custom row exists", async () => {
    expect(await getRequiredLanguage(-100999001)).toBe(DEFAULT_CHAT_LANGUAGE);
  });

  it("creates, updates, lists, and deletes a chat language", async () => {
    const created = await upsertChatLanguage(-100999001, "  Spanish  ");
    expect(created.language).toBe("Spanish");
    expect((await getChatLanguage(-100999001))?.language).toBe("Spanish");
    expect(await getRequiredLanguage(-100999001)).toBe("Spanish");

    const updated = await upsertChatLanguage(-100999001, "Brazilian Portuguese");
    expect(updated.language).toBe("Brazilian Portuguese");

    const rows = await listChatLanguages();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chatId).toBe(-100999001);

    expect(await deleteChatLanguage(-100999001)).toBe(true);
    expect(await getChatLanguage(-100999001)).toBeNull();
    expect(await getRequiredLanguage(-100999001)).toBe(DEFAULT_CHAT_LANGUAGE);
  });

  it("normalizes whitespace in language labels", () => {
    expect(normalizeChatLanguage("  Traditional   Chinese  ")).toBe(
      "Traditional Chinese",
    );
  });
});
