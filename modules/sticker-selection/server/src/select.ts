import {
  auxiliaryChatComplete,
  type ChatMessage,
  type ModuleDefinition,
} from "@llm-tg-bot/modules-utils";
import {
  buildStickerAnalyzerMessages,
  getStickerResponseFormat,
  parseStickerChoice,
} from "./prompt.js";
import { resolveStickerFileId } from "./resolve.js";
import type {
  StickerCatalog,
  StickerSelectionInput,
  StickerSelectionOutput,
} from "./types.js";

export const STICKER_CHECK_NUM_PREDICT = 96;

export interface StickerSelectionConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  numPredict?: number;
  /**
   * Optional host-provided completion (e.g. debug tracing).
   * When set, `baseUrl` / `model` / `apiKey` are ignored for the LLM call.
   */
  chatComplete?: (messages: ChatMessage[]) => Promise<string>;
}

function emptyCatalog(catalog: StickerCatalog): boolean {
  return !catalog.packName.trim() || catalog.stickers.length === 0;
}

export async function pickSticker(
  input: StickerSelectionInput,
  config: StickerSelectionConfig,
): Promise<StickerSelectionOutput> {
  if (emptyCatalog(input.catalog)) {
    return {
      choice: null,
      fileId: null,
      reason: "Sticker catalog not loaded",
    };
  }

  const botReply = input.botReply.trim();
  if (!botReply) {
    return {
      choice: null,
      fileId: null,
      reason: "Empty bot reply",
    };
  }

  const messages = buildStickerAnalyzerMessages({
    catalog: input.catalog,
    botReply,
    message: input.message,
    replyContext: input.replyContext,
    thinkingEnabled: input.thinkingEnabled,
  });
  if (!messages) {
    return {
      choice: null,
      fileId: null,
      reason: "Sticker catalog not loaded",
    };
  }

  const responseFormat = getStickerResponseFormat(
    Boolean(input.thinkingEnabled),
  );

  try {
    const raw = config.chatComplete
      ? await config.chatComplete(messages)
      : await auxiliaryChatComplete(
          {
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
          },
          messages,
          {
            numPredict: config.numPredict ?? STICKER_CHECK_NUM_PREDICT,
            responseFormat,
          },
        );
    const parsed = parseStickerChoice(raw);
    if (!parsed.choice) {
      return {
        choice: null,
        fileId: null,
        reason: parsed.reason,
      };
    }
    const fileId = resolveStickerFileId(parsed.choice, input.catalog.stickers);
    if (!fileId) {
      return {
        choice: parsed.choice,
        fileId: null,
        reason: "Sticker choice did not match catalog",
      };
    }
    return {
      choice: parsed.choice,
      fileId,
      reason: parsed.reason,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      choice: null,
      fileId: null,
      reason: `LLM request failed: ${message}`,
    };
  }
}

export const stickerSelectionModule: ModuleDefinition<
  StickerSelectionInput,
  StickerSelectionConfig,
  StickerSelectionOutput
> = {
  id: "sticker-selection",
  run: pickSticker,
};
