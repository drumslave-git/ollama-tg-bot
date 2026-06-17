import type { Context } from "grammy";
import type { BotHostServices } from "@llm-tg-bot/modules-registry";
import {
  EXPLAIN_EXTENSION_ID,
  type ExplainExtension,
} from "./explain-types.js";
import { runExplainTurn } from "./explain-turn.js";

function formatExplainQuestion(resolution: {
  text: string;
  fromReply: boolean;
}): string {
  const { text, fromReply } = resolution;
  if (fromReply) {
    return (
      `The owner used /explain on a specific bot message. ` +
      `Give a meta explanation of why the bot would have sent this (cite personality, base prompt, memories, or history). ` +
      `Do not continue the roleplay or speak in character.\n\n` +
      `Bot message:\n${text}`
    );
  }
  return `The owner asks: ${text}`;
}

function readExplainExtension(
  services: BotHostServices,
): ExplainExtension | null {
  const extension = services.extensions[EXPLAIN_EXTENSION_ID];
  return extension ? (extension as ExplainExtension) : null;
}

export async function handleExplainCommand(
  ctx: unknown,
  services: BotHostServices,
): Promise<void> {
  const extension = readExplainExtension(services);
  if (!extension) {
    throw new Error("Explain extension is not configured");
  }

  const grammyCtx = ctx as Context;
  const botUsername = services.botUsername;

  if (!extension.isOwner(grammyCtx)) {
    await services.replyToUser(grammyCtx, "Only the bot owner can use /explain.");
    return;
  }

  const resolution = extension.resolveCommandText(
    grammyCtx,
    String(grammyCtx.match ?? ""),
  );
  if (!resolution) {
    await services.replyToUser(
      grammyCtx,
      `Usage: <code>/explain@${botUsername} your question</code>\n` +
        `Or reply to a message with <code>/explain@${botUsername}</code>\n` +
        `Example: <code>/explain why are you so aggressive?</code>\n\n` +
        `Answers honestly about configuration and memories — not in character.`,
    );
    return;
  }

  const input = extension.buildTurnInput(
    grammyCtx,
    formatExplainQuestion(resolution),
  );
  if (!input) return;

  try {
    await runExplainTurn(grammyCtx, input, extension.deps);
  } catch {
    await services.replyToUser(grammyCtx, "Sorry, I could not explain.").catch(
      () => {},
    );
  }
}
