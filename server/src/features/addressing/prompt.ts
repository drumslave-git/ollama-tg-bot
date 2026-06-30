import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  jsonReplyTail,
  parseJsonContent,
  readBoolean,
  readString,
  strictObjectSchema,
} from "../../shared/index.js";

export const ADDRESS_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "address_decision",
    {
      // `reasoning` is intentionally first so the constrained decode commits a
      // written conclusion *before* sampling the boolean — otherwise the single
      // boolean token can contradict the model's separate thinking channel.
      reasoning: {
        type: "string",
        description:
          "One or two sentences: is the bot display name present (in any language, alphabet, or grammatical form)? End with your conclusion. Decide here before setting addressed.",
      },
      addressed: {
        type: "boolean",
        description:
          "True when the message names the bot display name and should receive a reply. Must follow from `reasoning`.",
      },
    },
    ["reasoning", "addressed"],
  );

export function getAddressResponseFormat(): JsonSchemaResponseFormat {
  return ADDRESS_RESPONSE_FORMAT;
}

export const ANALYZER_SYSTEM = `You decide whether a group-chat message names a Telegram bot by its display name and should receive a reply.

@username mentions and replies to the bot are handled elsewhere. Your job is only the spoken display name.

Respond with JSON only, matching the provided schema. The object has two fields, in this order:
- reasoning (string): think first — is the display name present, including in another language, alphabet, or grammatical form? End with your conclusion.
- addressed (boolean): true when the bot should reply, false otherwise. This MUST follow from your reasoning.

Say addressed=true when the message names the bot display name:
- Exact match or clear spelling/case variation of that name
- The same name in another language or alphabet (e.g. a Cyrillic spelling of a Latin name)
- A vocative or otherwise declined grammatical form of the name (many languages inflect names when addressing someone)

Say addressed=false when:
- The display name does not appear and is not clearly referenced
- Humans chat among themselves; second-person "you" alone is not the bot name
- Generic words like "bot", "assistant", or "AI" without the specific display name
- Background banter the bot should not interrupt

Example (addressed=false): "Today I got a request that you need to be put on extended leave" — "you" refers to another person; the display name does not appear.`;

export function parseAddressDecision(raw: string): {
  result: boolean;
  reason: string;
} {
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed) {
    return { result: false, reason: "Could not parse LLM address decision" };
  }
  const addressed = readBoolean(parsed, "addressed");
  if (addressed === null) {
    return { result: false, reason: "Could not parse LLM address decision" };
  }
  const modelReasoning = readString(parsed, "reasoning");
  const decision = addressed ? "LLM decision: yes" : "LLM decision: no";
  return {
    result: addressed,
    reason: modelReasoning ? `${decision} — ${modelReasoning}` : decision,
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
        jsonReplyTail("reasoning first, then addressed true or false"),
    },
  ];
}
