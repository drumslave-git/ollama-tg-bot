import type { Api } from "grammy";
import type { StickerCatalog } from "./types.js";
import type { BotHostLogging } from "@llm-tg-bot/modules-registry";

export interface CatalogSticker {
  index: number;
  emoji: string;
  fileId: string;
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

export function clearStickerCatalog(): void {
  catalog = null;
  lastError = null;
}

export async function refreshStickerCatalog(
  api: Api,
  packName: string,
  log: BotHostLogging,
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
    }));

    if (stickers.length === 0) {
      catalog = null;
      lastError = "Sticker set is empty";
      log.logEvent("sticker_catalog_empty", { packName: normalized });
      return { ok: false, count: 0, error: lastError };
    }

    catalog = {
      packName: normalized,
      stickers,
      loadedAt: new Date().toISOString(),
    };
    lastError = null;
    log.logEvent("sticker_catalog_loaded", {
      packName: normalized,
      count: stickers.length,
    });
    return { ok: true, count: stickers.length };
  } catch (err) {
    catalog = null;
    lastError =
      err instanceof Error ? err.message : "Failed to load sticker set";
    log.logEventError("sticker_catalog_failed", err, { packName: normalized });
    return { ok: false, count: 0, error: lastError };
  }
}

export async function syncStickerCatalogFromSettings(
  api: Api,
  settings: Record<string, unknown>,
  log: BotHostLogging,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const stickersEnabled = Boolean(settings.stickersEnabled);
  const packName = String(settings.stickerPackName ?? "").trim();
  if (!stickersEnabled || !packName) {
    clearStickerCatalog();
    return { ok: true, count: 0 };
  }
  return refreshStickerCatalog(api, packName, log);
}
