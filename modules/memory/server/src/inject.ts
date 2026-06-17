export interface ParticipantMemoryFacts {
  userId: string;
  label: string;
  facts: string[];
}

export const MEMORY_USAGE_PREAMBLE = `## Long-term memory (evolve from this)
Use stored memories to adapt over time. Apply what you know about each person — their character, preferences, and boundaries. Respect what they appreciate and avoid what annoys them. Follow group norms and bot-behavior lessons as standing instructions. Let memories shape tone, depth, topics, and habits — not just factual answers.`;

export function formatGeneralMemoryForPrompt(facts: string[]): string {
  if (facts.length === 0) {
    return "No general facts stored yet.";
  }
  return facts.map((f) => `- ${f}`).join("\n");
}

export function formatGroupMemoryForPrompt(facts: string[]): string {
  const content = facts.join("\n").trim();
  if (!content) {
    return "No stored facts yet about this group.";
  }
  return content;
}

export function formatUserMemoryForPrompt(facts: string[]): string {
  const content = facts.join("\n").trim();
  if (!content) {
    return "No stored facts yet about this user.";
  }
  return content;
}

export function buildGeneralMemorySection(facts: string[]): string {
  return (
    `## General knowledge and bot-wide lessons (all chats)\n` +
    `Glossary, project facts, and behavior patterns that work across chats.\n` +
    `${formatGeneralMemoryForPrompt(facts)}`
  );
}

export function buildGroupMemorySection(facts: string[]): string {
  return (
    `## This group's culture and how to behave here\n` +
    `Norms, dynamics, and what this group appreciates or finds annoying about you.\n` +
    `${formatGroupMemoryForPrompt(facts)}`
  );
}

export function buildParticipantMemoriesSection(
  participants: ParticipantMemoryFacts[],
): string {
  if (participants.length === 0) return "";
  let section =
    `\n\n## People in this chat (adapt to each)\n` +
    `Personality, preferences, boundaries, and interaction lessons per person.`;
  for (const participant of participants) {
    const facts = formatUserMemoryForPrompt(participant.facts);
    section += `\n\n### ${participant.label} (id: ${participant.userId})\n${facts}`;
  }
  return section;
}

export function buildExplainGeneralMemorySection(facts: string[]): string {
  return `### General memories (all chats)\n${formatGeneralMemoryForPrompt(facts)}`;
}

export function buildExplainGroupMemorySection(
  facts: string[],
  isGroupChat: boolean,
): string {
  const body = isGroupChat
    ? formatGroupMemoryForPrompt(facts)
    : "Not applicable (private chat).";
  return `### Group memories\n${body}`;
}

export function buildExplainUserMemorySection(facts: string[]): string {
  return `### Memories about the asking user\n${formatUserMemoryForPrompt(facts)}`;
}
