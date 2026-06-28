import type { Bot } from "grammy";
import { trackingMiddleware } from "./tracking.js";
import { groupSetupHandler } from "./group-setup.js";
import { messageHandler } from "./message.js";
import { registerBotCommands } from "../commands/index.js";
import {
  createBotHostServices,
  registerFeatureCommands,
} from "../../runtime/feature-hosts.js";

export function registerHandlers(bot: Bot, botUsername: string): void {
  const services = createBotHostServices(bot.api, botUsername, bot.token);

  bot.use(trackingMiddleware);

  registerBotCommands(bot, botUsername);
  registerFeatureCommands(bot, services);

  bot.on("message", (ctx) => messageHandler(ctx, bot.token));

  bot.on("my_chat_member", (ctx) => groupSetupHandler(ctx, botUsername));
}
