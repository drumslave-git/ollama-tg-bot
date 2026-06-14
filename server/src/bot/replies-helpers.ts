import type { Context } from "grammy";
import { replyParameters } from "./replies.js";

export async function replyHtml(
  ctx: Context,
  text: string,
  extra?: Parameters<Context["reply"]>[1],
) {
  try {
    return await ctx.reply(text, { parse_mode: "HTML", ...extra });
  } catch {
    return await ctx.reply(text, extra);
  }
}

export async function replyToUser(
  ctx: Context,
  text: string,
  extra?: Parameters<Context["reply"]>[1],
) {
  const params = replyParameters(ctx);
  return replyHtml(
    ctx,
    text,
    params ? { reply_parameters: params, ...extra } : extra,
  );
}
