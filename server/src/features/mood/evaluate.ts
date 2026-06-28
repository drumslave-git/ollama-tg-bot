import {
  auxiliaryChatComplete,
  type ChatMessage,
  type FeatureDefinition,
  type FeatureLogging,
} from "../../shared/index.js";
import {
  buildMoodEvaluateMessages,
  getMoodResponseFormat,
  parseMoodBlock,
  type MoodEvaluateInput,
} from "./prompt.js";
import { normalizeMoodValues, type MoodValues } from "./values.js";

export const MOOD_EVAL_NUM_PREDICT = 192;

export interface MoodEvaluateConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  numPredict?: number;
  log?: FeatureLogging;
  /**
   * Optional host-provided completion (e.g. debug tracing).
   * When set, `baseUrl` / `model` / `apiKey` are ignored for the LLM call.
   */
  chatComplete?: (messages: ChatMessage[]) => Promise<string>;
}

export interface MoodEvaluateOutput {
  mood: MoodValues;
  reason: string;
}

export async function evaluateMood(
  input: MoodEvaluateInput,
  config: MoodEvaluateConfig,
): Promise<MoodEvaluateOutput> {
  const fallback = normalizeMoodValues(input.currentMood);
  const messages = buildMoodEvaluateMessages(input);

  const responseFormat = getMoodResponseFormat();

  try {
    const raw = config.chatComplete
      ? await config.chatComplete(messages)
      : await auxiliaryChatComplete(
          {
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
          },
          messages,
          {
            numPredict: config.numPredict ?? MOOD_EVAL_NUM_PREDICT,
            responseFormat,
          },
        );
    const parsed = parseMoodBlock(raw, fallback);
    config.log?.logEvent?.("mood_evaluated", {
      moodSummary: JSON.stringify(parsed.mood),
      reason: parsed.reason,
    });
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    config.log?.logEventError?.("mood_evaluate_failed", err);
    return {
      mood: fallback,
      reason: `LLM request failed: ${message}`,
    };
  }
}

export const moodEvaluationFeature: FeatureDefinition<
  MoodEvaluateInput,
  MoodEvaluateConfig,
  MoodEvaluateOutput
> = {
  id: "mood-evaluation",
  run: evaluateMood,
};
