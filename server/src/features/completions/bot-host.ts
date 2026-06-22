import type { BotModuleHost } from "../../contracts/index.js";
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
