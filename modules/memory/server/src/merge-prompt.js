import { asObject, parseJsonContent, readString, strictObjectSchema, } from "@llm-tg-bot/modules-utils";
export const MEMORY_MERGE_RESPONSE_FORMAT = strictObjectSchema("memory_merge", {
    memory: {
        type: "string",
        description: "Merged durable memory text, one fact per line when possible, or none when empty.",
    },
}, ["memory"]);
export const MEMORY_MERGE_SYSTEM = `You update one long-term memory document.

Inputs:
- Existing memory text
- Newly extracted durable information

Task:
- Merge new information into the existing memory.
- Drop duplicates and near-duplicates — if incoming repeats something already in existing memory (same meaning, different wording), keep one concise version.
- Preserve all unique durable details. This must be lossless unless an old detail is a duplicate, contradicted by newer information, or clearly ephemeral.
- Compact wording where possible.
- Keep the result readable as short lines or compact paragraphs.
- Do not invent facts.
- If there is no useful memory left, set memory to "none".

Respond with JSON only, matching the provided schema:
- memory (string): durable facts only — one fact per line when possible.

Output rules (mandatory):
- Do not copy prompt metadata into memory: no "Entity", "Entity kind", "Memory scope", "user", or "group" as labels.
- Do not prefix facts with scope/type headers — write the facts directly (e.g. "Frontend developer." not "Entity: user Profession: frontend developer.").`;
function mergeScopeHint(kind) {
    switch (kind) {
        case "user":
            return "Document subject: one Telegram user (the current speaker).";
        case "group":
            return "Document subject: the group/chat itself (not individual users).";
        case "general":
            return "Document subject: cross-chat general knowledge (definitions, project facts, glossary).";
    }
}
/** Strip scope/metadata labels the model sometimes echoes from the merge prompt. */
export function sanitizeMergedMemory(text) {
    const metadataLine = /^(?:Entity\s+kind|Entity|Memory\s+scope|Document\s+subject):\s*(?:user|group|one Telegram user.*|the group\/chat.*)\s*$/i;
    const metadataPrefix = /^(?:Entity\s+kind|Entity|Memory\s+scope):\s*(?:user|group)\s+/i;
    return text
        .split("\n")
        .map((line) => line.replace(metadataPrefix, "").trim())
        .filter((line) => line.length > 0 && !metadataLine.test(line))
        .join("\n");
}
/** Build the memory-merge prompt (system + user) that folds new facts into the entity doc. */
export function buildMemoryMergeMessages(input) {
    const existing = input.existing.join("\n").trim() || "(none yet)";
    const incoming = input.incoming.map((f) => `- ${f}`).join("\n");
    return [
        { role: "system", content: MEMORY_MERGE_SYSTEM },
        {
            role: "user",
            content: `${mergeScopeHint(input.kind)}\n\n` +
                `Existing memory:\n${existing}\n\n` +
                `Newly extracted information:\n${incoming}\n\n` +
                `Return JSON with a memory field containing durable facts — no scope labels.`,
        },
    ];
}
export function parseMemoryBlock(raw) {
    const parsed = asObject(parseJsonContent(raw));
    const block = (parsed ? readString(parsed, "memory") : null) ?? raw.trim();
    if (!block || /^none$/i.test(block))
        return "";
    const cleaned = sanitizeMergedMemory(block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"));
    return cleaned;
}
/** Split a merged memory document into individual fact lines for storage. */
export function splitMergedMemoryFacts(content) {
    return content
        .split("\n")
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter((line) => line.length >= 2);
}
