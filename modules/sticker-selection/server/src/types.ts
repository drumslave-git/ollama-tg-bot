export interface StickerCatalogEntry {
  index: number;
  /** Emoji assigned to this sticker in the pack (from Telegram). */
  emoji: string;
  fileId: string;
}

export interface StickerCatalog {
  packName: string;
  stickers: StickerCatalogEntry[];
}

export interface StickerSelectionInput {
  botReply: string;
  message?: string;
  replyContext?: string | null;
  catalog: StickerCatalog;
  thinkingEnabled?: boolean;
}

export interface StickerSelectionOutput {
  choice: string | null;
  fileId: string | null;
  reason: string;
}

export interface StickerReplyRoll {
  chance: number;
  roll: number | null;
  hit: boolean;
}
