import {
  evaluateMood as runMoodEvaluation,
  MOOD_EVAL_NUM_PREDICT,
  MOOD_RESPONSE_FORMAT,
  normalizeMoodValues,
  type MoodEvaluateInput,
  type MoodValues,
} from "@llm-tg-bot/modules-mood-evaluation";
import {
  hostAuxiliaryChatComplete,
  hostLlmConfig,
  hostLogging,
} from "./module-host.js";

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
  type MoodEvaluateConfig,
  type MoodEvaluateOutput,
  type MoodParseResult,
  type MoodKey,
  type MoodValues,
} from "@llm-tg-bot/modules-mood-evaluation";

export interface HostMoodEvaluateInput extends MoodEvaluateInput {
  traceTurnId?: number;
}

export async function evaluateMood(input: HostMoodEvaluateInput): Promise<MoodValues> {
  const fallback = normalizeMoodValues(input.currentMood);
  const result = await runMoodEvaluation(input, {
    ...hostLlmConfig(),
    numPredict: MOOD_EVAL_NUM_PREDICT,
    log: hostLogging(),
    chatComplete: hostAuxiliaryChatComplete({
      numPredict: MOOD_EVAL_NUM_PREDICT,
      responseFormat: MOOD_RESPONSE_FORMAT,
      traceTurnId: input.traceTurnId,
      traceLabel: "mood evaluate",
    }),
  });
  return result.mood ?? fallback;
}
