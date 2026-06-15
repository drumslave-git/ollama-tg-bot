import type { ComponentType } from "react";
import { StickersPage } from "./StickersPage";

export interface ModuleUiDefinition {
  id: string;
  Page: ComponentType;
}

export const moduleUi: ModuleUiDefinition = {
  id: "sticker-selection",
  Page: StickersPage,
};

export { StickersPage };
