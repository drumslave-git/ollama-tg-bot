import type { Context } from "grammy";
import type { BotHostServices } from "../../contracts/index.js";
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

  if (!(await extension.isOwner(grammyCtx))) {
    await services.replyToUser(grammyCtx, "Only the bot owner can use /explain.");
    return;
  }

  // The only supported target is a reply to one of the bot's own messages.
  const input = await extension.buildTurnInput(grammyCtx);
  if (!input) {
    await services.replyToUser(
      grammyCtx,
      `Reply to one of my messages with <code>/explain@${botUsername}</code> ` +
        `and I'll explain why I sent it, based on that message's debug trace.`,
    );
    return;
  }

  try {
    await runExplainTurn(grammyCtx, input, extension.deps);
  } catch {
    await services.replyToUser(grammyCtx, "Sorry, I could not explain.").catch(
      () => {},
    );
  }
}
