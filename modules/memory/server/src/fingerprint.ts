import { createHash } from "node:crypto";

type HistoryRow = { role: string; content: string };

function parseUserIdFromRole(role: string): string | null {
  if (!role.startsWith("user:")) return null;
  const parts = role.split(":");
  return parts[parts.length - 1] || null;
}

/** Stable fingerprint of the history slice used for debounced memory extraction. */
export function computeMemoryExtractionFingerprint(
  messages: HistoryRow[],
): string | null {
  if (messages.length === 0) return null;

  let userMessage = "";
  let assistantReply = "";
  let userId: string | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]!;
    if (!assistantReply && row.role === "assistant") {
      assistantReply = row.content.replace(/^\[assistant said\]:\s*/i, "");
      continue;
    }
    if (!userMessage && row.role.startsWith("user:")) {
      userMessage = row.content;
      userId = parseUserIdFromRole(row.role);
      break;
    }
  }

  if (!userMessage && !assistantReply) return null;

  const payload = JSON.stringify({
    messageCount: messages.length,
    userId,
    userMessage: userMessage || "(no user text)",
    assistantReply,
  });
  return createHash("sha256").update(payload).digest("hex");
}
