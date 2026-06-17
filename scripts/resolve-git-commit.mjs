import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ENV_KEYS = [
  "GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "CI_COMMIT_SHA",
  "GIT_COMMIT",
  "SOURCE_VERSION",
  "COMMIT_SHA",
];

export function resolveGitCommit() {
  for (const key of ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(resolveGitCommit());
}
