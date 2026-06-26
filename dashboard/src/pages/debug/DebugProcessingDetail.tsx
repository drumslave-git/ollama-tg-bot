import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, type MessageProcessingDetail } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveDebug } from "../../liveSocket";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, LoadingState } from "../../components/ui/Layout";
import { decodeRouteEntityId, parseRouteProcessingId } from "./debugPaths";
import {
  formatDuration,
  formatTime,
  liveDurationMs,
  statusClass,
  useLiveClock,
} from "./debugUtils";
import {
  downloadProcessingLog,
  EntryRow,
} from "./DebugProcessingEntries";

const metaGridClass =
  "m-0 mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-3";

const fieldLabelClass =
  "mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted";

export function DebugProcessingDetail() {
  const { entityId: entityIdParam, processingId: processingIdParam } =
    useParams();
  const entityId = decodeRouteEntityId(entityIdParam);
  const processingId = parseRouteProcessingId(processingIdParam);
  const { apiOnline } = useDashboard();
  const [detail, setDetail] = useState<MessageProcessingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline || processingId == null) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getDebugProcessing(processingId);
        if (entityId && data.processing.entityId !== entityId) {
          setError(new Error("Processing does not belong to this chat."));
          setDetail(null);
          return;
        }
        setDetail(data.processing);
      } catch (err) {
        setError(err);
        setDetail(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, entityId, processingId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveDebug(
    useCallback(
      (event) => {
        if (!apiOnline || processingId == null) return;
        if (event.processingId !== processingId) return;
        void load(true);
      },
      [apiOnline, processingId, load],
    ),
    apiOnline === true,
  );

  const isProcessing = detail?.status === "processing";
  const now = useLiveClock(isProcessing);
  const duration = detail
    ? liveDurationMs(detail.createdAt, detail.totalTimeSpent, detail.status, now)
    : null;

  if (!entityId || processingId == null) {
    return <Navigate to="/debug" replace />;
  }

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading && detail ? (
        <>
          <div className="mb-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => downloadProcessingLog(detail)}
            >
              Download log
            </Button>
          </div>

          <Card>
            <div className="mb-3 flex flex-col gap-2">
              <Badge variant={statusClass(detail.status)}>{detail.status}</Badge>
              <h3 className="m-0 break-words text-lg font-semibold">
                {detail.messagePreview || "(non-text message)"}
              </h3>
            </div>
            <dl className={metaGridClass}>
              <div>
                <dt className={fieldLabelClass}>When</dt>
                <dd className="m-0 text-sm">{formatTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className={fieldLabelClass}>Total time</dt>
                <dd className="m-0 text-sm">{formatDuration(duration)}</dd>
              </div>
              <div>
                <dt className={fieldLabelClass}>Chat</dt>
                <dd className="m-0 text-sm">{detail.entityId}</dd>
              </div>
              {detail.messageId != null ? (
                <div>
                  <dt className={fieldLabelClass}>Telegram msg</dt>
                  <dd className="m-0 text-sm">{detail.messageId}</dd>
                </div>
              ) : null}
              {detail.userLabel ? (
                <div>
                  <dt className={fieldLabelClass}>User</dt>
                  <dd className="m-0 text-sm">{detail.userLabel}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <h3 className="m-0 mb-4 text-base font-semibold text-text">
              Entries
            </h3>
            {detail.entries.length === 0 ? (
              <p className="m-0 text-muted">No entries recorded.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}

      {!loading && !detail && error == null ? (
        <p className="m-0 text-muted">Processing not found.</p>
      ) : null}
    </>
  );
}
