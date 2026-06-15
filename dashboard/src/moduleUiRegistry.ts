import type { ComponentType } from "react";

export interface ModuleUiEntry {
  id: string;
  Page: ComponentType;
}

const uiModules = import.meta.glob<{ moduleUi: ModuleUiEntry }>(
  "../../modules/*/ui/src/index.tsx",
  { eager: true },
);

export const moduleUiRegistry = new Map<string, ModuleUiEntry>(
  Object.values(uiModules).map((mod) => [mod.moduleUi.id, mod.moduleUi]),
);

export function getModuleUi(id: string): ModuleUiEntry | undefined {
  return moduleUiRegistry.get(id);
}

export function listModuleUiEntries(): ModuleUiEntry[] {
  return [...moduleUiRegistry.values()];
}
