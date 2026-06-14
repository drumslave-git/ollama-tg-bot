import { Bot } from "grammy";
import { requireBotToken } from "../config.js";
import { logInfo } from "../logging.js";
import { setBotIdentity } from "./bot-identity.js";
import { PUBLIC_BOT_COMMANDS } from "./commands-help.js";
import { registerHandlers } from "./handlers.js";
import { syncStickerCatalogFromSettings } from "./sticker-catalog.js";

let botInstance: Bot | null = null;
let botUsername = "";

export function getBot(): Bot & { token: string } {
  if (!botInstance) throw new Error("Bot not initialized");
  return botInstance as Bot & { token: string };
}

export function getBotUsername(): string {
  return botUsername;
}

export async function startBot(): Promise<Bot> {
  const token = requireBotToken();
  const bot = new Bot(token);
  botInstance = bot;

  const me = await bot.api.getMe();
  botUsername = me.username ?? `bot${me.id}`;
  setBotIdentity(me, botUsername);

  registerHandlers(bot, botUsername);

  void bot.api.setMyCommands(PUBLIC_BOT_COMMANDS).catch((err) => {
    console.error("Failed to register bot commands:", err);
  });

  void syncStickerCatalogFromSettings(bot.api).catch((err) => {
    console.error("Sticker catalog sync failed:", err);
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  void bot.start({
    allowed_updates: ["message", "my_chat_member"],
    onStart: () => {
      logInfo(`Bot @${botUsername} is running`);
      logInfo(
        "Groups: @mention, reply, or use the bot's name. " +
          "Other messages are checked by the model for indirect address. " +
          "If @mentions are ignored, send /setprivacy to @BotFather and choose Disable.",
      );
    },
  });

  return bot;
}

export async function stopBot(): Promise<void> {
  if (botInstance) {
    await botInstance.stop();
    botInstance = null;
  }
}
