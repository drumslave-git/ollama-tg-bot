import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import {
  api,
  type SummaryDayGroup,
  type SummaryRunResult,
} from "@llm-tg-bot/dashboard/api";
import { historyRootPath, topicMessagesPath } from "./historyPaths";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

/** Local wall-clock date as YYYY-MM-DD for the date input default. */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function ChatSummariesPage() {
  const { chatId = "" } = useParams();

  const [days, setDays] = useState<SummaryDayGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [summaryDate, setSummaryDate] = useState(todayLocal());
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<SummaryRunResult | null>(null);
  const [runError, setRunError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!chatId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const { days: groups } = await api.getChatSummaries(chatId);
        setDays(groups);
      } catch (err) {
        setError(err);
        setDays(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [chatId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (event.tableIds?.includes("chat_summaries")) void load(true);
      },
      [load],
    ),
  );

  const runSummary = useCallback(async () => {
    setRunError(null);
    setRunResult(null);
    setRunning(true);
    try {
      const res = await api.runSummary({ date: summaryDate, chatId });
      setRunResult(res.results.find((r) => r.chatId === chatId) ?? null);
      await load(true);
    } catch (err) {
      setRunError(err);
    } finally {
      setRunning(false);
    }
  }, [summaryDate, chatId, load]);

  const topicCount =
    days?.reduce((sum, day) => sum + day.topics.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link to={historyRootPath} className={secondaryBtn}>
            ← Chats
          </Link>
          <code className="font-mono text-[0.95em]">{chatId}</code>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-semibold">Run a summary now</h2>
        <p className="m-0 mb-3.5 max-w-2xl text-[0.88rem] text-muted">
          Trigger the daily history summary for this chat on demand instead of
          waiting for the scheduled job. Re-running replaces that day's stored
          topics.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
            value={summaryDate}
            onChange={(event) => setSummaryDate(event.target.value)}
            max={todayLocal()}
          />
          <button
            type="button"
            className={primaryBtn}
            onClick={() => void runSummary()}
            disabled={running}
          >
            {running ? "Summarizing…" : "Summarize this chat"}
          </button>
        </div>

        {runError ? (
          <div className="mt-3">
            <ErrorBanner error={runError} />
          </div>
        ) : null}

        {runResult ? (
          <p className="m-0 mt-3 text-sm">
            {runResult.error ? (
              <span className="text-danger">failed — {runResult.error}</span>
            ) : (
              <span className="text-muted">
                {summaryDate}: {plural(runResult.messageCount, "message")} →{" "}
                {plural(runResult.topicCount, "topic")}
              </span>
            )}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6">
        {error ? (
          <div className="mb-3.5">
            <ErrorBanner error={error} onRetry={() => void load()} />
          </div>
        ) : null}

        {loading && !days ? (
          <p className="text-muted">Loading…</p>
        ) : !days || days.length === 0 ? (
          <p className="text-muted">
            No summaries stored for this chat yet. Run one above.
          </p>
        ) : (
          <>
            <p className="mb-3.5 text-muted">
              {plural(topicCount, "topic")} across {plural(days.length, "day")}
            </p>
            <div className="flex flex-col gap-4">
              {days.map((day) => (
                <article
                  key={day.summaryDate}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-3.5 py-2.5">
                    <time
                      className="font-mono text-[0.9em] text-accent"
                      dateTime={day.summaryDate}
                    >
                      {day.summaryDate}
                    </time>
                    <span className="text-xs text-muted">
                      {plural(day.topics.length, "topic")}
                    </span>
                  </header>
                  <ol className="m-0 list-none p-0">
                    {day.topics.map((topic) => (
                      <li
                        key={topic.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <Link
                          to={topicMessagesPath(chatId, topic.id)}
                          className="flex items-start justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-surface-hover"
                        >
                          <p className="m-0 whitespace-pre-wrap break-words text-sm leading-snug">
                            {topic.content}
                          </p>
                          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-muted">
                            {plural(topic.messageIds.length, "msg")} ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
