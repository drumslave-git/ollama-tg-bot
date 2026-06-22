import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { api, type DataTablePayload } from "@llm-tg-bot/dashboard/api";

const TABLE_ID = "chat_messages";

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

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toMessageRow(row: Record<string, unknown>): MessageRow | null {
  const id = Number(row.id);
  const entityId = String(row.entityId ?? "");
  const role = typeof row.role === "string" ? row.role : "";
  const content = typeof row.content === "string" ? row.content : "";
  if (!Number.isFinite(id) || !entityId || !role) return null;
  return {
    id,
    entityId,
    role,
    content,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
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
      </header>

      {error ? <ErrorBanner error={error} /> : null}

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
                      <span className="text-xs text-muted">
                        Last{" "}
                        <time dateTime={group.lastAt}>
                          {formatTime(group.lastAt)}
                        </time>
                      </span>
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
