import {
  analyzeStickerForReply,
  STICKER_CHECK_NUM_PREDICT,
  STICKER_RESPONSE_FORMAT,
  type StickerReplyRoll,
} from "@llm-tg-bot/modules-sticker-selection";
import { getStickerCatalogForSelection } from "./sticker-catalog.js";
import {
  hostAuxiliaryChatComplete,
  hostLlmConfig,
  hostLogging,
} from "../module-host.js";

export {
  STICKER_RESPONSE_FORMAT,
  buildStickerAnalyzerSystem,
  buildStickerAnalyzerMessages,
  parseStickerChoice,
  formatStickerCatalogSection,
  stickerPromptLabel,
  resolveStickerFileId,
  rollStickerReplyChance,
  pickSticker,
  stickerSelectionModule,
  analyzeStickerForReply,
  STICKER_CHECK_NUM_PREDICT,
  type StickerCatalog,
  type StickerCatalogEntry,
  type StickerReplyRoll,
  type StickerSelectionConfig,
  type StickerSelectionInput,
  type StickerSelectionOutput,
} from "@llm-tg-bot/modules-sticker-selection";

export interface StickerAnalyzeHostInput {
  userMessage: string;
  botReply: string;
  replyContext?: string | null;
  traceTurnId?: number;
}

export async function analyzeStickerForReplyFromTurn(
  input: StickerAnalyzeHostInput,
): Promise<string | null> {
  return analyzeStickerForReply(
    {
      botReply: input.botReply,
      message: input.userMessage,
      replyContext: input.replyContext,
      catalog: getStickerCatalogForSelection(),
      traceTurnId: input.traceTurnId,
    },
    {
      ...hostLlmConfig(),
      numPredict: STICKER_CHECK_NUM_PREDICT,
      log: hostLogging(),
      chatComplete: hostAuxiliaryChatComplete({
        numPredict: STICKER_CHECK_NUM_PREDICT,
        responseFormat: STICKER_RESPONSE_FORMAT,
        traceTurnId: input.traceTurnId,
        traceLabel: "sticker pick",
      }),
    },
  );
}
