import type {
  PipelineFeatureHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { buildSystemPromptForTurn } from "../../pipeline/turn-services.js";
import { captureTaskTurnContext } from "../tasks/index.js";
import { captureBrowserTurnContext } from "../web-browse/index.js";

export const systemPromptHost: PipelineFeatureHost = {
  id: "completions",
  stepId: "system",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state): Promise<PipelineStepResult> {
    const started = performance.now();
    // Bind tasks + browser-agent tool context to this turn before the tool loop.
    await captureTaskTurnContext(state);
    captureBrowserTurnContext(state);
    const systemPromptContent = await buildSystemPromptForTurn(state);

    return {
      status: "ok",
      phaseId: "system",
      phaseTitle: "System prompt",
      summary: `${systemPromptContent.length} chars`,
      durationMs: performance.now() - started,
    };
  },
};
