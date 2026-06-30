import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { api, type SummaryChatStat } from "@llm-tg-bot/dashboard/api";
import { chatSummariesPath } from "./historyPaths";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function formatTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function HistoryChatList() {
  const [chats, setChats] = useState<SummaryChatStat[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { chats: rows } = await api.getSummaryChats();
      setChats(rows);
    } catch (err) {
      setError(err);
      setChats(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (
          event.tableIds?.includes("chat_messages") ||
          event.tableIds?.includes("chat_summaries")
        ) {
          void load(true);
        }
      },
      [load],
    ),
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !chats) return chats ?? [];
    return chats.filter((c) => c.chatId.toLowerCase().includes(query));
  }, [chats, searchQuery]);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      {error ? (
        <div className="mb-3.5">
          <ErrorBanner error={error} onRetry={() => void load()} />
        </div>
      ) : null}

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="min-w-0 flex-1 basis-56"
          placeholder="Search chat id…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && !chats ? (
        <p className="text-muted">Loading…</p>
      ) : !chats ? (
        <p className="text-muted">No history data.</p>
      ) : (
        <>
          <p className="text-muted">{plural(filtered.length, "chat")}</p>

          {filtered.length === 0 ? (
            <p className="text-muted">No chats match your search.</p>
          ) : (
            <ul className="m-0 mt-1 flex list-none flex-col gap-2.5 p-0">
              {filtered.map((chat) => (
                <li key={chat.chatId}>
                  <Link
                    to={chatSummariesPath(chat.chatId)}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3.5 py-3 transition-colors hover:border-accent hover:bg-surface-hover"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <code className="font-mono text-[0.92em] text-text">
                        {chat.chatId}
                      </code>
                      <span className="text-xs text-muted">
                        {plural(chat.messageCount, "message")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span>
                        {chat.topicCount > 0
                          ? `${plural(chat.topicCount, "topic")} · ${plural(
                              chat.summaryDays,
                              "day",
                            )}`
                          : "no summaries"}
                      </span>
                      <span>
                        Last{" "}
                        <time dateTime={chat.lastMessageAt}>
                          {formatTime(chat.lastMessageAt)}
                        </time>
                      </span>
                      <span aria-hidden className="text-base text-muted">
                        ›
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
