import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, type DebugChatSummary, type MessageReportListItem } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveDebug } from "../../liveSocket";
import { Badge } from "../../components/ui/Badge";
import { Card, LoadingState } from "../../components/ui/Layout";
import { cn } from "../../lib/cn";
import { debugMessagePath, decodeRouteChatId } from "./debugPaths";
import { formatDuration, formatTime, liveDurationMs, statusClass, upsertListItem, useLiveClock } from "./debugUtils";

const messageItemClass =
  "flex w-full flex-col gap-1.5 rounded-[10px] border border-border bg-surface-hover p-3.5 px-4 text-left text-inherit no-underline hover:border-accent hover:bg-accent/6";

export function DebugChatMessages() {
  const { chatId: chatIdParam } = useParams();
  const chatId = decodeRouteChatId(chatIdParam);
  const { apiOnline } = useDashboard();
  const [chat, setChat] = useState<DebugChatSummary | null>(null);
  const [messages, setMessages] = useState<MessageReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline || !chatId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [chatsRes, tracesRes] = await Promise.all([
          api.getDebugChats(),
          api.getDebugTraces(chatId),
        ]);
        const summary =
          chatsRes.chats.find((entry) => entry.chatId === chatId) ?? null;
        setChat(summary);
        setMessages(tracesRes.traces);
      } catch (err) {
        setError(err);
        setChat(null);
        setMessages([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, chatId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveDebug(
    useCallback(
      (event) => {
        if (!apiOnline || !chatId || event.chatId !== chatId) return;
        if (event.listItem) {
          setMessages((prev) => upsertListItem(prev, event.listItem!));
        } else {
          void load(true);
        }
      },
      [apiOnline, chatId, load],
    ),
    apiOnline === true,
  );

  const hasProcessing = messages.some((item) => item.status === "processing");
  const now = useLiveClock(hasProcessing);

  if (!chatId) {
    return <Navigate to="/debug" replace />;
  }

  const title = chat?.label ?? `Chat ${chatId}`;

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading ? (
        <Card>
          <h3 className="m-0 mb-4 text-base font-semibold text-text">{title}</h3>
          {messages.length === 0 ? (
            <p className="m-0 text-muted">No reports for this chat.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {messages.map((item) => {
                const duration = liveDurationMs(
                  item.createdAt,
                  item.durationMs,
                  item.status,
                  now,
                );
                const isLive = item.status === "processing";
                return (
                  <Link
                    key={item.id}
                    to={debugMessagePath(chatId, item.id)}
                    className={cn(
                      messageItemClass,
                      isLive &&
                        "border-warning/45 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-warning)_20%,transparent)]",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge
                        variant={statusClass(item.status)}
                        className={cn(isLive && "animate-debug-live-pulse")}
                      >
                        {item.status}
                      </Badge>
                      <span className="text-muted">#{item.id}</span>
                      <span className="text-sm tabular-nums text-muted">
                        {formatTime(item.createdAt)}
                      </span>
                      <span className="ml-auto text-sm tabular-nums text-muted">
                        {formatDuration(duration)}
                      </span>
                    </div>
                    <p className="m-0 text-[0.95rem] font-semibold">
                      {item.headline}
                    </p>
                    <p className="m-0 break-words text-sm leading-snug text-muted">
                      {item.messagePreview}
                    </p>
                    {item.userLabel ? (
                      <span className="self-start rounded-full bg-slate-400/15 px-1.5 py-0.5 text-xs text-muted">
                        {item.userLabel}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
