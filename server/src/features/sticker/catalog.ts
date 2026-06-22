export function stickerPromptLabel(sticker: {
  index: number;
  emoji: string;
}): string {
  const emoji = sticker.emoji?.trim();
  if (emoji && emoji !== "—") return emoji;
  return String(sticker.index + 1);
}

export function formatStickerCatalogSection(
  packName: string,
  stickers: Array<{ index: number; emoji: string }>,
): string | null {
  if (stickers.length === 0) return null;
  const lines = stickers.map(
    (s) => `${s.index + 1}: ${stickerPromptLabel(s)}`,
  );
  return (
    `Available stickers from pack "${packName}" (number: pack emoji):\n` +
    `${lines.join("\n")}`
  );
}
