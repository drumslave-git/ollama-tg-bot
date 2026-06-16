import type { Context } from "grammy";
import { summarizeMessageContent } from "../replies/replies.js";
import { resolveGroupChatId } from "../telegram/keys.js";

export type RememberTarget =
  | { kind: "user"; userId: string; label: string }
  | { kind: "group"; groupId: string }
  | { kind: "general" };

export function resolveCallerRememberTarget(ctx: Context): RememberTarget | null {
  const user = ctx.from;
  if (!user) return null;

  const userId = String(user.id);
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const label = user.username
    ? `${name} (@${user.username})`
    : name || `user ${userId}`;
  return { kind: "user", userId, label };
}

export function resolveRememberTarget(ctx: Context): RememberTarget | null {
  const replied = ctx.message?.reply_to_message;
  const botId = ctx.me?.id;
  const replyAuthor = replied?.from;

  if (
    replyAuthor &&
    !replyAuthor.is_bot &&
    (botId == null || replyAuthor.id !== botId)
  ) {
    const userId = String(replyAuthor.id);
    const name = [replyAuthor.first_name, replyAuthor.last_name]
      .filter(Boolean)
      .join(" ");
    const label = replyAuthor.username
      ? `${name} (@${replyAuthor.username})`
      : name || `user ${userId}`;
    return { kind: "user", userId, label };
  }

  if (ctx.chat?.type === "private") {
    return { kind: "general" };
  }

  const groupId = resolveGroupChatId(ctx);
  if (groupId) {
    return { kind: "group", groupId };
  }

  return null;
}

export function resolveCommandInlineOrReplyText(
  ctx: Context,
  inline: string,
): string | null {
  const text = inline.trim();
  if (text) return text;

  const replied = ctx.message?.reply_to_message;
  if (!replied) return null;

  const summary = summarizeMessageContent(replied).trim();
  if (!summary || summary === "[message]") return null;
  return summary;
}
