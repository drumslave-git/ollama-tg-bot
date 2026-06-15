import type { ChatMessage } from "@llm-tg-bot/modules-utils";
import { extractLastClosedBlock } from "@llm-tg-bot/modules-utils";

export const ADDRESS_TAG = "ADDRESS";

export const ANALYZER_SYSTEM = `You decide whether a group-chat message explicitly names a specific Telegram bot and should receive a reply.

Your entire assistant message must be exactly one of these two blocks — nothing before, nothing after, no other text or tags:

[ADDRESS]
yes
[/ADDRESS]

or

[ADDRESS]
no
[/ADDRESS]

Output rules (mandatory):
- Put the decision only in the assistant message content using the [ADDRESS]…[/ADDRESS] block above.
- The only line inside the block must be exactly "yes" or "no" (lowercase).
- Always include both [ADDRESS] and [/ADDRESS] on their own lines.
- Do not output [yes], [no], or any tag other than [ADDRESS].
- Do not output reasoning, analysis, or explanation — only the block.

Say yes only when the message contains a reference to the bot identity:
- The bot's username, first name, full name, nickname, or a clear spelling/case/punctuation variation
- A clear translation/transliteration of the bot's name into another language
- A natural-language call to that named bot, such as "<bot name>, what do you think?"

Say no when:
- Humans are chatting among themselves with no request aimed at the bot
- The bot is not named, even if the message asks a general question or sounds like it wants an assistant
- The message says "bot", "assistant", "AI", or similar generic words without the specific bot name
- It is background banter the bot should not interrupt`;

export function parseAddressDecision(raw: string): {
  result: boolean;
  reason: string;
} {
  let value = extractLastClosedBlock(raw, ADDRESS_TAG)?.toLowerCase() ?? "";

  if (!value) {
    const unclosed = raw.match(/\[ADDRESS\]\s*(yes|no)\b\s*$/i);
    value = unclosed?.[1]?.toLowerCase() ?? "";
  }

  if (!value) {
    return { result: false, reason: "Could not parse LLM address decision" };
  }
  if (/^no\b/.test(value) || value === "n") {
    return { result: false, reason: "LLM decision: no" };
  }
  if (/^y(es)?\b/.test(value) || value === "y") {
    return { result: true, reason: "LLM decision: yes" };
  }
  return { result: false, reason: "Could not parse LLM address decision" };
}

export function formatBotLabels(botAliases: string[]): string {
  const labels = new Set<string>();
  const [username, ...aliases] = botAliases;
  if (username?.trim()) {
    labels.add(`@${username.replace(/^@/, "")}`);
  }
  for (const alias of aliases) {
    if (alias.length >= 3) labels.add(alias);
  }
  return [...labels].join(", ");
}

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
        `Treat these as bot-name references even when case, punctuation, underscores/spaces, minor spelling, or Latin/Cyrillic transliteration differs.\n` +
        `Chat type: ${params.chatType}\n` +
        `Sender: ${params.sender}\n\n` +
        `Message:\n${params.text.trim() || "(empty or non-text)"}\n\n` +
        `Reply with only one [ADDRESS]…[/ADDRESS] block containing yes or no.`,
    },
  ];
}
