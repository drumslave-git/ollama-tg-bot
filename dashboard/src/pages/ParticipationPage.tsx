import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ParticipationChat } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/ui/Button";
import { Card, Hint, Page, PageHeader } from "../components/ui/Layout";
import { useDashboard } from "../context/DashboardContext";
import { cn } from "../lib/cn";
import { useLiveData } from "../liveSocket";

function typeLabel(type: string): string {
  switch (type) {
    case "private":
      return "Private";
    case "group":
      return "Group";
    case "supergroup":
      return "Supergroup";
    case "channel":
      return "Channel";
    default:
      return type || "Unknown";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function detailLine(chat: ParticipationChat): string {
  const details: string[] = [];
  if (chat.title) details.push(chat.title);
  if (chat.firstName || chat.lastName) {
    details.push([chat.firstName, chat.lastName].filter(Boolean).join(" "));
  }
  if (chat.username) details.push(`@${chat.username}`);
  return [...new Set(details.filter(Boolean))].join(" / ");
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ParticipationPage() {
  const { apiOnline } = useDashboard();
  const [chats, setChats] = useState<ParticipationChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await api.getParticipationChats();
        setChats(payload.chats);
      } catch (err) {
        setError(err);
        setChats([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (
          !event.tableIds?.length ||
          event.tableIds.includes("known_chats") ||
          event.tableIds.includes("chat_messages")
        ) {
          void load(true);
        }
      },
      [load],
    ),
    apiOnline === true,
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter((chat) =>
      [
        chat.chatId,
        chat.type,
        chat.label,
        chat.title,
        chat.username,
        chat.firstName,
        chat.lastName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [chats, query]);

  const privateCount = chats.filter((chat) => chat.type === "private").length;
  const groupCount = chats.filter((chat) => chat.type !== "private").length;

  return (
    <Page>
      <PageHeader
        title="Participation"
        description="Chats where the bot has recently been seen, based on Telegram updates received by this server."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-2xl font-semibold text-text">{chats.length}</div>
          <Hint>Total chats</Hint>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold text-text">{privateCount}</div>
          <Hint>Private chats</Hint>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold text-text">{groupCount}</div>
          <Hint>Groups and channels</Hint>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-semibold text-text">
              Active chats
            </h3>
            <Hint className="mt-1">
              {query.trim()
                ? `${plural(filtered.length, "match")} of ${plural(
                    chats.length,
                    "chat",
                  )}`
                : plural(chats.length, "chat")}
            </Hint>
          </div>
          <label className="mb-0 min-w-0 flex-[1_1_16rem] sm:max-w-xs">
            <span className="sr-only">Search participation</span>
            <input
              type="search"
              className="py-2"
              placeholder="Search by id, name, username..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {loading && chats.length === 0 ? <Hint>Loading chats...</Hint> : null}

        {!loading && chats.length === 0 && !error ? (
          <Hint>No chats have been observed yet.</Hint>
        ) : null}

        {chats.length > 0 && filtered.length === 0 ? (
          <Hint>No chats match the current search.</Hint>
        ) : null}

        {filtered.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-[0.84rem]">
              <thead>
                <tr>
                  <th className="border-b border-border bg-surface px-3 py-2 text-left font-semibold whitespace-nowrap">
                    Type
                  </th>
                  <th className="border-b border-border bg-surface px-3 py-2 text-left font-semibold">
                    Name
                  </th>
                  <th className="border-b border-border bg-surface px-3 py-2 text-left font-semibold whitespace-nowrap">
                    Chat ID
                  </th>
                  <th className="border-b border-border bg-surface px-3 py-2 text-right font-semibold whitespace-nowrap">
                    Messages
                  </th>
                  <th className="border-b border-border bg-surface px-3 py-2 text-left font-semibold whitespace-nowrap">
                    Last message
                  </th>
                  <th className="border-b border-border bg-surface px-3 py-2 text-left font-semibold whitespace-nowrap">
                    Last seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((chat) => (
                  <tr
                    key={chat.chatId}
                    className="hover:bg-accent/6 last:[&_td]:border-b-0"
                  >
                    <td className="border-b border-border px-3 py-2 align-top whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          chat.type === "private"
                            ? "border-accent/40 bg-accent/10 text-accent"
                            : "border-muted/30 bg-surface-2 text-muted",
                        )}
                      >
                        {typeLabel(chat.type)}
                      </span>
                    </td>
                    <td className="min-w-56 border-b border-border px-3 py-2 align-top">
                      <div className="font-medium text-text">{chat.label}</div>
                      {detailLine(chat) ? (
                        <div className="mt-0.5 text-xs text-muted">
                          {detailLine(chat)}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-top font-mono whitespace-nowrap text-muted">
                      {chat.chatId}
                    </td>
                    <td className="border-b border-border px-3 py-2 text-right align-top tabular-nums">
                      {chat.messageCount}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-top whitespace-nowrap text-muted">
                      {formatDate(chat.lastMessageAt)}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-top whitespace-nowrap text-muted">
                      {formatDate(chat.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </Page>
  );
}
