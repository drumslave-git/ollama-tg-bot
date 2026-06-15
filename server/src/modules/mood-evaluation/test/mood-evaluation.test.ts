import { describe, expect, it } from "vitest";
import {
  MOOD_EVALUATOR_SYSTEM,
  MOOD_TAG,
  buildMoodEvaluateMessages,
  evaluateMood,
  parseMoodBlock,
  DEFAULT_MOOD_VALUES,
  MOOD_KEYS,
} from "../src/index.js";

describe("parseMoodBlock", () => {
  it("parses all nine traits from a full block", () => {
    const raw = [
      "[MOOD]",
      ...MOOD_KEYS.map((k, i) => `${k}: ${i % 6}`),
      "[/MOOD]",
    ].join("\n");
    const { mood } = parseMoodBlock(raw, DEFAULT_MOOD_VALUES);
    for (const k of MOOD_KEYS) {
      expect(mood[k]).toBeGreaterThanOrEqual(0);
      expect(mood[k]).toBeLessThanOrEqual(5);
    }
    expect(mood.irritated).toBe(0);
    expect(mood.exhausted).toBe(1);
  });

  it("keeps fallback values for traits the model omitted", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES, amused: 4 };
    const { mood } = parseMoodBlock("[MOOD]\nirritated: 3\n[/MOOD]", fallback);
    expect(mood.irritated).toBe(3);
    expect(mood.amused).toBe(4);
  });

  it("returns the fallback when no traits are present", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES, curious: 2 };
    const result = parseMoodBlock("totally unparseable", fallback);
    expect(result.mood).toEqual(fallback);
    expect(result.reason).toContain("Could not parse");
  });

  it("rejects bare trait lines outside the block", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES };
    const result = parseMoodBlock("irritated: 5\namused: 4", fallback);
    expect(result.mood).toEqual(fallback);
    expect(result.reason).toContain("Could not parse");
  });

  it("clamps out-of-range values", () => {
    const { mood } = parseMoodBlock(
      "[MOOD]\nirritated: 99\n[/MOOD]",
      DEFAULT_MOOD_VALUES,
    );
    expect(mood.irritated).toBeLessThanOrEqual(5);
  });

  it("uses the last closed block when reasoning quotes the format", () => {
    const result = parseMoodBlock(
      "Example [MOOD]\nirritated: 1\n[/MOOD]\n[MOOD]\nirritated: 4\n[/MOOD]",
      DEFAULT_MOOD_VALUES,
    );
    expect(result.mood.irritated).toBe(4);
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
    expect(messages[1].content).toContain("[MOOD]");
  });
});

describe("MOOD_EVALUATOR_SYSTEM", () => {
  it("requires a closed [MOOD] block", () => {
    expect(MOOD_EVALUATOR_SYSTEM).toContain(`[${MOOD_TAG}]`);
    expect(MOOD_EVALUATOR_SYSTEM).toContain("exactly one block");
    expect(MOOD_EVALUATOR_SYSTEM).toContain("[irritated: 5]");
  });
});

describe("evaluateMood", () => {
  it("returns parsed mood from mocked LLM output", async () => {
    const result = await evaluateMood(
      {
        currentMood: DEFAULT_MOOD_VALUES,
        historyText: "",
        latestTurn: "hello",
      },
      {
        baseUrl: "http://localhost",
        model: "test",
        chatComplete: async () =>
          "[MOOD]\nirritated: 3\namused: 2\nexhausted: 0\ncurious: 1\ncontemptuous: 1\ngloomy: 0\nimpatient: 1\npleased: 0\nsuspicious: 1\n[/MOOD]",
      },
    );
    expect(result.mood.irritated).toBe(3);
    expect(result.reason).toBe("Mood updated");
  });
});
