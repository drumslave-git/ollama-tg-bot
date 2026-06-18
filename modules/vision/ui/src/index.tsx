import type { ComponentType } from "react";
import { VisionPage } from "./VisionPage";
import { VisionDebugPage } from "./VisionDebugPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
  DebugPage?: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "vision",
  Page: VisionPage,
  DebugPage: VisionDebugPage,
};

export { VisionPage };
