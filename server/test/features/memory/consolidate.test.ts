import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EMBEDDING_DIM } from "../../../src/llm/embeddings.js";
import {
  bindMemoryEntriesDatabase,
  addMemoryEntry,
  getEntriesFor,
} from "../../../src/features/memory/db/entries.js";
import {
  bindMemoryDatabase,
  upsertMemory,
  getMemoryRecord,
} from "../../../src/features/memory/db/memory.js";
import {
  consolidateEntity,
  type ConsolidateDeps,
} from "../../../src/features/memory/consolidate.js";
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

/** Deterministic deps: merge = join existing+incoming; embed = fixed vector. */
function stubDeps(overrides: Partial<ConsolidateDeps> = {}): ConsolidateDeps {
  return {
    mergeMemory: async (_type, existing, incoming) =>
      [...existing, ...incoming].join("\n"),
    embedText: async () => basisVector(0),
    ...overrides,
  };
}

describe.skipIf(!hasTestDb)("consolidateEntity (Postgres)", () => {
  beforeAll(async () => {
    await ensureVectorExtension();
    await dropTables("memory", "memory_entry");
    await bindMemoryEntriesDatabase(testDb);
    await bindMemoryDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() => truncateTables("memory", "memory_entry"));

  it("folds entries into a new record and deletes them", async () => {
    await addMemoryEntry("user", "1", "Likes tea.");
    await addMemoryEntry("user", "1", "Lives in Lisbon.");

    const result = await consolidateEntity("user", "1", stubDeps());
    expect(result.changed).toBe(true);
    expect(result.consumed).toBe(2);

    const record = await getMemoryRecord("user", "1");
    expect(record?.content).toBe("Likes tea.\nLives in Lisbon.");
    expect(await getEntriesFor("user", "1")).toHaveLength(0);
  });

  it("merges new notes with the existing record", async () => {
    await upsertMemory({
      type: "user",
      entityId: "1",
      content: "Likes tea.",
      embedding: basisVector(0),
    });
    await addMemoryEntry("user", "1", "Lives in Lisbon.");

    await consolidateEntity("user", "1", stubDeps());

    const record = await getMemoryRecord("user", "1");
    expect(record?.content).toBe("Likes tea.\nLives in Lisbon.");
  });

  it("no-ops when there are no pending entries", async () => {
    const result = await consolidateEntity("user", "999", stubDeps());
    expect(result).toEqual({ changed: false, consumed: 0 });
  });

  it("drops entries even when the merge yields nothing", async () => {
    await addMemoryEntry("general", null, "ephemeral note");
    const result = await consolidateEntity(
      "general",
      null,
      stubDeps({ mergeMemory: async () => "" }),
    );
    expect(result.changed).toBe(false);
    expect(result.consumed).toBe(1);
    expect(await getEntriesFor("general", null)).toHaveLength(0);
    expect(await getMemoryRecord("general", null)).toBeNull();
  });
});
