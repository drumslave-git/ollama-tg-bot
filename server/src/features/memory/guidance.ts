export const MEMORY_GET_DESCRIPTION =
  "Read the consolidated long-term memory for a scope. " +
  "type 'user' returns durable facts about one person (id = that user's numeric id, " +
  "from the [SESSION] block or [user:name:id] history tags); " +
  "type 'general' returns cross-chat knowledge (id is ignored). " +
  "Note: facts just saved with memory_save are folded in by a daily job; until then " +
  "use memory_entries_get to see them. Use before claiming you do not know something durable.";

export const MEMORY_SEARCH_DESCRIPTION =
  "Semantic (vector + keyword) search across all consolidated long-term memory " +
  "(user and general). Use to recall a durable fact when you do not know which person " +
  "or scope it belongs to; each result is tagged with its type and id. Pass an array of " +
  "queries to search several phrasings in one call. If this finds " +
  "nothing, the fact may be newly saved and not yet consolidated; fall back to memory_entries_search.";

export const MEMORY_ENTRIES_SEARCH_DESCRIPTION =
  "Keyword search over raw, not-yet-consolidated memory notes (the queue memory_save writes to). " +
  "Use as a fallback when memory_search finds nothing, since a fact saved earlier this " +
  "conversation may not be in the consolidated record until the next daily job. " +
  "Pass an array of queries to search several phrasings in one call. " +
  "Each result is tagged with its type and id.";

export const MEMORY_ENTRIES_GET_DESCRIPTION =
  "List the raw, not-yet-consolidated memory notes for a scope. " +
  "type 'user' (id = that user's numeric id) or 'general' (id ignored). " +
  "Use as a fallback to memory_get when a fact was saved recently and has not been " +
  "folded into the consolidated record yet.";

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
