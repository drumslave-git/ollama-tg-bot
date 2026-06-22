import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  parseJsonContent,
  readStringArray,
  reasoningJsonUserTail,
  reasoningSchemaSystemSuffix,
  responseFormatForThinking,
  strictObjectSchema,
} from "../../shared/index.js";

export const MEMORY_EXTRACT_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "memory_extract",
    {
      user_facts: {
        type: "array",
        items: { type: "string" },
        description:
          "New durable facts about the current speaker — identity, personality, preferences, boundaries, and how they want the bot to behave toward them.",
      },
      observed_user_facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            user_id: {
              type: "string",
              description:
                "Telegram user id from the Known people list — never invent ids.",
            },
            facts: {
              type: "array",
              items: { type: "string" },
              description:
                "Durable facts learned about this person from the turn (not the current speaker).",
            },
          },
          required: ["user_id", "facts"],
        },
        description:
          "Facts about other known people discussed this turn; empty when none or ids unknown.",
      },
      group_facts: {
        type: "array",
        items: { type: "string" },
        description:
          "New durable facts about the group/chat — culture, norms, dynamics, and how the bot should behave here.",
      },
      general_facts: {
        type: "array",
        items: { type: "string" },
        description:
          "Cross-chat knowledge — glossary, project facts, and bot-wide behavior lessons that apply everywhere.",
      },
    },
    ["user_facts", "observed_user_facts", "group_facts", "general_facts"],
  );

export function getMemoryExtractResponseFormat(
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return responseFormatForThinking(
    MEMORY_EXTRACT_RESPONSE_FORMAT,
    thinkingEnabled,
  );
}

export const EXTRACTOR_SYSTEM = `You extract durable long-term memory from one Telegram bot turn so the bot can evolve — learning who people are, how they communicate, what they like and dislike, and how they want the bot to behave.

Respond with JSON only, matching the provided schema:
- user_facts (string[]): new information about the CURRENT SPEAKER ONLY — who they are, personality, communication style, interests, likes/dislikes, boundaries, standing instructions, and explicit or implicit feedback on the bot (what they appreciate vs find annoying). In group chats, never store other members' traits here.
- observed_user_facts (object[]): facts about OTHER people when their user_id appears in "Known people in this chat". Each entry: { user_id, facts[] }. Use only ids from that list. Empty array when nobody else is discussed or ids are unknown.
- group_facts (string[]): new information about the group/chat itself — purpose, culture, recurring topics, in-jokes, social dynamics, norms, and how the bot should adapt here (tone, topics to avoid, what this group appreciates or finds annoying about the bot). Not facts about individual users. Empty array when not a group chat.
- general_facts (string[]): knowledge that applies across all chats — glossary terms, definitions, project/domain facts, and bot-wide behavior lessons (patterns that work or fail with people generally). Not user-specific or group-only context.

The user does not need to say "remember". Store information that would still matter in a future session.

Learn and store:
- Identity, role, background, timezone, how they want to be addressed
- Personality and communication style (direct, playful, formal, anxious, etc.)
- Interests, hobbies, expertise, and things they care about
- Likes and dislikes (topics, formats, tone, habits)
- Boundaries and sensitivities (topics to avoid, triggers, privacy)
- Feedback on the bot — praise, corrections, "stop doing X", "I liked when you Y", annoyance, appreciation
- What works or fails when interacting with this person or group
- Definitions, acronyms, terms, or useful domain/project knowledge
- Corrections to prior assumptions or outdated memories

Infer carefully from tone and reactions when the signal is clear (e.g. "too long", "perfect", "stop with the emojis", "that's helpful"). Do not invent preferences without evidence.

Do NOT store:
- Pure greetings or filler with no durable signal
- Jokes or sarcasm unless they reveal a real preference or boundary
- The assistant's own banter or hallucinated claims as user facts
- One-off questions with no lasting preference
- Transient moods unless they establish a lasting pattern
- Facts already listed under "Already stored"
- Duplicates rephrased slightly
- User-specific traits in general_facts or group-only context in general_facts`;

export interface KnownParticipant {
  userId: string;
  label: string;
}

export interface ObservedUserFacts {
  userId: string;
  facts: string[];
}

