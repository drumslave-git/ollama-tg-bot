import type { Api } from "grammy";
import type { Sticker } from "@grammyjs/types";
import type { StickerCatalog } from "@llm-tg-bot/modules-sticker-selection";
import {
  formatStickerCatalogSection,
  resolveStickerFileId as resolveStickerFileIdFromChoice,
  stickerPromptLabel,
} from "@llm-tg-bot/modules-sticker-selection";
import { getSettings } from "../db/database.js";
import { logEvent, logEventError } from "../event-log.js";

export interface CatalogSticker {
  index: number;
  /** Emoji assigned to this sticker in the pack (from Telegram). */
  emoji: string;
  fileId: string;
  previewFileId: string;
}

interface StickerCatalogState {
  packName: string;
  stickers: CatalogSticker[];
  loadedAt: string;
}

let catalog: StickerCatalogState | null = null;
let lastError: string | null = null;

function normalizePackName(name: string): string {
  return name.trim().replace(/^@/, "");
}

function readStickerEmoji(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed || "—";
}

function previewFileId(sticker: Sticker): string {
  return sticker.thumbnail?.file_id ?? sticker.file_id;
}

export { stickerPromptLabel };

export function getStickerCatalogState(): {
  packName: string;
  stickers: Pick<CatalogSticker, "index" | "emoji" | "fileId">[];
  loaded: boolean;
  error: string | null;
} {
  return {
    packName: catalog?.packName ?? "",
    stickers: (catalog?.stickers ?? []).map((s) => ({
      index: s.index,
      emoji: s.emoji,
      fileId: s.fileId,
    })),
    loaded: catalog != null && catalog.stickers.length > 0,
    error: lastError,
  };
}

export function getStickerCatalogForSelection(): StickerCatalog {
  if (!catalog) {
    return { packName: "", stickers: [] };
  }
  return {
    packName: catalog.packName,
    stickers: catalog.stickers.map((s) => ({
      index: s.index,
      emoji: s.emoji,
      fileId: s.fileId,
    })),
  };
}

export function getStickerPreviewFileId(index: number): string | null {
  const sticker = catalog?.stickers.find((s) => s.index === index);
  return sticker?.previewFileId ?? null;
}

export function clearStickerCatalog(): void {
  catalog = null;
  lastError = null;
}

export async function refreshStickerCatalog(
  api: Api,
  packName: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const normalized = normalizePackName(packName);
  if (!normalized) {
    clearStickerCatalog();
    lastError = "Sticker pack name is empty";
    return { ok: false, count: 0, error: lastError };
  }

  try {
    const set = await api.getStickerSet(normalized);

    const stickers = set.stickers.map((sticker, index) => ({
      index,
      emoji: readStickerEmoji(sticker.emoji),
      fileId: sticker.file_id,
      previewFileId: previewFileId(sticker),
    }));

    if (stickers.length === 0) {
      catalog = null;
      lastError = "Sticker set is empty";
      logEvent("sticker_catalog_empty", { packName: normalized });
      return { ok: false, count: 0, error: lastError };
    }

    catalog = {
      packName: normalized,
      stickers,
      loadedAt: new Date().toISOString(),
    };
    lastError = null;
    logEvent("sticker_catalog_loaded", {
      packName: normalized,
      count: stickers.length,
    });
    return { ok: true, count: stickers.length };
  } catch (err) {
    catalog = null;
    lastError =
      err instanceof Error ? err.message : "Failed to load sticker set";
    logEventError("sticker_catalog_failed", err, { packName: normalized });
    return { ok: false, count: 0, error: lastError };
  }
}

export function resolveStickerFileId(raw: string): string | null {
  if (!catalog || catalog.stickers.length === 0) return null;
  return resolveStickerFileIdFromChoice(raw, catalog.stickers);
}

export function formatStickerCatalogForAnalyze(): string | null {
  if (!catalog || catalog.stickers.length === 0) return null;
  return formatStickerCatalogSection(catalog.packName, catalog.stickers);
}

export async function syncStickerCatalogFromSettings(
  api: Api,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const settings = getSettings();
  if (!settings.stickersEnabled || !settings.stickerPackName.trim()) {
    clearStickerCatalog();
    return { ok: true, count: 0 };
  }
  return refreshStickerCatalog(api, settings.stickerPackName);
}
