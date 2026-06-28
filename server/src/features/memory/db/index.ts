import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindGeneralMemoryDatabase } from "./general-memory.js";
import { bindGroupMemoryDatabase } from "./group-memory.js";
import { bindUserMemoryDatabase } from "./user-memory.js";
import { bindMemoryConfigDatabase } from "./config.js";
import { bindMemoryJobStateDatabase } from "./job-state.js";
import { createMemoriesRouter } from "./routes.js";

export * from "./config.js";

export * from "./memory-facts.js";
export * from "./user-memory.js";
export * from "./group-memory.js";
export * from "./general-memory.js";
export {
  getMemoryChatFingerprint,
  setMemoryChatFingerprint,
} from "./job-state.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindUserMemoryDatabase(database);
  await bindGroupMemoryDatabase(database);
  await bindGeneralMemoryDatabase(database);
  await bindMemoryConfigDatabase(database);
  await bindMemoryJobStateDatabase(database);
}

export function createFeatureRouter() {
  return createMemoriesRouter();
}

export const memoryDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  createFeatureRouter,
};
