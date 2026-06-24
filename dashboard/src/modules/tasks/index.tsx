import type { ComponentType } from "react";
import { TasksPage } from "./TasksPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
  DebugPage?: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "tasks",
  Page: TasksPage,
};

export { TasksPage };
