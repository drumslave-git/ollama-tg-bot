import { describe, expect, it } from "vitest";
import {
  buildMoodEvaluateMessages,
  parseMoodBlock,
} from "../../src/mood-prompt.js";
import { DEFAULT_MOOD_VALUES, MOOD_KEYS } from "../../src/mood.js";

describe("parseMoodBlock", () => {
  it("parses all nine traits from a full block", () => {
    const raw = [
      "[MOOD]",
      ...MOOD_KEYS.map((k, i) => `${k}: ${i % 6}`),
      "[/MOOD]",
    ].join("\n");
    const mood = parseMoodBlock(raw, DEFAULT_MOOD_VALUES);
    for (const k of MOOD_KEYS) {
      expect(mood[k]).toBeGreaterThanOrEqual(0);
      expect(mood[k]).toBeLessThanOrEqual(5);
    }
    expect(mood.irritated).toBe(0);
    expect(mood.exhausted).toBe(1);
  });

  it("keeps fallback values for traits the model omitted", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES, amused: 4 };
    const mood = parseMoodBlock("[MOOD]\nirritated: 3\n[/MOOD]", fallback);
    expect(mood.irritated).toBe(3);
    expect(mood.amused).toBe(4);
  });

  it("returns the fallback when no traits are present", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES, curious: 2 };
    expect(parseMoodBlock("totally unparseable", fallback)).toEqual(fallback);
  });

  it("clamps out-of-range values", () => {
    const mood = parseMoodBlock("[MOOD]\nirritated: 99\n[/MOOD]", DEFAULT_MOOD_VALUES);
    expect(mood.irritated).toBeLessThanOrEqual(5);
  });
});

describe("buildMoodEvaluateMessages", () => {
  it("includes current mood, trait guide and the latest turn", () => {
    const messages = buildMoodEvaluateMessages({
      currentMood: DEFAULT_MOOD_VALUES,
      historyText: "earlier banter",
      latestTurn: "you are great",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("Current mood");
    expect(messages[1].content).toContain("Trait guide");
    expect(messages[1].content).toContain("you are great");
  });
});
