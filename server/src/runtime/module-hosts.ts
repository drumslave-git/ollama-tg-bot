import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import type { Context } from "grammy";
import {
  type BotHostServices,
  type BotModuleHost,
  type PipelineModuleHost,
} from "@llm-tg-bot/modules-registry";
import {
  addressingHost,
  replyTriggersHost,
} from "@llm-tg-bot/modules-addressing-detection";
import {
  historyInjectHost,
  historyRecordHost,
  intakeHistoryHost,
  turnSetupHost,
} from "@llm-tg-bot/modules-history";
import { visionReplyHost } from "@llm-tg-bot/modules-vision";
import {
  moodPipelineHost,
  personalityHost,
} from "@llm-tg-bot/modules-mood-evaluation";
import {
  completionsHost,
  systemPromptHost,
} from "@llm-tg-bot/modules-completions";
import { stickerPipelineHost } from "@llm-tg-bot/modules-sticker-selection";
import { botHost as completionsBotHost } from "@llm-tg-bot/modules-completions";
import { botHost as moodBotHost } from "@llm-tg-bot/modules-mood-evaluation";
import { botHost as stickerBotHost } from "@llm-tg-bot/modules-sticker-selection";
import { getSettings } from "../db/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { replyToUser } from "../bot/replies/replies-helpers.js";
import { createExplainExtensions } from "./explain-host.js";
import { createMoodExtensions } from "./mood-host.js";

const INTAKE_PIPELINE_HOSTS: PipelineModuleHost[] = [
  turnSetupHost,
  intakeHistoryHost,
  replyTriggersHost,
  addressingHost,
];

const QUEUE_PIPELINE_HOSTS: PipelineModuleHost[] = [
  visionReplyHost,
  systemPromptHost,
  personalityHost,
  historyInjectHost,
  moodPipelineHost,
  completionsHost,
  stickerPipelineHost,
  historyRecordHost,
];

const CORE_BOT_HOSTS: BotModuleHost[] = [
  completionsBotHost,
  moodBotHost,
  stickerBotHost,
];

let pipelineHosts: PipelineModuleHost[] | null = null;
let botHosts: BotModuleHost[] | null = null;

export function loadPipelineHosts(): PipelineModuleHost[] {
  if (pipelineHosts) return pipelineHosts;
  pipelineHosts = [...INTAKE_PIPELINE_HOSTS, ...QUEUE_PIPELINE_HOSTS];
  return pipelineHosts;
}

export function getPipelineHosts(): PipelineModuleHost[] {
  if (!pipelineHosts) {
    throw new Error("Pipeline hosts not loaded — call loadPipelineHosts() at startup");
  }
  return pipelineHosts;
}

export function getIntakePipelineHosts(): PipelineModuleHost[] {
  if (!pipelineHosts) {
    throw new Error("Pipeline hosts not loaded — call loadPipelineHosts() at startup");
  }
  return INTAKE_PIPELINE_HOSTS;
}

export function getQueuePipelineHosts(): PipelineModuleHost[] {
  if (!pipelineHosts) {
    throw new Error("Pipeline hosts not loaded — call loadPipelineHosts() at startup");
  }
  return QUEUE_PIPELINE_HOSTS;
}

export function loadBotHosts(): BotModuleHost[] {
  if (botHosts) return botHosts;
  botHosts = [...CORE_BOT_HOSTS];
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
    replyToUser: (ctx, text) => replyToUser(ctx as Context, text),
    extensions: {
      ...createExplainExtensions(),
      ...createMoodExtensions(),
    },
  };
}

export function registerModuleCommands(
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
