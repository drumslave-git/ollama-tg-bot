import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { mediaKindForMessage } from "../history/index.js";
import {
  findReplyMediaMessage,
  getSettings,
  loadVisionFromMessage,
  messageHasVisionMedia,
} from "../../pipeline/turn-services.js";
import { normalizeImageForChat } from "./normalize.js";

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

    // Attach the images to the current turn. The vision-capable model reads
    // them alongside the text in the main reply pass — no separate describe
    // request. Stored history media is captioned to text later by the vision
    // backfill scheduler, keeping long-term history token-light.
    const maxDimension = getSettings().visionMaxDimension;
    const images = loaded.images as { base64: string; mimeHint: string }[];
    const normalized: string[] = [];
    for (const image of images) {
      try {
        normalized.push(await normalizeImageForChat(image.base64, maxDimension));
      } catch {
        // Skip an image we can't decode/resize rather than failing the turn.
      }
    }

    if (normalized.length === 0) {
      return {
        status: "failed",
        phaseId: "vision",
        phaseTitle: "Vision",
        summary: "Could not prepare any image for the model",
      };
    }

    state.images = normalized;

    const sticker = loaded.sourceSticker ?? msg?.sticker;
    const mediaKind = mediaKindForMessage(msg!, !!sticker);

    if (visionFromReply) {
      const mediaNote = `The user is asking about an ${mediaKind} they replied to (shown with this message).`;
      state.replyContext = state.replyContext
        ? `${state.replyContext}\n\n${mediaNote}`
        : mediaNote;
    } else if (!state.latestBody.trim()) {
      state.latestBody = "Respond to this.";
    }

    return {
      status: "ok",
      phaseId: "vision",
      phaseTitle: "Vision",
      summary: `Attached ${normalized.length} ${mediaKind} image(s) to the reply`,
    };
  },
};
