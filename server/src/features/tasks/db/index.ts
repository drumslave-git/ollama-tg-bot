import type { DatabaseSync } from "node:sqlite";
import type { DataTableConfig, ModuleDbExports } from "../../../contracts/index.js";
import { bindTasksDatabase } from "./tasks.js";
import { bindTaskMessagesDatabase } from "./task-messages.js";
import { bindTaskEventsDatabase } from "./task-events.js";
import { createTasksRouter } from "./routes.js";

export * from "./tasks.js";
export * from "./task-messages.js";
export * from "./task-events.js";

const DATA_TABLE_CONFIGS: Record<string, DataTableConfig> = {
  tasks: {
    label: "Tasks",
    columns: [
      "id",
      "chat_id",
      "instruction",
      "schedule_kind",
      "time_of_day",
      "weekdays",
      "run_date",
      "timezone",
      "enabled",
      "next_run_at",
      "last_run_at",
      "created_at",
    ],
    query: `SELECT id, chat_id, instruction, schedule_kind, time_of_day, weekdays,
              run_date, timezone, enabled, next_run_at, last_run_at, created_at
            FROM tasks ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM tasks",
    timeColumns: ["created_at"],
  },
  task_messages: {
    label: "Task messages",
    columns: ["id", "task_id", "chat_id", "message_id", "created_at"],
    query: `SELECT id, task_id, chat_id, message_id, created_at
            FROM task_messages ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM task_messages",
    timeColumns: ["created_at"],
  },
  task_events: {
    label: "Task events",
    columns: ["id", "task_id", "kind", "chat_id", "summary", "created_at"],
    query: `SELECT id, task_id, kind, chat_id, summary, created_at
            FROM task_events ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM task_events",
    timeColumns: ["created_at"],
  },
};

export function bindModuleDatabase(database: DatabaseSync): void {
  bindTasksDatabase(database);
  bindTaskMessagesDatabase(database);
  bindTaskEventsDatabase(database);
}

export function createModuleRouter() {
  return createTasksRouter();
}

export function getDataTableConfigs(): Record<string, DataTableConfig> {
  return DATA_TABLE_CONFIGS;
}

export const tasksDbModule: ModuleDbExports = {
  bindModuleDatabase,
  createModuleRouter,
  getDataTableConfigs,
};
