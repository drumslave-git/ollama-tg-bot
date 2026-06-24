import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TaskEvent, type TaskEventKind } from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";

const KIND_LABEL: Record<TaskEventKind, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Removed",
  fired: "Fired",
  fire_failed: "Fire failed",
};

const KIND_CLASS: Record<TaskEventKind, string> = {
  created: "border-border bg-surface-hover text-muted",
  updated: "border-border bg-surface-hover text-muted",
  deleted: "border-border bg-surface-hover text-muted",
  fired: "border-accent/40 bg-accent/10 text-text",
  fire_failed: "border-danger/40 bg-danger/10 text-danger",
};

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-3 py-1.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

interface SentMessage {
  messageId: number;
  text: string;
}

function parseSentMessages(value: unknown): SentMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item && typeof item === "object" && "messageId" in item) {
      const m = item as { messageId: unknown; text: unknown };
      return [{ messageId: Number(m.messageId), text: String(m.text ?? "") }];
    }
    return [];
  });
}

/** Detail key/value pairs excluding ones rendered with dedicated UI. */
function detailEntries(detail: Record<string, unknown> | null): [string, string][] {
  if (!detail) return [];
  return Object.entries(detail)
    .filter(([key]) => key !== "sentMessages")
    .map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]);
}

export function TasksDebugPage() {
  const { apiOnline } = useDashboard();
  const online = apiOnline === true;
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!online) return;
      if (!silent) setLoading(true);
      try {
        const { events: rows } = await api.getTaskEvents();
        setEvents(rows);
        setError(null);
      } catch (err) {
        setError(err);
        setEvents([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [online],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (!event.tableIds || event.tableIds.includes("task_events")) {
          void load(true);
        }
      },
      [load],
    ),
    online,
  );

  const clear = async () => {
    if (!confirm("Clear the task event log?")) return;
    try {
      await api.clearTaskEvents();
      setEvents([]);
      setError(null);
    } catch (err) {
      setError(err);
    }
  };

  if (!online) {
    return (
      <p className="text-xs text-muted">API must be online to view task events.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="m-0 mb-1 text-sm text-muted">
          <Link to="/tasks" className="text-accent no-underline hover:underline">
            Tasks
          </Link>
          <span aria-hidden="true"> / </span>
          <span>Event log</span>
        </p>
        <h2 className="m-0 text-2xl font-bold tracking-tight">Task event log</h2>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted">
          Most recent {events.length} task events (fires, creations, changes, removals).
          Newest first, capped at 50. Updates live.
        </p>
        <button
          type="button"
          className={secondaryBtn}
          disabled={events.length === 0}
          onClick={() => void clear()}
        >
          Clear log
        </button>
      </div>

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {loading && events.length === 0 ? (
        <p className="text-xs text-muted">Loading events…</p>
      ) : null}

      {!loading && events.length === 0 && error == null ? (
        <p className="text-xs text-muted">
          No task events yet. They appear when tasks are created, fire, or are removed.
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {events.map((event) => {
          const isOpen = expanded === event.id;
          const entries = detailEntries(event.detail);
          const sentMessages = parseSentMessages(event.detail?.sentMessages);
          return (
            <li
              key={event.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <button
                type="button"
                className="flex w-full cursor-pointer items-start justify-between gap-3 px-3.5 py-2.5 text-left"
                onClick={() => setExpanded(isOpen ? null : event.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-xs font-semibold ${KIND_CLASS[event.kind]}`}
                    >
                      {KIND_LABEL[event.kind]}
                    </span>
                    {event.taskId != null ? (
                      <span className="font-mono text-xs text-muted">
                        #{event.taskId}
                      </span>
                    ) : null}
                    {event.chatId != null ? (
                      <span className="font-mono text-xs text-muted">
                        chat {event.chatId}
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 break-words text-sm leading-snug">
                    {event.summary}
                  </p>
                </div>
                <time
                  className="shrink-0 text-xs text-muted"
                  dateTime={event.createdAt}
                >
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </button>

              {isOpen && (sentMessages.length > 0 || entries.length > 0) ? (
                <div className="flex flex-col gap-3 border-t border-border bg-bg px-3.5 py-2.5">
                  {sentMessages.length > 0 ? (
                    <div>
                      <p className="m-0 mb-1.5 text-xs font-semibold text-muted">
                        Sent {sentMessages.length === 1 ? "message" : "messages"} ·{" "}
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                        {sentMessages.map((msg) => (
                          <li
                            key={msg.messageId}
                            className="flex items-start gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5"
                          >
                            <span className="shrink-0 font-mono text-xs text-muted">
                              #{msg.messageId}
                            </span>
                            <span className="whitespace-pre-wrap break-words text-sm text-text">
                              {msg.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {entries.length > 0 ? (
                    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {entries.map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="font-mono text-muted">{key}</dt>
                          <dd className="m-0 whitespace-pre-wrap break-words text-text">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
