import type {
  FeatureDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindLanguagesDatabase } from "./languages.js";
import { createLanguagesRouter } from "./routes.js";

export * from "./languages.js";

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindLanguagesDatabase(database);
}

export function createFeatureRouter() {
  return createLanguagesRouter();
}

export const languagesDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  createFeatureRouter,
};
