import type { ChatMessage } from "../llm/client.js";
import type { BotIdentity } from "./bot-identity.js";
import { extractLastClosedBlock } from "../response-format.js";

/**
 * Pure prompt + parsing helpers for the group name-variant address analyzer.
 * Kept free of DB/LLM imports so they can be unit-tested and driven by live tests.
 */
export const ANALYZER_SYSTEM = `You decide whether a group-chat message explicitly names a specific Telegram bot and should receive a reply.

Output ONLY:

[ADDRESS]
yes
[/ADDRESS]

or

[ADDRESS]
no
[/ADDRESS]

Say yes only when the message contains a reference to the bot identity:
- The bot's username, first name, full name, nickname, or a clear spelling/case/punctuation variation
- A clear translation/transliteration of the bot's name into another language
- A natural-language call to that named bot, such as "<bot name>, what do you think?"

Say no when:
- Humans are chatting among themselves with no request aimed at the bot
- The bot is not named, even if the message asks a general question or sounds like it wants an assistant
- The message says "bot", "assistant", "AI", or similar generic words without the specific bot name
- It is background banter the bot should not interrupt`;

export function parseAddressDecision(raw: string): boolean {
  let value = extractLastClosedBlock(raw, "ADDRESS")?.toLowerCase() ?? "";

  if (!value) {
    const unclosed = raw.match(/\[ADDRESS\]\s*(yes|no)\b\s*$/i);
    value = unclosed?.[1]?.toLowerCase() ?? "";
  }

  if (!value) return false;
  if (/^no\b/.test(value) || value === "n") return false;
  return /^y(es)?\b/.test(value) || value === "y";
}

export function formatBotNamesForAnalyzer(bot: BotIdentity): string {
  const labels = new Set<string>();
  labels.add(`@${bot.username}`);
  for (const alias of bot.aliases) {
    if (alias.length >= 3) labels.add(alias);
  }
  return [...labels].join(", ");
}

/** Build the address-analyzer prompt (system + user) for the name-variant LLM check. */
export function buildAddressAnalyzerMessages(params: {
  botLabels: string;
  chatType: string;
  sender: string;
  text: string;
}): ChatMessage[] {
  return [
    { role: "system", content: ANALYZER_SYSTEM },
    {
      role: "user",
      content:
        `Bot identity (names users may use): ${params.botLabels}\n` +
        `Chat type: ${params.chatType}\n` +
        `Sender: ${params.sender}\n\n` +
        `Message:\n${params.text.trim() || "(empty or non-text)"}`,
    },
  ];
}
