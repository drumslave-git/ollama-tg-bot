export function formatGeneralMemoryForPrompt(facts) {
    if (facts.length === 0) {
        return "No general facts stored yet.";
    }
    return facts.map((f) => `- ${f}`).join("\n");
}
export function formatGroupMemoryForPrompt(facts) {
    const content = facts.join("\n").trim();
    if (!content) {
        return "No stored facts yet about this group.";
    }
    return content;
}
export function formatUserMemoryForPrompt(facts) {
    const content = facts.join("\n").trim();
    if (!content) {
        return "No stored facts yet about this user.";
    }
    return content;
}
export function buildGeneralMemorySection(facts) {
    return `## General knowledge (all chats)\n${formatGeneralMemoryForPrompt(facts)}`;
}
export function buildGroupMemorySection(facts) {
    return `## Known facts about this group (shared)\n${formatGroupMemoryForPrompt(facts)}`;
}
export function buildParticipantMemoriesSection(participants) {
    if (participants.length === 0)
        return "";
    let section = `\n\n## Known facts about people in this chat`;
    for (const participant of participants) {
        const facts = formatUserMemoryForPrompt(participant.facts);
        section += `\n\n### ${participant.label} (id: ${participant.userId})\n${facts}`;
    }
    return section;
}
export function buildExplainGeneralMemorySection(facts) {
    return `### General memories (all chats)\n${formatGeneralMemoryForPrompt(facts)}`;
}
export function buildExplainGroupMemorySection(facts, isGroupChat) {
    const body = isGroupChat
        ? formatGroupMemoryForPrompt(facts)
        : "Not applicable (private chat).";
    return `### Group memories\n${body}`;
}
export function buildExplainUserMemorySection(facts) {
    return `### Memories about the asking user\n${formatUserMemoryForPrompt(facts)}`;
}
