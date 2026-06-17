import type { Context } from "grammy";

export function isSlashCommandMessage(ctx: Context): boolean {
  const msg = ctx.message;
  if (!msg) return false;

  if (
    msg.entities?.some(
      (entity) => entity.type === "bot_command" && entity.offset === 0,
    )
  ) {
    return true;
  }

  const text = (msg.text ?? msg.caption ?? "").trim();
  return text.startsWith("/");
}
