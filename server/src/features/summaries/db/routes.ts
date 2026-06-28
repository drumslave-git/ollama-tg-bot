import { Router } from "express";
import { config } from "../../../config/index.js";
import { logEvent, logEventError } from "../../../logging/event-log.js";
import { summarizeChatDay } from "../summarize.js";
import { addCalendarDays, zonedDate } from "../../tasks/schedule.js";
import { listDistinctHistoryChatIds } from "../../history/db/index.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Resolve a date arg to YYYY-MM-DD: a literal date, "today", "yesterday", or default today. */
function resolveDate(arg: unknown, tz: string): string {
  const today = zonedDate(new Date(), tz);
  const todayStr = `${today.year}-${pad2(today.month)}-${pad2(today.day)}`;
  if (arg == null || arg === "" || arg === "today") return todayStr;
  if (arg === "yesterday") {
    const y = addCalendarDays(today.year, today.month, today.day, -1);
    return `${y.year}-${pad2(y.month)}-${pad2(y.day)}`;
  }
  if (typeof arg === "string" && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  return "";
}

export const summariesRouter = Router();

/**
 * Trigger a history summary on demand — bypasses every scheduler gate (poll
 * interval, runHour, queue check, yesterday-only watermark). Used by the
 * dashboard "Summarize now" buttons for testing.
 *
 * Body: { date?: string ("today"|"yesterday"|YYYY-MM-DD), chatId?: string }
 * Omit chatId to summarize every chat that has history.
 */
summariesRouter.post("/run", async (req, res) => {
  const body = req.body ?? {};
  const tz = config.timezone;
  const date = resolveDate(body.date, tz);
  if (!date) {
    return res
      .status(400)
      .json({ error: 'date must be "today", "yesterday", or YYYY-MM-DD' });
  }

  const chatIds =
    body.chatId != null && String(body.chatId) !== ""
      ? [String(body.chatId)]
      : (await listDistinctHistoryChatIds()).map((id) => String(id));

  const results: Array<{
    chatId: string;
    topicCount: number;
    messageCount: number;
    error?: string;
  }> = [];

  for (const chatId of chatIds) {
    try {
      const { topicCount, messageCount } = await summarizeChatDay(
        chatId,
        date,
        tz,
      );
      logEvent("history_summary_manual_run", { chatId, date, topicCount, messageCount });
      results.push({ chatId, topicCount, messageCount });
    } catch (err) {
      logEventError("history_summary_manual_failed", err, { chatId, date });
      results.push({
        chatId,
        topicCount: 0,
        messageCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  res.json({ date, results });
});

export function createSummariesRouter(): Router {
  return summariesRouter;
}
