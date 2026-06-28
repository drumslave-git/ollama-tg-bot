/**
 * On-demand history summarizer — for testing without waiting for the daily job.
 *
 * Calls summarizeChatDay() directly, bypassing every scheduler gate: the 15-min
 * poll, the configured runHour, the queue-empty check, and the yesterday-only
 * watermark. Lets you summarize any chat for any day (today included) right now.
 *
 * Usage (from server/):
 *   npx tsx src/scripts/summarize-day.ts [date] [chatId]
 *
 *   date    YYYY-MM-DD | "today" | "yesterday"   (default: today)
 *   chatId  a single chat id                     (default: all chats with history)
 *
 * Examples:
 *   npx tsx src/scripts/summarize-day.ts                 # today, all chats
 *   npx tsx src/scripts/summarize-day.ts yesterday       # yesterday, all chats
 *   npx tsx src/scripts/summarize-day.ts 2026-06-27 12345
 *
 * Idempotent: re-running replaces that day's stored topics. Does NOT advance the
 * scheduler watermark, so the real daily job is unaffected.
 */
import { config } from "../config/index.js";
import { initDatabase } from "../db/index.js";
import { summarizeChatDay } from "../features/summaries/index.js";
import { listDistinctHistoryChatIds } from "../features/history/db/index.js";
import { addCalendarDays, zonedDate } from "../features/tasks/schedule.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function resolveDate(arg: string | undefined, tz: string): string {
  const today = zonedDate(new Date(), tz);
  if (!arg || arg === "today") {
    return `${today.year}-${pad2(today.month)}-${pad2(today.day)}`;
  }
  if (arg === "yesterday") {
    const y = addCalendarDays(today.year, today.month, today.day, -1);
    return `${y.year}-${pad2(y.month)}-${pad2(y.day)}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    throw new Error(`Invalid date "${arg}" — use YYYY-MM-DD, "today", or "yesterday".`);
  }
  return arg;
}

async function main(): Promise<void> {
  const [dateArg, chatArg] = process.argv.slice(2);
  await initDatabase();

  const tz = config.timezone;
  const date = resolveDate(dateArg, tz);
  const chatIds = chatArg
    ? [chatArg]
    : (await listDistinctHistoryChatIds()).map((id) => String(id));

  if (chatIds.length === 0) {
    console.log("No chats with history found.");
    return;
  }

  console.log(`Summarizing ${date} (tz ${tz}) for ${chatIds.length} chat(s)...\n`);
  for (const chatId of chatIds) {
    try {
      const { topicCount, messageCount } = await summarizeChatDay(chatId, date, tz);
      console.log(`  chat ${chatId}: ${messageCount} messages -> ${topicCount} topic(s)`);
    } catch (err) {
      console.error(`  chat ${chatId}: FAILED -`, err instanceof Error ? err.message : err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
