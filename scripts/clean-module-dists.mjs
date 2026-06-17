import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const modulesRoot = path.join(root, "modules");

function removeDist(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

for (const name of fs.readdirSync(modulesRoot)) {
  const moduleDir = path.join(modulesRoot, name);
  if (!fs.statSync(moduleDir).isDirectory()) continue;

  for (const sub of ["server", "db", "ui"]) {
    removeDist(path.join(moduleDir, sub, "dist"));
  }
}

removeDist(path.join(modulesRoot, "registry", "dist"));
