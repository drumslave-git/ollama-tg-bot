import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindMemoryEntriesDatabase } from "./entries.js";
import { bindMemoryDatabase } from "./memory.js";
import { bindMemoryConfigDatabase } from "./config.js";
import { createMemoriesRouter } from "./routes.js";

export * from "./entries.js";
export * from "./memory.js";
export * from "./config.js";

/**
 * Drop the legacy per-document memory tables. The feature was reworked from
 * three mutable documents (user/group/general) into raw `memory_entry` notes
 * consolidated into embedded `memory` records, with no data migration.
 */
async function dropLegacyTables(database: SqlDatabase): Promise<void> {
  await database.query(
    `DROP TABLE IF EXISTS user_memories, group_memories, general_facts,
       memory_job_chat_state`,
  );
  // The old memory_config carried maintenance_debounce_sec; drop so the new
  // {enabled, run_hour} schema is created cleanly (config is just defaults).
  await database.query(
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'memory_config'
           AND column_name = 'maintenance_debounce_sec'
       ) THEN
         DROP TABLE memory_config;
       END IF;
     END $$;`,
  );
}

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await dropLegacyTables(database);
  await bindMemoryEntriesDatabase(database);
  await bindMemoryDatabase(database);
  await bindMemoryConfigDatabase(database);
}

export function createFeatureRouter() {
  return createMemoriesRouter();
}

export const memoryDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  createFeatureRouter,
};
