import { addCalendarDays, zonedDate } from "../tasks/schedule.js";
import type { SummariesConfig } from "./config.js";

/** Cap days summarized per chat per tick so a long downtime can't stall the loop. */
const MAX_DAYS_PER_CHAT = 7;

export interface SummariesSchedulerDeps {
  /** Polling interval in ms (default 15 min). */
  tickMs?: number;
  timezone: string;
  getConfig: () => Promise<SummariesConfig>;
  /** Skip while the message queue is busy. */
  getQueueSize: () => number;
  listChatIds: () => Promise<string[]>;
  getLastSummarizedDate: (chatId: string) => Promise<string | null>;
  setLastSummarizedDate: (chatId: string, date: string) => Promise<void>;
  summarizeChatDay: (
    chatId: string,
    dateStr: string,
    timezone: string,
  ) => Promise<{ topicCount: number; messageCount: number }>;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
  logEventError?: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

/** Current wall-clock hour (0–23) in `timeZone`. */
function zonedHour(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  return Number(dtf.formatToParts(instant).find((p) => p.type === "hour")?.value ?? "0");
}

/** Dates (YYYY-MM-DD) from the day after `last` through `through`, capped. */
function pendingDates(last: string | null, through: { year: number; month: number; day: number }): string[] {
  const throughStr = dateStr(through);
  if (!last) return [throughStr];
  const dates: string[] = [];
  let cursor = last;
  for (let i = 0; i < MAX_DAYS_PER_CHAT; i += 1) {
    const [y, m, d] = cursor.split("-").map(Number);
    const next = addCalendarDays(y, m, d, 1);
    const nextStr = dateStr(next);
    if (nextStr > throughStr) break;
    dates.push(nextStr);
    cursor = nextStr;
  }
  return dates;
}

/**
 * Daily history-summary scheduler. Polls on an interval; once per day (after the
 * configured local hour) it summarizes each chat's completed days that have not
 * been summarized yet, then advances that chat's watermark.
 */
export function createSummariesScheduler(deps: SummariesSchedulerDeps) {
  const tickMs = deps.tickMs ?? 15 * 60_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const config = await deps.getConfig();
      if (!config.enabled) return;
      if (deps.getQueueSize() > 0) return;

      const now = new Date();
      if (zonedHour(now, deps.timezone) < config.runHour) return;

      const today = zonedDate(now, deps.timezone);
      const yesterday = addCalendarDays(today.year, today.month, today.day, -1);

      for (const chatId of await deps.listChatIds()) {
        if (deps.getQueueSize() > 0) break;
        const last = await deps.getLastSummarizedDate(chatId);
        const dates = pendingDates(last, yesterday);
        for (const date of dates) {
          if (deps.getQueueSize() > 0) break;
          try {
            const result = await deps.summarizeChatDay(chatId, date, deps.timezone);
            await deps.setLastSummarizedDate(chatId, date);
            deps.logEvent?.("history_summary_done", {
              chatId,
              date,
              topics: result.topicCount,
              messages: result.messageCount,
            });
          } catch (err) {
            deps.logEventError?.("history_summary_failed", err, { chatId, date });
            // Stop advancing this chat on failure so we retry the same day later.
            break;
          }
        }
      }
    } catch (err) {
      deps.logEventError?.("history_summary_tick_failed", err);
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      deps.logEvent?.("history_summary_scheduler_started", { tickMs });
      timer = setInterval(() => void tick(), tickMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    /** Run one tick immediately (used by tests / manual trigger). */
    runOnce(): Promise<void> {
      return tick();
    },
  };
}

export type SummariesScheduler = ReturnType<typeof createSummariesScheduler>;
