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

function badgeClass(status: string): string {
  const base =
    "rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold";
  if (status === "ok") return `${base} border-accent/35 text-accent`;
  if (status === "warn") return `${base} border-warning/35 text-warning`;
  if (status === "danger") return `${base} border-danger/35 text-danger`;
  return `${base} text-muted`;
}

const messageItemClass = (live: boolean) =>
  `flex w-full flex-col gap-1.5 rounded-[10px] border bg-surface-hover p-3.5 text-left text-inherit no-underline hover:border-accent hover:bg-accent/[0.06] ${
    live
      ? "border-warning/45 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-warning)_20%,transparent)]"
      : "border-border"
  }`;

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
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="mb-3 flex flex-col gap-2">
            <span className={badgeClass("warn")}>scheduled</span>
            <h3 className="m-0 text-[1.1rem] font-semibold">
              Memory extraction scheduled
            </h3>
          </div>
          <p className="m-0 text-base leading-snug">
            Job runs in <strong>{countdown}</strong>
            {runAt ? ` (${formatTime(runAt)})` : ""}
          </p>
        </section>
      ) : null}

      {loading ? (
        <p className="py-16 text-center text-muted">Loading…</p>
      ) : null}

      {!loading ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-5 text-[1.1rem] font-semibold">Job runs</h3>
          {runs.length === 0 ? (
            <p className="text-muted">
              No memory job runs yet. Activity appears after debounced queue
              drains.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
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
                const isLive = item.status === "running";
                return (
                  <Link
                    key={item.id}
                    to={memoryDebugRunPath(item.id)}
                    className={messageItemClass(isLive)}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`${badgeClass(statusClass(status))}${isLive ? " animate-debug-live-pulse" : ""}`}
                      >
                        {item.status}
                      </span>
                      <span className="text-muted">#{item.id}</span>
                      <span className="text-[0.82rem] tabular-nums text-muted">
                        {formatTime(item.createdAt)}
                      </span>
                      <span className="ml-auto text-[0.82rem] tabular-nums text-muted">
                        {item.status === "scheduled" && item.runAt
                          ? formatCountdown(item.runAt, now) ?? "—"
                          : formatDuration(duration)}
                      </span>
                    </div>
                    <p className="m-0 text-[0.95rem] font-semibold">
                      {item.headline}
                    </p>
                    <p className="m-0 break-words text-sm leading-snug text-muted">
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
