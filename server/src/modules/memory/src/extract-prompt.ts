import type { ChatMessage } from "@llm-tg-bot/modules-utils";
import { extractLastClosedBlock } from "@llm-tg-bot/modules-utils";

export const MEMORY_TAG = "MEMORY";
export const GROUP_MEMORY_TAG = "GROUP_MEMORY";
export const GENERAL_MEMORY_TAG = "GENERAL_MEMORY";

export const EXTRACTOR_SYSTEM = `You extract durable facts, terms, and useful long-term information from one addressed Telegram bot turn.

Your entire assistant message content must be exactly these three blocks — nothing before, nothing after, no other text or tags:

[MEMORY]
none
[/MEMORY]
[GROUP_MEMORY]
none
[/GROUP_MEMORY]
[GENERAL_MEMORY]
none
[/GENERAL_MEMORY]

Output rules (mandatory):
- Put extracted facts only in assistant message content using the blocks above — not in reasoning or analysis.
- Always include all three blocks with opening and closing tags on their own lines.
- The only content inside each block is one fact per line, or exactly "none" (lowercase) when nothing new.
- Do not output bare facts without blocks, or tags other than [MEMORY], [GROUP_MEMORY], and [GENERAL_MEMORY].
- Do not output reasoning, analysis, or explanation — only the three blocks.

[MEMORY] = new information about the current speaker only: identity, preferences, role, timezone, standing instructions, how they want to be addressed. One item per line. "none" if nothing new. In group chats, never store other members' traits here.

[GROUP_MEMORY] = new information about the group/chat itself: purpose, rules, recurring topics, in-jokes, ongoing shared context, what this chat is for. Not facts about individual users. "none" if nothing new or not a group chat.

[GENERAL_MEMORY] = facts that apply across all chats: glossary terms, definitions, project/domain facts, standing instructions not tied to one person or group. "none" if nothing new.

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
- user-specific traits in [GENERAL_MEMORY] or group-only context in [GENERAL_MEMORY]`;

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

function parseMemoryLines(block: string): string[] {
  const trimmed = block.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return [];

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0 && !/^none$/i.test(line));
}

export function parseMemoryExtract(raw: string): MemoryExtractResult {
  return {
    userFacts: parseMemoryLines(
      extractLastClosedBlock(raw, MEMORY_TAG) ?? "",
    ),
    groupFacts: parseMemoryLines(
      extractLastClosedBlock(raw, GROUP_MEMORY_TAG) ?? "",
    ),
    generalFacts: parseMemoryLines(
      extractLastClosedBlock(raw, GENERAL_MEMORY_TAG) ?? "",
    ),
  };
}

/** Build the memory-extraction prompt (system + user) for one addressed turn. */
export function buildMemoryExtractMessages(
  input: MemoryExtractInput,
): ChatMessage[] {
  const userBlock = formatStored("user", input.existingUserFacts);
  const groupBlock = input.isGroupChat
    ? formatStored("group", input.existingGroupFacts)
    : "Not a group chat - always write none in [GROUP_MEMORY].";
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
        `Reply with only the three required [MEMORY], [GROUP_MEMORY], and [GENERAL_MEMORY] blocks.`,
    },
  ];
}
