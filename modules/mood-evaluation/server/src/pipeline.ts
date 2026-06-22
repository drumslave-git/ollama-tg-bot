import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import { evaluateMood, MOOD_EVAL_NUM_PREDICT } from "./evaluate.js";
import { getMoodResponseFormat } from "./prompt.js";
import { normalizeMoodValues, type MoodValues } from "./values.js";

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
    const getMood = services.callbacks.getEffectiveMood;
    const saveMood = services.callbacks.saveMoodState;
    if (!getMood || !saveMood) {
      return {
        status: "failed",
        phaseId: "mood",
        phaseTitle: "Mood",
        summary: "Mood callbacks not configured",
      };
    }

    const decayedMood = normalizeMoodValues(getMood() as MoodValues);

    const settings = services.callbacks.getSettings?.() ?? {};
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
    saveMood(evaluatedMood);
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
