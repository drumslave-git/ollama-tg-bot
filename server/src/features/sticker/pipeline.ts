import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "../../contracts/index.js";
import type { ModuleLogging } from "../../shared/index.js";
import type { StickerCatalog } from "./types.js";
import {
  analyzeStickerForReply,
  STICKER_CHECK_NUM_PREDICT,
} from "./analyze.js";
import { getStickerResponseFormat } from "./prompt.js";
import { rollStickerReplyChance } from "./chance.js";
import { resolveStickerFileId } from "./resolve.js";
import {
  getSettings,
  getStickerCatalog,
} from "../../pipeline/turn-services.js";

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

export const stickerPipelineHost: PipelineModuleHost = {
  id: "sticker-selection",
  stepId: "sticker",

  shouldRun(state) {
    return Boolean(state.shouldReply && state.replyBody?.trim());
  },

  async run(state, services): Promise<PipelineStepResult> {
    const settings = getSettings();
    const stickersEnabled = Boolean(settings.stickersEnabled);
    if (!stickersEnabled) {
      return {
        status: "skipped",
        phaseId: "sticker",
        phaseTitle: "Sticker selection",
        summary: "Stickers disabled",
      };
    }

    const chance = Number(settings.stickerReplyChance ?? 0);
    const responseFormat = getStickerResponseFormat();
    const roll = rollStickerReplyChance(chance);
    if (!roll.hit) {
      return {
        status: "skipped",
        phaseId: "sticker",
        phaseTitle: "Sticker selection",
        summary: `Chance ${roll.chance}% not hit`,
      };
    }

    const catalog: StickerCatalog | undefined = getStickerCatalog();
    if (!catalog) {
      return {
        status: "skipped",
        phaseId: "sticker",
        phaseTitle: "Sticker selection",
        summary: "Sticker catalog not available",
      };
    }

    const started = performance.now();
    // Reply is already delivered; show "choosing sticker" (not "typing") while
    // the model picks. Only here — after the gates above — so a chance-miss or
    // disabled pack never flashes the action.
    const stopChatAction = state.startChatAction?.("choose_sticker");
    let stickerEmoji: string | null;
    try {
      stickerEmoji = await analyzeStickerForReply(
        {
          botReply: state.replyBody ?? "",
          message: state.latestBody,
          replyContext: state.replyContext,
          catalog,
          traceTurnId: state.turnId,
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
            // Sticker pick is a fast classification — no reasoning, it only adds latency.
            think: false,
          }),
        },
      );
    } finally {
      stopChatAction?.();
    }

    state.stickerEmoji = stickerEmoji;
    state.stickerFileId = stickerEmoji
      ? resolveStickerFileId(stickerEmoji, catalog.stickers)
      : null;

    if (stickerEmoji) {
      return {
        status: "ok",
        phaseId: "sticker",
        phaseTitle: "Sticker selection",
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
