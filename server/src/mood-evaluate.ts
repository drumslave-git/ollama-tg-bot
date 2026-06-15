import { chatComplete } from "./llm/client.js";
import { config } from "./config.js";
import { logEvent, logEventError } from "./event-log.js";
import { getResolvedSettings } from "./settings-runtime.js";
import {
  evaluateMood as runMoodEvaluation,
  MOOD_EVAL_NUM_PREDICT,
  MOOD_RESPONSE_FORMAT,
  normalizeMoodValues,
  type MoodEvaluateConfig,
  type MoodEvaluateInput,
  type MoodValues,
} from "@llm-tg-bot/modules-mood-evaluation";

export {
  MOOD_RESPONSE_FORMAT,
  MOOD_EVALUATOR_SYSTEM,
  MOOD_KEYS,
  MOOD_TRAIT_HINTS,
  DEFAULT_MOOD_VALUES,
  moodValuesEqual,
  clampMoodLevel,
  normalizeMoodValues,
  applyMoodCooldown,
  formatMoodForPrompt,
  buildMoodEvaluateMessages,
  parseMoodBlock,
  moodEvaluationModule,
  MOOD_EVAL_NUM_PREDICT,
  type MoodEvaluateInput,
  type MoodEvaluateConfig,
  type MoodEvaluateOutput,
  type MoodParseResult,
  type MoodKey,
  type MoodValues,
} from "@llm-tg-bot/modules-mood-evaluation";

export interface HostMoodEvaluateInput extends MoodEvaluateInput {
  traceTurnId?: number;
}

function buildMoodConfig(traceTurnId?: number): MoodEvaluateConfig {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
    numPredict: MOOD_EVAL_NUM_PREDICT,
    chatComplete: (messages) =>
      chatComplete(messages, {
        numPredict: MOOD_EVAL_NUM_PREDICT,
        auxiliary: true,
        responseFormat: MOOD_RESPONSE_FORMAT,
        traceTurnId,
        traceLabel: "mood evaluate",
      }),
  };
}

export async function evaluateMood(input: HostMoodEvaluateInput): Promise<MoodValues> {
  const fallback = normalizeMoodValues(input.currentMood);

  try {
    const result = await runMoodEvaluation(input, buildMoodConfig(input.traceTurnId));
    logEvent("mood_evaluated", {
      moodSummary: JSON.stringify(result.mood),
      reason: result.reason,
    });
    return result.mood;
  } catch (err) {
    logEventError("mood_evaluate_failed", err);
    return fallback;
  }
}
