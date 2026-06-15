import { describe, expect, it } from "vitest";
import {
  MOOD_EVALUATOR_SYSTEM,
  MOOD_RESPONSE_FORMAT,
  buildMoodEvaluateMessages,
  evaluateMood,
  parseMoodBlock,
  DEFAULT_MOOD_VALUES,
  MOOD_KEYS,
} from "../src/index.js";

describe("parseMoodBlock", () => {
  it("parses all nine traits from JSON", () => {
    const payload = Object.fromEntries(
      MOOD_KEYS.map((k, i) => [k, i % 6]),
    );
    const { mood } = parseMoodBlock(JSON.stringify(payload), DEFAULT_MOOD_VALUES);
    for (const k of MOOD_KEYS) {
      expect(mood[k]).toBeGreaterThanOrEqual(0);
      expect(mood[k]).toBeLessThanOrEqual(5);
    }
    expect(mood.irritated).toBe(0);
    expect(mood.exhausted).toBe(1);
  });

  it("keeps fallback values for traits the model omitted", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES, amused: 4 };
    const { mood } = parseMoodBlock('{"irritated":3}', fallback);
    expect(mood.irritated).toBe(3);
    expect(mood.amused).toBe(4);
  });

  it("returns the fallback when JSON is invalid", () => {
    const fallback = { ...DEFAULT_MOOD_VALUES, curious: 2 };
    const result = parseMoodBlock("totally unparseable", fallback);
    expect(result.mood).toEqual(fallback);
    expect(result.reason).toContain("Could not parse");
  });

  it("clamps out-of-range values", () => {
    const { mood } = parseMoodBlock(
      '{"irritated":99}',
      DEFAULT_MOOD_VALUES,
    );
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
    expect(messages[1].content).toContain("Return JSON");
  });
});

describe("MOOD_EVALUATOR_SYSTEM", () => {
  it("requires JSON with nine traits", () => {
    expect(MOOD_EVALUATOR_SYSTEM).toContain("Respond with JSON only");
    expect(MOOD_EVALUATOR_SYSTEM).toContain("irritated");
    expect(MOOD_RESPONSE_FORMAT.schema.required).toEqual(MOOD_KEYS);
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
          JSON.stringify({
            irritated: 3,
            amused: 2,
            exhausted: 0,
            curious: 1,
            contemptuous: 1,
            gloomy: 0,
            impatient: 1,
            pleased: 0,
            suspicious: 1,
          }),
      },
    );
    expect(result.mood.irritated).toBe(3);
    expect(result.reason).toBe("Mood updated");
  });
});
