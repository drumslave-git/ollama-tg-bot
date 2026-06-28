import type { FeatureDefinition, FeatureLogging } from "../../shared/index.js";
import { STICKER_RESPONSE_FORMAT } from "./prompt.js";
import {
  pickSticker,
  STICKER_CHECK_NUM_PREDICT,
  type StickerSelectionConfig,
} from "./select.js";
import type { StickerSelectionInput } from "./types.js";

export interface StickerAnalyzeInput extends StickerSelectionInput {
  traceTurnId?: number;
}

export interface StickerAnalyzeConfig extends StickerSelectionConfig {
  log?: FeatureLogging;
}

/**
 * Ask the model which sticker best fits the bot's reply emotionally.
 */
export async function analyzeStickerForReply(
  input: StickerAnalyzeInput,
  config: StickerAnalyzeConfig,
): Promise<string | null> {
  try {
    const result = await pickSticker(input, config);
    return result.choice;
  } catch (err) {
    config.log?.logEventError?.("sticker_analyze_failed", err, {
      turnId: input.traceTurnId,
    });
    return null;
  }
}

export { STICKER_CHECK_NUM_PREDICT, STICKER_RESPONSE_FORMAT };

export const stickerAnalyzeFeature: FeatureDefinition<
  StickerAnalyzeInput,
  StickerAnalyzeConfig,
  string | null
> = {
  id: "sticker-selection",
  run: analyzeStickerForReply,
};
