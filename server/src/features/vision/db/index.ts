import type { ModuleDbExports, SqlDatabase } from "../../../contracts/index.js";
import { bindVisionConfigDatabase } from "./module-config.js";
import { createVisionRouter } from "./routes.js";

export {
  getVisionModuleConfig,
  updateVisionModuleConfig,
} from "./module-config.js";

export async function bindModuleDatabase(database: SqlDatabase): Promise<void> {
  await bindVisionConfigDatabase(database);
}

export function createModuleRouter() {
  return createVisionRouter();
}

export const visionDbModule: ModuleDbExports = {
  bindModuleDatabase,
  createModuleRouter,
};
