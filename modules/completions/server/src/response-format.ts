import type { JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import {
  asObject,
  parseJsonContent,
  readReasoningFromContent,
  responseFormatForThinking,
  strictObjectSchema,
} from "@llm-tg-bot/modules-utils";
import { stripEchoedHistoryMarkup } from "@llm-tg-bot/modules-history";

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

export function getMainReplyResponseFormat(
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return responseFormatForThinking(MAIN_REPLY_RESPONSE_FORMAT, thinkingEnabled);
}

/**
 * Structured assistant output. Only the `reply` field is sent to Telegram.
 * Stickers are chosen in a separate model pass; memory is extracted in a dedicated pass.
 */
export function buildReplyFormatSpec(
  formatHint: string,
  thinkingEnabled = false,
): string {
  const reasoningLine = thinkingEnabled
    ? "- reasoning (string): brief chain-of-thought for this reply; analysis only — never the spoken reply text\n"
    : "";
  const fieldCount = thinkingEnabled ? "two fields" : "one field";
  return `Respond with JSON only, matching the provided schema. The object has ${fieldCount}:
${reasoningLine}- reply (string): your spoken reply to the user

Output rules (mandatory):
- Put only your spoken reply in the reply field.
- Memory is handled in a separate pass — do not add extra fields.
- Never include internal chat-history tags in reply (e.g. [assistant said], [user:… said], [sticker: …], [compressed]) — those are metadata, not spoken text.
- Do not copy broken formatting, garbled markup, or error-like phrasing from chat history into reply.
- Formatting: HTML tags are optional — reply in plain text unless a tag genuinely adds emphasis. Never send empty tags (e.g. <b></b>).

Reply length and style (apply inside reply, not as separate structure):
${formatHint}`;
}

/** Chain-of-thought from structured JSON content (when thinking is on). */
export function extractThinkingFromContent(content: string): string {
  return readReasoningFromContent(content) ?? "";
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
