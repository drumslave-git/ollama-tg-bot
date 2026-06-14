import type { ChatMessage } from "./llm/client.js";

/**
 * Pure prompt + parsing helpers for the background memory passes (extract + merge).
 * No DB/LLM imports so they can be unit-tested and driven by live tests.
 */
export const EXTRACTOR_SYSTEM = `You extract durable facts, terms, and useful long-term information from one addressed Telegram bot turn.

Output ONLY these blocks (no other text):

[MEMORY]
none
[/MEMORY]
[GROUP_MEMORY]
none
[/GROUP_MEMORY]
[GENERAL_MEMORY]
none
[/GENERAL_MEMORY]

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

export const MEMORY_MERGE_SYSTEM = `You update one long-term memory document for an entity.

Inputs:
- Existing memory for this entity
- Newly extracted durable information

Task:
- Merge new information into the existing memory.
- Preserve all durable details. This must be lossless unless an old detail is a duplicate, contradicted by newer information, or clearly ephemeral.
- Compact wording where possible.
- Keep the result readable as short lines or compact paragraphs.
- Do not invent facts.
- If there is no useful memory left, write "none".

Output ONLY:

[MEMORY]
updated memory text
[/MEMORY]`;

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

export interface MemoryMergeInput {
  kind: "user" | "group";
  existing: string[];
  incoming: string[];
}

function formatStored(kind: string, facts: string[]): string {
  const content = facts.join("\n").trim();
  if (!content) return `(none yet for this ${kind})`;
  return content;
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
        `---\n${turn}`,
    },
  ];
}

/** Build the memory-merge prompt (system + user) that folds new facts into the entity doc. */
export function buildMemoryMergeMessages(input: MemoryMergeInput): ChatMessage[] {
  const existing = input.existing.join("\n").trim() || "(none yet)";
  const incoming = input.incoming.map((f) => `- ${f}`).join("\n");
  return [
    { role: "system", content: MEMORY_MERGE_SYSTEM },
    {
      role: "user",
      content:
        `Entity kind: ${input.kind}\n\n` +
        `Existing memory:\n${existing}\n\n` +
        `Newly extracted information:\n${incoming}`,
    },
  ];
}

const MEMORY_BLOCK = /\[MEMORY\]\s*([\s\S]*?)\s*\[\/MEMORY\]/i;

export function parseMemoryBlock(raw: string): string {
  const block = (raw.match(MEMORY_BLOCK)?.[1] ?? raw).trim();
  if (!block || /^none$/i.test(block)) return "";
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** Facts in incoming that are not already stored (case-insensitive). */
export function newFactsOnly(
  existing: string[],
  incoming: string[],
): string[] {
  const keys = new Set(existing.map((f) => f.toLowerCase()));
  const out: string[] = [];
  for (const fact of incoming) {
    const normalized = fact.trim();
    if (normalized.length < 2) continue;
    const key = normalized.toLowerCase();
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(normalized);
  }
  return out;
}
