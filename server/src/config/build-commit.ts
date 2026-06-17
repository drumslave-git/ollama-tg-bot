import { buildCommit as bakedCommit } from "./build-info.js";

const RUNTIME_COMMIT_ENV_KEYS = [
  "GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "CI_COMMIT_SHA",
  "GIT_COMMIT",
  "SOURCE_VERSION",
  "COMMIT_SHA",
] as const;

function resolveRuntimeCommit(): string | null {
  for (const key of RUNTIME_COMMIT_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function getBuildCommit(): string {
  return resolveRuntimeCommit() ?? bakedCommit;
}

export function getBuildCommitShort(): string {
  const commit = getBuildCommit();
  return commit === "unknown" ? commit : commit.slice(0, 7);
}
