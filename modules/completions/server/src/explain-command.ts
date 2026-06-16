import type { Context } from "grammy";
import type { BotHostServices } from "@llm-tg-bot/modules-registry";
import {
  EXPLAIN_EXTENSION_ID,
  type ExplainExtension,
} from "./explain-types.js";
import { runExplainTurn } from "./explain-turn.js";

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

  const question = extension.resolveCommandText(
    grammyCtx,
    String(grammyCtx.match ?? ""),
  );
  if (!question) {
    await services.replyToUser(
      grammyCtx,
      `Usage: <code>/explain@${botUsername} your question</code>\n` +
        `Or reply to a message with <code>/explain@${botUsername}</code>\n` +
        `Example: <code>/explain why are you so aggressive?</code>\n\n` +
        `Answers honestly about configuration and memories — not in character.`,
    );
    return;
  }

  const input = extension.buildTurnInput(grammyCtx, question);
  if (!input) return;

  try {
    await runExplainTurn(grammyCtx, input, extension.deps);
  } catch {
    await services.replyToUser(grammyCtx, "Sorry, I could not explain.").catch(
      () => {},
    );
  }
}
