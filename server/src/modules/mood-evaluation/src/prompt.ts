import type { ChatMessage } from "@llm-tg-bot/modules-utils";
import { extractLastClosedBlock } from "@llm-tg-bot/modules-utils";
import {
  MOOD_KEYS,
  MOOD_TRAIT_HINTS,
  normalizeMoodValues,
  type MoodValues,
} from "./values.js";

export const MOOD_TAG = "MOOD";

export const MOOD_EVALUATOR_SYSTEM = `You evaluate the bot character's emotional mood for the next reply in a Telegram chat.

Your entire assistant message content must be exactly one block — nothing before, nothing after, no other text or tags:

[MOOD]
irritated: 0
exhausted: 0
amused: 0
curious: 0
contemptuous: 0
gloomy: 0
impatient: 0
pleased: 0
suspicious: 0
[/MOOD]

Output rules (mandatory):
- Put all nine trait lines only inside [MOOD]…[/MOOD] — not in reasoning or analysis.
- Each trait line must be exactly "name: N" where N is an integer 0–5.
- Always include all nine traits and both opening/closing tags on their own lines.
- Do not output bare trait lines, [irritated: 5], or any tag other than [MOOD].
- Do not output reasoning, analysis, or explanation — only the block.

Each trait is an integer 0–5. Start from the "Current mood" values and adjust based on the latest conversation context.

Chat history is provided as standard messages with roles and names:
- [user [name: username]]: User message
- [assistant]: Your past replies
- Messages might be narrative summaries of older conversation

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
  historyText: string;
  latestTurn: string;
}

export interface MoodParseResult {
  mood: MoodValues;
  reason: string;
}

function formatCurrentMood(mood: MoodValues): string {
  return MOOD_KEYS.map((key) => `${key}: ${mood[key]}`).join("\n");
}

function parseTraitsFromBody(
  body: string,
  fallback: MoodValues,
): MoodParseResult {
  const partial: Partial<Record<string, number>> = {};

  for (const key of MOOD_KEYS) {
    const lineMatch = body.match(
      new RegExp(`^\\s*${key}\\s*[:=]\\s*(\\d+)`, "im"),
    );
    if (lineMatch) {
      partial[key] = Number.parseInt(lineMatch[1], 10);
    }
  }

  if (Object.keys(partial).length === 0) {
    return {
      mood: fallback,
      reason: "No traits in mood block",
    };
  }

  return {
    mood: normalizeMoodValues(partial, fallback),
    reason: "Mood updated",
  };
}

export function parseMoodBlock(raw: string, fallback: MoodValues): MoodParseResult {
  const normalizedFallback = normalizeMoodValues(fallback);
  const body = extractLastClosedBlock(raw, MOOD_TAG);
  if (!body) {
    return {
      mood: normalizedFallback,
      reason: "Could not parse LLM mood block",
    };
  }
  return parseTraitsFromBody(body, normalizedFallback);
}

/** Build the mood-evaluation prompt (system + user). Mood values are normalized first. */
export function buildMoodEvaluateMessages(input: MoodEvaluateInput): ChatMessage[] {
  const fallback = normalizeMoodValues(input.currentMood);

  const traitGuide = MOOD_KEYS.map(
    (key) => `- ${key}: ${MOOD_TRAIT_HINTS[key]}`,
  ).join("\n");

  const userContent =
    `Current mood (starting point):\n${formatCurrentMood(fallback)}\n\n` +
    `Trait guide:\n${traitGuide}\n\n` +
    `---\nRecent chat:\n${input.historyText.trim() || "(no prior messages)"}\n\n` +
    `Latest turn:\n${input.latestTurn.trim() || "(empty)"}\n\n` +
    `Reply with only one [MOOD]…[/MOOD] block containing all nine traits.`;

  return [
    { role: "system", content: MOOD_EVALUATOR_SYSTEM },
    { role: "user", content: userContent },
  ];
}
