import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  api,
  type DebugChatSummary,
  type MessageProcessingListItem,
} from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveDebug } from "../../liveSocket";
import { Badge } from "../../components/ui/Badge";
import { Card, LoadingState } from "../../components/ui/Layout";
import { cn } from "../../lib/cn";
import { debugProcessingPath, decodeRouteEntityId } from "./debugPaths";
import {
  formatDuration,
  formatTime,
  liveDurationMs,
  statusClass,
  useLiveClock,
} from "./debugUtils";

const itemClass =
  "flex w-full flex-col gap-1.5 rounded-[10px] border border-border bg-surface-hover p-3.5 px-4 text-left text-inherit no-underline hover:border-accent hover:bg-accent/6";

export function DebugChatProcessings() {
  const { entityId: entityIdParam } = useParams();
  const entityId = decodeRouteEntityId(entityIdParam);
  const { apiOnline } = useDashboard();
  const [chat, setChat] = useState<DebugChatSummary | null>(null);
  const [processings, setProcessings] = useState<MessageProcessingListItem[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline || !entityId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [chatsRes, listRes] = await Promise.all([
          api.getDebugChats(),
          api.getDebugProcessings(entityId),
        ]);
        setChat(
          chatsRes.chats.find((entry) => entry.entityId === entityId) ?? null,
        );
        setProcessings(listRes.processings);
      } catch (err) {
        setError(err);
        setChat(null);
        setProcessings([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, entityId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveDebug(
    useCallback(
      (event) => {
        if (!apiOnline || !entityId || event.entityId !== entityId) return;
        void load(true);
      },
      [apiOnline, entityId, load],
    ),
    apiOnline === true,
  );

  const hasProcessing = processings.some(
    (item) => item.status === "processing",
  );
  const now = useLiveClock(hasProcessing);

  if (!entityId) {
    return <Navigate to="/debug" replace />;
  }

  const title = chat?.label ?? `Chat ${entityId}`;

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading ? (
        <Card>
          <h3 className="m-0 mb-4 text-base font-semibold text-text">{title}</h3>
          {processings.length === 0 ? (
            <p className="m-0 text-muted">No processings for this chat.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {processings.map((item) => {
                const duration = liveDurationMs(
                  item.createdAt,
                  item.totalTimeSpent,
                  item.status,
                  now,
                );
                const isLive = item.status === "processing";
                return (
                  <Link
                    key={item.id}
                    to={debugProcessingPath(entityId, item.id)}
                    className={cn(
                      itemClass,
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
                      {item.messageId != null ? (
                        <span className="text-muted">msg #{item.messageId}</span>
                      ) : null}
                      <span className="text-sm tabular-nums text-muted">
                        {formatTime(item.createdAt)}
                      </span>
                      <span className="text-xs text-muted">
                        {item.entryCount} entr{item.entryCount === 1 ? "y" : "ies"}
                      </span>
                      <span className="ml-auto text-sm tabular-nums text-muted">
                        {formatDuration(duration)}
                      </span>
                    </div>
                    <p className="m-0 break-words text-sm leading-snug text-text">
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
