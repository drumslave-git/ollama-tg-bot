import type { DatabaseSync } from "node:sqlite";
import type {
  DataTableConfig,
  ModuleDbExports,
  ModuleDbHost,
} from "../../../contracts/index.js";
import {
  bindHistoryDatabase,
  configureHistoryAccess,
} from "./history.js";
import { configureHistoryRoutes, createHistoryRouter } from "./routes.js";

export * from "../index.js";
export * from "./history.js";

const DATA_TABLE_CONFIGS: Record<string, DataTableConfig> = {
  chat_history: {
    label: "Chat history",
    columns: ["chat_key", "messages", "updated_at", "compressed_at"],
    query: `SELECT chat_key, messages, updated_at, compressed_at
            FROM chat_history ORDER BY updated_at DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM chat_history",
    timeColumns: ["updated_at", "compressed_at"],
  },
};

export function bindModuleDatabase(database: DatabaseSync): void {
  bindHistoryDatabase(database);
}

export function configureModuleAccess(host: ModuleDbHost): void {
  if (!host.getHistoryLimits) {
    throw new Error("History module requires getHistoryLimits on ModuleDbHost");
  }
  configureHistoryAccess(host.getHistoryLimits);
  configureHistoryRoutes(host);
}

export function createModuleRouter() {
  return createHistoryRouter();
}

export function getDataTableConfigs(): Record<string, DataTableConfig> {
  return DATA_TABLE_CONFIGS;
}

export const historyDbModule: ModuleDbExports = {
  bindModuleDatabase,
  configureModuleAccess,
  createModuleRouter,
  getDataTableConfigs,
};