export interface MemoryExtractInput {
  userMessage: string;
  replyContext: string | null;
  assistantReply: string;
  existingUserFacts: string[];
  existingGroupFacts: string[];
  existingGeneralFacts: string[];
  isGroupChat: boolean;
  currentSpeaker?: KnownParticipant | null;
  knownParticipants?: KnownParticipant[];
}

export interface MemoryExtractResult {
  userFacts: string[];
  observedUserFacts: ObservedUserFacts[];
  groupFacts: string[];
  generalFacts: string[];
}

function formatStored(kind: string, facts: string[]): string {
  const content = facts.join("\n").trim();
  if (!content) return `(none yet for this ${kind})`;
  return content;
}

function formatKnownParticipants(
  participants: KnownParticipant[] | undefined,
  currentSpeaker: KnownParticipant | null | undefined,
): string {
  const list = participants ?? [];
  if (list.length === 0) {
    return "(none — observed_user_facts must be empty)";
  }
  const lines = list.map((p) => {
    const current =
      currentSpeaker && p.userId === currentSpeaker.userId ? " [current speaker]" : "";
    return `- id ${p.userId}: ${p.label}${current}`;
  });
  return lines.join("\n");
}

function normalizeFactLines(items: string[] | null): string[] {
  if (!items) return [];
  return items
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0 && !/^none$/i.test(line));
}

function readObservedUserFacts(
  obj: Record<string, unknown>,
): ObservedUserFacts[] {
  const value = obj.observed_user_facts;
  if (!Array.isArray(value)) return [];

  const results: ObservedUserFacts[] = [];
  for (const item of value) {
    const entry = asObject(item);
    if (!entry) continue;
    const userId =
      typeof entry.user_id === "string" ? entry.user_id.trim() : "";
    if (!userId) continue;
    const facts = normalizeFactLines(readStringArray(entry, "facts"));
    if (facts.length === 0) continue;
    results.push({ userId, facts });
  }
  return results;
}

export function parseMemoryExtract(raw: string): MemoryExtractResult {
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed) {
    return {
      userFacts: [],
      observedUserFacts: [],
      groupFacts: [],
      generalFacts: [],
    };
  }
  return {
    userFacts: normalizeFactLines(readStringArray(parsed, "user_facts")),
    observedUserFacts: readObservedUserFacts(parsed),
    groupFacts: normalizeFactLines(readStringArray(parsed, "group_facts")),
    generalFacts: normalizeFactLines(readStringArray(parsed, "general_facts")),
  };
}

/** Build the memory-extraction prompt (system + user) for one addressed turn. */
export function buildMemoryExtractMessages(
  input: MemoryExtractInput,
  thinkingEnabled = false,
): ChatMessage[] {
  const userBlock = formatStored("user", input.existingUserFacts);
  const groupBlock = input.isGroupChat
    ? formatStored("group", input.existingGroupFacts)
    : "Not a group chat - always return an empty group_facts array.";
  const generalBlock = formatStored("general", input.existingGeneralFacts);
  const participantsBlock = formatKnownParticipants(
    input.knownParticipants,
    input.currentSpeaker,
  );

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
  turn += `\n\nAssistant reply (for context — learn from user reactions to it, but do not store the assistant's jokes as facts):\n${input.assistantReply.trim()}`;

  const speakerLine = input.currentSpeaker
    ? `Current speaker: ${input.currentSpeaker.label} (id ${input.currentSpeaker.userId})\n\n`
    : "";

  return [
    {
      role: "system",
      content: EXTRACTOR_SYSTEM + reasoningSchemaSystemSuffix(thinkingEnabled),
    },
    {
      role: "user",
      content:
        speakerLine +
        `Known people in this chat (use these ids for observed_user_facts only):\n${participantsBlock}\n\n` +
        `Already stored about this user:\n${userBlock}\n\n` +
        `Already stored about this group:\n${groupBlock}\n\n` +
        `Already stored general knowledge:\n${generalBlock}\n\n` +
        `---\n${turn}\n\n` +
        reasoningJsonUserTail(
          "user_facts, observed_user_facts, group_facts, and general_facts",
          thinkingEnabled,
        ),
    },
  ];
}
