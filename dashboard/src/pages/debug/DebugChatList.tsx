import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DebugChatSummary } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveDebug } from "../../liveSocket";
import { Card, LoadingState } from "../../components/ui/Layout";
import { debugChatPath } from "./debugPaths";
import { formatTime, patchChatSummaries } from "./debugUtils";

const chatItemClass =
  "flex w-full cursor-pointer flex-row items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-hover p-3.5 px-4 text-left text-inherit no-underline hover:border-accent hover:bg-accent/6";

export function DebugChatList() {
  const { apiOnline } = useDashboard();
  const [chats, setChats] = useState<DebugChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadChats = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getDebugChats();
        setChats(Array.isArray(data.chats) ? data.chats : []);
      } catch (err) {
        setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline],
  );

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useLiveDebug(
    useCallback(
      (event) => {
        if (!apiOnline) return;
        if (event.listItem) {
          setChats((prev) => patchChatSummaries(prev, event));
        }
        void loadChats(true);
      },
      [apiOnline, loadChats],
    ),
    apiOnline === true,
  );

  return (
    <>
      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void loadChats()}
        />
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading ? (
        <Card>
          <h3 className="m-0 mb-4 text-base font-semibold text-text">Chats</h3>
          {chats.length === 0 ? (
            <p className="m-0 text-muted">
              No reports yet. Send messages to the bot to populate this view.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {chats.map((chat) => (
                <Link
                  key={chat.chatId}
                  to={debugChatPath(chat.chatId)}
                  className={chatItemClass}
                >
                  <div>
                    <strong className="block">{chat.label}</strong>
                    <span className="text-muted">
                      {chat.chatType === "private" ? "Private" : "Group"} ·{" "}
                      {chat.traceCount} reports
                    </span>
                  </div>
                  <span className="text-sm text-muted">
                    {chat.latestAt ? formatTime(chat.latestAt) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
