import fs from "node:fs";
import path from "node:path";
const SKIP_DIRS = new Set(["registry", "node_modules"]);
export function discoverModuleManifests(modulesRoot) {
    if (!fs.existsSync(modulesRoot))
        return [];
    const manifests = [];
    for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name))
            continue;
        const manifestPath = path.join(modulesRoot, entry.name, "manifest.json");
        if (!fs.existsSync(manifestPath))
            continue;
        const raw = fs.readFileSync(manifestPath, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed.id || !parsed.name) {
            throw new Error(`Invalid manifest at ${manifestPath}: id and name are required`);
        }
        manifests.push(parsed);
    }
    return manifests.sort((a, b) => a.name.localeCompare(b.name));
}
