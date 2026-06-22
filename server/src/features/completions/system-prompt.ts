import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { buildSystemPromptForTurn } from "../../pipeline/turn-services.js";

export const systemPromptHost: PipelineModuleHost = {
  id: "completions",
  stepId: "system",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state): Promise<PipelineStepResult> {
    const started = performance.now();
    const systemPromptContent = buildSystemPromptForTurn(state);

    return {
      status: "ok",
      phaseId: "system",
      phaseTitle: "System prompt",
      summary: `${systemPromptContent.length} chars`,
      durationMs: performance.now() - started,
    };
  },
};
