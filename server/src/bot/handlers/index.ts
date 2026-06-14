import type { Bot } from "grammy";
import { trackingMiddleware } from "./tracking.js";
import { passiveHistoryMiddleware } from "./passive-history.js";
import { groupSetupHandler } from "./group-setup.js";
import { messageHandler } from "./message.js";
import { registerBotCommands } from "../commands/index.js";

export function registerHandlers(bot: Bot, botUsername: string): void {
  bot.use(trackingMiddleware);

  registerBotCommands(bot, botUsername);

  bot.use((ctx, next) => passiveHistoryMiddleware(ctx, next, bot.token));

  bot.on("message", (ctx) => messageHandler(ctx, bot.token));

  bot.on("my_chat_member", (ctx) => groupSetupHandler(ctx, botUsername));
}
