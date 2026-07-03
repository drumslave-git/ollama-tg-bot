import type {
  PipelineFeatureHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { extractTelegramReply } from "./response-format.js";
import {
  buildChatContextForTurn,
  replyAddressesOtherParticipant,
} from "../../pipeline/turn-services.js";

export const completionsHost: PipelineFeatureHost = {
  id: "completions",
  stepId: "completions",
  alwaysOn: true,
  debugTitle: "Main reply",

  shouldRun(state) {
    return Boolean(state.shouldReply);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const createMain = services.llm.createMainChatComplete;
    if (!createMain) {
      return {
        status: "failed",
        phaseId: "completions",
        phaseTitle: "Completions",
        summary: "Completion services not configured",
      };
    }

    const started = performance.now();
    const built = await buildChatContextForTurn(state);

    const report = services.getReport(state.turnId);

    services.logging.logEvent("llm_reply_started", {
      turnId: state.turnId,
      chatId: state.chatId,
      convKey: state.convKey,
    });

    const complete = createMain({
      think: true,
      // Plain-text main reply: no JSON schema. Grammar-constrained decoding can
      // push weaker models into repetition loops.
      responseFormat: undefined,
      traceTurnId: state.turnId,
      traceLabel: "main reply",
      traceLayout: {
        system: built.systemContent,
        latest: built.latestContent,
      },
    });

    const { raw: modelOutput, thinking, webSearchSources, generatedImages } =
      await complete(built.messages);
    state.thinking = thinking;
    if (webSearchSources?.length) {
      state.webSearchSources = webSearchSources;
    }
    if (generatedImages?.length) {
      state.generatedImages = generatedImages;
    }

    const replyBody = extractTelegramReply(modelOutput);
    state.replyBody = replyBody;
    const hasImages = (state.generatedImages?.length ?? 0) > 0;

    // Dynamic delivery: thread the reply to the speaker's message when it
    // answers them; send a plain message when it addresses someone else (a
    // referral like "tell userB to stop" → "@userB stop"). In private chats
    // there is no third party, so always thread.
    if (state.inGroup && replyBody.trim()) {
      const from = state.telegram.from as { username?: string } | undefined;
      const addressesOther = await replyAddressesOtherParticipant(replyBody, {
        botId: state.telegram.me?.id,
        botUsername: state.telegram.me?.username,
        senderId: state.userId ? Number(state.userId) : undefined,
        senderUsername: from?.username,
      });
      state.threadReply = !addressesOther;
    } else {
      state.threadReply = true;
    }

    // An image-only turn (model generated an image and returned no text) is a
    // valid reply — the photo is delivered separately from state.generatedImages.
    if (!replyBody.trim() && !hasImages) {
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
