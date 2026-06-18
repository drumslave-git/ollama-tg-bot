import type { ComponentType } from "react";
import { VisionPage } from "./VisionPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "vision",
  Page: VisionPage,
};

export { VisionPage };
