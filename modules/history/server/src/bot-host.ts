import type { Context } from "grammy";
import type { BotModuleHost } from "@llm-tg-bot/modules-registry";
import { recordPassiveGroupHistory } from "./passive-history.js";

export const botHost: BotModuleHost = {
  id: "history",

  middlewares: [
    {
      order: 10,
      handler: async (ctx, next, services) => {
        try {
          await recordPassiveGroupHistory(ctx as Context, services);
        } catch (err) {
          const grammyCtx = ctx as Context;
          services.logging.logEventError("passive_history_failed", err, {
            chatId: grammyCtx.chat?.id,
            messageId: grammyCtx.message?.message_id,
          });
        }
        await next();
      },
    },
  ],
};
