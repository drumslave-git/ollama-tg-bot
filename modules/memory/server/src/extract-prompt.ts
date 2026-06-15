import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import {
  asObject,
  parseJsonContent,
  readStringArray,
  strictObjectSchema,
} from "@llm-tg-bot/modules-utils";

export const MEMORY_EXTRACT_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "memory_extract",
    {
      user_facts: {
        type: "array",
        items: { type: "string" },
        description:
          "New durable facts about the current speaker only; empty array when nothing new.",
      },
      group_facts: {
        type: "array",
        items: { type: "string" },
        description:
          "New durable facts about the group/chat itself; empty array when nothing new.",
      },
      general_facts: {
        type: "array",
        items: { type: "string" },
        description:
          "New cross-chat general knowledge; empty array when nothing new.",
      },
    },
    ["user_facts", "group_facts", "general_facts"],
  );

export const EXTRACTOR_SYSTEM = `You extract durable facts, terms, and useful long-term information from one addressed Telegram bot turn.

Respond with JSON only, matching the provided schema:
- user_facts (string[]): new information about the current speaker only — identity, preferences, role, timezone, standing instructions, how they want to be addressed. In group chats, never store other members' traits here.
- group_facts (string[]): new information about the group/chat itself — purpose, rules, recurring topics, in-jokes, ongoing shared context. Not facts about individual users. Use an empty array when nothing new or not a group chat.
- general_facts (string[]): facts that apply across all chats — glossary terms, definitions, project/domain facts, standing instructions not tied to one person or group.

Decide on your own. The user does not need to say "remember". Store information that would still matter in a future session.

Store when the user shares:
- who they are, preferences, standing instructions
- what this group is for, norms, ongoing context
- definitions, acronyms, terms, or useful domain/project knowledge
- corrections to prior assumptions

Do NOT store:
- greetings, jokes, sarcasm, or the assistant's own banter
- one-off questions, transient moods, or message metadata
- facts already listed under "Already stored"
- duplicates rephrased slightly
- user-specific traits in general_facts or group-only context in general_facts`;

export interface MemoryExtractInput {
  userMessage: string;
  replyContext: string | null;
  assistantReply: string;
  existingUserFacts: string[];
  existingGroupFacts: string[];
  existingGeneralFacts: string[];
  isGroupChat: boolean;
}

export interface MemoryExtractResult {
  userFacts: string[];
  groupFacts: string[];
  generalFacts: string[];
}

function formatStored(kind: string, facts: string[]): string {
  const content = facts.join("\n").trim();
  if (!content) return `(none yet for this ${kind})`;
  return content;
}

function normalizeFactLines(items: string[] | null): string[] {
  if (!items) return [];
  return items
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0 && !/^none$/i.test(line));
}

export function parseMemoryExtract(raw: string): MemoryExtractResult {
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed) {
    return { userFacts: [], groupFacts: [], generalFacts: [] };
  }
  return {
    userFacts: normalizeFactLines(readStringArray(parsed, "user_facts")),
    groupFacts: normalizeFactLines(readStringArray(parsed, "group_facts")),
    generalFacts: normalizeFactLines(readStringArray(parsed, "general_facts")),
  };
}

/** Build the memory-extraction prompt (system + user) for one addressed turn. */
export function buildMemoryExtractMessages(
  input: MemoryExtractInput,
): ChatMessage[] {
  const userBlock = formatStored("user", input.existingUserFacts);
  const groupBlock = input.isGroupChat
    ? formatStored("group", input.existingGroupFacts)
    : "Not a group chat - always return an empty group_facts array.";
  const generalBlock = formatStored("general", input.existingGeneralFacts);

  const replyContext = input.replyContext?.trim() ?? "";
  const hasReplyThread = replyContext.includes("[REPLY THREAD");

  let turn: string;
  if (hasReplyThread) {
    turn = `Message context:\n${replyContext}`;
  } else {
    turn = `User message:\n${input.userMessage.trim() || "(non-text message)"}`;
    if (replyContext) {
      turn += `\n\nReplied-to context:\n${replyContext}`;
    }
  }
  turn += `\n\nAssistant reply (for context only, do not store its jokes as facts):\n${input.assistantReply.trim()}`;

  return [
    { role: "system", content: EXTRACTOR_SYSTEM },
    {
      role: "user",
      content:
        `Already stored about this user:\n${userBlock}\n\n` +
        `Already stored about this group:\n${groupBlock}\n\n` +
        `Already stored general knowledge:\n${generalBlock}\n\n` +
        `---\n${turn}\n\n` +
        `Return JSON with user_facts, group_facts, and general_facts arrays.`,
    },
  ];
}
