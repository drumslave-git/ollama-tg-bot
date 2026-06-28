import { describe, expect, it } from "vitest";
import {
  AUXILIARY_NUM_PREDICT,
  AUXILIARY_REASONING_NUM_PREDICT,
  MAX_NUM_PREDICT,
  MAINTENANCE_ANNOUNCE_REASONING_NUM_PREDICT,
  MIN_NUM_CTX,
  MIN_NUM_PREDICT,
  getAuxiliaryNumPredict,
  getMaintenanceAnnounceNumPredict,
  getChatTimeoutMs,
  getEffectiveNumPredict,
  getExplainNumPredict,
  EXPLAIN_NUM_PREDICT,
  getHistoryLimits,
  getReplyLengthGuidance,
  maxNumPredictForContext,
  minNumCtxForPredict,
  normalizeTokenBudget,
  snapNumCtx,
  snapNumPredict,
  validateSettingsFields,
} from "../../src/settings/limits.js";
import { makeSettings } from "../helpers/settings.js";

describe("snapNumPredict", () => {
  it("rounds to the nearest step and clamps to bounds", () => {
    expect(snapNumPredict(100)).toBe(96); // nearest multiple of 32
    expect(snapNumPredict(1)).toBe(MIN_NUM_PREDICT);
    expect(snapNumPredict(1_000_000)).toBe(MAX_NUM_PREDICT);
  });
});

describe("snapNumCtx", () => {
  it("rounds to the step and clamps to the minimum", () => {
    expect(snapNumCtx(100)).toBe(MIN_NUM_CTX);
    expect(snapNumCtx(8192)).toBe(8192);
  });
});

describe("maxNumPredictForContext / minNumCtxForPredict", () => {
  it("are mutually consistent at the headroom boundary", () => {
    const numCtx = 8192;
    const maxPredict = maxNumPredictForContext(numCtx);
    expect(minNumCtxForPredict(maxPredict)).toBeLessThanOrEqual(numCtx);
  });
});

describe("getEffectiveNumPredict", () => {
  it("snaps the configured budget", () => {
    expect(getEffectiveNumPredict(makeSettings({ numPredict: 100 }))).toBe(96);
  });

  it("honours a base override", () => {
    expect(
      getEffectiveNumPredict(makeSettings(), { baseNumPredict: 256 }),
    ).toBe(256);
  });
});

describe("getAuxiliaryNumPredict", () => {
  it("never drops below the auxiliary floor when thinking is off", () => {
    expect(getAuxiliaryNumPredict(makeSettings({ numPredict: 64 }))).toBe(
      AUXILIARY_NUM_PREDICT,
    );
  });

  it("uses the higher reasoning floor when thinking is on", () => {
    expect(
      getAuxiliaryNumPredict(
        makeSettings({ numPredict: 64, thinkingEnabled: true }),
      ),
    ).toBe(AUXILIARY_REASONING_NUM_PREDICT);
  });

  it("uses a larger configured budget when above the floor", () => {
    expect(getAuxiliaryNumPredict(makeSettings({ numPredict: 1024 }))).toBe(
      1024,
    );
  });
});

describe("getExplainNumPredict", () => {
  it("gives the generous target when the context has ample room", () => {
    // Large context, tiny prompt -> full target budget.
    expect(
      getExplainNumPredict(makeSettings({ numCtx: 32768 }), 1000),
    ).toBe(EXPLAIN_NUM_PREDICT);
  });

  it("shrinks the budget so output never collides with a large prompt", () => {
    // Small context, large trace prompt -> budget bounded by remaining tokens,
    // strictly below the target (this is the regression we are guarding).
    const budget = getExplainNumPredict(
      makeSettings({ numCtx: 4096 }),
      10000,
    );
    expect(budget).toBeLessThan(EXPLAIN_NUM_PREDICT);
    expect(budget).toBeGreaterThanOrEqual(MIN_NUM_PREDICT);
  });

  it("never drops below the floor even when the prompt exceeds the context", () => {
    expect(
      getExplainNumPredict(makeSettings({ numCtx: 2048 }), 100000),
    ).toBe(MIN_NUM_PREDICT);
  });
});

