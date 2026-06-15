function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Last closed [TAG]…[/TAG] block — reasoning may quote the format before the decision. */
export function extractLastClosedBlock(
  text: string,
  tag: string,
): string | null {
  const closed = new RegExp(
    `\\[${escapeRegExp(tag)}\\]\\s*([\\s\\S]*?)\\s*\\[\\/${escapeRegExp(tag)}\\]`,
    "gi",
  );
  let last: string | null = null;
  for (const match of text.matchAll(closed)) {
    last = match[1]?.trim() ?? null;
  }
  return last;
}
