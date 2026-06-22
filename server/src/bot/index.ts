import { Bot } from "grammy";
import { requireBotToken } from "../config/index.js";
import { logInfo } from "../logging/index.js";
import { setBotIdentity } from "../features/addressing/index.js";
import { PUBLIC_BOT_COMMANDS } from "./commands/commands-help.js";
import { registerHandlers } from "./handlers/index.js";
import {
  collectModuleBotCommands,
  runBotHostStartupHooks,
} from "../runtime/module-hosts.js";

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

  const allCommands = [...PUBLIC_BOT_COMMANDS, ...collectModuleBotCommands()];
  void bot.api.setMyCommands(allCommands).catch((err) => {
    console.error("Failed to register bot commands:", err);
  });

  void runBotHostStartupHooks(bot.api, botUsername, token).catch((err) => {
    console.error("Bot module startup hooks failed:", err);
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
