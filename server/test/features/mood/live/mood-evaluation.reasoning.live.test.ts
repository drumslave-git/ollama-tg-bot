import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOOD_VALUES,
  getMoodResponseFormat,
  MOOD_KEYS,
  type MoodValues,
} from "../../../../src/features/mood/index.js";
import { liveConfig, liveReasoningMode, runLiveMoodEvaluation } from "./helpers.js";

const cfg = liveConfig();

function isValidMood(mood: MoodValues): boolean {
  return MOOD_KEYS.every((k) => {
    const v = mood[k];
    return Number.isInteger(v) && v >= 0 && v <= 5;
  });
}

describe.skipIf(!cfg || !liveReasoningMode())(
  "live: mood-evaluation feature (reasoning)",
  () => {
    it("uses json_schema without a reasoning field while thinking is on", () => {
      const format = getMoodResponseFormat();
      expect(format.schema.required).not.toContain("reasoning");
      expect(format.schema.required).toContain("irritated");
    });

    it("returns all nine traits when thinking is enabled", async () => {
      const result = await runLiveMoodEvaluation(
        cfg!,
        { latestMessage: "Could you help me with a quick question?" },
      );
      for (const key of MOOD_KEYS) {
        expect(result.mood, `missing trait ${key}`).toHaveProperty(key);
      }
      expect(isValidMood(result.mood)).toBe(true);
      expect(result.reason).toBe("Mood updated");
    });

    it("raises irritation/contempt for hostile input when thinking is on", async () => {
      const baseline = { ...DEFAULT_MOOD_VALUES, irritated: 1, contemptuous: 1 };
      const result = await runLiveMoodEvaluation(
        cfg!,
        {
          currentMood: baseline,
          personality: "Sharp-tongued and easily annoyed",
          latestMessage:
            "[user:troll:9 said] you are a useless garbage bot and everyone hates you",
        },
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
  },
);
