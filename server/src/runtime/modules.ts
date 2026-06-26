import type { Router } from "express";
import {
  configureModuleLiveHooks,
  type DataTableConfig,
  type ModuleDbHost,
  type SqlDatabase,
} from "../contracts/index.js";
import { MODULE_REGISTRY, type ModuleEntry } from "./module-registry.js";

const loadedDbModules: ModuleEntry[] = [];
const moduleDataTables = new Map<string, DataTableConfig>();

export function getModuleEntries(): ModuleEntry[] {
  return MODULE_REGISTRY;
}

export async function initModuleDatabases(db: SqlDatabase): Promise<void> {
  for (const entry of MODULE_REGISTRY) {
    if (!entry.db) continue;
    await entry.db.bindModuleDatabase(db);
    loadedDbModules.push(entry);
    if (entry.db.getDataTableConfigs) {
      for (const [tableId, tableConfig] of Object.entries(
        entry.db.getDataTableConfigs(),
      )) {
        moduleDataTables.set(tableId, tableConfig);
      }
    }
  }
}

export function configureModuleDatabases(host: ModuleDbHost): void {
  for (const entry of loadedDbModules) {
    entry.db?.configureModuleAccess?.(host);
  }
}

export function createModuleRouters(): Array<{
  entry: ModuleEntry;
  router: Router;
}> {
  const routers: Array<{ entry: ModuleEntry; router: Router }> = [];
  for (const entry of loadedDbModules) {
    if (!entry.db?.createModuleRouter || !entry.apiBasePath) continue;
    routers.push({ entry, router: entry.db.createModuleRouter() });
  }
  return routers;
}

export function getModuleDataTableConfigs(): Map<string, DataTableConfig> {
  return moduleDataTables;
}

export function wireModuleLiveHooks(
  hooks: Parameters<typeof configureModuleLiveHooks>[0],
): void {
  configureModuleLiveHooks(hooks);
}
