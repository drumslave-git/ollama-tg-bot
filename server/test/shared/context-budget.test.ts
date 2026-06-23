import { describe, expect, it } from "vitest";
import {
  calculateContextBudget,
  estimateModelWeightGb,
  extractModelMaxCtx,
  parseParameterSizeFromName,
  parseParameterSizeGb,
  vramTierContextTokens,
} from "../../src/shared/context-budget.js";

describe("vramTierContextTokens", () => {
  it("maps VRAM to the right tier", () => {
    expect(vramTierContextTokens(8)).toBe(4096);
    expect(vramTierContextTokens(24)).toBe(32768);
    expect(vramTierContextTokens(80)).toBe(262144);
  });
});

describe("parseParameterSizeGb", () => {
  it("estimates Q4 weight from billions", () => {
    expect(parseParameterSizeGb("7B")).toBeCloseTo(7 * 0.65, 5);
  });

  it("handles million-scale sizes", () => {
    expect(parseParameterSizeGb("500M")).toBeCloseTo(0.5 * 0.65, 5);
  });

  it("returns null for garbage", () => {
    expect(parseParameterSizeGb("xyz")).toBeNull();
    expect(parseParameterSizeGb(undefined)).toBeNull();
  });
});

describe("parseParameterSizeFromName", () => {
  it("reads standard size from a model name", () => {
    expect(parseParameterSizeFromName("qwen2.5-7b-instruct")).toBe("7B");
  });

  it("reads gemma effective size", () => {
    expect(parseParameterSizeFromName("gemma-3n-e4b-it")).toBe("4B");
  });

  it("reads tag-style size", () => {
    expect(parseParameterSizeFromName("llama3:3b")).toBe("3B");
  });

  it("returns null when no size present", () => {
    expect(parseParameterSizeFromName("custom-model")).toBeNull();
  });
});

describe("estimateModelWeightGb", () => {
  it("prefers sizeBytes when present", () => {
    expect(estimateModelWeightGb({ name: "m", sizeBytes: 1024 ** 3 })).toBeCloseTo(
      1,
      5,
    );
  });

  it("falls back to parameterSize metadata", () => {
    expect(estimateModelWeightGb({ name: "m", parameterSize: "7B" })).toBeCloseTo(
      7 * 0.65,
      5,
    );
  });

  it("falls back to the model name", () => {
    expect(estimateModelWeightGb({ name: "foo-13b" })).toBeCloseTo(13 * 0.65, 5);
  });
});

describe("extractModelMaxCtx", () => {
  it("reads the largest *.context_length value", () => {
    expect(
      extractModelMaxCtx({
        "llama.context_length": 8192,
        "general.context_length": "4096",
        unrelated: 999,
      }),
    ).toBe(8192);
  });

  it("returns null when no context length key", () => {
    expect(extractModelMaxCtx({ foo: 1 })).toBeNull();
  });
});

describe("calculateContextBudget", () => {
  it("drives context from KV headroom when the model size is known", () => {
    const budget = calculateContextBudget(80, { name: "tiny-1b" });
    expect(budget.limitedBy).toBe("kv_headroom");
    // A 1B model on 80 GB has headroom for far more than the absolute max.
    expect(budget.effectiveNumCtx).toBe(262144);
  });

  it("falls back to the VRAM tier baseline when model size is unknown", () => {
    const budget = calculateContextBudget(80, { name: "custom-model" });
    expect(budget.limitedBy).toBe("vram_tier");
    expect(budget.effectiveNumCtx).toBe(262144);
  });

  it("uses more of a big GPU than the coarse tier would allow", () => {
    // 24 GB + ~7 GB weights: the old VRAM tier capped this at 32768; KV
    // headroom should now allow substantially more.
    const budget = calculateContextBudget(24, {
      name: "gemma-12b",
      sizeBytes: 7 * 1024 ** 3,
    });
    expect(budget.limitedBy).toBe("kv_headroom");
    expect(budget.effectiveNumCtx).toBeGreaterThan(32768);
  });

  it("caps to the model native maximum", () => {
    const budget = calculateContextBudget(80, {
      name: "tiny-1b",
      modelMaxCtx: 8192,
    });
    expect(budget.limitedBy).toBe("model_max");
    expect(budget.effectiveNumCtx).toBe(8192);
  });

  it("never drops below the minimum context floor", () => {
    const budget = calculateContextBudget(8, { name: "tiny-1b" });
    expect(budget.effectiveNumCtx).toBeGreaterThanOrEqual(2048);
  });

  it("limits by KV headroom for a large model on small VRAM", () => {
    const budget = calculateContextBudget(24, { name: "huge-70b" });
    expect(["kv_headroom", "generation_floor", "min_floor"]).toContain(
      budget.limitedBy,
    );
  });
});
