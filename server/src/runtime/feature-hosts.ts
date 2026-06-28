import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import type { Context } from "grammy";
import {
  type BotHostServices,
  type BotFeatureHost,
  type PipelineFeatureHost,
} from "../contracts/index.js";
import { addressingHost } from "../features/addressing/index.js";
import {
  historyRecordHost,
  intakeHistoryHost,
  turnSetupHost,
} from "../features/history/index.js";
import { visionReplyHost } from "../features/vision/index.js";
import {
  moodPipelineHost,
  personalityHost,
} from "../features/mood/index.js";
import {
  completionsHost,
  systemPromptHost,
} from "../features/completions/index.js";
import { stickerPipelineHost } from "../features/sticker/index.js";
import { botHost as completionsBotHost } from "../features/completions/index.js";
import { botHost as moodBotHost } from "../features/mood/index.js";
import { botHost as stickerBotHost } from "../features/sticker/index.js";
import { getSettings } from "../db/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { replyToUser } from "../bot/replies/replies-helpers.js";
import { createExplainExtensions } from "./explain-host.js";
import { createMoodExtensions } from "./mood-host.js";

// Built lazily inside getters (not as file-level consts) so the host
// imports are read at call time, after all features have finished
// initializing. A top-level array would hit a temporal-dead-zone error on
// the import cycle between hosts and their shared turn-services.

export function getIntakePipelineHosts(): PipelineFeatureHost[] {
  return [turnSetupHost, intakeHistoryHost, addressingHost];
}

/**
 * Hosts on the critical path: everything needed to produce and deliver the
 * text reply. Mood and sticker are intentionally excluded — they run after
 * delivery (see {@link getPostReplyPipelineHosts}) so their LLM calls don't
 * block the reply.
 */
export function getReplyPipelineHosts(): PipelineFeatureHost[] {
  return [visionReplyHost, systemPromptHost, personalityHost, completionsHost];
}

/**
 * Hosts that run after the text reply has been delivered. Their work (sticker
 * pick, history record, mood update for the next turn) is off the critical
 * path, so failures here never block or replace the reply already sent.
 */
export function getPostReplyPipelineHosts(): PipelineFeatureHost[] {
  return [stickerPipelineHost, historyRecordHost, moodPipelineHost];
}

/** Full queue host list in workflow/dashboard display order. */
export function getQueuePipelineHosts(): PipelineFeatureHost[] {
  return [
    visionReplyHost,
    systemPromptHost,
    personalityHost,
    moodPipelineHost,
    completionsHost,
    stickerPipelineHost,
    historyRecordHost,
  ];
}

export function getBotHosts(): BotFeatureHost[] {
  return [completionsBotHost, moodBotHost, stickerBotHost];
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
    getSettings: async () =>
      (await getSettings()) as unknown as Record<string, unknown>,
    replyToUser: (ctx, text) => replyToUser(ctx as Context, text),
    extensions: {
      ...createExplainExtensions(),
      ...createMoodExtensions(),
    },
  };
}

export function registerFeatureCommands(
  bot: Bot,
  services: BotHostServices,
): void {
  for (const host of getBotHosts()) {
    for (const command of host.commands ?? []) {
      bot.command(command.command, async (ctx) => {
        await command.handler(ctx, services);
      });
    }
  }
}

export function collectFeatureBotCommands(): BotCommand[] {
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
