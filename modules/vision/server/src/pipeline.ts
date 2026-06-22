import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import {
  isBase64MediaHistoryContent,
  mediaKindForMessage,
  replaceBase64WithVisionDescription,
} from "@llm-tg-bot/modules-history";

function buildVisionTurnBody(
  messageText: string,
  mediaKind: string,
  visionDescription: string,
): string {
  const mediaNote = `The user sent a ${mediaKind}: ${visionDescription}`;
  return [messageText, mediaNote].filter(Boolean).join("\n\n");
}

export const visionReplyHost: PipelineModuleHost = {
  id: "vision",
  stepId: "vision",
  alwaysOn: true,
  debugTitle: "Vision",

  shouldRun(state, services) {
    if (!state.shouldReply) return false;
    const msg = state.telegram.message as Message | undefined;
    if (services.callbacks.messageHasVisionMedia?.(msg)) return true;
    if (services.callbacks.findReplyMediaMessage?.(msg)) return true;
    return false;
  },

  async run(state, services): Promise<PipelineStepResult> {
    const cb = services.callbacks;
    const msg = state.telegram.message as Message | undefined;
    const botToken = state.telegram.botToken;
    const botId = state.telegram.me?.id;
    const from = state.telegram.from;
    const messageText = state.latestBody;
    const msgLog = {
      turnId: state.turnId,
      chatId: state.chatId,
      convKey: state.convKey,
    };

    let visionFromReply = false;
    let loaded = await cb.loadVisionFromMessage?.(botToken, msg);
    if (!loaded) {
      return {
        status: "skipped",
        phaseId: "vision",
        phaseTitle: "Vision",
        summary: "Vision loader unavailable",
      };
    }

    if (loaded.unavailableText) {
      state.earlyReply = loaded.unavailableText;
      return {
        status: "failed",
        phaseId: "vision",
        phaseTitle: "Vision",
        summary: "Vision model unavailable",
      };
    }

    if (loaded.images.length === 0) {
      const replyMediaMsg = cb.findReplyMediaMessage?.(msg) as Message | undefined;
      if (replyMediaMsg) {
        const replyLoaded = await cb.loadVisionFromMessage?.(
          botToken,
          replyMediaMsg,
        );
        if (replyLoaded?.unavailableText) {
          state.earlyReply = replyLoaded.unavailableText;
          return {
            status: "failed",
            phaseId: "vision",
            phaseTitle: "Vision",
            summary: "Vision model unavailable (replied-to media)",
          };
        }
        if (replyLoaded && replyLoaded.images.length > 0) {
          loaded = replyLoaded;
          visionFromReply = true;
        }
      }
    }

    if (loaded.images.length === 0) {
      return {
        status: "skipped",
        phaseId: "vision",
        phaseTitle: "Vision",
        summary: "No vision media",
      };
    }

    const visionDescription =
      (await cb.describeVisionImages?.(
        loaded.images,
        { ...msgLog, fromReply: visionFromReply },
        loaded.visionHint,
        state.turnId,
      )) ?? "";

    if (!visionDescription) {
      return {
        status: "failed",
        phaseId: "vision",
        phaseTitle: "Vision",
        summary: "Vision describe failed",
      };
    }

    const sticker = loaded.sourceSticker ?? msg?.sticker;
    const mediaOnCurrentMessage = cb.messageHasVisionMedia?.(msg);
    const mediaKind = mediaKindForMessage(
      msg!,
      !!sticker || !!loaded.sourceSticker,
    );

    if (visionDescription && mediaOnCurrentMessage) {
      state.latestBody = buildVisionTurnBody(
        messageText,
        mediaKind,
        visionDescription,
      );
      if (!state.latestBody.trim()) {
        state.latestBody = "Respond to this.";
      }
    } else if (visionDescription && visionFromReply) {
      const mediaNote = `The user is asking about an ${mediaKind} they replied to: ${visionDescription}`;
      state.latestBody = [messageText, mediaNote].filter(Boolean).join("\n\n");
      const mediaNoteCtx = `Replied-to ${mediaKind}: ${visionDescription}`;
      state.replyContext = state.replyContext
        ? `${state.replyContext}\n\n${mediaNoteCtx}`
        : mediaNoteCtx;
    }

    if (state.convKey && mediaOnCurrentMessage) {
      cb.mapHistoryBase64Media?.(
        state.convKey,
        isBase64MediaHistoryContent,
        (content) =>
          replaceBase64WithVisionDescription(content, visionDescription),
      );
    }

    if (state.memoryInput && typeof state.memoryInput === "object") {
      state.memoryInput = {
        ...state.memoryInput,
        userMessage: state.latestBody,
        replyContext: state.replyContext,
      };
    }

    return {
      status: "ok",
      phaseId: "vision",
      phaseTitle: "Vision",
      summary: `Processed ${mediaKind} (${visionDescription.length} chars)`,
    };
  },
};

/** @deprecated Use visionReplyHost */
export const visionPreprocessHost = visionReplyHost;
