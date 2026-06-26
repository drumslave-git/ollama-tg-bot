import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { getActivePersonalityPrompt } from "../../pipeline/turn-services.js";

export const personalityHost: PipelineModuleHost = {
  id: "mood-evaluation",
  stepId: "personality",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state): Promise<PipelineStepResult> {
    const started = performance.now();
    state.personalityPrompt = await getActivePersonalityPrompt();

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
