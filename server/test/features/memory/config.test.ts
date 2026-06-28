import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMORY_CONFIG,
  validateMemoryConfig,
} from "../../../src/features/memory/config.js";

describe("validateMemoryConfig", () => {
  it("returns defaults for an empty patch", () => {
    expect(validateMemoryConfig({})).toEqual(
      DEFAULT_MEMORY_CONFIG,
    );
  });

  it("rejects out-of-range debounce values", () => {
    expect(() =>
      validateMemoryConfig({ maintenanceDebounceSec: 2 }),
    ).toThrow(/maintenanceDebounceSec/);
  });
});
