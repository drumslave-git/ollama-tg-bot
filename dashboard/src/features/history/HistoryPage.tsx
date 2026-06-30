import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import {
  api,
  type DataTablePayload,
  type SummaryRunResult,
} from "@llm-tg-bot/dashboard/api";

const TABLE_ID = "chat_messages";

/** Local wall-clock date as YYYY-MM-DD for the date input default. */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface MessageRow {
  id: number;
  entityId: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ChatGroup {
  entityId: string;
  messages: MessageRow[];
  lastAt: string;
}

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const smallBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-2.5 py-1 text-xs font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toMessageRow(row: Record<string, unknown>): MessageRow | null {
  // The generic data browser returns raw snake_case column names.
  const id = Number(row.id);
  const entityId = String(row.entity_id ?? "");
  const role = typeof row.role === "string" ? row.role : "";
  const content = typeof row.content === "string" ? row.content : "";
  if (!Number.isFinite(id) || !entityId || !role) return null;
  return {
    id,
    entityId,
    role,
    content,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

function groupByEntity(rows: Record<string, unknown>[]): ChatGroup[] {
  const groups = new Map<string, MessageRow[]>();
  for (const raw of rows) {
    const msg = toMessageRow(raw);
    if (!msg) continue;
    const existing = groups.get(msg.entityId);
    if (existing) existing.push(msg);
    else groups.set(msg.entityId, [msg]);
  }

  return [...groups.entries()]
    .map(([entityId, messages]) => {
      messages.sort((a, b) => a.id - b.id);
      return {
        entityId,
        messages,
        lastAt: messages[messages.length - 1]?.createdAt ?? "",
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function HistoryPage() {
  const [payload, setPayload] = useState<DataTablePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [summaryDate, setSummaryDate] = useState(todayLocal());
  // Which run is in flight: a chat's entityId, "__all__", or null when idle.
  const [runningChat, setRunningChat] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<SummaryRunResult[] | null>(null);
  const [runError, setRunError] = useState<unknown>(null);

  const resultsByChat = useMemo(() => {
    const map = new Map<string, SummaryRunResult>();
    for (const r of runResults ?? []) map.set(r.chatId, r);
    return map;
  }, [runResults]);

  const runSummary = useCallback(
    async (chatId?: string) => {
      setRunError(null);
      setRunningChat(chatId ?? "__all__");
      try {
        const res = await api.runSummary({ date: summaryDate, chatId });
        // Merge per-chat runs into the existing result set; replace on "all".
        setRunResults((prev) => {
          if (!chatId || !prev) return res.results;
          const merged = new Map(prev.map((r) => [r.chatId, r]));
          for (const r of res.results) merged.set(r.chatId, r);
          return [...merged.values()];
        });
      } catch (err) {
        setRunError(err);
      } finally {
        setRunningChat(null);
      }
    },
    [summaryDate],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setPayload(await api.getDataTable(TABLE_ID));
    } catch (err) {
      setError(err);
      setPayload(null);
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
        if (event.tableIds?.includes(TABLE_ID)) void load(true);
      },
      [load],
    ),
  );

  const groups = useMemo(
    () => (payload ? groupByEntity(payload.rows) : []),
    [payload],
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => {
      if (group.entityId.toLowerCase().includes(query)) return true;
      return group.messages.some((m) =>
        m.content.toLowerCase().includes(query),
      );
    });
  }, [groups, searchQuery]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-2xl font-bold tracking-tight">
            Chat history
          </h1>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Every stored message per Telegram chat. The model reads this on
            demand through the history MCP tools — nothing is auto-injected or
            compressed.
          </p>
        </div>
        <Link to="/history/debug" className={secondaryBtn}>
          Summary job runs
        </Link>
      </header>

      {error ? <ErrorBanner error={error} /> : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-semibold">Run a summary now</h2>
        <p className="m-0 mb-3.5 max-w-2xl text-[0.88rem] text-muted">
          Trigger the daily history summary on demand instead of waiting for the
          scheduled job. Pick a day and summarize every chat, or just one below.
          Re-running replaces that day's stored topics.
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
            disabled={runningChat !== null}
          >
            {runningChat === "__all__"
              ? "Summarizing…"
              : "Summarize all chats"}
          </button>
        </div>

        {runError ? (
          <div className="mt-3">
            <ErrorBanner error={runError} />
          </div>
        ) : null}

        {runResults ? (
          <ul className="m-0 mt-3 list-none p-0 text-sm">
            {runResults.map((r) => (
              <li key={r.chatId} className="py-0.5">
                <code className="font-mono text-[0.85em]">{r.chatId}</code>:{" "}
                {r.error ? (
                  <span className="text-danger">failed — {r.error}</span>
                ) : (
                  <span className="text-muted">
                    {r.messageCount} message{r.messageCount === 1 ? "" : "s"} →{" "}
                    {r.topicCount} topic{r.topicCount === 1 ? "" : "s"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6">
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="min-w-0 flex-1 basis-56"
            placeholder="Search entity id or message text…"
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

        {loading && !payload ? (
          <p className="text-muted">Loading…</p>
        ) : !payload ? (
          <p className="text-muted">No history data.</p>
        ) : (
          <>
            <p className="text-muted">
              {filteredGroups.length} chat
              {filteredGroups.length === 1 ? "" : "s"}
              {payload.truncated ? " (rows truncated)" : ""}
            </p>

            {filteredGroups.length === 0 ? (
              <p className="text-muted">No chats match your search.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredGroups.map((group) => (
                  <article
                    key={group.entityId}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-3.5 py-2.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <code className="font-mono text-[0.88em]">
                          {group.entityId}
                        </code>
                        <span className="ml-0.5 text-xs font-normal text-muted">
                          {group.messages.length} message
                          {group.messages.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {resultsByChat.has(group.entityId) ? (
                          <span className="text-xs text-muted">
                            {(() => {
                              const r = resultsByChat.get(group.entityId)!;
                              return r.error
                                ? `failed: ${r.error}`
                                : `${summaryDate}: ${r.topicCount} topic${
                                    r.topicCount === 1 ? "" : "s"
                                  }`;
                            })()}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted">
                          Last{" "}
                          <time dateTime={group.lastAt}>
                            {formatTime(group.lastAt)}
                          </time>
                        </span>
                        <button
                          type="button"
                          className={smallBtn}
                          onClick={() => void runSummary(group.entityId)}
                          disabled={runningChat !== null}
                          title={`Summarize ${group.entityId} for ${summaryDate}`}
                        >
                          {runningChat === group.entityId
                            ? "Summarizing…"
                            : "Summarize"}
                        </button>
                      </div>
                    </header>

                    <ol className="m-0 list-none p-0">
                      {group.messages.map((message) => (
                        <li
                          key={message.id}
                          className="border-b border-border px-3.5 py-3 last:border-b-0"
                        >
                          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-mono text-xs text-accent">
                              {message.role}
                            </span>
                            <time
                              className="text-xs text-muted"
                              dateTime={message.createdAt}
                            >
                              {formatTime(message.createdAt)}
                            </time>
                          </div>
                          <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-snug">
                            {message.content}
                          </pre>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
