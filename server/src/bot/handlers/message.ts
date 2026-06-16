import type { Context } from "grammy";
import { logEvent, logEventError, type EventFields } from "../../logging/event-log.js";
import { getMaxDebugTraceId } from "../../db/debug/traces.js";
import { beginMessageReport, getMessageReport } from "../../debug/message-report.js";
import { resolveConversationKey, resolveGroupChatId, resolveUserId, isGroupChat, currentSpeakerFromUser } from "../turn/conversation.js";
import { extractText } from "../messages/message-content.js";
import { summarizeMessageContent, formatReplyContext, isReplyInBotThread, isReplyToBot } from "../replies/replies.js";
import { isSlashCommandMessage } from "../commands/slash-command.js";
import {
  messageHasVisionMedia,
  messageHasUserImage,
  loadVisionFromMessage,
  findReplyMediaMessage,
  stickerPackEmoji,
  describeVisionImages,
} from "../media/vision-adapter.js";
import { getSettings, recordMessageReceived, recordReply } from "../../db/index.js";
import { isMaintenanceBlocked } from "../maintenance/maintenance.js";
import { startTypingForMessage } from "../replies/typing.js";
import { getUserFacts } from "../../db/memory/user.js";
import { getGroupFacts } from "../../db/memory/group.js";
import { getGeneralFacts } from "../../db/memory/general.js";
import { mediaKindForMessage, userRoleTag, buildMediaHistoryContent, buildTextHistoryContent } from "@llm-tg-bot/modules-history";
import { getBotIdentity, stripBotAddressing } from "../identity/bot-identity.js";
import { resolveMentionedKnownUsers, formatMentionedUsersContext } from "../messages/mentions.js";
import { replyToUser } from "../replies/replies-helpers.js";
import { runChatTurn } from "../turn/chat-turn.js";
import { isOwner } from "../owner/owner.js";
import type { PipelineTurnState } from "@llm-tg-bot/modules-registry";
import {
  createPipelineServices,
  runPipelinePhase,
} from "../../pipeline/index.js";

let nextTurnId: number | null = null;

function senderLabel(ctx: Context): string {
  if (!ctx.from) return "Someone";
  return (
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") ||
    ctx.from.username ||
    "Someone"
  );
}

function buildVisionTurnBody(
  messageText: string,
  mediaKind: string,
  visionDescription: string,
): string {
  const mediaNote = `The user sent a ${mediaKind}: ${visionDescription}`;
  return [messageText, mediaNote].filter(Boolean).join("\n\n");
}

function allocateTurnId(): number {
  if (nextTurnId == null) {
    nextTurnId = getMaxDebugTraceId() + 1;
  }
  return nextTurnId++;
}

