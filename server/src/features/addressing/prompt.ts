import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  jsonReplyTail,
  parseJsonContent,
  readString,
  strictObjectSchema,
} from "../../shared/index.js";

/** Enum values for how the display name appears; anything but "absent" replies. */
export const NAME_MATCH_VALUES = [
  "exact",
  "other_alphabet",
  "inflected",
  "absent",
] as const;
export type NameMatch = (typeof NAME_MATCH_VALUES)[number];

// A bounded enum, not a free-text reasoning field: it forces the model to commit
// a structured conclusion in the constrained stream (so the decision can't
// contradict the model's thinking) without giving it a string field to run away
// into a repetition loop. `addressed` is derived from this in code, never sampled.
export const ADDRESS_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "address_decision",
    {
      name_match: {
        type: "string",
        enum: [...NAME_MATCH_VALUES],
        description:
          "How the bot display name appears in the message: 'exact' (same spelling or case variation), 'other_alphabet' (the same name in another language or alphabet, e.g. Cyrillic of a Latin name), 'inflected' (a vocative or declined grammatical form), or 'absent' (the name is not present).",
      },
    },
    ["name_match"],
  );

export function getAddressResponseFormat(): JsonSchemaResponseFormat {
  return ADDRESS_RESPONSE_FORMAT;
}

export const ANALYZER_SYSTEM = `You decide whether a group-chat message names a Telegram bot by its display name and should receive a reply.

@username mentions and replies to the bot are handled elsewhere. Your job is only the spoken display name.

Respond with JSON only, matching the provided schema. The object has one field:
- name_match (string): classify how the bot display name appears in the message.

Set name_match to a present form when the message names the bot display name:
- "exact" — exact match or clear spelling/case variation of that name
- "other_alphabet" — the same name in another language or alphabet (e.g. a Cyrillic spelling of a Latin name)
- "inflected" — a vocative or otherwise declined grammatical form of the name (many languages inflect names when addressing someone)

Set name_match to "absent" when:
- The display name does not appear and is not clearly referenced
- Humans chat among themselves; second-person "you" alone is not the bot name
- Generic words like "bot", "assistant", or "AI" without the specific display name
- Background banter the bot should not interrupt

Example (absent): "Today I got a request that you need to be put on extended leave" — "you" refers to another person; the display name does not appear.`;

export function parseAddressDecision(raw: string): {
  result: boolean;
  reason: string;
} {
  const parsed = asObject(parseJsonContent(raw));
  const match = parsed ? readString(parsed, "name_match") : null;
  if (!match || !NAME_MATCH_VALUES.includes(match as NameMatch)) {
    return { result: false, reason: "Could not parse LLM address decision" };
  }
  const addressed = match !== "absent";
  return {
    result: addressed,
    reason: addressed
      ? `LLM decision: yes — name appears as ${match}`
      : "LLM decision: no — name absent",
  };
}

export function formatBotIdentity(username: string, displayName: string): string {
  const handle = `@${username.replace(/^@/, "")}`;
  const name = displayName.trim();
  if (!name) return `Username: ${handle}; no display name configured`;
  return `Username: ${handle}; display name: ${name}`;
}

export interface BuildAddressAnalyzerMessagesParams {
  botIdentity: string;
  chatType: string;
  sender: string;
  text: string;
  /** When false, a regex scan found no display name in the message text. */
  nameScanFound?: boolean;
}

export function buildAddressAnalyzerMessages(
  params: BuildAddressAnalyzerMessagesParams,
): ChatMessage[] {
  const nameScanNote =
    params.nameScanFound === false
      ? "Automated name scan did not find a literal match, but it only catches exact " +
        "spellings in the bot's own language — it misses transliterations, other " +
        "alphabets, and inflected forms. Judge the message yourself: set addressed=true " +
        "if it names the display name in any language, alphabet, or grammatical form. " +
        "Second-person pronouns alone are not enough.\n"
      : "";

  return [
    {
      role: "system",
      content: ANALYZER_SYSTEM,
    },
    {
      role: "user",
      content:
        `Bot identity: ${params.botIdentity}\n` +
        `@username mentions are already handled; check only for the display name.\n` +
        nameScanNote +
        `Chat type: ${params.chatType}\n` +
        `Sender: ${params.sender}\n\n` +
        `Message:\n${params.text.trim() || "(empty or non-text)"}\n\n` +
        jsonReplyTail("the name_match field"),
    },
  ];
}
