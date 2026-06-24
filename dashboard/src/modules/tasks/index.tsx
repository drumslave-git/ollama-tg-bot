import type { ComponentType } from "react";
import { TasksPage } from "./TasksPage";
import { TasksDebugPage } from "./TasksDebugPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
  DebugPage?: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "tasks",
  Page: TasksPage,
  DebugPage: TasksDebugPage,
};

export { TasksPage, TasksDebugPage };
