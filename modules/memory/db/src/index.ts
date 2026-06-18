import type { DatabaseSync } from "node:sqlite";
import type { DataTableConfig, ModuleDbExports } from "@llm-tg-bot/modules-registry";
import { bindGeneralMemoryDatabase } from "./general-memory.js";
import { bindGroupMemoryDatabase } from "./group-memory.js";
import { bindUserMemoryDatabase } from "./user-memory.js";
import { bindMemoryConfigDatabase } from "./module-config.js";
import { createMemoriesRouter } from "./routes.js";

export * from "./module-config.js";

export * from "./memory-facts.js";
export * from "./user-memory.js";
export * from "./group-memory.js";
export * from "./general-memory.js";

const DATA_TABLE_CONFIGS: Record<string, DataTableConfig> = {
  user_memories: {
    label: "User memories",
    columns: ["id", "user_id", "content", "created_at", "updated_at"],
    query: `SELECT id, user_id, content, created_at, updated_at
            FROM user_memories ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM user_memories",
    timeColumns: ["created_at", "updated_at"],
  },
  group_memories: {
    label: "Group memories",
    columns: ["id", "group_id", "content", "created_at", "updated_at"],
    query: `SELECT id, group_id, content, created_at, updated_at
            FROM group_memories ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM group_memories",
    timeColumns: ["created_at", "updated_at"],
  },
  general_facts: {
    label: "General facts",
    columns: ["id", "fact", "created_at"],
    query: `SELECT id, fact, created_at
            FROM general_facts ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM general_facts",
    timeColumns: ["created_at"],
  },
};

export function bindModuleDatabase(database: DatabaseSync): void {
  bindUserMemoryDatabase(database);
  bindGroupMemoryDatabase(database);
  bindGeneralMemoryDatabase(database);
  bindMemoryConfigDatabase(database);
}

export function createModuleRouter() {
  return createMemoriesRouter();
}

export function getDataTableConfigs(): Record<string, DataTableConfig> {
  return DATA_TABLE_CONFIGS;
}

export const memoryDbModule: ModuleDbExports = {
  bindModuleDatabase,
  createModuleRouter,
  getDataTableConfigs,
};