export async function messageHandler(ctx: Context, botToken: string) {
  if (!ctx.message) return;

  let turnId = 0;
  let report: ReturnType<typeof beginMessageReport> | null = null;
  let msgLog: EventFields = {};

  try {
    turnId = allocateTurnId();
    const chatId = ctx.chat?.id;
    const userId = resolveUserId(ctx);
    const chatType = ctx.chat?.type ?? "unknown";
    const messagePreview =
      extractText(ctx) ||
      summarizeMessageContent(ctx.message).slice(0, 200) ||
      "(non-text message)";

    report =
      chatId != null
        ? beginMessageReport({
            turnId,
            chatId,
            userId,
            chatType,
            messageId: ctx.message.message_id ?? null,
            messagePreview,
          })
        : null;

    msgLog = {
      turnId,
      chatId,
      userId: ctx.from?.id,
      chatType: ctx.chat?.type,
    };

    logEvent("message_received", msgLog);
    if (ctx.from?.is_bot) {
      logEvent("message_ignored", { ...msgLog, reason: "from_bot" });
      report?.finishIgnored("from_bot");
      return;
    }
    if (isSlashCommandMessage(ctx)) {
      logEvent("message_ignored", { ...msgLog, reason: "slash_command" });
      report?.finishIgnored("slash_command");
      return;
    }

    const text = extractText(ctx);
    const hasMedia =
      !!ctx.message.photo ||
      !!ctx.message.sticker ||
      !!ctx.message.document;

    report?.setIntake({
      hasMedia,
      mediaKind: hasMedia
        ? mediaKindForMessage(ctx.message, !!ctx.message.sticker)
        : undefined,
    });

    if (!text && !hasMedia) {
      logEvent("message_ignored", { ...msgLog, reason: "no_content" });
      report?.finishIgnored("no_content");
      return;
    }

    if (messageHasVisionMedia(ctx.message)) {
      logEvent("media_detected", {
        ...msgLog,
        mediaKind: mediaKindForMessage(ctx.message, !!ctx.message.sticker),
        onMessage: true,
      });
    }

    const settings = getSettings();
    if (isMaintenanceBlocked(ctx)) {
      logEvent("message_ignored", { ...msgLog, reason: "maintenance_mode" });
      report?.finishIgnored("maintenance_mode");
      return;
    }
    const inGroup = ctx.chat?.type !== "private";
    const randomRoll =
      settings.randomReplyEnabled && inGroup ? Math.random() * 100 : null;
    const randomHit =
      settings.randomReplyEnabled &&
      inGroup &&
      randomRoll != null &&
      randomRoll < settings.randomReplyChance;
    const imageHit =
      settings.reactToEveryImage &&
      inGroup &&
      !randomHit &&
      messageHasUserImage(ctx.message);
    let addressed = false;
    let addressSource: string | undefined;

    if (randomHit || imageHit) {
      addressed = false;
    } else {
      const bot = getBotIdentity();
      const pipelineState: PipelineTurnState = {
        turnId,
        latestBody: text ?? "",
        moduleInput: {
          address: {
            chatType: ctx.chat?.type,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id,
            message: ctx.message,
            bot,
            isReplyToBot: isReplyToBot(ctx, bot.username),
            isReplyInBotThread: isReplyInBotThread(ctx, bot.username),
            sender: senderLabel(ctx),
          },
        },
      };
      await runPipelinePhase("gate", pipelineState, createPipelineServices());
      addressed = Boolean(pipelineState.addressed);
      addressSource = pipelineState.addressSource;
    }

    logEvent("message_address_gate", {
      ...msgLog,
      addressed,
      randomHit,
      imageHit,
      randomReplyEnabled: settings.randomReplyEnabled,
      randomReplyChance: settings.randomReplyChance,
      randomRoll: randomRoll == null ? undefined : Number(randomRoll.toFixed(2)),
      reactToEveryImage: settings.reactToEveryImage,
    });

    if (!addressed && !randomHit && !imageHit) {
      logEvent("message_ignored", { ...msgLog, reason: "not_addressed" });
      report?.finishIgnored("not_addressed", addressSource);
      return;
    }

    const trigger = addressed
      ? "addressed"
      : randomHit
        ? "random"
        : "image";
    logEvent("message_accepted", { ...msgLog, trigger });
    report?.setAccepted({
      trigger,
      addressSource: addressSource,
    });

    recordMessageReceived();

    let endTyping: (() => void) | undefined;
    try {
      endTyping = startTypingForMessage(ctx) ?? undefined;
      const chatId = ctx.chat?.id;
      if (!chatId) {
        report?.finalizeError("Missing chat id");
        return;
      }

      const convKey = resolveConversationKey(ctx);
      if (!convKey) {
        report?.finalizeError("Missing conversation key");
        return;
      }
      report?.setConvKey(convKey);

      const messageThreadId = ctx.message?.message_thread_id;
      const groupUserId = resolveUserId(ctx);
      const groupChatId = resolveGroupChatId(ctx);
      const inGroupChat = isGroupChat(ctx);
      const userMemoryFacts = groupUserId ? getUserFacts(groupUserId) : [];
      const groupMemoryFacts = groupChatId ? getGroupFacts(groupChatId) : [];
      const generalMemoryFacts = getGeneralFacts();
      const botId = ctx.me?.id;
      const botUsername = ctx.me?.username;
      const speaker = inGroupChat ? currentSpeakerFromUser(ctx.from) : null;
      const userRole = userRoleTag(ctx.from);

      const promptText = stripBotAddressing(text, getBotIdentity()) || text;
      const mentionCtx = {
        botId,
        botUsername,
        senderId: ctx.from?.id,
        senderUsername: ctx.from?.username,
      };
      const mentionedUsers = resolveMentionedKnownUsers(
        text.trim(),
        ctx.message,
        mentionCtx,
      );
      const mentionedUsersContext = formatMentionedUsersContext(mentionedUsers);
      const messageText = promptText;

      let userHistoryContent: string | null = null;
      let skipUserHistory = inGroupChat;
      let latestBody = messageText || "(non-text message)";
      let replyContext = formatReplyContext(ctx, botId, speaker);

      if (inGroupChat) {
        if (messageHasVisionMedia(ctx.message)) {
          const loaded = await loadVisionFromMessage(botToken, ctx.message);
          if (loaded.unavailableText) {
            logEvent("vision_unavailable", { ...msgLog, convKey, addressed: true });
            getMessageReport(turnId)?.failPhase(
              "vision",
              "Vision",
              "Vision model unavailable",
            );
            getMessageReport(turnId)?.finalizeEarlyReply({
              reason: "Vision unavailable",
            });
            await replyToUser(ctx, loaded.unavailableText);
            recordReply(false);
            return;
          }
          if (loaded.images.length > 0) {
            const visionDescription = await describeVisionImages(
              loaded.images,
              {
                ...msgLog,
                convKey,
              },
              loaded.visionHint,
              turnId,
            );
            const sticker = loaded.sourceSticker ?? ctx.message.sticker;
            const mediaKind = mediaKindForMessage(ctx.message, !!sticker);
            const mediaHistory = buildMediaHistoryContent(
              ctx.from,
              ctx.message,
              mediaKind,
              visionDescription,
              botId,
              stickerPackEmoji(sticker),
            );
            if (mediaHistory) {
              userHistoryContent = mediaHistory;
              logEvent("vision_stored", {
                ...msgLog,
                convKey,
                mediaKind,
                chars: visionDescription.length,
              });
              getMessageReport(turnId)?.okPhase(
                "vision",
                "Vision",
                `Stored ${mediaKind} description (${visionDescription.length} chars)`,
              );
            }
            latestBody = buildVisionTurnBody(
              messageText,
              mediaKind,
              visionDescription,
            );
          }
        }
        if (!latestBody.trim() || latestBody === "(non-text message)") {
          latestBody = "Respond to this.";
        }
      } else {
        let visionFromReply = false;
        let loaded = await loadVisionFromMessage(botToken, ctx.message);

        if (loaded.unavailableText) {
          logEvent("vision_unavailable", { ...msgLog, convKey });
          getMessageReport(turnId)?.failPhase(
            "vision",
            "Vision",
            "Vision model unavailable",
          );
          getMessageReport(turnId)?.finalizeEarlyReply({
            reason: "Vision unavailable",
          });
          await replyToUser(ctx, loaded.unavailableText);
          recordReply(false);
          return;
        }

        if (loaded.images.length === 0) {
          const replyMediaMsg = findReplyMediaMessage(ctx.message);
          if (replyMediaMsg) {
            logEvent("media_detected", {
              ...msgLog,
              mediaKind: mediaKindForMessage(replyMediaMsg, !!replyMediaMsg.sticker),
              onMessage: false,
              fromReply: true,
            });
            const replyLoaded = await loadVisionFromMessage(
              botToken,
              replyMediaMsg,
            );
            if (replyLoaded.unavailableText) {
              logEvent("vision_unavailable", { ...msgLog, convKey, fromReply: true });
              getMessageReport(turnId)?.failPhase(
                "vision",
                "Vision",
                "Vision model unavailable (replied-to media)",
              );
              getMessageReport(turnId)?.finalizeEarlyReply({
                reason: "Vision unavailable",
              });
              await replyToUser(ctx, replyLoaded.unavailableText);
              recordReply(false);
              return;
            }
            if (replyLoaded.images.length > 0) {
              loaded = replyLoaded;
              visionFromReply = true;
            }
          }
        }

        let visionDescription = "";
        if (loaded.images.length > 0) {
          visionDescription = await describeVisionImages(
            loaded.images,
            {
              ...msgLog,
              convKey,
              fromReply: visionFromReply,
            },
            loaded.visionHint,
            turnId,
          );
        }

        const sticker = loaded.sourceSticker ?? ctx.message.sticker;
        const mediaOnCurrentMessage = messageHasVisionMedia(ctx.message);
        const mediaKind = mediaKindForMessage(
          ctx.message,
          !!sticker || !!loaded.sourceSticker,
        );

        if (visionDescription && mediaOnCurrentMessage) {
          const mediaHistory = buildMediaHistoryContent(
            ctx.from,
            ctx.message,
            mediaKind,
            visionDescription,
            botId,
            stickerPackEmoji(sticker),
          );
          if (mediaHistory) {
            userHistoryContent = mediaHistory;
            skipUserHistory = false;
            logEvent("vision_stored", {
              ...msgLog,
              convKey,
              mediaKind,
              fromReply: visionFromReply,
              chars: visionDescription.length,
            });
            getMessageReport(turnId)?.okPhase(
              "vision",
              "Vision",
              `Stored ${mediaKind} description (${visionDescription.length} chars)`,
            );
          }
          latestBody = buildVisionTurnBody(
            messageText,
            mediaKind,
            visionDescription,
          );
        } else if (visionDescription && visionFromReply) {
          const mediaNote = `The user is asking about an ${mediaKind} they replied to: ${visionDescription}`;
          latestBody = [messageText, mediaNote].filter(Boolean).join("\n\n");
          const mediaNoteCtx = `Replied-to ${mediaKind}: ${visionDescription}`;
          replyContext = replyContext
            ? `${replyContext}\n\n${mediaNoteCtx}`
            : mediaNoteCtx;
        } else {
          const textHistory = buildTextHistoryContent(
            ctx.from,
            ctx.message,
            messageText,
            botId,
          );
          if (textHistory) {
            userHistoryContent = textHistory;
            skipUserHistory = false;
          }
          latestBody = messageText || "(non-text message)";
        }
      }

      await runChatTurn(ctx, {
        turnId,
        convKey,
        chatId,
        userId: groupUserId,
        groupChatId,
        inGroup: inGroupChat,
        latestBody,
        userRole,
        userHistoryContent,
        skipUserHistory,
        userMemoryFacts,
        groupMemoryFacts,
        generalMemoryFacts,
        currentSpeaker: speaker,
        currentSpeakerIsOwner: inGroupChat ? isOwner(ctx) : false,
        replyContext,
        mentionedUsersContext,
        messageThreadId,
        isForum: ctx.chat?.is_forum === true,
        memoryInput: {
          userMessage: latestBody,
          replyContext,
          existingUserFacts: userMemoryFacts,
          existingGroupFacts: groupMemoryFacts,
          existingGeneralFacts: generalMemoryFacts,
          isGroupChat: inGroupChat,
        },
      });
    } catch (err) {
      logEventError("handler_error", err, msgLog);
      getMessageReport(turnId)?.finalizeError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      endTyping?.();
    }
  } catch (err) {
    logEventError("handler_error", err, msgLog);
    report?.finalizeError(
      err instanceof Error ? err.message : String(err),
    );
  }
}
