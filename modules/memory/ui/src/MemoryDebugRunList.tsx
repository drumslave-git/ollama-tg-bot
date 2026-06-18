import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type MemoryJobDebugSnapshot,
  type MemoryJobRunListItem,
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
import { memoryDebugRunPath } from "./debugPaths";

function runListFromSnapshot(snapshot: MemoryJobDebugSnapshot): MemoryJobRunListItem[] {
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
          chatsProcessed: snapshot.currentRun.report.chatsProcessed,
          chatsSkipped: snapshot.currentRun.report.chatsSkipped,
        },
      ]
    : [];
  const recent = snapshot.recentRuns.filter(
    (run) => run.id !== snapshot.currentRun?.id,
  );
  return [...current, ...recent].sort((a, b) => b.id - a.id);
}

export function MemoryDebugRunList() {
  const { apiOnline, stats } = useDashboard();
  const [snapshot, setSnapshot] = useState<MemoryJobDebugSnapshot | null>(null);
  const [runs, setRuns] = useState<MemoryJobRunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getMemoryJobDebug();
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
    snapshot?.status === "scheduled" || stats?.memoryJobStatus === "scheduled";
  const runAt = snapshot?.scheduledRunAt ?? stats?.memoryJobRunAt ?? null;
  const now = useLiveClock(scheduled || runs.some((r) => r.status === "running"));
  const countdown = scheduled ? formatCountdown(runAt, now) : null;

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {scheduled && countdown ? (
        <section className="card report-outcome report-outcome-processing">
          <div className="report-outcome-head">
            <span className="badge warn">scheduled</span>
            <h3>Memory extraction scheduled</h3>
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
              No memory job runs yet. Activity appears after debounced queue
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
                    to={memoryDebugRunPath(item.id)}
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
                      {item.chatsProcessed} processed
                      {item.chatsSkipped > 0
                        ? ` · ${item.chatsSkipped} skipped`
                        : ""}
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
