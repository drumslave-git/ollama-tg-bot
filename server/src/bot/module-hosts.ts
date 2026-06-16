import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import type { Context } from "grammy";
import {
  discoverModuleManifests,
  type BotHostServices,
  type BotMiddlewareRegistration,
  type BotModuleHost,
  type ModuleManifest,
} from "@llm-tg-bot/modules-registry";
import { resolveModulesRoot } from "../runtime/modules.js";
import { getSettings } from "../db/database.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { resolveConversationKey } from "./conversation.js";
import { isMaintenanceBlocked } from "./maintenance.js";
import { isSlashCommandMessage } from "./slash-command.js";
import { enrichTextWithUserMentions } from "./mentions.js";
import {
  loadVisionFromMessage,
  messageHasVisionMedia,
} from "./message-media.js";
import { describeVisionImages } from "./vision-describe.js";
import { stickerPackEmoji } from "./stickers.js";
import { replyToUser } from "./replies-helpers.js";

let botHosts: BotModuleHost[] | null = null;

export async function loadBotHosts(): Promise<BotModuleHost[]> {
  if (botHosts) return botHosts;

  const manifests = discoverModuleManifests(resolveModulesRoot()).filter(
    (manifest): manifest is ModuleManifest & { serverPackage: string } =>
      Boolean(manifest.serverPackage),
  );

  const loaded: BotModuleHost[] = [];

  for (const manifest of manifests) {
    const mod = (await import(manifest.serverPackage)) as {
      botHost?: BotModuleHost;
    };
    if (!mod.botHost) continue;
    if (mod.botHost.id !== manifest.id) {
      throw new Error(
        `Module ${manifest.id} botHost.id mismatch: ${mod.botHost.id}`,
      );
    }
    loaded.push(mod.botHost);
  }

  botHosts = loaded;
  return botHosts;
}

export function getBotHosts(): BotModuleHost[] {
  if (!botHosts) {
    throw new Error("Bot hosts not loaded — call loadBotHosts() at startup");
  }
  return botHosts;
}

export function createBotHostServices(
  api: unknown,
  botUsername: string,
  botToken: string,
): BotHostServices {
  return {
    api,
    botUsername,
    botToken,
    logging: {
      logEvent: (event, fields) => logEvent(event, fields as never),
      logEventError: (event, err, fields) =>
        logEventError(event, err, fields as never),
    },
    getSettings: () => getSettings() as unknown as Record<string, unknown>,
    callbacks: {
      resolveConversationKey: (ctx) =>
        resolveConversationKey(ctx as Context),
      isMaintenanceBlocked: (ctx) => isMaintenanceBlocked(ctx as Context),
      isSlashCommandMessage: (ctx) => isSlashCommandMessage(ctx as Context),
      enrichTextWithUserMentions: (text, message, options) =>
        enrichTextWithUserMentions(text, message as never, options),
      loadVisionFromMessage: (token, message) =>
        loadVisionFromMessage(token, message as never),
      messageHasVisionMedia: (message) => messageHasVisionMedia(message as never),
      describeVisionImages: (images, msgLog, visionHint) =>
        describeVisionImages(images as never, msgLog as never, visionHint),
      stickerPackEmoji: (sticker) => stickerPackEmoji(sticker as never),
      replyToUser: (ctx, text) => replyToUser(ctx as Context, text),
    },
  };
}

function collectMiddlewares(): BotMiddlewareRegistration[] {
  return getBotHosts()
    .flatMap((host) => host.middlewares ?? [])
    .sort((a, b) => a.order - b.order);
}

export function registerModuleMiddlewares(
  bot: Bot,
  services: BotHostServices,
): void {
  for (const middleware of collectMiddlewares()) {
    bot.use((ctx, next) => middleware.handler(ctx, next, services));
  }
}

export function registerModuleCommands(
  bot: Bot,
  services: BotHostServices,
): void {
  for (const host of getBotHosts()) {
    for (const command of host.commands ?? []) {
      bot.command(command.command, (ctx) =>
        command.handler(ctx, services),
      );
    }
  }
}

export function collectModuleBotCommands(): BotCommand[] {
  return getBotHosts().flatMap(
    (host) =>
      host.commands?.map((command) => ({
        command: command.command,
        description: command.description,
      })) ?? [],
  );
}

export async function runBotHostStartupHooks(
  api: unknown,
  botUsername: string,
  botToken: string,
): Promise<void> {
  const services = createBotHostServices(api, botUsername, botToken);
  for (const host of getBotHosts()) {
    if (!host.onStart) continue;
    await host.onStart(services);
  }
}
