import type { Context } from "grammy";
import { recordPassiveGroupHistory } from "../history-record.js";
import { logEventError } from "../../event-log.js";

export async function passiveHistoryMiddleware(ctx: Context, next: () => Promise<void>, token: string) {
  try {
    await recordPassiveGroupHistory(ctx, token);
  } catch (err) {
    logEventError("passive_history_failed", err, {
      chatId: ctx.chat?.id,
      messageId: ctx.message?.message_id,
    });
  }
  await next();
}
