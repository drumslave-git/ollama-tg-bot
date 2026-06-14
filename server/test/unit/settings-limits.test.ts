import { describe, expect, it } from "vitest";
import {
  AUXILIARY_NUM_PREDICT,
  MAX_NUM_PREDICT,
  MIN_NUM_CTX,
  MIN_NUM_PREDICT,
  getAuxiliaryNumPredict,
  getChatTimeoutMs,
  getEffectiveNumPredict,
  getHistoryLimits,
  getReplyLengthGuidance,
  maxNumPredictForContext,
  minNumCtxForPredict,
  normalizeTokenBudget,
  snapNumCtx,
  snapNumPredict,
  validateSettingsFields,
} from "../../src/settings-limits.js";
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
  it("never drops below the auxiliary floor", () => {
    expect(getAuxiliaryNumPredict(makeSettings({ numPredict: 64 }))).toBe(
      AUXILIARY_NUM_PREDICT,
    );
  });

  it("uses a larger configured budget when above the floor", () => {
    expect(getAuxiliaryNumPredict(makeSettings({ numPredict: 1024 }))).toBe(
      1024,
    );
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
  it("derives history token and char caps from context/generation", () => {
    const limits = getHistoryLimits(makeSettings({ numCtx: 8192, numPredict: 512 }));
    expect(limits.numPredict).toBe(512);
    expect(limits.historyMaxTokens).toBe(Math.floor((8192 - 512) * 0.45));
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

  it("requires a sticker pack name when stickers are enabled", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ stickersEnabled: true, stickerPackName: "" }),
      ),
    ).toThrow(/stickerPackName is required/);
  });

  it("rejects sendThinking without thinking", () => {
    expect(() =>
      validateSettingsFields(
        makeSettings({ sendThinkingEnabled: true, thinkingEnabled: false }),
      ),
    ).toThrow(/sendThinkingEnabled requires thinkingEnabled/);
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
});
