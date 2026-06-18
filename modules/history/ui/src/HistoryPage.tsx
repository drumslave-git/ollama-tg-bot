import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { api, type DataTablePayload } from "@llm-tg-bot/dashboard/api";

interface StoredMessage {
  role: string;
  content: string;
  compressedAt?: number;
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatUnixTime(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function parseMessages(raw: unknown): StoredMessage[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredMessage =>
        m != null &&
        typeof m === "object" &&
        typeof (m as StoredMessage).role === "string" &&
        typeof (m as StoredMessage).content === "string",
    );
  } catch {
    return [];
  }
}

export function HistoryPage() {
  const [payload, setPayload] = useState<DataTablePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setPayload(await api.getDataTable("chat_history"));
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
        if (event.tableIds?.includes("chat_history")) void load(true);
      },
      [load],
    ),
  );

  const filteredRows = useMemo(() => {
    if (!payload) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return payload.rows;
    return payload.rows.filter((row) => {
      const chatKey = String(row.chatKey ?? "").toLowerCase();
      const messages = String(row.messages ?? "").toLowerCase();
      return chatKey.includes(query) || messages.includes(query);
    });
  }, [payload, searchQuery]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Chat history</h1>
        <p className="page-lead">
          Stored transcripts per Telegram chat. Limits are derived from context
          window settings on the Settings page.
        </p>
      </header>

      {error ? <ErrorBanner error={error} /> : null}

      <section className="card">
        <div className="toolbar">
          <input
            type="search"
            className="input"
            placeholder="Search chat key or message text…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading && !payload ? (
          <p className="muted">Loading…</p>
        ) : !payload ? (
          <p className="muted">No history data.</p>
        ) : (
          <>
            <p className="muted">
              {filteredRows.length} of {payload.total} chats
              {payload.truncated ? " (list truncated)" : ""}
            </p>

            {filteredRows.length === 0 ? (
              <p className="muted">No chats match your search.</p>
            ) : (
              <div className="history-groups">
                {filteredRows.map((row) => {
                  const chatKey = String(row.chatKey ?? "—");
                  const messages = parseMessages(row.messages);

                  return (
                    <article key={chatKey} className="history-group">
                      <header className="history-group-head">
                        <div className="history-group-meta">
                          <code className="history-chat-key">{chatKey}</code>
                          <span className="label-meta">
                            {messages.length} message
                            {messages.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="history-group-times">
                          <span>
                            Updated{" "}
                            <time dateTime={String(row.updatedAt ?? "")}>
                              {formatTime(row.updatedAt)}
                            </time>
                          </span>
                          {row.compressedAt ? (
                            <span>
                              Compressed{" "}
                              <time dateTime={String(row.compressedAt ?? "")}>
                                {formatTime(row.compressedAt)}
                              </time>
                            </span>
                          ) : null}
                        </div>
                      </header>

                      {messages.length === 0 ? (
                        <p className="history-empty muted">No messages stored.</p>
                      ) : (
                        <ol className="history-message-list">
                          {messages.map((message, index) => (
                            <li
                              key={`${chatKey}-${index}`}
                              className="history-message"
                            >
                              <div className="history-message-head">
                                <span className="history-message-role">
                                  {message.role}
                                </span>
                                {message.compressedAt ? (
                                  <time
                                    className="history-message-time"
                                    dateTime={new Date(
                                      message.compressedAt * 1000,
                                    ).toISOString()}
                                  >
                                    compressed {formatUnixTime(message.compressedAt)}
                                  </time>
                                ) : null}
                              </div>
                              <pre className="history-message-content">
                                {message.content}
                              </pre>
                            </li>
                          ))}
                        </ol>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
