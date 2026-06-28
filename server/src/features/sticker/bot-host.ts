import type { Api } from "grammy";
import type { BotFeatureHost, BotHostServices } from "../../contracts/index.js";
import { syncStickerCatalogFromSettings } from "./sticker-catalog.js";

export const botHost: BotFeatureHost = {
  id: "sticker-selection",

  async onStart(services: BotHostServices): Promise<void> {
    await syncStickerCatalogFromSettings(
      services.api as Api,
      await services.getSettings(),
      services.logging,
    );
  },
};
