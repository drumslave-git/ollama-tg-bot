import type {
  DataTableConfig,
  ModuleDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindSummariesDatabase } from "./summaries.js";
import { bindSummariesJobStateDatabase } from "./job-state.js";
import { bindSummariesConfigDatabase } from "./module-config.js";

export * from "./summaries.js";
export * from "./job-state.js";
export * from "./module-config.js";

const DATA_TABLE_CONFIGS: Record<string, DataTableConfig> = {
  chat_summaries: {
    label: "Chat summaries",
    columns: ["id", "chat_id", "summary_date", "message_ids", "content", "created_at"],
    query: `SELECT id, chat_id, summary_date, message_ids, content, created_at
            FROM chat_summaries ORDER BY id DESC LIMIT $1`,
    countQuery: "SELECT COUNT(*)::int AS n FROM chat_summaries",
    timeColumns: ["created_at"],
  },
};

export async function bindModuleDatabase(database: SqlDatabase): Promise<void> {
  await bindSummariesDatabase(database);
  await bindSummariesJobStateDatabase(database);
  await bindSummariesConfigDatabase(database);
}

export function getDataTableConfigs(): Record<string, DataTableConfig> {
  return DATA_TABLE_CONFIGS;
}

export const summariesDbModule: ModuleDbExports = {
  bindModuleDatabase,
  getDataTableConfigs,
};
