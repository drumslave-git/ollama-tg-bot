import type { Context } from "grammy";
import type { BotModuleHost } from "@llm-tg-bot/modules-registry";
import { buildMoodCommandReply } from "./mood-command.js";

export const botHost: BotModuleHost = {
  id: "mood-evaluation",

  commands: [
    {
      command: "mood",
      description: "Current mood traits and defaults",
      handler: async (ctx, services) => {
        const grammyCtx = ctx as Context;
        const reply = services.callbacks.replyToUser;
        if (!reply) return;
        try {
          await reply(
            grammyCtx,
            buildMoodCommandReply(services.getSettings()),
          );
        } catch (err) {
          console.error("/mood command error:", err);
          await reply(grammyCtx, "Sorry, I could not load mood.").catch((e) =>
            console.error("Failed to send /mood error reply:", e),
          );
        }
      },
    },
  ],
};
