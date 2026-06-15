import type { StickerCatalogEntry } from "./types.js";

function normalizeEmojiMatch(value: string): string {
  return value.normalize("NFC").trim().replace(/\uFE0F/g, "");
}

function emojisMatch(a: string, b: string): boolean {
  const left = normalizeEmojiMatch(a);
  const right = normalizeEmojiMatch(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

/** Map an LLM sticker choice (emoji or list number) to a Telegram file_id. */
export function resolveStickerFileId(
  raw: string,
  stickers: StickerCatalogEntry[],
): string | null {
  if (stickers.length === 0) return null;
  const input = raw.trim();
  if (!input) return null;

  const indexMatch = input.match(/^#?(\d+)$/);
  if (indexMatch) {
    const n = Number(indexMatch[1]);
    if (Number.isInteger(n) && n >= 1 && n <= stickers.length) {
      return stickers[n - 1]!.fileId;
    }
    if (Number.isInteger(n) && n >= 0 && n < stickers.length) {
      return stickers[n]!.fileId;
    }
  }

  const byEmoji = stickers.filter((s) => emojisMatch(s.emoji, input));
  if (byEmoji.length === 1) return byEmoji[0]!.fileId;
  if (byEmoji.length > 1) return pickRandom(byEmoji)?.fileId ?? null;

  return null;
}
