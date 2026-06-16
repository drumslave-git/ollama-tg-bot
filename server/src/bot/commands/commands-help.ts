import type { BotCommand } from "grammy/types";

export const PUBLIC_BOT_COMMANDS: BotCommand[] = [
  { command: "start", description: "Intro and how to use the bot" },
  { command: "help", description: "List available commands" },
  { command: "id", description: "Your Telegram user id" },
  { command: "remember", description: "Save a fact to your personal memory" },
  { command: "forget", description: "Clear your stored memory" },
];

export function buildPublicCommandsHelp(
  botUsername: string,
  inGroup: boolean,
  extraCommands: BotCommand[] = [],
): string {
  const cmd = (name: string) =>
    inGroup ? `<code>/${name}@${botUsername}</code>` : `<code>/${name}</code>`;

  const lines = [
    ...PUBLIC_BOT_COMMANDS,
    ...extraCommands.filter(
      (extra) => !PUBLIC_BOT_COMMANDS.some((base) => base.command === extra.command),
    ),
  ].map((entry) => `${cmd(entry.command)} — ${entry.description}`);

  return (
    `<b>Commands</b>\n\n` +
    lines.join("\n") +
    (inGroup
      ? `\n\nIn groups, append <code>@${botUsername}</code> when privacy mode is on.`
      : "")
  );
}
