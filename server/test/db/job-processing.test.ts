import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_RUNS_PER_MODULE,
  appendJobEntry,
  bindJobProcessingDatabase,
  createJobProcessing,
  getJobProcessingDetail,
  listJobModules,
  listProcessingsForModule,
  setJobProcessingStatus,
} from "../../src/db/debug/job-processing.js";
import {
  closeTestPool,
  dropTables,
  hasTestDb,
  testDb,
  truncateTables,
} from "../helpers/pg.js";

describe.skipIf(!hasTestDb)("job processing store (Postgres)", () => {
  beforeAll(async () => {
    await dropTables("job_processing_entries", "job_processings");
    await bindJobProcessingDatabase(testDb);
  });
  afterAll(closeTestPool);
  beforeEach(() =>
    truncateTables("job_processing_entries", "job_processings"),
  );

  it("records a run with ordered entries and a summary", async () => {
    const pid = await createJobProcessing("vision");
    expect(pid).not.toBeNull();
    await appendJobEntry(pid!, "Scan chats", "text", "Found 3 chat(s)");
    await appendJobEntry(pid!, "LLM request · Vision description", "json", "{}");
    await setJobProcessingStatus(pid!, "processed", {
      totalTimeSpentMs: 4200,
      summary: "2 backfilled",
    });

    const list = await listProcessingsForModule("vision");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      moduleId: "vision",
      status: "processed",
      totalTimeSpent: 4200,
      summary: "2 backfilled",
      entryCount: 2,
    });

    const detail = await getJobProcessingDetail(pid!);
    expect(detail?.entries.map((e) => e.title)).toEqual([
      "Scan chats",
      "LLM request · Vision description",
    ]);
  });

  it("groups runs by module and caps per module", async () => {
    await createJobProcessing("memory");
    const overflow = MAX_RUNS_PER_MODULE + 4;
    for (let i = 0; i < overflow; i++) {
      const pid = await createJobProcessing("vision");
      await appendJobEntry(pid!, "Scan", "text", `run ${i}`);
    }

    const vision = await listProcessingsForModule("vision");
    expect(vision).toHaveLength(MAX_RUNS_PER_MODULE);

    const modules = await listJobModules();
    expect(modules.find((m) => m.moduleId === "vision")?.runCount).toBe(
      MAX_RUNS_PER_MODULE,
    );
    expect(modules.find((m) => m.moduleId === "memory")?.runCount).toBe(1);
  });
});
