import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typecheckPackage } from "./typecheck-package.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

const workspaces = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
).workspaces;

let failed = false;

for (const workspace of workspaces) {
  const packageDir = join(repoRoot, workspace);
  const hasTsconfig =
    existsSync(join(packageDir, "tsconfig.json")) ||
    existsSync(join(packageDir, "tsconfig.app.json"));

  if (!hasTsconfig) {
    continue;
  }

  console.log(`\n>> typecheck ${workspace}`);
  const status = typecheckPackage(packageDir);
  if (status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
