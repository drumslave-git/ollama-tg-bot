import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindBrowserAgentRunsDatabase } from "./browser-agent-runs.js";
import { bindBrowserAgentProcessingDatabase } from "../../../db/debug/browser-agent-processing.js";
import { createBrowserRouter } from "./routes.js";

export * from "./browser-agent-runs.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindBrowserAgentRunsDatabase(database);
  // After runs — browser_agent_processings has a FK to browser_agent_runs(id).
  await bindBrowserAgentProcessingDatabase(database);
}

export function createFeatureRouter() {
  return createBrowserRouter();
}

export const webBrowseDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  createFeatureRouter,
};
