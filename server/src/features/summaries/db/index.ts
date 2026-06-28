import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindSummariesDatabase } from "./summaries.js";
import { bindSummariesJobStateDatabase } from "./job-state.js";
import { bindSummariesConfigDatabase } from "./config.js";

export * from "./summaries.js";
export * from "./job-state.js";
export * from "./config.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindSummariesDatabase(database);
  await bindSummariesJobStateDatabase(database);
  await bindSummariesConfigDatabase(database);
}

export const summariesDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
};
