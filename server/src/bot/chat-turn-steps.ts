import type { Context } from "grammy";
import type { ChatTurnInput } from "./chat-turn.js";
import { getResolvedSettings } from "../settings-runtime.js";
import { logEvent, logEventError } from "../event-log.js";
import { getMessageReport } from "../message-report.js";
import { getEffectiveMood, saveMoodState } from "../db/mood.js";
import { evaluateMood } from "../mood-evaluate.js";
import { resolveLinkFetchContext } from "./link-fetch.js";
import { isTavilyConfigured, executeWebSearch, type TavilySource } from "../tavily/client.js";
import { analyzeSearchNeed } from "./search-analyze.js";
import { rollStickerReplyChance, analyzeStickerForReply } from "./sticker-analyze.js";
import { resolveStickerFileId } from "./sticker-catalog.js";
import { sendThinkingMessages } from "./send-thinking.js";
import { resolveTypingThreadParams, messageThreadExtra } from "./typing.js";
import { prepareTelegramHtml, visibleTelegramText, escapeHtml } from "../telegram/html.js";
import { replyParameters } from "./replies.js";

export async function evaluateMoodForTurn(input: ChatTurnInput, moodContextText: string, moodLatestTurnPreview: string) {
  const settings = getResolvedSettings();
  const report = getMessageReport(input.turnId);
  const decayedMood = getEffectiveMood();
  if (settings.workflowSteps && !settings.workflowSteps.includes("mood")) {
    report?.skipPhase("mood", "Mood", "Skipped (Workflow step disabled)");
    return decayedMood;
  }
  const moodStarted = performance.now();
  const evaluatedMood = await evaluateMood({
    currentMood: decayedMood,
    historyText: moodContextText,
    latestTurn: moodLatestTurnPreview,
    traceTurnId: input.turnId,
  });
  saveMoodState(evaluatedMood);
  report?.okPhase(
    "mood",
    "Mood",
    "Mood state updated for this reply",
    performance.now() - moodStarted,
    { type: "mood", traits: evaluatedMood },
  );
  return evaluatedMood;
}

export async function fetchLinksForTurn(input: ChatTurnInput) {
  const settings = getResolvedSettings();
  const report = getMessageReport(input.turnId);
  if (settings.workflowSteps && !settings.workflowSteps.includes("links")) {
    report?.skipPhase("links", "Link fetch", "Skipped (Workflow step disabled)");
    return { context: null, urlCount: 0, resolved: false };
  }
  const linkFetchStarted = performance.now();
  const linkFetch = await resolveLinkFetchContext({
    message: input.latestBody,
    replyContext: input.replyContext,
  });
  if (linkFetch.urlCount > 0) {
    report?.okPhase(
      "links",
      "Link fetch",
      `Fetched ${linkFetch.urlCount} URL(s)`,
      performance.now() - linkFetchStarted,
    );
  } else {
    report?.skipPhase("links", "Link fetch", "No links in message");
  }
  return linkFetch;
}

export async function searchWebForTurn(input: ChatTurnInput, linkFetchResolved: boolean, turnLog: any) {
  const settings = getResolvedSettings();
  const report = getMessageReport(input.turnId);
  if (settings.workflowSteps && !settings.workflowSteps.includes("search")) {
    report?.skipPhase("search", "Web search", "Skipped (Workflow step disabled)");
    return { webSearchContext: null, webSearchSources: [] };
  }
  let webSearchContext: string | null = null;
  let webSearchSources: TavilySource[] = [];

  if (isTavilyConfigured() && !linkFetchResolved) {
    const decision = await analyzeSearchNeed({
      userMessage: input.latestBody,
      replyContext: input.replyContext,
      traceTurnId: input.turnId,
    });
    if (decision.needsSearch && decision.query) {
      logEvent("web_search_triggered", { ...turnLog, queryLen: decision.query.length });
      const searchStarted = performance.now();
      const result = await executeWebSearch(decision.query);
      webSearchContext = result.context;
      webSearchSources = result.sources;
      if (result.ok) {
        report?.okPhase(
          "search",
          "Web search",
          `Query "${decision.query}" · ${result.results.length} source(s)`,
          performance.now() - searchStarted,
        );
      } else {
        logEventError("web_search_failed", new Error(result.reason), turnLog);
        report?.failPhase(
          "search",
          "Web search",
          result.reason,
          performance.now() - searchStarted,
        );
      }
    } else {
      const skipReason =
        decision.reason && decision.reason !== "LLM decision: no"
          ? decision.reason
          : "Not needed";
      report?.skipPhase("search", "Web search", skipReason);
    }
  } else if (isTavilyConfigured() && linkFetchResolved) {
    report?.skipPhase("search", "Web search", "Skipped because link content was fetched");
  } else {
    report?.skipPhase("search", "Web search", "Tavily not configured");
  }
  return { webSearchContext, webSearchSources };
}

export async function analyzeStickerForTurn(input: ChatTurnInput, replyBody: string, turnLog: any) {
  const settings = getResolvedSettings();
  const report = getMessageReport(input.turnId);
  if (settings.workflowSteps && !settings.workflowSteps.includes("sticker")) {
    report?.skipPhase("sticker", "Sticker", "Skipped (Workflow step disabled)");
    return { stickerEmoji: null, stickerFileId: null };
  }
  let stickerEmoji: string | null = null;

  const stickerRoll = settings.stickersEnabled ? rollStickerReplyChance(settings.stickerReplyChance) : null;
  if (settings.stickersEnabled && stickerRoll?.hit) {
    const stickerStarted = performance.now();
    stickerEmoji = await analyzeStickerForReply({
      userMessage: input.latestBody,
      botReply: replyBody,
      replyContext: input.replyContext,
      traceTurnId: input.turnId,
    });
    if (stickerEmoji) {
      report?.okPhase("sticker", "Sticker", `Sent ${stickerEmoji}`, performance.now() - stickerStarted);
    } else {
      report?.skipPhase("sticker", "Sticker", "Chance hit but no sticker selected");
    }
  } else if (settings.stickersEnabled && stickerRoll) {
    report?.skipPhase("sticker", "Sticker", `Chance ${stickerRoll.chance}% not hit`);
  } else {
    report?.skipPhase("sticker", "Sticker", settings.stickersEnabled ? "Stickers disabled" : "Stickers disabled");
  }

  const stickerFileId = stickerEmoji ? resolveStickerFileId(stickerEmoji) : null;
  return { stickerEmoji, stickerFileId };
}

export function buildReplyExtra(ctx: Context, options?: { messageThreadId?: number }) {
  const extra: Parameters<Context["reply"]>[1] = {};
  if (options?.messageThreadId) {
    const threadParams = messageThreadExtra({ message_thread_id: options.messageThreadId });
    if (threadParams) extra.message_thread_id = threadParams.message_thread_id;
  }
  const replyParams = replyParameters(ctx);
  if (replyParams) extra.reply_parameters = replyParams;
  return Object.keys(extra).length > 0 ? extra : undefined;
}

export function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let curr = text;
  while (curr.length > maxLen) {
    let splitAt = curr.lastIndexOf("\n", maxLen);
    if (splitAt === -1) splitAt = curr.lastIndexOf(" ", maxLen);
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(curr.slice(0, splitAt));
    curr = curr.slice(splitAt).trimStart();
  }
  if (curr) chunks.push(curr);
  return chunks;
}