describe("getMaintenanceAnnounceNumPredict", () => {
  it("matches auxiliary budget when thinking is off", () => {
    expect(
      getMaintenanceAnnounceNumPredict(makeSettings({ numPredict: 64 })),
    ).toBe(AUXILIARY_NUM_PREDICT);
  });

  it("raises the floor when thinking is on", () => {
    expect(
      getMaintenanceAnnounceNumPredict(
        makeSettings({ numPredict: 64, thinkingEnabled: true }),
      ),
    ).toBe(MAINTENANCE_ANNOUNCE_REASONING_NUM_PREDICT);
  });
});

describe("normalizeTokenBudget", () => {
  it("snaps numPredict while leaving other fields intact", () => {
    const settings = makeSettings({ numPredict: 100, numCtx: 8192 });
    const normalized = normalizeTokenBudget(settings);
    expect(normalized.numPredict).toBe(96);
    expect(normalized.numCtx).toBe(8192);
  });
});

describe("getHistoryLimits", () => {
  it("derives reply char caps from the generation budget", () => {
    const limits = getHistoryLimits(makeSettings({ numCtx: 8192, numPredict: 512 }));
    expect(limits.numPredict).toBe(512);
    expect(limits.historyMaxReplyChars).toBeGreaterThan(100);
  });

  it("clamps reply chars to the 4000 ceiling", () => {
    const limits = getHistoryLimits(
      makeSettings({ numCtx: 32768, numPredict: 8192 }),
    );
    expect(limits.historyMaxReplyChars).toBe(4000);
  });
});

describe("getReplyLengthGuidance", () => {
  it("includes token and char budgets in the hints", () => {
    const g = getReplyLengthGuidance(makeSettings({ numPredict: 512 }));
    expect(g.maxTokens).toBe(512);
    expect(g.systemHint).toContain("512");
    expect(g.formatHint).toContain("characters");
  });
});

describe("getChatTimeoutMs", () => {
  it("converts seconds to milliseconds", () => {
    expect(getChatTimeoutMs(makeSettings({ chatTimeoutSec: 90 }))).toBe(90_000);
  });
});

describe("validateSettingsFields", () => {
  it("accepts default settings", () => {
    expect(() => validateSettingsFields(makeSettings())).not.toThrow();
  });

  it("rejects temperature out of range", () => {
    expect(() =>
      validateSettingsFields(makeSettings({ temperature: 5 })),
    ).toThrow(/temperature/);
  });

  it("rejects topK out of range", () => {
    expect(() => validateSettingsFields(makeSettings({ topK: 0 }))).toThrow(
      /topK/,
    );
  });

  it("requires ownerUserId when ownerUsername is set", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ ownerUsername: "georg", ownerUserId: "" }),
      ),
    ).toThrow(/ownerUserId is required/);
  });

  it("rejects an invalid reasoningEffort", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ reasoningEffort: "extreme" as never }),
      ),
    ).toThrow(/reasoningEffort/);
  });

  it("rejects a numCtx/numPredict combo that violates the headroom", () => {
    // numPredict is too large for this tiny context window.
    expect(() =>
      validateSettingsFields(makeSettings({ numCtx: MIN_NUM_CTX, numPredict: 8192 })),
    ).toThrow(/numPredict|numCtx/);
  });

  it("rejects numCtx below the absolute minimum", () => {
    expect(() =>
      validateSettingsFields(makeSettings({ numCtx: 512, numPredict: 32 })),
    ).toThrow(/numCtx/);
  });

  it("rejects invalid workflowSteps", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ workflowSteps: "invalid" as never }),
      ),
    ).toThrow(/workflowSteps/);
  });

  it("accepts custom workflow step ids", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ workflowSteps: ["custom-step", "any-feature-id"] }),
      ),
    ).not.toThrow();
  });

  it("rejects invalid workflowNodes", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ workflowNodes: "invalid" as never }),
      ),
    ).toThrow(/workflowNodes/);

    expect(() =>
      validateSettingsFields(
        makeSettings({ workflowNodes: [{ id: "test", x: "invalid" as never, y: 0 }] }),
      ),
    ).toThrow(/workflowNodes/);
  });

  it("rejects invalid workflowEdges", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ workflowEdges: "invalid" as never }),
      ),
    ).toThrow(/workflowEdges/);

    expect(() =>
      validateSettingsFields(
        makeSettings({ workflowEdges: [{ id: "test", source: 123 as never, target: "test" }] }),
      ),
    ).toThrow(/workflowEdges/);
  });
});
