import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { api, type DataTablePayload } from "@llm-tg-bot/dashboard/api";

interface StoredMessage {
  role: string;
  content: string;
  compressedAt?: number;
}

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

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
  const [compressingChatKey, setCompressingChatKey] = useState<string | null>(
    null,
  );
  const [compressNotice, setCompressNotice] = useState<string | null>(null);

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

  const compressChat = async (chatKey: string, messageCount: number) => {
    if (messageCount === 0) return;
    if (
      !confirm(
        `Compress ${messageCount} message${messageCount === 1 ? "" : "s"} for chat ${chatKey} into one summary? This replaces the stored transcript.`,
      )
    ) {
      return;
    }

    setCompressingChatKey(chatKey);
    setCompressNotice(null);
    setError(null);
    try {
      const result = await api.compressHistory(chatKey);
      if (result.skipped) {
        setCompressNotice(
          result.reason === "empty"
            ? "Nothing to compress for that chat."
            : "Compression was skipped.",
        );
      } else if (result.ok) {
        setCompressNotice(
          `Compressed ${result.messageCount ?? messageCount} message${
            (result.messageCount ?? messageCount) === 1 ? "" : "s"
          } for chat ${chatKey}.`,
        );
        await load(true);
      }
    } catch (err) {
      setError(err);
    } finally {
      setCompressingChatKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-2xl font-bold tracking-tight">
            Chat history
          </h1>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Stored transcripts per Telegram chat. Limits are derived from context
            window settings on the Settings page. Use Compress to summarize a chat
            into one narrative row (same as automatic overflow compression).
          </p>
        </div>
      </header>

      {error ? <ErrorBanner error={error} /> : null}
      {compressNotice ? (
        <p className="mt-1.5 text-xs text-muted">{compressNotice}</p>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="min-w-0 flex-1 basis-56"
            placeholder="Search chat key or message text…"
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
              {filteredRows.length} of {payload.total} chats
              {payload.truncated ? " (list truncated)" : ""}
            </p>

            {filteredRows.length === 0 ? (
              <p className="text-muted">No chats match your search.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredRows.map((row) => {
                  const chatKey = String(row.chatKey ?? "—");
                  const messages = parseMessages(row.messages);
                  const isCompressing = compressingChatKey === chatKey;

                  return (
                    <article
                      key={chatKey}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-3.5 py-2.5">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <code className="font-mono text-[0.88em]">
                            {chatKey}
                          </code>
                          <span className="ml-0.5 text-xs font-normal text-muted">
                            {messages.length} message
                            {messages.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <div className="flex flex-wrap gap-3 text-xs text-muted">
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
                          <button
                            type="button"
                            className={secondaryBtn}
                            disabled={
                              messages.length === 0 ||
                              isCompressing ||
                              compressingChatKey != null
                            }
                            onClick={() => void compressChat(chatKey, messages.length)}
                          >
                            {isCompressing ? "Compressing…" : "Compress"}
                          </button>
                        </div>
                      </header>

                      {messages.length === 0 ? (
                        <p className="m-0 px-3.5 py-3 text-muted">
                          No messages stored.
                        </p>
                      ) : (
                        <ol className="m-0 list-none p-0">
                          {messages.map((message, index) => (
                            <li
                              key={`${chatKey}-${index}`}
                              className="border-b border-border px-3.5 py-3 last:border-b-0"
                            >
                              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-mono text-xs text-accent">
                                  {message.role}
                                </span>
                                {message.compressedAt ? (
                                  <time
                                    className="text-xs text-muted"
                                    dateTime={new Date(
                                      message.compressedAt * 1000,
                                    ).toISOString()}
                                  >
                                    compressed {formatUnixTime(message.compressedAt)}
                                  </time>
                                ) : null}
                              </div>
                              <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-snug">
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
