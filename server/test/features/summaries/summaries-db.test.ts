import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EMBEDDING_DIM } from "../../../src/llm/embeddings.js";
import {
  bindSummariesDatabase,
  replaceSummariesForDate,
  searchSummaries,
  getSummariesForDate,
  type InsertSummaryInput,
} from "../../../src/features/summaries/db/summaries.js";
import {
  closeTestPool,
  dropTables,
  ensureVectorExtension,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";

const CHAT = "555";

/** A unit vector with a 1 at `index` — distinct directions are cosine-far apart. */
function basisVector(index: number): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[index] = 1;
  return v;
}

function topic(
  overrides: Partial<InsertSummaryInput> & { content: string; embedding: number[] },
): InsertSummaryInput {
  return {
    chatId: CHAT,
    summaryDate: "2026-06-20",
    messageIds: [1, 2],
    ...overrides,
  };
}

describe.skipIf(!hasTestDb)("chat summaries (Postgres + pgvector)", () => {
  beforeAll(async () => {
    await ensureVectorExtension();
    await dropTables("chat_summaries");
    await bindSummariesDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("chat_summaries"));

  it("stores topics with embeddings and reads them back", async () => {
    await replaceSummariesForDate(CHAT, "2026-06-20", [
      topic({
        content: "Discussed the deploy plan and rollback steps.",
        messageIds: [10, 11],
        embedding: basisVector(0),
      }),
    ]);
    const rows = await getSummariesForDate(CHAT, "2026-06-20");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toContain("deploy plan");
    expect(rows[0]!.messageIds).toEqual([10, 11]);
    expect(rows[0]!.summaryDate).toBe("2026-06-20");
  });

  it("replaces existing topics for the same date", async () => {
    await replaceSummariesForDate(CHAT, "2026-06-20", [
      topic({ content: "first", embedding: basisVector(0) }),
    ]);
    await replaceSummariesForDate(CHAT, "2026-06-20", [
      topic({ content: "second", embedding: basisVector(1) }),
    ]);
    const rows = await getSummariesForDate(CHAT, "2026-06-20");
    expect(rows.map((r) => r.content)).toEqual(["second"]);
  });

  it("ranks the nearest vector first in hybrid search", async () => {
    await replaceSummariesForDate(CHAT, "2026-06-20", [
      topic({
        content: "Talked about chess openings.",
        messageIds: [1],
        embedding: basisVector(0),
      }),
      topic({
        content: "Planned the weekend hike.",
        messageIds: [2],
        embedding: basisVector(5),
      }),
    ]);

    // Query vector aligned with the chess topic's direction.
    const matches = await searchSummaries(CHAT, basisVector(0), "", 5);
    expect(matches[0]!.content).toContain("chess");
    expect(matches[0]!.messageIds).toEqual([1]);
  });

  it("full-text component matches by keyword even without vector alignment", async () => {
    await replaceSummariesForDate(CHAT, "2026-06-20", [
      topic({ content: "Talked about chess openings.", embedding: basisVector(0) }),
      topic({ content: "Planned the weekend hike.", embedding: basisVector(5) }),
    ]);
    // Vector points nowhere useful; the keyword "hike" should still surface topic 2.
    const matches = await searchSummaries(CHAT, basisVector(900), "hike", 5);
    expect(matches.some((m) => m.content.includes("hike"))).toBe(true);
  });

  it("isolates summaries per chat", async () => {
    await replaceSummariesForDate(CHAT, "2026-06-20", [
      topic({ content: "mine", embedding: basisVector(0) }),
    ]);
    await replaceSummariesForDate("999", "2026-06-20", [
      topic({ chatId: "999", content: "theirs", embedding: basisVector(0) }),
    ]);
    const matches = await searchSummaries(CHAT, basisVector(0), "", 5);
    expect(matches.map((m) => m.content)).toEqual(["mine"]);
  });
});
