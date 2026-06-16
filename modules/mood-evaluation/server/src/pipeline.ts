import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import { evaluateMood, MOOD_EVAL_NUM_PREDICT } from "./evaluate.js";
import { MOOD_RESPONSE_FORMAT } from "./prompt.js";
import { normalizeMoodValues, type MoodValues } from "./values.js";
import { personalityHost } from "./personality-pipeline.js";

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
  phase: "pre-reply",
  order: 70,
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
    const moodContextText = state.moodContextText ?? "";
    const moodLatestTurnPreview =
      state.moodLatestTurnPreview ??
      [state.replyContext, state.latestBody].filter(Boolean).join("\n\n");

    const started = performance.now();
    const result = await evaluateMood(
      {
        currentMood: decayedMood,
        historyText: moodContextText,
        latestTurn: moodLatestTurnPreview,
      },
      {
        baseUrl: services.llm.baseUrl,
        model: services.llm.model,
        apiKey: services.llm.apiKey,
        numPredict: MOOD_EVAL_NUM_PREDICT,
        log: hostLogging(services),
        chatComplete: services.llm.createAuxiliaryChatComplete({
          numPredict: MOOD_EVAL_NUM_PREDICT,
          responseFormat: MOOD_RESPONSE_FORMAT,
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

export const pipelineHost = moodPipelineHost;
export const pipelineHosts = [personalityHost, moodPipelineHost];
