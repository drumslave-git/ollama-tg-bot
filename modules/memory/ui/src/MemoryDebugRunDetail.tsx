import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, type MemoryJobRunDetail } from "@llm-tg-bot/dashboard/api";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveStats } from "@llm-tg-bot/dashboard/liveSocket";
import {
  formatCountdown,
  formatDuration,
  formatTime,
  liveDurationMs,
  useLiveClock,
} from "@llm-tg-bot/dashboard/pages/debug/debugUtils";
import {
  PhaseRow,
  statusClass,
} from "@llm-tg-bot/dashboard/pages/debug/DebugReportParts";
import { parseMemoryDebugRunId } from "./debugPaths";

export function MemoryDebugRunDetail() {
  const { runId: runIdParam } = useParams();
  const runId = parseMemoryDebugRunId(runIdParam);
  const { apiOnline } = useDashboard();
  const [detail, setDetail] = useState<MemoryJobRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline || runId == null) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getMemoryJobRun(runId);
        setDetail(data.run);
      } catch (err) {
        setError(err);
        setDetail(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, runId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveStats(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const report = detail?.report;
  const isRunning = detail?.status === "running";
  const isScheduled = detail?.status === "scheduled";
  const now = useLiveClock(isRunning || isScheduled);
  const reportDuration =
    detail && report
      ? liveDurationMs(
          detail.createdAt,
          report.durationMs,
          isRunning ? "processing" : detail.status,
          now,
        )
      : null;
  const countdown =
    isScheduled && detail?.runAt
      ? formatCountdown(detail.runAt, now)
      : null;

  if (runId == null) {
    return <Navigate to="/modules/memory/debug" replace />;
  }

  const outcomeStatus =
    detail?.status === "completed"
      ? "processed"
      : detail?.status === "failed"
        ? "error"
        : detail?.status === "running"
          ? "processing"
          : detail?.status === "scheduled"
            ? "processing"
            : "ignored";

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <p className="loading">Loading…</p> : null}

      {!loading && detail && report ? (
        <>
          <section
            className={`card report-outcome report-outcome-${outcomeStatus}`}
          >
            <div className="report-outcome-head">
              <span className={`badge ${statusClass(outcomeStatus)}`}>
                {detail.status}
              </span>
              <h3>{report.headline}</h3>
            </div>
            {isScheduled && countdown ? (
              <p className="report-preview report-preview-large">
                Runs in <strong>{countdown}</strong>
              </p>
            ) : null}
            <dl className="report-meta">
              <div>
                <dt>When</dt>
                <dd>{formatTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(reportDuration)}</dd>
              </div>
              <div>
                <dt>Chats scanned</dt>
                <dd>{report.chatsScanned}</dd>
              </div>
              <div>
                <dt>Processed</dt>
                <dd>{report.chatsProcessed}</dd>
              </div>
              <div>
                <dt>Skipped</dt>
                <dd>{report.chatsSkipped}</dd>
              </div>
              {detail.runAt ? (
                <div>
                  <dt>Scheduled for</dt>
                  <dd>{formatTime(detail.runAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {(report.error || report.interrupted) && (
            <section className="card">
              <h3>Result</h3>
              <dl className="report-fields">
                {report.interrupted ? (
                  <div>
                    <dt>Interrupted</dt>
                    <dd>Queue activity resumed before completion</dd>
                  </div>
                ) : null}
                {report.error ? (
                  <div>
                    <dt>Error</dt>
                    <dd>{report.error}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          )}

          <section className="card">
            <h3>Pipeline</h3>
            {report.phases.length === 0 ? (
              <p className="muted">No pipeline steps recorded.</p>
            ) : (
              <div className="report-phase-list">
                {report.phases.map((phase) => (
                  <PhaseRow key={phase.id} phase={phase} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {!loading && !detail && error == null ? (
        <p className="muted">Run not found.</p>
      ) : null}
    </>
  );
}
