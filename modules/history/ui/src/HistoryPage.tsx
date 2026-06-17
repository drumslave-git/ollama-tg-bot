import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { api, type DataTablePayload } from "@llm-tg-bot/dashboard/api";

interface StoredMessagePreview {
  role: string;
  content: string;
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseMessages(raw: unknown): StoredMessagePreview[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is StoredMessagePreview =>
          m != null &&
          typeof m === "object" &&
          typeof (m as StoredMessagePreview).role === "string" &&
          typeof (m as StoredMessagePreview).content === "string",
      )
      .slice(-5);
  } catch {
    return [];
  }
}

function messagePreview(raw: unknown): string {
  const messages = parseMessages(raw);
  if (messages.length === 0) return "—";
  const last = messages[messages.length - 1];
  const text = last.content.replace(/\s+/g, " ").trim();
  const clipped = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  return `[${last.role}] ${clipped}`;
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
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Chat key</th>
                    <th>Updated</th>
                    <th>Compressed</th>
                    <th>Latest message</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={String(row.chatKey)}>
                      <td>
                        <code>{String(row.chatKey ?? "—")}</code>
                      </td>
                      <td>{formatTime(row.updatedAt)}</td>
                      <td>{formatTime(row.compressedAt)}</td>
                      <td className="long-cell">{messagePreview(row.messages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
