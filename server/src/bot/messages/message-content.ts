import type { Context } from "grammy";

export function extractText(ctx: Context): string {
  const msg = ctx.message;
  if (!msg) return "";
  return (msg.text ?? msg.caption ?? "").trim();
}
