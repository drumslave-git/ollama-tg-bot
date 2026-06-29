import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EMBEDDING_DIM } from "../../../src/llm/embeddings.js";
import {
  bindMemoryEntriesDatabase,
  addMemoryEntry,
  listPendingEntities,
  getEntriesFor,
  deleteEntries,
  deleteEntriesFor,
} from "../../../src/features/memory/db/entries.js";
import {
  bindMemoryDatabase,
  upsertMemory,
  getMemoryRecord,
  listAllMemory,
  searchMemory,
  getUserFacts,
  clearUserMemory,
} from "../../../src/features/memory/db/memory.js";
import {
  closeTestPool,
  dropTables,
  ensureVectorExtension,
  hasTestDb,
  testDb,
  truncateTables,
} from "../../helpers/pg.js";

function basisVector(index: number): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[index] = 1;
  return v;
}

describe.skipIf(!hasTestDb)("memory db (Postgres + pgvector)", () => {
  beforeAll(async () => {
    await ensureVectorExtension();
    await dropTables("memory", "memory_entry");
    await bindMemoryEntriesDatabase(testDb);
    await bindMemoryDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("memory", "memory_entry"));

  it("tracks pending entries per entity", async () => {
    await addMemoryEntry("user", "1", "Likes tea.");
    await addMemoryEntry("user", "1", "Lives in Lisbon.");
    await addMemoryEntry("group", "g1", "Quiet on weekends.");
    await addMemoryEntry("general", null, "MTTR = mean time to recovery.");

    const pending = await listPendingEntities();
    expect(pending).toEqual(
      expect.arrayContaining([
        { type: "user", entityId: "1" },
        { type: "group", entityId: "g1" },
        { type: "general", entityId: null },
      ]),
    );

    const userEntries = await getEntriesFor("user", "1");
    expect(userEntries.map((e) => e.content)).toEqual([
      "Likes tea.",
      "Lives in Lisbon.",
    ]);
  });

  it("rejects too-short and too-long notes", async () => {
    expect(await addMemoryEntry("user", "1", "x")).toBeNull();
    expect(await addMemoryEntry("user", "1", "a".repeat(501))).toBeNull();
  });

  it("deletes processed entries by id", async () => {
    const a = await addMemoryEntry("user", "1", "Likes tea.");
    await addMemoryEntry("user", "1", "Lives in Lisbon.");
    await deleteEntries([a!.id]);
    const remaining = await getEntriesFor("user", "1");
    expect(remaining.map((e) => e.content)).toEqual(["Lives in Lisbon."]);
  });

  it("upserts one record per entity and reads it back", async () => {
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Likes tea.",
      embedding: basisVector(0),
    });
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Likes tea.\nLives in Lisbon.",
      embedding: basisVector(1),
    });
    const record = await getMemoryRecord("user", "1");
    expect(record?.content).toBe("Likes tea.\nLives in Lisbon.");
    expect(await listAllMemory()).toHaveLength(1);
  });

  it("keeps general (null entity) unique per type", async () => {
    await upsertMemory({
      type: "general",
      entityId: null,
      content: "first",
      embedding: basisVector(0),
    });
    await upsertMemory({
      type: "general",
      entityId: null,
      content: "second",
      embedding: basisVector(1),
    });
    const record = await getMemoryRecord("general", null);
    expect(record?.content).toBe("second");
  });

  it("ranks the nearest vector first in hybrid search", async () => {
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Talks about chess openings.",
      embedding: basisVector(0),
    });
    await upsertMemory({
      type: "user",
      entityId: "2",
      content: "Planned the weekend hike.",
      embedding: basisVector(5),
    });
    const matches = await searchMemory(basisVector(0), "", 5);
    expect(matches[0]!.content).toContain("chess");
    expect(matches[0]!.entityId).toBe("1");
  });

  it("matches by keyword even without vector alignment", async () => {
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Talks about chess openings.",
      embedding: basisVector(0),
    });
    await upsertMemory({
      type: "user",
      entityId: "2",
      content: "Planned the weekend hike.",
      embedding: basisVector(5),
    });
    const matches = await searchMemory(basisVector(900), "hike", 5);
    expect(matches.some((m) => m.content.includes("hike"))).toBe(true);
  });

  it("getUserFacts splits the consolidated record into lines", async () => {
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Likes tea.\nLives in Lisbon.",
      embedding: basisVector(0),
    });
    expect(await getUserFacts("1")).toEqual(["Likes tea.", "Lives in Lisbon."]);
  });

  it("clearUserMemory removes the record and pending entries", async () => {
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Likes tea.",
      embedding: basisVector(0),
    });
    await addMemoryEntry("user", "1", "Lives in Lisbon.");
    await clearUserMemory("1");
    expect(await getMemoryRecord("user", "1")).toBeNull();
    expect(await getEntriesFor("user", "1")).toHaveLength(0);
  });

  it("deleteEntriesFor clears one entity's queue", async () => {
    await addMemoryEntry("group", "g1", "Quiet on weekends.");
    await deleteEntriesFor("group", "g1");
    expect(await getEntriesFor("group", "g1")).toHaveLength(0);
  });
});
