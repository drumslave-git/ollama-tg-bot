import type {
  ModuleDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindSummariesDatabase } from "./summaries.js";
import { bindSummariesJobStateDatabase } from "./job-state.js";
import { bindSummariesConfigDatabase } from "./module-config.js";

export * from "./summaries.js";
export * from "./job-state.js";
export * from "./module-config.js";

export async function bindModuleDatabase(database: SqlDatabase): Promise<void> {
  await bindSummariesDatabase(database);
  await bindSummariesJobStateDatabase(database);
  await bindSummariesConfigDatabase(database);
}

export const summariesDbModule: ModuleDbExports = {
  bindModuleDatabase,
};
