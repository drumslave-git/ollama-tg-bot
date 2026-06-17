import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import {
  asObject,
  parseJsonContent,
  readBoolean,
  reasoningJsonUserTail,
  reasoningSchemaSystemSuffix,
  responseFormatForThinking,
  strictObjectSchema,
} from "@llm-tg-bot/modules-utils";

export const ADDRESS_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "address_decision",
    {
      addressed: {
        type: "boolean",
        description:
          "True when the message names the bot display name and should receive a reply.",
      },
    },
    ["addressed"],
  );

export function getAddressResponseFormat(
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return responseFormatForThinking(ADDRESS_RESPONSE_FORMAT, thinkingEnabled);
}

export const ANALYZER_SYSTEM = `You decide whether a group-chat message names a Telegram bot by its display name and should receive a reply.

@username mentions and replies to the bot are handled elsewhere. Your job is only the spoken display name.

Respond with JSON only, matching the provided schema. The object has one field:
- addressed (boolean): true when the bot should reply, false otherwise.

Say addressed=true only when the message names the bot display name:
- Exact match or clear spelling/case variation of that name
- The same name in another language or alphabet

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
  return {
    result: addressed,
    reason: addressed ? "LLM decision: yes" : "LLM decision: no",
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
  thinkingEnabled?: boolean;
}

export function buildAddressAnalyzerMessages(
  params: BuildAddressAnalyzerMessagesParams,
): ChatMessage[] {
  const nameScanNote =
    params.nameScanFound === false
      ? "Automated name scan: no display name found in the message text. " +
        "Say addressed=true only when the message clearly names the display name anyway " +
        "(e.g. another alphabet or language). " +
        "Second-person pronouns alone are not enough.\n"
      : "";

  return [
    {
      role: "system",
      content: ANALYZER_SYSTEM + reasoningSchemaSystemSuffix(!!params.thinkingEnabled),
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
        reasoningJsonUserTail("addressed true or false", !!params.thinkingEnabled),
    },
  ];
}
