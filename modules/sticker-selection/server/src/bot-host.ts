import type { Api } from "grammy";
import type { BotModuleHost, BotHostServices } from "@llm-tg-bot/modules-registry";
import { syncStickerCatalogFromSettings } from "./sticker-catalog.js";

export const botHost: BotModuleHost = {
  id: "sticker-selection",

  async onStart(services: BotHostServices): Promise<void> {
    await syncStickerCatalogFromSettings(
      services.api as Api,
      services.getSettings(),
      services.logging,
    );
  },
};
