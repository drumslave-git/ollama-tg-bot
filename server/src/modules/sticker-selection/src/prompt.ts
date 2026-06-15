import type { ChatMessage } from "@llm-tg-bot/modules-utils";
import { extractLastClosedBlock } from "@llm-tg-bot/modules-utils";
import { formatStickerCatalogSection } from "./catalog.js";
import type { StickerCatalog } from "./types.js";

export const STICKER_TAG = "STICKER";
const STICKER_VALUE_MAX_LEN = 32;

export function buildStickerAnalyzerSystem(catalog: StickerCatalog): string | null {
  const catalogSection = formatStickerCatalogSection(
    catalog.packName,
    catalog.stickers,
  );
  if (!catalogSection) return null;

  return (
    `You pick the best-matching Telegram sticker for a bot's text reply, based on emotional tone and context.\n\n` +
    `${catalogSection}\n\n` +
    `Your entire assistant message content must be exactly one block — nothing before, nothing after, no other text or tags:\n\n` +
    `[${STICKER_TAG}]\n` +
    `<emoji or number>\n` +
    `[/${STICKER_TAG}]\n\n` +
    `Output rules (mandatory):\n` +
    `- Put only the sticker choice inside [${STICKER_TAG}]…[/${STICKER_TAG}] — not in reasoning or analysis.\n` +
    `- The only line inside the block must be the pack emoji exactly, or the sticker number from the list.\n` +
    `- Always include opening and closing tags on their own lines.\n` +
    `- Do not output bare numbers/emojis without the [${STICKER_TAG}] block.\n` +
    `- Do not output reasoning, analysis, or explanation — only the block.\n\n` +
    `Always pick the sticker that best fits the reply's mood, humor, or reaction — even if the fit is subtle.`
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
}): ChatMessage[] | null {
  const system = buildStickerAnalyzerSystem(params.catalog);
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

  content += `\n\nReply with only one [${STICKER_TAG}]…[/${STICKER_TAG}] block.`;

  return [
    { role: "system", content: system },
    { role: "user", content },
  ];
}

export function parseStickerChoice(raw: string): {
  choice: string | null;
  reason: string;
} {
  const value = extractLastClosedBlock(raw, STICKER_TAG)?.trim() ?? "";
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
