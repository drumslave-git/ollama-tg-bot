import type { JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  parseJsonContent,
  strictObjectSchema,
} from "../../shared/index.js";
import { stripEchoedHistoryMarkup } from "../history/index.js";

export const MAIN_REPLY_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "telegram_reply",
    {
      reply: {
        type: "string",
        description:
          "The bot's spoken reply to the user. Telegram HTML subset when tags add emphasis.",
      },
    },
    ["reply"],
  );

export function getMainReplyResponseFormat(): JsonSchemaResponseFormat {
  return MAIN_REPLY_RESPONSE_FORMAT;
}

/**
 * Shared "Respond with JSON only…" preamble: the reply field plus a mandatory
 * output-rules block. Chain-of-thought is never a JSON field — providers return
 * reasoning in a separate response channel.
 */
function buildJsonReplySpec(params: {
  replyDesc: string;
  rules: string;
}): string {
  return `Respond with JSON only, matching the provided schema. The object has one field:
- reply (string): ${params.replyDesc}

Output rules (mandatory):
${params.rules}`;
}

/**
 * Structured assistant output. Only the `reply` field is sent to Telegram.
 * Stickers are chosen in a separate model pass; memory is extracted in a dedicated pass.
 */
export function buildExplainFormatSpec(): string {
  return buildJsonReplySpec({
    replyDesc: "your meta explanation for the bot owner",
    rules: `- Do NOT roleplay. Do NOT speak as the bot's character or continue its dialogue.
- Explain which configuration, memory, or chat history caused the behavior.
- Put only the explanation in the reply field.
- Write in clear, direct prose. Match the owner's language when they asked in one; otherwise use English.
- Quote or paraphrase the relevant instruction or memory when it explains the behavior.`,
  });
}

export function buildReplyFormatSpec(formatHint: string): string {
  return `Reply with your spoken message only — plain text, no JSON, no wrapper, no field labels.

Output rules (mandatory):
- Output only your spoken reply, nothing before or after it.
- Memory is handled in a separate pass.
- Never include internal chat-history tags (e.g. [assistant said], [user:… said], [sticker: …], [compressed]) — those are metadata, not spoken text.
- Do not copy broken formatting, garbled markup, or error-like phrasing from chat history.
- Formatting: HTML tags are optional — reply in plain text unless a tag genuinely adds emphasis. Never send empty tags (e.g. <b></b>).

Reply length and style:
${formatHint}`;
}

const BLOCK_NAME = "[A-Za-z_][A-Za-z0-9_]*";
const CLOSED_BLOCK = new RegExp(
  `\\[(${BLOCK_NAME})\\]\\s*[\\s\\S]*?\\s*\\[\\/\\1\\]`,
  "gi",
);
const UNCLOSED_BLOCK = new RegExp(`\\[(${BLOCK_NAME})\\][\\s\\S]*$`);
const STRAY_BLOCK_TAG = new RegExp(`\\[\\/?(${BLOCK_NAME})\\]`, "g");

/** Remove legacy [TAG]…[/TAG] blocks and stray [TAG] tags from user-facing text. */
export function stripStructuredMarkup(text: string): string {
  let result = text;
  let prev = "";
  while (result !== prev) {
    prev = result;
    result = result
      .replace(CLOSED_BLOCK, "")
      .replace(UNCLOSED_BLOCK, "")
      .replace(STRAY_BLOCK_TAG, "");
  }
  return result.trim();
}

/** Cut echoed history metadata the model must not speak (see buildReplyFormatSpec). */
function trimEchoedReplyTail(text: string): string {
  const stickerIdx = text.search(/\[sticker:/i);
  if (stickerIdx >= 0) return text.slice(0, stickerIdx).trim();
  return text.trim();
}

function cleanReplyText(text: string): string {
  const trimmed = trimEchoedReplyTail(text.trim());
  const withoutEcho = trimmed.replace(/^\[assistant said\]\s*:?\s*/i, "").trim();
  return stripEchoedHistoryMarkup(stripStructuredMarkup(withoutEcho));
}

/** User-facing reply from API `message.content` (JSON with a reply field). */
export function extractTelegramReply(content: string): string {
  const parsed = asObject(parseJsonContent(content));
  if (parsed && typeof parsed.reply === "string") {
    return cleanReplyText(parsed.reply);
  }
  return cleanReplyText(content);
}
