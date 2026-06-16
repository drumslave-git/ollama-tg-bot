import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";

export const personalityHost: PipelineModuleHost = {
  id: "mood-evaluation",
  stepId: "personality",
  phase: "pre-reply",
  order: 50,
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const getPrompt = services.callbacks.getActivePersonalityPrompt;
    if (!getPrompt) {
      return {
        status: "failed",
        phaseId: "personality",
        phaseTitle: "Personality",
        summary: "Personality callback not configured",
      };
    }

    const started = performance.now();
    state.personalityPrompt = getPrompt();

    return {
      status: "ok",
      phaseId: "personality",
      phaseTitle: "Personality",
      summary: state.personalityPrompt
        ? `${state.personalityPrompt.length} chars`
        : "Default (empty)",
      durationMs: performance.now() - started,
    };
  },
};
