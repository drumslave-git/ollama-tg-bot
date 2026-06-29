import type { Animation, Document, Message, PhotoSize, Video } from "@grammyjs/types";
import { downloadTelegramFile } from "./telegram-files.js";
import {
  loadStickerForVision,
  stickerUnavailableText,
} from "./stickers.js";
import type { ImagePayload, LoadedVisionMedia } from "./types.js";

/**
 * Static image for animated/video media that the vision model can actually read.
 * Telegram "GIFs" are mp4 animations and videos are mp4 — the file itself is not
 * an image, but Telegram ships a JPEG thumbnail (a single frame) that answers
 * "what's in this?". A true image/gif we decode directly from the file.
 */
async function loadAnimatedFrame(
  token: string,
  media: Animation | Video,
): Promise<ImagePayload | null> {
  if (media.mime_type === "image/gif") {
    const img = await downloadTelegramFile(token, media.file_id);
    if (img) return img;
  }
  if (media.thumbnail) {
    return downloadTelegramFile(token, media.thumbnail.file_id);
  }
  return null;
}

/**
 * Thumbnail of a non-image document that is really a video/gif (an mp4 "GIF" or a
 * clip sent as a file). application/* documents (PDFs, archives) are excluded.
 */
function videoLikeDocumentThumb(document: Document): PhotoSize | undefined {
  if (!document.thumbnail) return undefined;
  const mime = document.mime_type ?? "";
  if (mime.startsWith("video/") || mime === "image/gif") return document.thumbnail;
  return undefined;
}

/** Download photo, image/animation/video, document, or sticker from a Telegram message for LLM vision. */
export async function loadVisionFromMessage(
  token: string,
  message: Message,
): Promise<LoadedVisionMedia> {
  if (message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    const img = await downloadTelegramFile(token, photo.file_id);
    return { images: img ? [img] : [] };
  }

  if (message.sticker) {
    const loaded = await loadStickerForVision(token, message.sticker);
    if (!loaded) {
      return {
        images: [],
        unavailableText: stickerUnavailableText(message.sticker),
      };
    }
    return {
      images: [loaded.payload],
      sourceSticker: message.sticker,
      visionHint: loaded.visionHint,
    };
  }

  if (message.document?.mime_type?.startsWith("image/")) {
    const img = await downloadTelegramFile(token, message.document.file_id);
    return { images: img ? [img] : [] };
  }

  const animated = message.animation ?? message.video;
  if (animated) {
    const img = await loadAnimatedFrame(token, animated);
    return { images: img ? [img] : [] };
  }

  const docThumb = message.document
    ? videoLikeDocumentThumb(message.document)
    : undefined;
  if (docThumb) {
    const img = await downloadTelegramFile(token, docThumb.file_id);
    return { images: img ? [img] : [] };
  }

  return { images: [] };
}

/** First message in a reply chain (up to depth) that carries vision-capable media. */
export function findReplyMediaMessage(
  message: Message,
  maxDepth = 4,
): Message | null {
  let current: Message | undefined = message.reply_to_message;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (messageHasVisionMedia(current)) return current;
    current = current.reply_to_message;
    depth++;
  }

  return null;
}

export function messageHasVisionMedia(message: Message): boolean {
  if (message.photo?.length) return true;
  if (message.sticker) return true;
  if (message.document?.mime_type?.startsWith("image/")) return true;
  const animated = message.animation ?? message.video;
  if (animated && (animated.mime_type === "image/gif" || animated.thumbnail)) {
    return true;
  }
  if (message.document && videoLikeDocumentThumb(message.document)) return true;
  return false;
}

/** Photo or image file in the message itself (not stickers). */
export function messageHasUserImage(message: Message): boolean {
  if (message.photo?.length) return true;
  if (message.document?.mime_type?.startsWith("image/")) return true;
  return false;
}
