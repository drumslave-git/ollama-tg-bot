import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindSummariesDatabase } from "./summaries.js";
import { bindSummariesJobStateDatabase } from "./job-state.js";
import { bindSummariesConfigDatabase } from "./config.js";
import { createSummariesRouter } from "./routes.js";

export * from "./summaries.js";
export * from "./job-state.js";
export * from "./config.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindSummariesDatabase(database);
  await bindSummariesJobStateDatabase(database);
  await bindSummariesConfigDatabase(database);
}

export function createFeatureRouter() {
  return createSummariesRouter();
}

export const summariesDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  createFeatureRouter,
};
