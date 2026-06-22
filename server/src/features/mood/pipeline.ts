import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "../../contracts/index.js";
import type { ModuleLogging } from "../../shared/index.js";
import { evaluateMood, MOOD_EVAL_NUM_PREDICT } from "./evaluate.js";
import { getMoodResponseFormat } from "./prompt.js";
import { normalizeMoodValues, type MoodValues } from "./values.js";
import {
  getEffectiveMood,
  getSettings,
  saveMoodState,
} from "../../pipeline/turn-services.js";

function hostLogging(services: PipelineHostServices): ModuleLogging {
  return {
    logEvent: (event, fields) =>
      services.logging.logEvent(event, fields as Record<string, unknown>),
    logEventError: (event, err, fields) =>
      services.logging.logEventError(
        event,
        err,
        fields as Record<string, unknown>,
      ),
  };
}

export const moodPipelineHost: PipelineModuleHost = {
  id: "mood-evaluation",
  stepId: "mood",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const decayedMood = normalizeMoodValues(getEffectiveMood() as MoodValues);

    const settings = getSettings();
    const thinkingEnabled = Boolean(settings.thinkingEnabled);
    const responseFormat = getMoodResponseFormat(thinkingEnabled);

    const started = performance.now();
    const result = await evaluateMood(
      {
        currentMood: decayedMood,
        personality: state.personalityPrompt ?? "",
        latestMessage: state.latestBody,
        thinkingEnabled,
      },
      {
        baseUrl: services.llm.baseUrl,
        model: services.llm.model,
        apiKey: services.llm.apiKey,
        numPredict: MOOD_EVAL_NUM_PREDICT,
        log: hostLogging(services),
        chatComplete: services.llm.createAuxiliaryChatComplete({
          numPredict: MOOD_EVAL_NUM_PREDICT,
          responseFormat,
          traceTurnId: state.turnId,
          traceLabel: "mood evaluate",
        }),
      },
    );

    const evaluatedMood = result.mood ?? decayedMood;
    saveMoodState(evaluatedMood);
    state.mood = evaluatedMood;

    return {
      status: "ok",
      phaseId: "mood",
      phaseTitle: "Mood",
      summary: "Mood state updated for this reply",
      durationMs: performance.now() - started,
      detail: { type: "mood", traits: evaluatedMood },
    };
  },
};
