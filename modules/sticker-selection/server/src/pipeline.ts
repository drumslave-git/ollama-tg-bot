import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import type { StickerCatalog } from "./types.js";
import {
  analyzeStickerForReply,
  STICKER_CHECK_NUM_PREDICT,
} from "./analyze.js";
import { getStickerResponseFormat } from "./prompt.js";
import { rollStickerReplyChance } from "./chance.js";
import { resolveStickerFileId } from "./resolve.js";

function hostLogging(services: PipelineHostServices): ModuleLogging {
  return {
    logEvent: (event, fields) =>
      services.logging.logEvent(event, fields as Record<string, unknown>),
    logEventError: (event, err, fields) =>
      services.logging.logEventError(
        event,
        err,
        fields as Record<string, unknown>,
      ),
  };
}

export const pipelineHost: PipelineModuleHost = {
  id: "sticker-selection",
  stepId: "sticker",
  phase: "post-reply",
  order: 10,

  shouldRun(state) {
    return Boolean(state.shouldReply && state.replyBody?.trim());
  },

  async run(state, services): Promise<PipelineStepResult> {
    const settings = services.callbacks.getSettings?.() ?? {};
    const stickersEnabled = Boolean(settings.stickersEnabled);
    if (!stickersEnabled) {
      return {
        status: "skipped",
        phaseId: "sticker",
        phaseTitle: "Sticker",
        summary: "Stickers disabled",
      };
    }

    const chance = Number(settings.stickerReplyChance ?? 0);
    const thinkingEnabled = Boolean(settings.thinkingEnabled);
    const responseFormat = getStickerResponseFormat(thinkingEnabled);
    const roll = rollStickerReplyChance(chance);
    if (!roll.hit) {
      return {
        status: "skipped",
        phaseId: "sticker",
        phaseTitle: "Sticker",
        summary: `Chance ${roll.chance}% not hit`,
      };
    }

    const catalog = services.callbacks.getStickerCatalog?.() as
      | StickerCatalog
      | undefined;
    if (!catalog) {
      return {
        status: "skipped",
        phaseId: "sticker",
        phaseTitle: "Sticker",
        summary: "Sticker catalog not available",
      };
    }

    const started = performance.now();
    const stickerEmoji = await analyzeStickerForReply(
      {
        botReply: state.replyBody ?? "",
        message: state.latestBody,
        replyContext: state.replyContext,
        catalog,
        traceTurnId: state.turnId,
        thinkingEnabled,
      },
      {
        baseUrl: services.llm.baseUrl,
        model: services.llm.model,
        apiKey: services.llm.apiKey,
        numPredict: STICKER_CHECK_NUM_PREDICT,
        log: hostLogging(services),
        chatComplete: services.llm.createAuxiliaryChatComplete({
          numPredict: STICKER_CHECK_NUM_PREDICT,
          responseFormat,
          traceTurnId: state.turnId,
          traceLabel: "sticker pick",
        }),
      },
    );

    state.stickerEmoji = stickerEmoji;
    state.stickerFileId = stickerEmoji
      ? resolveStickerFileId(stickerEmoji, catalog.stickers)
      : null;

    if (stickerEmoji) {
      return {
        status: "ok",
        phaseId: "sticker",
        phaseTitle: "Sticker",
        summary: `Sent ${stickerEmoji}`,
        durationMs: performance.now() - started,
      };
    }

    return {
      status: "skipped",
      phaseId: "sticker",
      phaseTitle: "Sticker",
      summary: "Chance hit but no sticker selected",
      durationMs: performance.now() - started,
    };
  },
};
