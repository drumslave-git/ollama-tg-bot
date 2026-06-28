import type { FeatureDbExports, SqlDatabase } from "../../../contracts/index.js";
import { bindVisionConfigDatabase } from "./config.js";
import { createVisionRouter } from "./routes.js";

export {
  getVisionConfig,
  updateVisionConfig,
} from "./config.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindVisionConfigDatabase(database);
}

export function createFeatureRouter() {
  return createVisionRouter();
}

export const visionDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  createFeatureRouter,
};
