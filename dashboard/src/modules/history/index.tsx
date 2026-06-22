import type { ComponentType } from "react";
import { HistoryPage } from "./HistoryPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "history",
  Page: HistoryPage,
};

export { HistoryPage };
