import { downloadTelegramFile, getTelegramFilePath, isRasterImagePath, } from "./telegram-files.js";
function stickerEmoji(sticker) {
    const emoji = sticker.emoji?.trim();
    return emoji || null;
}
export function stickerPackEmoji(sticker) {
    return sticker ? stickerEmoji(sticker) : null;
}
/** Short label for chat history and reply summaries. */
export function stickerHistoryLabel(sticker) {
    const emoji = stickerEmoji(sticker);
    return emoji
        ? `[sticker image was sent, pack emoji: ${emoji}]`
        : "[sticker image was sent]";
}
/** Pack emoji context — secondary to the attached artwork. */
export function stickerEmojiContext(sticker) {
    const emoji = stickerEmoji(sticker);
    if (!emoji)
        return null;
    return (`Telegram maps this sticker to ${emoji} in its pack. ` +
        `Use that only as extra tone after you interpret the artwork.`);
}
function buildVisionHint(sticker, frameHint) {
    const parts = [frameHint, stickerEmojiContext(sticker)].filter((p) => Boolean(p));
    return parts.length > 0 ? parts.join("\n\n") : undefined;
}
async function downloadRasterByFileId(token, fileId) {
    const path = await getTelegramFilePath(token, fileId);
    if (!path || !isRasterImagePath(path))
        return null;
    return downloadTelegramFile(token, fileId);
}
export async function loadStickerForVision(token, sticker) {
    if (sticker.is_animated || sticker.is_video) {
        const thumbId = sticker.thumbnail?.file_id;
        if (thumbId) {
            const payload = await downloadTelegramFile(token, thumbId);
            if (payload) {
                const frameHint = sticker.is_video
                    ? "This image is a still preview frame from the user's video sticker."
                    : "This image is a still preview frame from the user's animated sticker.";
                return {
                    payload,
                    visionHint: buildVisionHint(sticker, frameHint),
                };
            }
        }
        const fallback = await downloadRasterByFileId(token, sticker.file_id);
        if (fallback) {
            return {
                payload: fallback,
                visionHint: buildVisionHint(sticker, "This is a static preview of the sticker."),
            };
        }
        return null;
    }
    const payload = await downloadRasterByFileId(token, sticker.file_id);
    if (!payload)
        return null;
    return {
        payload,
        visionHint: buildVisionHint(sticker),
    };
}
export function stickerUnavailableText(sticker) {
    const emoji = stickerEmoji(sticker);
    const suffix = emoji ? ` (${emoji})` : "";
    if ((sticker.is_animated || sticker.is_video) && !sticker.thumbnail) {
        return (`This animated sticker has no preview image available${suffix}. ` +
            `Try a static sticker or send a screenshot.`);
    }
    if (sticker.is_animated) {
        return `Could not load the preview for this animated sticker${suffix}.`;
    }
    if (sticker.is_video) {
        return `Could not load the preview for this video sticker${suffix}.`;
    }
    return `Could not download this sticker image${suffix}.`;
}
