import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  parseJsonContent,
  readString,
  reasoningJsonUserTail,
  reasoningSchemaSystemSuffix,
  responseFormatForThinking,
  strictObjectSchema,
} from "../../shared/index.js";
import { formatStickerCatalogSection } from "./catalog.js";
import type { StickerCatalog } from "./types.js";

export const STICKER_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "sticker_choice",
    {
      choice: {
        type: "string",
        description:
          "Pack emoji exactly, sticker number from the list, or none to skip.",
      },
    },
    ["choice"],
  );

export function getStickerResponseFormat(
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return responseFormatForThinking(STICKER_RESPONSE_FORMAT, thinkingEnabled);
}

const STICKER_VALUE_MAX_LEN = 32;

export function buildStickerAnalyzerSystem(
  catalog: StickerCatalog,
  thinkingEnabled = false,
): string | null {
  const catalogSection = formatStickerCatalogSection(
    catalog.packName,
    catalog.stickers,
  );
  if (!catalogSection) return null;

  return (
    `You pick the best-matching Telegram sticker for a bot's text reply, based on emotional tone and context.\n\n` +
    `${catalogSection}\n\n` +
    `Respond with JSON only, matching the provided schema:\n` +
    `- choice (string): the pack emoji exactly, or the sticker number from the list, or "none" to skip` +
    reasoningSchemaSystemSuffix(thinkingEnabled) +
    `\n\nAlways pick the sticker that best fits the reply's mood, humor, or reaction — even if the fit is subtle.`
  );
}

function isReplyThreadContext(context: string | null | undefined): boolean {
  return Boolean(context?.includes("[REPLY THREAD"));
}

export function buildStickerAnalyzerMessages(params: {
  catalog: StickerCatalog;
  botReply: string;
  message?: string;
  replyContext?: string | null;
  thinkingEnabled?: boolean;
}): ChatMessage[] | null {
  const system = buildStickerAnalyzerSystem(
    params.catalog,
    !!params.thinkingEnabled,
  );
  if (!system) return null;

  const botReply = params.botReply.trim();
  let content = `Bot reply to evaluate:\n${botReply}`;
  const replyContext = params.replyContext?.trim() ?? "";

  if (isReplyThreadContext(replyContext)) {
    content += `\n\nConversation context:\n${replyContext}`;
  } else {
    if (params.message?.trim()) {
      content += `\n\nUser message that prompted this reply:\n${params.message.trim()}`;
    }
    if (replyContext) {
      content += `\n\nQuoted reply context:\n${replyContext}`;
    }
  }

  content +=
    "\n\n" + reasoningJsonUserTail("a choice field", !!params.thinkingEnabled);

  return [
    { role: "system", content: system },
    { role: "user", content },
  ];
}

export function parseStickerChoice(raw: string): {
  choice: string | null;
  reason: string;
} {
  const parsed = asObject(parseJsonContent(raw));
  const value = parsed ? readString(parsed, "choice") : null;
  if (!value) {
    return {
      choice: null,
      reason: "Could not parse LLM sticker choice",
    };
  }
  if (/^(none|no|skip|-)$/i.test(value)) {
    return { choice: null, reason: "LLM decision: skip" };
  }
  if (value.length > STICKER_VALUE_MAX_LEN || value.includes("\n")) {
    return {
      choice: null,
      reason: "Invalid sticker choice value",
    };
  }
  return { choice: value, reason: "LLM sticker selected" };
}
