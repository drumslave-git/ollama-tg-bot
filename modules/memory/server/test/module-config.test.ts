import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMORY_MODULE_CONFIG,
  validateMemoryModuleConfig,
} from "../src/module-config.js";

describe("validateMemoryModuleConfig", () => {
  it("returns defaults for an empty patch", () => {
    expect(validateMemoryModuleConfig({})).toEqual(
      DEFAULT_MEMORY_MODULE_CONFIG,
    );
  });

  it("rejects out-of-range debounce values", () => {
    expect(() =>
      validateMemoryModuleConfig({ extractionDebounceSec: 2 }),
    ).toThrow(/extractionDebounceSec/);
  });
});
