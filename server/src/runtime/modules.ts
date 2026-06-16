import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import {
  configureModuleLiveHooks,
  discoverModuleManifests,
  type DataTableConfig,
  type ModuleDbExports,
  type ModuleDbHost,
  type ModuleManifest,
} from "@llm-tg-bot/modules-registry";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

/** Project-root modules directory. */
export function resolveModulesRoot(): string {
  return path.join(rootDir, "modules");
}

interface LoadedModuleDb {
  manifest: ModuleManifest;
  exports: ModuleDbExports;
}

const loadedDbModules = new Map<string, LoadedModuleDb>();
const moduleDataTables = new Map<string, DataTableConfig>();

export function getLoadedModuleManifests(): ModuleManifest[] {
  return discoverModuleManifests(resolveModulesRoot());
}

async function loadModuleDbExports(
  manifest: ModuleManifest,
): Promise<ModuleDbExports | null> {
  if (!manifest.dbPackage) return null;
  const mod = (await import(manifest.dbPackage)) as ModuleDbExports;
  if (typeof mod.bindModuleDatabase !== "function") {
    throw new Error(`Module ${manifest.id} db package missing bindModuleDatabase`);
  }
  return mod;
}

export async function initModuleDatabases(db: DatabaseSync): Promise<void> {
  const manifests = getLoadedModuleManifests();
  for (const manifest of manifests) {
    if (!manifest.dbPackage) continue;
    const exports = await loadModuleDbExports(manifest);
    if (!exports) continue;
    exports.bindModuleDatabase(db);
    loadedDbModules.set(manifest.id, { manifest, exports });
    if (exports.getDataTableConfigs) {
      for (const [tableId, tableConfig] of Object.entries(
        exports.getDataTableConfigs(),
      )) {
        moduleDataTables.set(tableId, tableConfig);
      }
    }
  }
}

export function configureModuleDatabases(host: ModuleDbHost): void {
  for (const { exports } of loadedDbModules.values()) {
    exports.configureModuleAccess?.(host);
  }
}

export async function createModuleRouters(): Promise<
  Array<{ manifest: ModuleManifest; router: Router }>
> {
  const routers: Array<{ manifest: ModuleManifest; router: Router }> = [];
  for (const entry of loadedDbModules.values()) {
    if (!entry.exports.createModuleRouter || !entry.manifest.apiBasePath) continue;
    routers.push({
      manifest: entry.manifest,
      router: entry.exports.createModuleRouter(),
    });
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
