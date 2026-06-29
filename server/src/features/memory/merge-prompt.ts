import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import {
  asObject,
  jsonReplyTail,
  parseJsonContent,
  readString,
  strictObjectSchema,
} from "../../shared/index.js";

export const MEMORY_MERGE_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "memory_merge",
    {
      memory: {
        type: "string",
        description:
          "Merged durable memory text, one fact per line when possible, or none when empty.",
      },
    },
    ["memory"],
  );

export function getMemoryMergeResponseFormat(): JsonSchemaResponseFormat {
  return MEMORY_MERGE_RESPONSE_FORMAT;
}

export const MEMORY_MERGE_SYSTEM = `You update one long-term memory document so the bot can evolve its understanding over time.

Inputs:
- Existing memory text
- Newly extracted durable information

Task:
- Merge new information into the existing memory.
- Drop duplicates and near-duplicates — if incoming repeats something already in existing memory (same meaning, different wording), keep one concise version.
- When new information contradicts old information, keep the newer/corrected version and drop the outdated line.
- Preserve all unique durable details. This must be lossless unless an old detail is a duplicate, contradicted, or clearly ephemeral.
- Compact wording where possible.
- Organize implicitly: identity/background first, then personality and communication style, then likes/interests, then dislikes/boundaries, then bot-interaction lessons (what they appreciate vs find annoying). Use one fact per line — no section headers in the output.
- Do not invent facts.
- If there is no useful memory left, set memory to "none".

Respond with JSON only, matching the provided schema:
- memory (string): durable facts only — one fact per line when possible.

Output rules (mandatory):
- Do not copy prompt metadata into memory: no "Entity", "Entity kind", "Memory scope", "user", or "group" as labels.
- Do not prefix facts with scope/type headers — write the facts directly (e.g. "Prefers short replies." not "Bot feedback: prefers short replies.").`;

export interface MemoryMergeInput {
  kind: "user" | "general";
  existing: string[];
  incoming: string[];
}

function mergeScopeHint(kind: MemoryMergeInput["kind"]): string {
  switch (kind) {
    case "user":
      return (
        "Document subject: one Telegram user. Capture who they are, how they communicate, " +
        "what they like and dislike, and how the bot should interact with them."
      );
    case "general":
      return (
        "Document subject: cross-chat general knowledge — definitions, project facts, " +
        "and bot-wide behavior lessons."
      );
  }
}

/** Strip scope/metadata labels the model sometimes echoes from the merge prompt. */
export function sanitizeMergedMemory(text: string): string {
  const metadataLine =
    /^(?:Entity\s+kind|Entity|Memory\s+scope|Document\s+subject):\s*(?:user|group|one Telegram user.*|the group\/chat.*)\s*$/i;
  const metadataPrefix =
    /^(?:Entity\s+kind|Entity|Memory\s+scope):\s*(?:user|group)\s+/i;

  return text
    .split("\n")
    .map((line) => line.replace(metadataPrefix, "").trim())
    .filter((line) => line.length > 0 && !metadataLine.test(line))
    .join("\n");
}

/** Build the memory-merge prompt (system + user) that folds new facts into the entity doc. */
export function buildMemoryMergeMessages(
  input: MemoryMergeInput,
): ChatMessage[] {
  const existing = input.existing.join("\n").trim() || "(none yet)";
  const incoming = input.incoming.map((f) => `- ${f}`).join("\n");
  return [
    {
      role: "system",
      content: MEMORY_MERGE_SYSTEM,
    },
    {
      role: "user",
      content:
        `${mergeScopeHint(input.kind)}\n\n` +
        `Existing memory:\n${existing}\n\n` +
        `Newly extracted information:\n${incoming}\n\n` +
        jsonReplyTail(
          "a memory field containing durable facts — no scope labels",
        ),
    },
  ];
}

export function parseMemoryBlock(raw: string): string {
  const parsed = asObject(parseJsonContent(raw));
  const block =
    (parsed ? readString(parsed, "memory") : null) ?? raw.trim();
  if (!block || /^none$/i.test(block)) return "";
  const cleaned = sanitizeMergedMemory(
    block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),
  );
  return cleaned;
}

/** Split a merged memory document into individual fact lines for storage. */
export function splitMergedMemoryFacts(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length >= 2);
}
