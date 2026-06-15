import fs from "node:fs";
import path from "node:path";
import type { ModuleManifest } from "./manifest.js";

const SKIP_DIRS = new Set(["registry", "node_modules"]);

export function discoverModuleManifests(modulesRoot: string): ModuleManifest[] {
  if (!fs.existsSync(modulesRoot)) return [];

  const manifests: ModuleManifest[] = [];

  for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;

    const manifestPath = path.join(modulesRoot, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as ModuleManifest;
    if (!parsed.id || !parsed.name) {
      throw new Error(`Invalid manifest at ${manifestPath}: id and name are required`);
    }
    manifests.push(parsed);
  }

  return manifests.sort((a, b) => a.name.localeCompare(b.name));
}
