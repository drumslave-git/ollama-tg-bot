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
