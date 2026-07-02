import type { Context } from "grammy";
import type { Message } from "grammy/types";
import { stickerHistoryLabel } from "../../features/vision/index.js";

/**
 * Reply annotation for the current turn — only the parts a bare message_id
 * cannot convey: a highlighted quote fragment, or a reply to a message from
 * another chat that is not in our history. The reply link itself (which message
 * this one replies to) travels as the row's `reply_to_message_id` and is
 * rendered as a `replied to msg:X` pointer, so it is not repeated here.
 */
export function formatReplyContext(ctx: Context): string | null {
  const msg = ctx.message;
  if (!msg) return null;

  const quoteText = msg.quote?.text?.trim();
  if (quoteText) {
    return `Quoted fragment from the message being replied to:\n• ${quoteText}`;
  }

  const externalText = summarizeExternalReply(msg);
  if (externalText) {
    return `Replying to a message from another chat:\n• ${externalText}`;
  }

  return null;
}

export function replyParameters(
  ctx: Context,
): { message_id: number } | undefined {
  const messageId = ctx.message?.message_id;
  return messageId != null ? { message_id: messageId } : undefined;
}

export function summarizeMessageContent(message: Message): string {
  const text = (message.text ?? message.caption ?? "").trim();
  if (text) return text;

  if (message.photo?.length) return "[photo]";
  if (message.sticker) return stickerHistoryLabel(message.sticker);
  if (message.animation) return "[animation]";
  if (message.video) return "[video]";
  if (message.document) {
    const mime = message.document.mime_type ?? "";
    if (mime.startsWith("video/")) return "[video]";
    if (mime === "image/gif") return "[animation]";
    return message.document.file_name
      ? `[file: ${message.document.file_name}]`
      : "[file]";
  }
  if (message.voice) return "[voice message]";
  if (message.audio) return "[audio]";
  return "[message]";
}

function summarizeExternalReply(msg: Message): string | null {
  const external = msg.external_reply;
  if (!external) return null;

  const text = (external as { text?: string }).text?.trim();
  if (text) return text;

  const caption = (external as { caption?: string }).caption?.trim();
  if (caption) return caption;

  return null;
}
