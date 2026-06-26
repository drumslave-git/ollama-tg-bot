import type { Context } from "grammy";
import { rememberTelegramUser } from "../../db/users/known-users.js";
import { tryResolveOwnerFromUser } from "../owner/owner-sync.js";

export async function trackTelegramUser(ctx: Context): Promise<void> {
  await rememberTelegramUser(ctx.from);
  await tryResolveOwnerFromUser(ctx.from);
}

export function trackingMiddleware(ctx: Context, next: () => Promise<void>) {
  void trackTelegramUser(ctx).catch((err) => {
    console.error("Failed to track Telegram user:", err);
  });
  return next();
}
