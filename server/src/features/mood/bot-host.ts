import type { Context } from "grammy";
import type { BotFeatureHost, BotHostServices } from "../../contracts/index.js";
import { buildMoodCommandReply } from "./mood-command.js";
import {
  MOOD_EXTENSION_ID,
  type MoodCommandExtension,
} from "./mood-command-types.js";

function readMoodExtension(
  services: BotHostServices,
): MoodCommandExtension | null {
  const extension = services.extensions[MOOD_EXTENSION_ID];
  return extension ? (extension as MoodCommandExtension) : null;
}

export const botHost: BotFeatureHost = {
  id: "mood-evaluation",

  commands: [
    {
      command: "mood",
      description: "Current mood traits and defaults",
      handler: async (ctx, services) => {
        const grammyCtx = ctx as Context;
        const extension = readMoodExtension(services);
        if (!extension) {
          throw new Error("Mood extension is not configured");
        }

        try {
          await services.replyToUser(
            grammyCtx,
            await buildMoodCommandReply(await services.getSettings(), extension),
          );
        } catch (err) {
          console.error("/mood command error:", err);
          await services.replyToUser(grammyCtx, "Sorry, I could not load mood.").catch(
            (e) => console.error("Failed to send /mood error reply:", e),
          );
        }
      },
    },
  ],
};
