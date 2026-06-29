import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMORY_CONFIG,
  validateMemoryConfig,
} from "../../../src/features/memory/config.js";

describe("validateMemoryConfig", () => {
  it("returns defaults for an empty patch", () => {
    expect(validateMemoryConfig({})).toEqual(DEFAULT_MEMORY_CONFIG);
  });

  it("rejects an out-of-range run hour", () => {
    expect(() => validateMemoryConfig({ runHour: 24 })).toThrow(/runHour/);
    expect(() => validateMemoryConfig({ runHour: -1 })).toThrow(/runHour/);
  });

  it("accepts enabled + runHour overrides", () => {
    expect(validateMemoryConfig({ enabled: false, runHour: 9 })).toEqual({
      enabled: false,
      runHour: 9,
    });
  });
});
