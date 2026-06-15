import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { discoverModuleManifests } from "../src/discover.js";

const modulesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

describe("discoverModuleManifests", () => {
  it("loads feature module manifests from modules/", () => {
    const manifests = discoverModuleManifests(modulesRoot);
    const ids = manifests.map((manifest) => manifest.id);
    expect(ids).toContain("memory");
    expect(ids).toContain("mood-evaluation");
    expect(ids).toContain("addressing-detection");
  });

  it("includes dashboard metadata for modules with UI", () => {
    const memory = discoverModuleManifests(modulesRoot).find(
      (manifest) => manifest.id === "memory",
    );
    expect(memory?.uiPackage).toBe("@llm-tg-bot/modules-memory-ui");
    expect(memory?.dashboard?.label).toBe("Memory");
  });
});
