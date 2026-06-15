import type { ComponentType } from "react";
import { MemoriesPage } from "./MemoriesPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "memory",
  Page: MemoriesPage,
};

export { MemoriesPage };
