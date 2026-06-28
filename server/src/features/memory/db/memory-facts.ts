export const MIN_FACT_LENGTH = 2;
export const MAX_FACT_LENGTH = 500;

export function normalizeFactText(fact: unknown): string | null {
  if (typeof fact !== "string") return null;
  const normalized = fact.trim();
  if (normalized.length < MIN_FACT_LENGTH || normalized.length > MAX_FACT_LENGTH) {
    return null;
  }
  return normalized;
}

export function normalizeEntityId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Max characters kept in a single stored memory document. */
const MAX_MEMORY_CHARS = 12000;

/** Normalize a memory document for storage: trim, drop too-short, cap length. */
export function normalizeMemoryContent(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const normalized = content.trim();
  if (normalized.length < MIN_FACT_LENGTH) return null;
  return normalized.slice(0, MAX_MEMORY_CHARS);
}

/** Append a fact line to a memory document, skipping case-insensitive duplicates. */
export function appendUniqueLine(existing: string, fact: string): string {
  const lines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const key = fact.toLowerCase();
  if (lines.some((line) => line.toLowerCase() === key)) {
    return existing.trim();
  }
  return [...lines, fact].join("\n").slice(0, MAX_MEMORY_CHARS);
}
