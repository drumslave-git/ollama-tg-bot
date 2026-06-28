import type { Router } from "express";
import {
  configureFeatureLiveHooks,
  type FeatureDbHost,
  type SqlDatabase,
} from "../contracts/index.js";
import { FEATURE_REGISTRY, type FeatureEntry } from "./feature-registry.js";

const loadedDbFeatures: FeatureEntry[] = [];

export function getFeatureEntries(): FeatureEntry[] {
  return FEATURE_REGISTRY;
}

export async function initFeatureDatabases(db: SqlDatabase): Promise<void> {
  for (const entry of FEATURE_REGISTRY) {
    if (!entry.db) continue;
    await entry.db.bindFeatureDatabase(db);
    loadedDbFeatures.push(entry);
  }
}

export function configureFeatureDatabases(host: FeatureDbHost): void {
  for (const entry of loadedDbFeatures) {
    entry.db?.configureFeatureAccess?.(host);
  }
}

export function createFeatureRouters(): Array<{
  entry: FeatureEntry;
  router: Router;
}> {
  const routers: Array<{ entry: FeatureEntry; router: Router }> = [];
  for (const entry of loadedDbFeatures) {
    if (!entry.db?.createFeatureRouter || !entry.apiBasePath) continue;
    routers.push({ entry, router: entry.db.createFeatureRouter() });
  }
  return routers;
}

export function wireFeatureLiveHooks(
  hooks: Parameters<typeof configureFeatureLiveHooks>[0],
): void {
  configureFeatureLiveHooks(hooks);
}
