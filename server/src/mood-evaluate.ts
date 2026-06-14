import { chatComplete } from "./llm/client.js";
import { logEvent, logEventError } from "./event-log.js";
import { normalizeMoodValues, type MoodValues } from "./mood.js";
import {
  buildMoodEvaluateMessages,
  parseMoodBlock,
  type MoodEvaluateInput,
} from "./mood-prompt.js";

export {
  MOOD_EVALUATOR_SYSTEM,
  buildMoodEvaluateMessages,
  parseMoodBlock,
  type MoodEvaluateInput,
} from "./mood-prompt.js";

const MOOD_EVAL_NUM_PREDICT = 192;

export async function evaluateMood(
  input: MoodEvaluateInput,
): Promise<MoodValues> {
  const fallback = normalizeMoodValues(input.currentMood);
  const messages = buildMoodEvaluateMessages(input);

  try {
    const raw = await chatComplete(messages, {
      numPredict: MOOD_EVAL_NUM_PREDICT,
      auxiliary: true,
      traceTurnId: input.traceTurnId,
      traceLabel: "mood evaluate",
    });
    const evaluated = parseMoodBlock(raw, fallback);
    logEvent("mood_evaluated", {
      moodSummary: JSON.stringify(evaluated),
    });
    return evaluated;
  } catch (err) {
    logEventError("mood_evaluate_failed", err);
    return fallback;
  }
}
