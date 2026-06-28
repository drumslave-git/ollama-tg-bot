import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type JobRunListItem } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveData } from "../../liveSocket";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/cn";
import {
  formatDuration,
  formatTime,
  liveDurationMs,
  statusClass,
  useLiveClock,
} from "./debugUtils";

const itemClass = (live: boolean) =>
  cn(
    "flex w-full flex-col gap-1.5 rounded-[10px] border bg-surface-hover p-3.5 text-left text-inherit no-underline hover:border-accent hover:bg-accent/6",
    live
      ? "border-warning/45 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-warning)_20%,transparent)]"
      : "border-border",
  );

/** Shared list of background-job runs (memory/vision) backed by job_processings. */
export function JobRunList({
  moduleId,
  runPath,
}: {
  moduleId: string;
  runPath: (id: number) => string;
}) {
  const { apiOnline } = useDashboard();
  const [runs, setRuns] = useState<JobRunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        setRuns((await api.getDebugJobRuns(moduleId)).runs);
      } catch (err) {
        setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, moduleId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (event.tableIds && !event.tableIds.includes("job_processings")) {
          return;
        }
        void load(true);
      },
      [load],
    ),
    apiOnline === true,
  );

  const now = useLiveClock(runs.some((r) => r.status === "processing"));

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <p className="py-16 text-center text-muted">Loading…</p> : null}

      {!loading ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-5 text-[1.1rem] font-semibold">Job runs</h3>
          {runs.length === 0 ? (
            <p className="text-muted">
              No job runs recorded yet. Activity appears after the debounced
              queue drains.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map((item) => {
                const isLive = item.status === "processing";
                const duration = liveDurationMs(
                  item.createdAt,
                  item.totalTimeSpent,
                  item.status,
                  now,
                );
                return (
                  <Link
                    key={item.id}
                    to={runPath(item.id)}
                    className={itemClass(isLive)}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge
                        variant={statusClass(item.status)}
                        className={cn(isLive && "animate-debug-live-pulse")}
                      >
                        {item.status}
                      </Badge>
                      <span className="text-muted">#{item.id}</span>
                      <span className="text-[0.82rem] tabular-nums text-muted">
                        {formatTime(item.createdAt)}
                      </span>
                      <span className="text-xs text-muted">
                        {item.entryCount} entries
                      </span>
                      <span className="ml-auto text-[0.82rem] tabular-nums text-muted">
                        {formatDuration(duration)}
                      </span>
                    </div>
                    <p className="m-0 break-words text-sm leading-snug text-text">
                      {item.summary || "(no summary)"}
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
