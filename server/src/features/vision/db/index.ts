import type { DatabaseSync } from "node:sqlite";
import type { ModuleDbExports } from "../../../contracts/index.js";
import { bindVisionConfigDatabase } from "./module-config.js";
import { createVisionRouter } from "./routes.js";

export {
  getVisionModuleConfig,
  updateVisionModuleConfig,
} from "./module-config.js";

export function bindModuleDatabase(database: DatabaseSync): void {
  bindVisionConfigDatabase(database);
}

export function createModuleRouter() {
  return createVisionRouter();
}

export const visionDbModule: ModuleDbExports = {
  bindModuleDatabase,
  createModuleRouter,
};
