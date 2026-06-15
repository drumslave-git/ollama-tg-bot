function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Last closed [TAG]…[/TAG] block — reasoning may quote the format before the decision. */
export function extractLastClosedBlock(text, tag) {
    const closed = new RegExp(`\\[${escapeRegExp(tag)}\\]\\s*([\\s\\S]*?)\\s*\\[\\/${escapeRegExp(tag)}\\]`, "gi");
    let last = null;
    for (const match of text.matchAll(closed)) {
        last = match[1]?.trim() ?? null;
    }
    return last;
}
