import type { Context } from "grammy";

export function isSlashCommandMessage(ctx: Context): boolean {
  const text = ctx.message?.text ?? ctx.message?.caption;
  return (text?.trim() ?? "").startsWith("/");
}
