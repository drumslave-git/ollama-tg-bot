import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, type MessageReportDetail } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveDebug } from "../../liveSocket";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, LoadingState } from "../../components/ui/Layout";
import {
  decodeRouteChatId,
  parseRouteMessageId,
} from "./debugPaths";
import { formatDuration, formatTime, liveDurationMs, useLiveClock } from "./debugUtils";
import {
  downloadReportLog,
  PhaseRow,
  statusClass,
} from "./DebugReportParts";

const metaGridClass =
  "m-0 mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-3";

const fieldsGridClass =
  "m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-4 gap-y-3";

const fieldLabelClass =
  "mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted";

export function DebugMessageDetail() {
  const { chatId: chatIdParam, messageId: messageIdParam } = useParams();
  const chatId = decodeRouteChatId(chatIdParam);
  const messageId = parseRouteMessageId(messageIdParam);
  const { apiOnline } = useDashboard();
  const [detail, setDetail] = useState<MessageReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline || messageId == null) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getDebugTrace(messageId);
        if (chatId && data.trace.chatId !== chatId) {
          setError(new Error("Report does not belong to this chat."));
          setDetail(null);
          return;
        }
        setDetail(data.trace);
      } catch (err) {
        setError(err);
        setDetail(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, chatId, messageId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveDebug(
    useCallback(
      (event) => {
        if (!apiOnline || messageId == null || event.traceId !== messageId) {
          return;
        }
        if (event.trace) {
          if (chatId && event.trace.chatId !== chatId) return;
          setDetail(event.trace);
        } else {
          void load(true);
        }
      },
      [apiOnline, chatId, messageId, load],
    ),
    apiOnline === true,
  );

  const report = detail?.report;
  const isProcessing = detail?.status === "processing";
  const now = useLiveClock(isProcessing);
  const reportDuration =
    detail && report
      ? liveDurationMs(detail.createdAt, report.durationMs, report.status, now)
      : null;

  if (!chatId || messageId == null) {
    return <Navigate to="/debug" replace />;
  }

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading && detail && report ? (
        <>
          <div className="mb-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => downloadReportLog(detail)}>
              Download log
            </Button>
          </div>

          <Card>
            <div className="mb-3 flex flex-col gap-2">
              <Badge variant={statusClass(report.status)}>{report.status}</Badge>
              <h3 className="m-0 text-lg font-semibold">{report.headline}</h3>
            </div>
            <p className="m-0 break-words text-base leading-snug text-text">
              {report.intake.messagePreview}
            </p>
            <dl className={metaGridClass}>
              <div>
                <dt className={fieldLabelClass}>When</dt>
                <dd className="m-0 text-sm">{formatTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className={fieldLabelClass}>Duration</dt>
                <dd className="m-0 text-sm">{formatDuration(reportDuration)}</dd>
              </div>
              <div>
                <dt className={fieldLabelClass}>Chat</dt>
                <dd className="m-0 text-sm">
                  {detail.chatType} · {detail.chatId}
                </dd>
              </div>
              {detail.messageId != null ? (
                <div>
                  <dt className={fieldLabelClass}>Telegram msg</dt>
                  <dd className="m-0 text-sm">{detail.messageId}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <h3 className="m-0 mb-4 text-base font-semibold text-text">Routing</h3>
            {report.routing.decision === "pending" ? (
              <dl className={fieldsGridClass}>
                <div>
                  <dt className={fieldLabelClass}>Decision</dt>
                  <dd className="m-0 text-sm">Evaluating</dd>
                </div>
                <div>
                  <dt className={fieldLabelClass}>Status</dt>
                  <dd className="m-0 text-sm">{report.routing.pendingLabel}</dd>
                </div>
              </dl>
            ) : report.routing.decision === "queued" ? (
              <dl className={fieldsGridClass}>
                <div>
                  <dt className={fieldLabelClass}>Decision</dt>
                  <dd className="m-0 text-sm">Queued</dd>
                </div>
                <div>
                  <dt className={fieldLabelClass}>Position</dt>
                  <dd className="m-0 text-sm">{report.routing.position}</dd>
                </div>
                <div>
                  <dt className={fieldLabelClass}>Status</dt>
                  <dd className="m-0 text-sm">{report.routing.queueLabel}</dd>
                </div>
              </dl>
            ) : report.routing.decision === "ignored" ? (
              <dl className={fieldsGridClass}>
                <div>
                  <dt className={fieldLabelClass}>Decision</dt>
                  <dd className="m-0 text-sm">Ignored</dd>
                </div>
                <div>
                  <dt className={fieldLabelClass}>Reason</dt>
                  <dd className="m-0 text-sm">{report.routing.ignoreLabel}</dd>
                </div>
                {report.routing.addressSource ? (
                  <div>
                    <dt className={fieldLabelClass}>Address check</dt>
                    <dd className="m-0 text-sm">{report.routing.addressSource}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <dl className={fieldsGridClass}>
                <div>
                  <dt className={fieldLabelClass}>Decision</dt>
                  <dd className="m-0 text-sm">Accepted</dd>
                </div>
                <div>
                  <dt className={fieldLabelClass}>Trigger</dt>
                  <dd className="m-0 text-sm">{report.routing.triggerLabel}</dd>
                </div>
                {report.routing.addressSource ? (
                  <div>
                    <dt className={fieldLabelClass}>Address match</dt>
                    <dd className="m-0 text-sm">{report.routing.addressSource}</dd>
                  </div>
                ) : null}
              </dl>
            )}
            {report.intake.hasMedia ? (
              <p className="m-0 mt-3 text-sm text-muted">
                Media attached
                {report.intake.mediaKind ? `: ${report.intake.mediaKind}` : ""}
              </p>
            ) : null}
          </Card>

          {report.result.replyChars != null ||
          report.result.sticker ||
          report.result.error ? (
            <Card>
              <h3 className="m-0 mb-4 text-base font-semibold text-text">Result</h3>
              <dl className={fieldsGridClass}>
                {report.result.replyChars != null ? (
                  <div>
                    <dt className={fieldLabelClass}>Reply length</dt>
                    <dd className="m-0 text-sm">{report.result.replyChars} chars</dd>
                  </div>
                ) : null}
                {report.result.chunks != null ? (
                  <div>
                    <dt className={fieldLabelClass}>Chunks sent</dt>
                    <dd className="m-0 text-sm">{report.result.chunks}</dd>
                  </div>
                ) : null}
                {report.result.sticker ? (
                  <div>
                    <dt className={fieldLabelClass}>Sticker</dt>
                    <dd className="m-0 text-sm">{report.result.sticker}</dd>
                  </div>
                ) : null}
                {report.result.error ? (
                  <div>
                    <dt className={fieldLabelClass}>Error</dt>
                    <dd className="m-0 text-sm">{report.result.error}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}

          <Card>
            <h3 className="m-0 mb-4 text-base font-semibold text-text">Pipeline</h3>
            {report.phases.length === 0 ? (
              <p className="m-0 text-muted">No pipeline steps recorded.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {report.phases.map((phase) => (
                  <PhaseRow key={phase.id} phase={phase} />
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}

      {!loading && !detail && error == null ? (
        <p className="m-0 text-muted">Report not found.</p>
      ) : null}
    </>
  );
}
