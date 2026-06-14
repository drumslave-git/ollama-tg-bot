import { describe, expect, it } from "vitest";
import {
  buildMoodEvaluateMessages,
  parseMoodBlock,
} from "../../src/mood-prompt.js";
import {
  DEFAULT_MOOD_VALUES,
  MOOD_KEYS,
  type MoodValues,
} from "../../src/mood.js";
import { liveClient, liveConfig, runAuxiliary } from "./helpers.js";

const cfg = liveConfig();

async function evaluate(latestTurn: string, current = DEFAULT_MOOD_VALUES) {
  const client = liveClient(cfg!);
  const messages = buildMoodEvaluateMessages({
    currentMood: current,
    historyText: "",
    latestTurn,
  });
  const { content } = await runAuxiliary(client, cfg!.model, messages, {
    numPredict: 192,
  });
  return parseMoodBlock(content, current);
}

function isValidMood(mood: MoodValues): boolean {
  return MOOD_KEYS.every((k) => {
    const v = mood[k];
    return Number.isInteger(v) && v >= 0 && v <= 5;
  });
}

describe.skipIf(!cfg)("live: mood evaluation", () => {
  it("returns all nine traits as integers within 0-5", async () => {
    const mood = await evaluate("Could you help me with a quick question?");
    for (const key of MOOD_KEYS) {
      expect(mood, `missing trait ${key}`).toHaveProperty(key);
    }
    expect(isValidMood(mood)).toBe(true);
  });

  it("raises irritation/contempt when the user is hostile", async () => {
    const baseline = { ...DEFAULT_MOOD_VALUES, irritated: 1, contemptuous: 1 };
    const mood = await evaluate(
      "[user:troll:9 said] you are a useless garbage bot and everyone hates you",
      baseline,
    );
    expect(isValidMood(mood)).toBe(true);
    const hostility =
      mood.irritated + mood.contemptuous + mood.impatient + mood.suspicious;
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
});
