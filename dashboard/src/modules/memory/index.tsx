import type { ComponentType } from "react";
import { MemoriesPage } from "./MemoriesPage";
import { MemoryDebugPage } from "./MemoryDebugPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
  DebugPage?: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "memory",
  Page: MemoriesPage,
  DebugPage: MemoryDebugPage,
};

export { MemoriesPage };
