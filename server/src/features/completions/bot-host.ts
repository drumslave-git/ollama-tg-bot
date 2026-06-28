import type { BotFeatureHost } from "../../contracts/index.js";
import { handleExplainCommand } from "./explain-command.js";

export const botHost: BotFeatureHost = {
  id: "completions",

  commands: [
    {
      command: "explain",
      description: "Owner: meta explanation of bot behavior",
      handler: handleExplainCommand,
    },
  ],
};
