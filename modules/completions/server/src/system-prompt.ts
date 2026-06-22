import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";

export const systemPromptHost: PipelineModuleHost = {
  id: "completions",
  stepId: "system",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const build = services.callbacks.buildSystemPromptForTurn;
    if (!build) {
      return {
        status: "failed",
        phaseId: "system",
        phaseTitle: "System prompt",
        summary: "System prompt builder not configured",
      };
    }

    const started = performance.now();
    state.systemPromptContent = build(state);

    return {
      status: "ok",
      phaseId: "system",
      phaseTitle: "System prompt",
      summary: `${state.systemPromptContent.length} chars`,
      durationMs: performance.now() - started,
    };
  },
};
