import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type VisionJobDebugSnapshot,
  type VisionJobRunListItem,
} from "@llm-tg-bot/dashboard/api";
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
import { statusClass } from "@llm-tg-bot/dashboard/pages/debug/DebugReportParts";
import { visionDebugRunPath } from "./debugPaths";

function runListFromSnapshot(
  snapshot: VisionJobDebugSnapshot,
): VisionJobRunListItem[] {
  const current = snapshot.currentRun
    ? [
        {
          id: snapshot.currentRun.id,
          status: snapshot.currentRun.status,
          headline: snapshot.currentRun.report.headline,
          createdAt: snapshot.currentRun.createdAt,
          runAt: snapshot.currentRun.runAt,
          durationMs:
            snapshot.currentRun.finishedAt != null
              ? snapshot.currentRun.report.durationMs
              : null,
          mediaBackfilled: snapshot.currentRun.report.mediaBackfilled,
          mediaFailed: snapshot.currentRun.report.mediaFailed,
        },
      ]
    : [];
  const recent = snapshot.recentRuns.filter(
    (run) => run.id !== snapshot.currentRun?.id,
  );
  return [...current, ...recent].sort((a, b) => b.id - a.id);
}

export function VisionDebugRunList() {
  const { apiOnline, stats } = useDashboard();
  const [snapshot, setSnapshot] = useState<VisionJobDebugSnapshot | null>(null);
  const [runs, setRuns] = useState<VisionJobRunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getVisionJobDebug();
        setSnapshot(data);
        setRuns(runListFromSnapshot(data));
      } catch (err) {
        setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveStats(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const scheduled =
    snapshot?.status === "scheduled" || stats?.visionJobStatus === "scheduled";
  const runAt = snapshot?.scheduledRunAt ?? stats?.visionJobRunAt ?? null;
  const now = useLiveClock(scheduled || runs.some((r) => r.status === "running"));
  const countdown = scheduled ? formatCountdown(runAt, now) : null;

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {snapshot && snapshot.pendingMediaRows > 0 ? (
        <section className="card report-outcome report-outcome-processing">
          <div className="report-outcome-head">
            <span className="badge warn">pending</span>
            <h3>Base64 media awaiting backfill</h3>
          </div>
          <p className="report-preview report-preview-large">
            {snapshot.pendingMediaRows} row
            {snapshot.pendingMediaRows === 1 ? "" : "s"} across{" "}
            {snapshot.chatsWithPending} chat
            {snapshot.chatsWithPending === 1 ? "" : "s"}
          </p>
        </section>
      ) : null}

      {scheduled && countdown ? (
        <section className="card report-outcome report-outcome-processing">
          <div className="report-outcome-head">
            <span className="badge warn">scheduled</span>
            <h3>Vision backfill scheduled</h3>
          </div>
          <p className="report-preview report-preview-large">
            Job runs in <strong>{countdown}</strong>
            {runAt ? ` (${formatTime(runAt)})` : ""}
          </p>
        </section>
      ) : null}

      {loading ? <p className="loading">Loading…</p> : null}

      {!loading ? (
        <section className="card">
          <h3>Job runs</h3>
          {runs.length === 0 ? (
            <p className="muted">
              No vision backfill runs yet. Activity appears after debounced queue
              drains.
            </p>
          ) : (
            <div className="report-message-list">
              {runs.map((item) => {
                const duration = liveDurationMs(
                  item.createdAt,
                  item.durationMs,
                  item.status === "running" ? "processing" : item.status,
                  now,
                );
                const status =
                  item.status === "running"
                    ? "processing"
                    : item.status === "completed"
                      ? "processed"
                      : item.status === "failed"
                        ? "error"
                        : item.status;
                return (
                  <Link
                    key={item.id}
                    to={visionDebugRunPath(item.id)}
                    className={`report-message-item${item.status === "running" ? " report-message-item-live" : ""}`}
                  >
                    <div className="report-message-top">
                      <span className={`badge ${statusClass(status)}`}>
                        {item.status}
                      </span>
                      <span className="muted">#{item.id}</span>
                      <span className="report-message-time">
                        {formatTime(item.createdAt)}
                      </span>
                      <span className="report-message-duration">
                        {item.status === "scheduled" && item.runAt
                          ? formatCountdown(item.runAt, now) ?? "—"
                          : formatDuration(duration)}
                      </span>
                    </div>
                    <p className="report-headline">{item.headline}</p>
                    <p className="report-preview">
                      {item.mediaBackfilled} backfilled
                      {item.mediaFailed > 0 ? ` · ${item.mediaFailed} failed` : ""}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
