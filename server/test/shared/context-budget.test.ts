import { describe, expect, it } from "vitest";
import {
  calculateContextBudget,
  extractModelMaxCtx,
} from "../../src/shared/context-budget.js";

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
  it("uses the manually-configured numCtx when within limits", () => {
    const budget = calculateContextBudget(16384, 512, { name: "any-model" });
    expect(budget.effectiveNumCtx).toBe(16384);
    expect(budget.requestedNumCtx).toBe(16384);
    expect(budget.limitedBy).toBe("manual");
  });

  it("caps to the model's native maximum", () => {
    const budget = calculateContextBudget(32768, 512, {
      name: "tiny",
      modelMaxCtx: 8192,
    });
    expect(budget.effectiveNumCtx).toBe(8192);
    expect(budget.limitedBy).toBe("model_max");
  });

  it("does not cap when the requested value is at or below the model max", () => {
    const budget = calculateContextBudget(8192, 512, {
      name: "tiny",
      modelMaxCtx: 32768,
    });
    expect(budget.effectiveNumCtx).toBe(8192);
    expect(budget.limitedBy).toBe("manual");
  });

  it("raises to the generation floor when numCtx is too small for numPredict", () => {
    const budget = calculateContextBudget(2048, 4096, { name: "any-model" });
    // numPredict 4096 + 512 headroom needs > 2048 of context.
    expect(budget.effectiveNumCtx).toBeGreaterThan(2048);
    expect(budget.limitedBy).toBe("generation_floor");
  });

  it("never drops below the minimum context floor", () => {
    const budget = calculateContextBudget(512, 32, { name: "any-model" });
    expect(budget.effectiveNumCtx).toBeGreaterThanOrEqual(2048);
  });

  it("clamps above the absolute maximum", () => {
    const budget = calculateContextBudget(1_000_000, 512, { name: "any-model" });
    expect(budget.effectiveNumCtx).toBe(262144);
  });
});
