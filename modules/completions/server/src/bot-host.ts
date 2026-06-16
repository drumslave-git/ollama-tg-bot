import type { BotModuleHost } from "@llm-tg-bot/modules-registry";
import { handleExplainCommand } from "./explain-command.js";

export const botHost: BotModuleHost = {
  id: "completions",

  commands: [
    {
      command: "explain",
      description: "Owner: meta explanation of bot behavior",
      handler: handleExplainCommand,
    },
  ],
};
