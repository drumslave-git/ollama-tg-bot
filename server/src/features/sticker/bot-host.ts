import type { Api } from "grammy";
import type { BotModuleHost, BotHostServices } from "../../contracts/index.js";
import { syncStickerCatalogFromSettings } from "./sticker-catalog.js";

export const botHost: BotModuleHost = {
  id: "sticker-selection",

  async onStart(services: BotHostServices): Promise<void> {
    await syncStickerCatalogFromSettings(
      services.api as Api,
      await services.getSettings(),
      services.logging,
    );
  },
};
