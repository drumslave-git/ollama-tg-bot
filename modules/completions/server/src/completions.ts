import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import {
  extractTelegramReply,
  getMainReplyResponseFormat,
} from "./response-format.js";

export const completionsHost: PipelineModuleHost = {
  id: "completions",
  stepId: "completions",
  alwaysOn: true,
  debugTitle: "Main reply",

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const buildContext = services.callbacks.buildChatContextForTurn;
    const createMain = services.llm.createMainChatComplete;
    if (!buildContext || !createMain) {
      return {
        status: "failed",
        phaseId: "completions",
        phaseTitle: "Completions",
        summary: "Completion services not configured",
      };
    }

    const started = performance.now();
    const built = buildContext(state);

    const report = services.getReport(state.turnId);

    services.logging.logEvent("llm_reply_started", {
      turnId: state.turnId,
      chatId: state.chatId,
      convKey: state.convKey,
    });

    const settings = services.callbacks.getSettings?.() ?? {};
    const thinkingEnabled = Boolean(settings.thinkingEnabled);

    const complete = createMain({
      think: true,
      responseFormat: getMainReplyResponseFormat(thinkingEnabled),
      traceTurnId: state.turnId,
      traceLabel: "main reply",
      traceLayout: {
        system: built.systemContent,
        history: built.historyMessages,
        latest: built.latestContent,
      },
    });

    const { raw: modelOutput, thinking, webSearchSources } =
      await complete(built.messages);
    state.thinking = thinking;
    if (webSearchSources?.length) {
      state.webSearchSources = webSearchSources;
    }

    const replyBody = extractTelegramReply(modelOutput);
    state.replyBody = replyBody;

    if (!replyBody.trim()) {
      report?.failPhase(
        "completions",
        "Main reply",
        "Model response had no reply content",
        performance.now() - started,
      );
      return {
        status: "failed",
        phaseId: "completions",
        phaseTitle: "Main reply",
        summary: "Model response had no reply content",
        durationMs: performance.now() - started,
      };
    }

    return {
      status: "ok",
      phaseId: "completions",
      phaseTitle: "Main reply",
      summary: `${replyBody.length} chars · ${built.historyMessages.length} history messages`,
      durationMs: performance.now() - started,
    };
  },
};
