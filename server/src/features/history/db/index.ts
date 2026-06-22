import type { DatabaseSync } from "node:sqlite";
import type {
  DataTableConfig,
  ModuleDbExports,
} from "../../../contracts/index.js";
import { bindHistoryDatabase } from "./history.js";

export * from "../index.js";
export * from "./history.js";

const DATA_TABLE_CONFIGS: Record<string, DataTableConfig> = {
  chat_messages: {
    label: "Chat history",
    columns: ["id", "entity_id", "role", "content", "message_id", "created_at"],
    query: `SELECT id, entity_id, role, content, message_id, created_at
            FROM chat_messages ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM chat_messages",
    timeColumns: ["created_at"],
  },
};

export function bindModuleDatabase(database: DatabaseSync): void {
  bindHistoryDatabase(database);
}

export function getDataTableConfigs(): Record<string, DataTableConfig> {
  return DATA_TABLE_CONFIGS;
}

export const historyDbModule: ModuleDbExports = {
  bindModuleDatabase,
  getDataTableConfigs,
};
