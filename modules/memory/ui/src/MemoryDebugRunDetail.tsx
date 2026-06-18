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

function badgeClass(status: string): string {
  const base =
    "rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold";
  if (status === "ok") return `${base} border-accent/35 text-accent`;
  if (status === "warn") return `${base} border-warning/35 text-warning`;
  if (status === "danger") return `${base} border-danger/35 text-danger`;
  return `${base} text-muted`;
}

const metaGrid =
  "mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-3";
const metaDt =
  "mb-0.5 text-[0.72rem] font-semibold uppercase tracking-wide text-muted";
const metaDd = "m-0 text-[0.92rem]";
const fieldsGrid =
  "m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-4 gap-y-3";

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

      {loading ? (
        <p className="py-16 text-center text-muted">Loading…</p>
      ) : null}

      {!loading && detail && report ? (
        <>
          <section className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-3 flex flex-col gap-2">
              <span className={badgeClass(statusClass(outcomeStatus))}>
                {detail.status}
              </span>
              <h3 className="m-0 text-[1.1rem] font-semibold">
                {report.headline}
              </h3>
            </div>
            {isScheduled && countdown ? (
              <p className="m-0 text-base leading-snug">
                Runs in <strong>{countdown}</strong>
              </p>
            ) : null}
            <dl className={metaGrid}>
              <div>
                <dt className={metaDt}>When</dt>
                <dd className={metaDd}>{formatTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className={metaDt}>Duration</dt>
                <dd className={metaDd}>{formatDuration(reportDuration)}</dd>
              </div>
              <div>
                <dt className={metaDt}>Chats scanned</dt>
                <dd className={metaDd}>{report.chatsScanned}</dd>
              </div>
              <div>
                <dt className={metaDt}>Processed</dt>
                <dd className={metaDd}>{report.chatsProcessed}</dd>
              </div>
              <div>
                <dt className={metaDt}>Skipped</dt>
                <dd className={metaDd}>{report.chatsSkipped}</dd>
              </div>
              {detail.runAt ? (
                <div>
                  <dt className={metaDt}>Scheduled for</dt>
                  <dd className={metaDd}>{formatTime(detail.runAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {(report.error || report.interrupted) && (
            <section className="rounded-lg border border-border bg-surface p-6">
              <h3 className="mb-5 text-[1.1rem] font-semibold">Result</h3>
              <dl className={fieldsGrid}>
                {report.interrupted ? (
                  <div>
                    <dt className={metaDt}>Interrupted</dt>
                    <dd className={metaDd}>
                      Queue activity resumed before completion
                    </dd>
                  </div>
                ) : null}
                {report.error ? (
                  <div>
                    <dt className={metaDt}>Error</dt>
                    <dd className={metaDd}>{report.error}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          )}

          <section className="rounded-lg border border-border bg-surface p-6">
            <h3 className="mb-5 text-[1.1rem] font-semibold">Pipeline</h3>
            {report.phases.length === 0 ? (
              <p className="text-muted">No pipeline steps recorded.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {report.phases.map((phase) => (
                  <PhaseRow key={phase.id} phase={phase} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {!loading && !detail && error == null ? (
        <p className="text-muted">Run not found.</p>
      ) : null}
    </>
  );
}
