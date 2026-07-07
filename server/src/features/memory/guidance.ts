export const MEMORY_SAVE_TOOL_DESCRIPTION =
  "Record one durable fact for long-term memory. If the current message asks you to remember, save, note, " +
  "or not forget something, call this before replying; an acknowledgment without this tool saves nothing. " +
  "Use type 'user' for facts about a specific person: id must be that user's numeric id from the [SESSION] " +
  "block or a [user:name:id] history tag. Use type 'general' for stable shared chat knowledge, group rules, " +
  "terms, or preferences; id is ignored. Also call proactively for clear durable self-facts from the current " +
  "speaker: introductions/name, location, work, stable preferences, identity, boundaries, or lasting behavior " +
  "lessons. Do not save guesses, insults, temporary moods, one-off plans, or ordinary chit-chat. If several " +
  "facts should be remembered, call once per fact. Notes are queued and merged into the consolidated record " +
  "by a daily job.";

export function buildMemorySaveSystemPromptLines(toolName: string): string[] {
  return [
    `- MEMORY PROTOCOL: before your final reply, check [CURRENT MESSAGE] for "remember", "save", "note", "don't forget", "remind yourself", or equivalent phrasing. If present, call ${toolName} first. Acknowledging memory without the tool stores nothing and is an error.`,
    `- Scope memory precisely: use type 'user' + current speaker id for facts about the speaker; use another user id only when the fact is explicitly tied to a tagged [user:name:id]; use type 'general' for stable shared chat knowledge, group preferences, terms, and rules. Write one concise fact per call, and make multiple calls for multiple facts.`,
    `- Also call ${toolName} proactively for clear durable self-facts the current speaker reveals: introductions/name, location, work, stable preferences, identity, boundaries, or lasting instructions about how to behave. Do not save temporary states, jokes, guesses, insults, ordinary chit-chat, or facts inferred only from vibes.`,
  ];
}
