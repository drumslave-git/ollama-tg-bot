import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindHistoryDatabase } from "./history.js";

export * from "../types.js";
export * from "../format.js";
export * from "../transform.js";
export * from "./history.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindHistoryDatabase(database);
}

export const historyDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
};
