import { chatComplete } from "../llm/client.js";
import { config } from "../config.js";
import { logEventError } from "../event-log.js";
import { getResolvedSettings } from "../settings-runtime.js";
import {
  pickSticker,
  rollStickerReplyChance,
  STICKER_CHECK_NUM_PREDICT,
  STICKER_RESPONSE_FORMAT,
  type StickerReplyRoll,
  type StickerSelectionConfig,
  type StickerSelectionInput,
} from "@llm-tg-bot/modules-sticker-selection";
import { getStickerCatalogForSelection } from "./sticker-catalog.js";

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
  STICKER_CHECK_NUM_PREDICT,
  type StickerCatalog,
  type StickerCatalogEntry,
  type StickerReplyRoll,
  type StickerSelectionConfig,
  type StickerSelectionInput,
  type StickerSelectionOutput,
} from "@llm-tg-bot/modules-sticker-selection";

export interface StickerAnalyzeInput {
  userMessage: string;
  botReply: string;
  replyContext?: string | null;
  traceTurnId?: number;
}

function buildStickerConfig(traceTurnId?: number): StickerSelectionConfig {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
    numPredict: STICKER_CHECK_NUM_PREDICT,
    chatComplete: (messages) =>
      chatComplete(messages, {
        numPredict: STICKER_CHECK_NUM_PREDICT,
        auxiliary: true,
        responseFormat: STICKER_RESPONSE_FORMAT,
        traceTurnId,
        traceLabel: "sticker pick",
      }),
  };
}

/**
 * Ask the model which sticker best fits the bot's reply emotionally.
 */
export async function analyzeStickerForReply(
  input: StickerAnalyzeInput,
): Promise<string | null> {
  try {
    const result = await pickSticker(
      {
        botReply: input.botReply,
        message: input.userMessage,
        replyContext: input.replyContext,
        catalog: getStickerCatalogForSelection(),
      },
      buildStickerConfig(input.traceTurnId),
    );
    return result.choice;
  } catch (err) {
    logEventError("sticker_analyze_failed", err);
    return null;
  }
}
