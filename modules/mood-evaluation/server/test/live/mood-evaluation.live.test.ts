import { describe, expect, it } from "vitest";
import {
  buildMoodEvaluateMessages,
  evaluateMood,
  parseMoodBlock,
  DEFAULT_MOOD_VALUES,
  MOOD_KEYS,
  type MoodValues,
} from "../../src/index.js";

interface LiveConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  const baseUrl = rawBase.replace(/\/v1\/?$/, "");
  return {
    baseUrl,
    model,
    apiKey: (process.env.LLM_API_KEY ?? "").trim() || "not-needed",
  };
}

const cfg = liveConfig();

function llmConfig() {
  return {
    baseUrl: cfg!.baseUrl,
    model: cfg!.model,
    apiKey: cfg!.apiKey,
  };
}

function isValidMood(mood: MoodValues): boolean {
  return MOOD_KEYS.every((k) => {
    const v = mood[k];
    return Number.isInteger(v) && v >= 0 && v <= 5;
  });
}

describe.skipIf(!cfg)("live: mood-evaluation module", () => {
  it("returns all nine traits as integers within 0-5", async () => {
    const result = await evaluateMood(
      {
        currentMood: DEFAULT_MOOD_VALUES,
        historyText: "",
        latestTurn: "Could you help me with a quick question?",
      },
      llmConfig(),
    );
    for (const key of MOOD_KEYS) {
      expect(result.mood, `missing trait ${key}`).toHaveProperty(key);
    }
    expect(isValidMood(result.mood)).toBe(true);
  });

  it("raises irritation/contempt when the user is hostile", async () => {
    const baseline = { ...DEFAULT_MOOD_VALUES, irritated: 1, contemptuous: 1 };
    const result = await evaluateMood(
      {
        currentMood: baseline,
        historyText: "",
        latestTurn:
          "[user:troll:9 said] you are a useless garbage bot and everyone hates you",
      },
      llmConfig(),
    );
    expect(isValidMood(result.mood)).toBe(true);
    const hostility =
      result.mood.irritated +
      result.mood.contemptuous +
      result.mood.impatient +
      result.mood.suspicious;
    const baseHostility =
      baseline.irritated +
      baseline.contemptuous +
      baseline.impatient +
      baseline.suspicious;
    expect(
      hostility,
      "hostile input should not lower the negative traits",
    ).toBeGreaterThanOrEqual(baseHostility);
  });

  it("builds messages with the JSON format reminder", () => {
    const messages = buildMoodEvaluateMessages({
      currentMood: DEFAULT_MOOD_VALUES,
      historyText: "",
      latestTurn: "hi",
    });
    expect(messages[1].content).toContain("Return JSON");
  });

  it("parses well-formed JSON from content field shape", async () => {
    const parsed = parseMoodBlock(
      JSON.stringify({
        irritated: 2,
        exhausted: 0,
        amused: 1,
        curious: 1,
        contemptuous: 1,
        gloomy: 0,
        impatient: 1,
        pleased: 0,
        suspicious: 1,
      }),
      DEFAULT_MOOD_VALUES,
    );
    expect(parsed.reason).toBe("Mood updated");
    expect(parsed.mood.irritated).toBe(2);
  });
});
