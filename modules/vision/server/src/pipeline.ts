import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import {
  buildMediaHistoryContent,
  buildTextHistoryContent,
  mediaKindForMessage,
} from "@llm-tg-bot/modules-history";

function buildVisionTurnBody(
  messageText: string,
  mediaKind: string,
  visionDescription: string,
): string {
  const mediaNote = `The user sent a ${mediaKind}: ${visionDescription}`;
  return [messageText, mediaNote].filter(Boolean).join("\n\n");
}

export const visionPreprocessHost: PipelineModuleHost = {
  id: "vision",
  stepId: "vision",
  phase: "preprocess",
  order: 5,
  alwaysOn: true,

  async run(state, services): Promise<PipelineStepResult> {
    const cb = services.callbacks;
    const msg = state.telegram.message as Message | undefined;
    const botToken = state.telegram.botToken;
    const botId = state.telegram.me?.id;
    const from = state.telegram.from;
    const inGroup = state.inGroup;
    const messageText = state.latestBody;
    const msgLog = {
      turnId: state.turnId,
      chatId: state.chatId,
      convKey: state.convKey,
    };

    if (inGroup) {
      if (!cb.messageHasVisionMedia?.(msg)) {
        if (!messageText.trim() || messageText === "(non-text message)") {
          state.latestBody = "Respond to this.";
        }
        return {
          status: "skipped",
          phaseId: "vision",
          phaseTitle: "Vision",
          summary: "No vision media",
        };
      }

      const loaded = await cb.loadVisionFromMessage?.(botToken, msg);
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
        return {
          status: "skipped",
          phaseId: "vision",
          phaseTitle: "Vision",
          summary: "No images loaded",
        };
      }

      const visionDescription = await cb.describeVisionImages?.(
        loaded.images,
        msgLog,
        loaded.visionHint,
        state.turnId,
      );
      if (!visionDescription) {
        return {
          status: "failed",
          phaseId: "vision",
          phaseTitle: "Vision",
          summary: "Vision describe failed",
        };
      }

      const sticker = loaded.sourceSticker ?? msg?.sticker;
      const mediaKind = mediaKindForMessage(msg!, !!sticker);
      const mediaHistory = buildMediaHistoryContent(
        from as never,
        msg!,
        mediaKind,
        visionDescription,
        botId,
        cb.stickerPackEmoji?.(sticker) ?? null,
      );
      if (mediaHistory) {
        state.userHistoryContent = mediaHistory;
        services.logging.logEvent("vision_stored", {
          ...msgLog,
          mediaKind,
          chars: visionDescription.length,
        });
      }
      state.latestBody = buildVisionTurnBody(
        messageText,
        mediaKind,
        visionDescription,
      );
      if (!state.latestBody.trim()) {
        state.latestBody = "Respond to this.";
      }

      return {
        status: "ok",
        phaseId: "vision",
        phaseTitle: "Vision",
        summary: `Stored ${mediaKind} description (${visionDescription.length} chars)`,
      };
    }

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

    let visionDescription = "";
    if (loaded.images.length > 0) {
      visionDescription =
        (await cb.describeVisionImages?.(
          loaded.images,
          { ...msgLog, fromReply: visionFromReply },
          loaded.visionHint,
          state.turnId,
        )) ?? "";
    }

    const sticker = loaded.sourceSticker ?? msg?.sticker;
    const mediaOnCurrentMessage = cb.messageHasVisionMedia?.(msg);
    const mediaKind = mediaKindForMessage(
      msg!,
      !!sticker || !!loaded.sourceSticker,
    );

    if (visionDescription && mediaOnCurrentMessage) {
      const mediaHistory = buildMediaHistoryContent(
        from as never,
        msg!,
        mediaKind,
        visionDescription,
        botId,
        cb.stickerPackEmoji?.(sticker) ?? null,
      );
      if (mediaHistory) {
        state.userHistoryContent = mediaHistory;
        state.skipUserHistory = false;
        services.logging.logEvent("vision_stored", {
          ...msgLog,
          mediaKind,
          fromReply: visionFromReply,
          chars: visionDescription.length,
        });
      }
      state.latestBody = buildVisionTurnBody(
        messageText,
        mediaKind,
        visionDescription,
      );
    } else if (visionDescription && visionFromReply) {
      const mediaNote = `The user is asking about an ${mediaKind} they replied to: ${visionDescription}`;
      state.latestBody = [messageText, mediaNote].filter(Boolean).join("\n\n");
      const mediaNoteCtx = `Replied-to ${mediaKind}: ${visionDescription}`;
      state.replyContext = state.replyContext
        ? `${state.replyContext}\n\n${mediaNoteCtx}`
        : mediaNoteCtx;
    } else {
      const textHistory = buildTextHistoryContent(
        from as never,
        msg!,
        messageText,
        botId,
      );
      if (textHistory) {
        state.userHistoryContent = textHistory;
        state.skipUserHistory = false;
      }
      state.latestBody = messageText || "(non-text message)";
    }

    if (state.memoryInput && typeof state.memoryInput === "object") {
      state.memoryInput = {
        ...state.memoryInput,
        userMessage: state.latestBody,
        replyContext: state.replyContext,
      };
    }

    return {
      status: visionDescription ? "ok" : "skipped",
      phaseId: "vision",
      phaseTitle: "Vision",
      summary: visionDescription
        ? `Processed ${mediaKind}`
        : "No vision content",
    };
  },
};
