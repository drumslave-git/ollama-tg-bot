import type { Bot, Context } from "grammy";
import { isGroupChat, resolveConversationKey, resolveGroupChatId, resolveUserId } from "../telegram/keys.js";
import { getSettings } from "../../db/index.js";
import { config } from "../../config/index.js";
import { groupSetupMessage } from "../handlers/group-setup.js";
import { isOwner, getOwnerUserId, getOwnerUsername } from "../owner/owner.js";
import { escapeHtml } from "../../telegram/html.js";
import { buildPublicCommandsHelp } from "./commands-help.js";
import { collectModuleBotCommands } from "../../runtime/module-hosts.js";
import { clearHistory } from "../../db/history/index.js";
import { clearUserMemory, createUserFact } from "../../db/memory/user.js";
import { clearGroupMemory, createGroupFact } from "../../db/memory/group.js";
import { createGeneralFact } from "../../db/memory/general.js";
import { MAX_FACT_LENGTH, MIN_FACT_LENGTH } from "../../db/memory/facts.js";
import { logEvent } from "../../logging/event-log.js";
import { replyToUser } from "../replies/replies-helpers.js";
import { resolveCallerRememberTarget, resolveCommandInlineOrReplyText, resolveRememberTarget } from "./command-utils.js";

export function registerBotCommands(bot: Bot, botUsername: string): void {
  bot.command("start", async (ctx) => {
    const settings = getSettings();
    const inGroup = isGroupChat(ctx);
    await replyToUser(
      ctx,
      (inGroup
        ? groupSetupMessage(botUsername) + "\n\n"
        : `Hi! I'm connected to the LLM.\n\n`) +
        (inGroup
          ? ""
          : `• Send me anything in private chat\n` +
            `• Send photos or stickers (animated/video use a preview frame)\n`) +
        `• I remember recent messages in this chat\n` +
        `• I open links in your messages and read the page content\n` +
        (config.tavilyApiKey
          ? `• I can search the web via Tavily when needed\n`
          : "") +
        `• I learn facts about you (stored per user)` +
        (inGroup ? `\n• I learn facts about this group (stored per chat)` : "") +
        `\n\n` +
        `Current model: <code>${escapeHtml(settings.model)}</code>\n` +
        `Commands: /help@${botUsername}\n` +
        `Clear your memory: /forget@${botUsername}` +
        (isOwner(ctx)
          ? `\nOwner tools: /reset@${botUsername}` +
            (inGroup ? ` · /forgetgroup@${botUsername}` : "") +
            ` · /explain@${botUsername} (or reply with either)`
          : "") +
        (isOwner(ctx) ? `\n\nYou are the configured bot owner.` : "") +
        (!inGroup && !getOwnerUserId() && !getOwnerUsername()
          ? `\n\nSet owner: enter your @username in the dashboard Settings page (message the bot once first).`
          : ""),
    );
  });

  bot.command("help", async (ctx) => {
    await replyToUser(
      ctx,
      buildPublicCommandsHelp(
        botUsername,
        isGroupChat(ctx),
        collectModuleBotCommands(),
      ),
    );
  });

  bot.command("id", async (ctx) => {
    try {
      const userId = resolveUserId(ctx);
      if (!userId) return;
      const username = ctx.from?.username;
      let text = `Your Telegram user id: <code>${escapeHtml(userId)}</code>`;
      if (username) {
        text += `\nYour username: @${escapeHtml(username)}`;
      }
      if (isOwner(ctx)) {
        text += "\n\nYou are the configured bot owner.";
      } else if (!getOwnerUserId() && !getOwnerUsername()) {
        text +=
          "\n\nSet owner in the dashboard Settings page using your @username (send /start here first so it can be resolved).";
      }
      if (isGroupChat(ctx)) {
        text += `\n\nIn groups use <code>/id@${botUsername}</code> so Telegram delivers the command.`;
      }
      await replyToUser(ctx, text);
    } catch (err) {
      console.error("/id command error:", err);
      await replyToUser(ctx, "Sorry, I could not look up your id.").catch(
        (e) => console.error("Failed to send /id error reply:", e),
      );
    }
  });

  bot.command("reset", async (ctx) => {
    if (!isOwner(ctx)) {
      await replyToUser(ctx, "Only the bot owner can use /reset.");
      return;
    }
    const convKey = resolveConversationKey(ctx);
    if (!convKey) return;
    clearHistory(convKey);
    const scope = isGroupChat(ctx)
      ? "this group's shared chat history"
      : "this conversation";
    await replyToUser(ctx, `Chat context cleared for ${scope}.`);
  });

  bot.command("forget", async (ctx) => {
    const userId = resolveUserId(ctx);
    if (!userId) return;
    clearUserMemory(userId);
    await replyToUser(ctx, "Your stored memory has been cleared.");
  });

  bot.command("forgetgroup", async (ctx) => {
    if (!isOwner(ctx)) {
      await replyToUser(ctx, "Only the bot owner can use /forgetgroup.");
      return;
    }
    const groupChatId = resolveGroupChatId(ctx);
    if (!groupChatId) {
      await replyToUser(ctx, "Group memory is only available in group chats.");
      return;
    }
    clearGroupMemory(groupChatId);
    await replyToUser(ctx, "This group's stored memory has been cleared.");
  });

  bot.command("remember", async (ctx) => {
    const owner = isOwner(ctx);
    const inline = ctx.match as string;
    const factResolution = resolveCommandInlineOrReplyText(ctx, inline);
    const fact = factResolution?.text;

    if (!fact) {
      await replyToUser(
        ctx,
        "Usage: /remember [fact] (or reply to a message with /remember)",
      );
      return;
    }

    const target = owner
      ? resolveRememberTarget(ctx)
      : resolveCallerRememberTarget(ctx);
    if (!target) {
      await replyToUser(ctx, "Could not determine where to store this memory.");
      return;
    }

    let saved = false;
    let targetLabel = "";

    if (target.kind === "user") {
      const record = createUserFact(target.userId, fact);
      saved = record != null;
      targetLabel = `user memory for ${target.label}`;
    } else if (target.kind === "group") {
      const record = createGroupFact(target.groupId, fact);
      saved = record != null;
      targetLabel = "group memory";
    } else {
      const record = createGeneralFact(fact);
      saved = record != null;
      targetLabel = "general memory";
    }

    if (!saved) {
      await replyToUser(
        ctx,
        `Could not save memory. Facts must be ${MIN_FACT_LENGTH}–${MAX_FACT_LENGTH} characters.`,
      );
      return;
    }

    logEvent("remember_saved", {
      chatId: ctx.chat?.id,
      userId: resolveUserId(ctx),
      target: target.kind,
      targetUserId: target.kind === "user" ? target.userId : undefined,
      targetGroupId: target.kind === "group" ? target.groupId : undefined,
      factChars: fact.length,
    });

    await replyToUser(
      ctx,
      `Saved to <b>${escapeHtml(targetLabel)}</b>:\n<code>${escapeHtml(fact)}</code>`,
    );
  });
}
