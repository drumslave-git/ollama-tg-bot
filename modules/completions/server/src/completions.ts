import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import {
  extractTelegramReply,
  getMainReplyResponseFormat,
  MAIN_REPLY_RESPONSE_FORMAT,
} from "./response-format.js";

export const completionsHost: PipelineModuleHost = {
  id: "completions",
  stepId: "completions",
  phase: "reply",
  order: 0,
  alwaysOn: true,

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
    state.chatMessages = built.messages;
    state.systemContent = built.systemContent;
    state.historyMessages = built.historyMessages;
    state.latestContent = built.latestContent;
    state.storedHistoryCount = built.storedHistoryCount;

    const report = services.getReport(state.turnId);
    const injectedChars = (built.historyMessages as { content?: string }[]).reduce(
      (n, m) => n + String(m.content ?? "").length,
      0,
    );
    report?.okPhase(
      "context",
      "Chat context",
      `${built.historyMessages.length} history messages · ${injectedChars} chars injected`,
      undefined,
      {
        type: "fields",
        fields: [
          {
            label: "Stored messages",
            value: String(built.storedHistoryCount),
          },
          {
            label: "Injected messages",
            value: String(built.historyMessages.length),
          },
          { label: "Injected chars", value: String(injectedChars) },
          { label: "Latest turn chars", value: String(built.latestContent.length) },
        ],
      },
    );

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

    const { raw: modelOutput, thinking } = await complete(built.messages);
    state.thinking = thinking;

    if (thinkingEnabled) {
      if (thinking) {
        report?.okPhase(
          "reasoning",
          "Model reasoning",
          `${thinking.length} chars returned`,
        );
      } else {
        report?.skipPhase(
          "reasoning",
          "Model reasoning",
          "No separate reasoning field in API response",
        );
      }
    }

    const replyBody = extractTelegramReply(modelOutput);
    state.replyBody = replyBody;

    if (!replyBody.trim()) {
      return {
        status: "failed",
        phaseId: "completions",
        phaseTitle: "Completions",
        summary: "Model response had no reply content",
        durationMs: performance.now() - started,
      };
    }

    return {
      status: "ok",
      phaseId: "completions",
      phaseTitle: "Completions",
      summary: `${replyBody.length} chars`,
      durationMs: performance.now() - started,
    };
  },
};
