import type { Context } from "grammy";
import { rememberTelegramUser } from "../../db/users/known-users.js";
import { tryResolveOwnerFromUser } from "../owner/owner-sync.js";

export function trackTelegramUser(ctx: Context): void {
  rememberTelegramUser(ctx.from);
  tryResolveOwnerFromUser(ctx.from);
}

export function trackingMiddleware(ctx: Context, next: () => Promise<void>) {
  try {
    trackTelegramUser(ctx);
  } catch (err) {
    console.error("Failed to track Telegram user:", err);
  }
  return next();
}
