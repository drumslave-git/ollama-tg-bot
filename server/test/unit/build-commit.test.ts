import { afterEach, describe, expect, it, vi } from "vitest";
import { getBuildCommit, getBuildCommitShort } from "../../src/config/build-commit.js";

describe("getBuildCommit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers GIT_COMMIT_SHA at runtime over the baked build-info value", () => {
    vi.stubEnv("GIT_COMMIT_SHA", "abc123def456789");
    expect(getBuildCommit()).toBe("abc123def456789");
    expect(getBuildCommitShort()).toBe("abc123d");
  });

  it("falls back to common CI commit env vars", () => {
    vi.stubEnv("GITHUB_SHA", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(getBuildCommit()).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(getBuildCommitShort()).toBe("deadbee");
  });
});
