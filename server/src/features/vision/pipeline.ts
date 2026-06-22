import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import {
  isBase64MediaHistoryContent,
  mediaKindForMessage,
  replaceBase64WithVisionDescription,
} from "../history/index.js";
import {
  describeVisionImages,
  findReplyMediaMessage,
  loadVisionFromMessage,
  mapHistoryBase64Media,
  messageHasVisionMedia,
} from "../../pipeline/turn-services.js";

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

  shouldRun(state) {
    if (!state.shouldReply) return false;
    const msg = state.telegram.message as Message | undefined;
    if (messageHasVisionMedia(msg)) return true;
    if (findReplyMediaMessage(msg)) return true;
    return false;
  },

  async run(state): Promise<PipelineStepResult> {
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
    let loaded = await loadVisionFromMessage(botToken, msg);
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
      const replyMediaMsg = findReplyMediaMessage(msg) as Message | undefined;
      if (replyMediaMsg) {
        const replyLoaded = await loadVisionFromMessage(
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

    const visionDescription = await describeVisionImages(
      loaded.images,
      { ...msgLog, fromReply: visionFromReply },
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
    const mediaOnCurrentMessage = messageHasVisionMedia(msg);
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
      mapHistoryBase64Media(
        state.convKey,
        isBase64MediaHistoryContent,
        (content) =>
          replaceBase64WithVisionDescription(content, visionDescription),
      );
    }

    return {
      status: "ok",
      phaseId: "vision",
      phaseTitle: "Vision",
      summary: `Processed ${mediaKind} (${visionDescription.length} chars)`,
    };
  },
};
