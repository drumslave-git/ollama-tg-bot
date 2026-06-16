import type { UserFromGetMe } from "grammy/types";
import {
  buildBotAddressIdentity,
  type BotAddressIdentity,
} from "@llm-tg-bot/modules-addressing-detection";

export type { BotAddressIdentity };

export {
  buildBotAddressIdentity,
  messageReferencesBotByName,
  stripBotAddressing,
} from "@llm-tg-bot/modules-addressing-detection";

let identity: BotAddressIdentity | null = null;

export function setBotIdentity(me: UserFromGetMe, username: string): void {
  identity = buildBotAddressIdentity(me, username);
}

export function getBotIdentity(): BotAddressIdentity {
  if (!identity) {
    throw new Error("Bot identity not initialized");
  }
  return identity;
}
