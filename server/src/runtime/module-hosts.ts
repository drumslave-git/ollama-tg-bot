import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import type { Context } from "grammy";
import {
  type BotHostServices,
  type BotModuleHost,
  type PipelineModuleHost,
} from "@llm-tg-bot/modules-registry";
import { pipelineHosts as addressingPipelineHosts } from "@llm-tg-bot/modules-addressing-detection";
import { pipelineHosts as historyPipelineHosts } from "@llm-tg-bot/modules-history";
import { pipelineHosts as visionPipelineHosts } from "@llm-tg-bot/modules-vision";
import { pipelineHosts as moodPipelineHosts } from "@llm-tg-bot/modules-mood-evaluation";
import { pipelineHosts as completionsPipelineHosts } from "@llm-tg-bot/modules-completions";
import { pipelineHost as stickerPipelineHost } from "@llm-tg-bot/modules-sticker-selection";
import { botHost as completionsBotHost } from "@llm-tg-bot/modules-completions";
import { botHost as moodBotHost } from "@llm-tg-bot/modules-mood-evaluation";
import { botHost as stickerBotHost } from "@llm-tg-bot/modules-sticker-selection";
import { getSettings } from "../db/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { replyToUser } from "../bot/replies/replies-helpers.js";
import { createExplainExtensions } from "./explain-host.js";
import { createMoodExtensions } from "./mood-host.js";

const PHASE_ORDER: Record<string, number> = {
  preprocess: 0,
  gate: 1,
  "pre-reply": 2,
  reply: 3,
  "post-reply": 4,
};

function sortPipelineHosts(hosts: PipelineModuleHost[]): PipelineModuleHost[] {
  return hosts.sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return a.order - b.order;
  });
}

const CORE_PIPELINE_HOSTS: PipelineModuleHost[] = [
  ...historyPipelineHosts,
  ...addressingPipelineHosts,
  ...visionPipelineHosts,
  ...completionsPipelineHosts,
  ...moodPipelineHosts,
  stickerPipelineHost,
];

const CORE_BOT_HOSTS: BotModuleHost[] = [
  completionsBotHost,
  moodBotHost,
  stickerBotHost,
];

let pipelineHosts: PipelineModuleHost[] | null = null;
let botHosts: BotModuleHost[] | null = null;

export async function loadPipelineHosts(): Promise<PipelineModuleHost[]> {
  if (pipelineHosts) return pipelineHosts;
  pipelineHosts = sortPipelineHosts([...CORE_PIPELINE_HOSTS]);
  return pipelineHosts;
}

export function getPipelineHosts(): PipelineModuleHost[] {
  if (!pipelineHosts) {
    throw new Error("Pipeline hosts not loaded — call loadPipelineHosts() at startup");
  }
  return pipelineHosts;
}

export async function loadBotHosts(): Promise<BotModuleHost[]> {
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
