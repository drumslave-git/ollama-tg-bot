import { z } from "zod";

/**
 * Zod field for a search query that accepts either a single string or a list of
 * strings. Letting the model pass several queries in one call means a multi-angle
 * search resolves in a single tool round instead of forcing a separate LLM turn
 * per phrasing.
 */
export function queryField(description: string) {
  return z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(description);
}

/** Normalize a string | string[] query input into a trimmed, de-duplicated list. */
export function normalizeQueries(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const q = raw.trim();
    if (q && !seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
  }
  return out;
}
