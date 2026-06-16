import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import type { Context } from "grammy";
import {
  discoverModuleManifests,
  type BotHostServices,
  type BotModuleHost,
  type ModuleManifest,
  type PipelineModuleHost,
} from "@llm-tg-bot/modules-registry";
import { resolveModulesRoot } from "./modules.js";
import { getSettings } from "../db/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { replyToUser } from "../bot/replies/replies-helpers.js";
import { createExplainExtensions } from "./explain-host.js";

type ServerManifest = ModuleManifest & { serverPackage: string };

const PHASE_ORDER: Record<string, number> = {
  preprocess: 0,
  gate: 1,
  "not-addressed": 2,
  "pre-reply": 3,
  reply: 4,
  "post-reply": 5,
  background: 6,
};

function serverManifests(): ServerManifest[] {
  return discoverModuleManifests(resolveModulesRoot()).filter(
    (manifest): manifest is ServerManifest => Boolean(manifest.serverPackage),
  );
}

function sortPipelineHosts(hosts: PipelineModuleHost[]): PipelineModuleHost[] {
  return hosts.sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return a.order - b.order;
  });
}

let pipelineHosts: PipelineModuleHost[] | null = null;
let botHosts: BotModuleHost[] | null = null;

export async function loadPipelineHosts(): Promise<PipelineModuleHost[]> {
  if (pipelineHosts) return pipelineHosts;

  const loaded: PipelineModuleHost[] = [];

  for (const manifest of serverManifests()) {
    const mod = (await import(manifest.serverPackage)) as {
      pipelineHost?: PipelineModuleHost;
      pipelineHosts?: PipelineModuleHost[];
    };

    const hosts = mod.pipelineHosts
      ? mod.pipelineHosts
      : mod.pipelineHost
        ? [mod.pipelineHost]
        : [];

    for (const host of hosts) {
      if (host.id !== manifest.id) {
        throw new Error(
          `Module ${manifest.id} pipelineHost.id mismatch: ${host.id}`,
        );
      }
      loaded.push(host);
    }
  }

  pipelineHosts = sortPipelineHosts(loaded);
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

  const loaded: BotModuleHost[] = [];

  for (const manifest of serverManifests()) {
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
    replyToUser: (ctx, text) => replyToUser(ctx as Context, text),
    extensions: createExplainExtensions(),
  };
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
