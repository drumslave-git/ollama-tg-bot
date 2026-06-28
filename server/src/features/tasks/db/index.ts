import type {
  ModuleDbExports,
  SqlDatabase,
} from "../../../contracts/index.js";
import { bindTasksDatabase } from "./tasks.js";
import { bindTaskMessagesDatabase } from "./task-messages.js";
import { bindTaskEventsDatabase } from "./task-events.js";
import { bindTaskProcessingDatabase } from "../../../db/debug/task-processing.js";
import { createTasksRouter } from "./routes.js";

export * from "./tasks.js";
export * from "./task-messages.js";
export * from "./task-events.js";

export async function bindModuleDatabase(database: SqlDatabase): Promise<void> {
  await bindTasksDatabase(database);
  await bindTaskMessagesDatabase(database);
  await bindTaskEventsDatabase(database);
  // After tasks — task_processings has a FK to tasks(id).
  await bindTaskProcessingDatabase(database);
}

export function createModuleRouter() {
  return createTasksRouter();
}

export const tasksDbModule: ModuleDbExports = {
  bindModuleDatabase,
  createModuleRouter,
};
