import type { ComponentType } from "react";
import { MoodPage } from "./MoodPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "mood-evaluation",
  Page: MoodPage,
};

export { MoodPage };
