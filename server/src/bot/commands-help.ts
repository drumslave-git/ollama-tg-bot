import type { BotCommand } from "grammy/types";

export const PUBLIC_BOT_COMMANDS: BotCommand[] = [
  { command: "start", description: "Intro and how to use the bot" },
  { command: "help", description: "List available commands" },
  { command: "id", description: "Your Telegram user id" },
  { command: "mood", description: "Current mood traits and defaults" },
  { command: "remember", description: "Save a fact to your personal memory" },
  { command: "forget", description: "Clear your stored memory" },
];

export function buildPublicCommandsHelp(
  botUsername: string,
  inGroup: boolean,
): string {
  const cmd = (name: string) =>
    inGroup ? `<code>/${name}@${botUsername}</code>` : `<code>/${name}</code>`;

  return (
    `<b>Commands</b>\n\n` +
    `${cmd("start")} — intro and how to use the bot\n` +
    `${cmd("help")} — this list\n` +
    `${cmd("id")} — your Telegram user id\n` +
    `${cmd("mood")} — current mood traits and defaults\n` +
    `${cmd("remember")} — save a fact to your personal memory\n` +
    `${cmd("forget")} — clear your stored memory` +
    (inGroup
      ? `\n\nIn groups, append <code>@${botUsername}</code> when privacy mode is on.`
      : "")
  );
}
