import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  parseJsonContent,
  readInt,
  reasoningJsonUserTail,
  reasoningSchemaSystemSuffix,
  responseFormatForThinking,
  strictObjectSchema,
} from "../../shared/index.js";
import {
  MOOD_KEYS,
  MOOD_TRAIT_HINTS,
  normalizeMoodValues,
  type MoodValues,
} from "./values.js";

const moodProperties = Object.fromEntries(
  MOOD_KEYS.map((key) => [
    key,
    {
      type: "integer",
      minimum: 0,
      maximum: 5,
      description: MOOD_TRAIT_HINTS[key],
    },
  ]),
);

export const MOOD_RESPONSE_FORMAT: JsonSchemaResponseFormat = strictObjectSchema(
  "mood_traits",
  moodProperties,
  [...MOOD_KEYS],
);

export function getMoodResponseFormat(
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return responseFormatForThinking(MOOD_RESPONSE_FORMAT, thinkingEnabled);
}

export const MOOD_EVALUATOR_SYSTEM = `You evaluate the bot character's emotional mood for the next reply in a Telegram chat.

Respond with JSON only, matching the provided schema. The object has nine integer traits (0–5 each):
${MOOD_KEYS.map((key) => `- ${key}`).join("\n")}

Each trait is an integer 0–5. Start from the "Current mood" values and adjust based on the character personality and the latest incoming message only.

Trait meanings:
- irritated — sharper, shorter, more hostile
- exhausted — dry, slower, less aggressive
- amused — more playful sarcasm
- curious — asks sharper questions, less mocking
- contemptuous — brutal toward bad ideas
- gloomy — poetic, darker, quieter
- impatient — skips ceremony, gives direct commands
- pleased — rare approval, still not warm
- suspicious — challenges assumptions

Rules:
- Change only traits the context actually warrants; small shifts (±1–2) are normal.
- Do not set everything high at once — pick what fits the moment.
- Output all nine traits every time.`;

export interface MoodEvaluateInput {
  currentMood: MoodValues;
  personality: string;
  latestMessage: string;
  thinkingEnabled?: boolean;
}

export interface MoodParseResult {
  mood: MoodValues;
  reason: string;
}

function formatCurrentMood(mood: MoodValues): string {
  return MOOD_KEYS.map((key) => `${key}: ${mood[key]}`).join("\n");
}

function parseTraitsFromObject(
  obj: Record<string, unknown>,
  fallback: MoodValues,
): MoodParseResult {
  const partial: Partial<Record<string, number>> = {};

  for (const key of MOOD_KEYS) {
    const value = readInt(obj, key, 0, 5);
    if (value !== null) {
      partial[key] = value;
    }
  }

  if (Object.keys(partial).length === 0) {
    return {
      mood: fallback,
      reason: "No traits in mood JSON",
    };
  }

  return {
    mood: normalizeMoodValues(partial, fallback),
    reason: "Mood updated",
  };
}

export function parseMoodBlock(raw: string, fallback: MoodValues): MoodParseResult {
  const normalizedFallback = normalizeMoodValues(fallback);
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed) {
    return {
      mood: normalizedFallback,
      reason: "Could not parse LLM mood JSON",
    };
  }
  return parseTraitsFromObject(parsed, normalizedFallback);
}

/** Build the mood-evaluation prompt (system + user). Mood values are normalized first. */
export function buildMoodEvaluateMessages(input: MoodEvaluateInput): ChatMessage[] {
  const fallback = normalizeMoodValues(input.currentMood);

  const traitGuide = MOOD_KEYS.map(
    (key) => `- ${key}: ${MOOD_TRAIT_HINTS[key]}`,
  ).join("\n");

  const userContent =
    `Personality:\n${input.personality.trim() || "(default character)"}\n\n` +
    `Current mood (starting point):\n${formatCurrentMood(fallback)}\n\n` +
    `Trait guide:\n${traitGuide}\n\n` +
    `---\nLatest message:\n${input.latestMessage.trim() || "(empty)"}\n\n` +
    reasoningJsonUserTail(
      "all nine mood traits as integers 0–5",
      !!input.thinkingEnabled,
    );

  return [
    {
      role: "system",
      content:
        MOOD_EVALUATOR_SYSTEM +
        reasoningSchemaSystemSuffix(!!input.thinkingEnabled),
    },
    { role: "user", content: userContent },
  ];
}
