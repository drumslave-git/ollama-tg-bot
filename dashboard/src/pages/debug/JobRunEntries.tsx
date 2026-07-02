import { useCallback, useEffect, useState } from "react";
import { api, type JobRunDetail } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useDashboard } from "../../context/DashboardContext";
import { useLiveData } from "../../liveSocket";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  formatDuration,
  formatTime,
  formatTokens,
  liveDurationMs,
  statusClass,
  useLiveClock,
} from "./debugUtils";
import { downloadJobRunLog, EntryRow } from "./DebugProcessingEntries";

/** Shared detail view for one background-job run: header + ordered entries. */
export function JobRunEntries({ runId }: { runId: number | null }) {
  const { apiOnline } = useDashboard();
  const [detail, setDetail] = useState<JobRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline || runId == null) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        setDetail((await api.getDebugJobRun(runId)).run);
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

  const isProcessing = detail?.status === "processing";
  const now = useLiveClock(isProcessing);
  const duration = detail
    ? liveDurationMs(detail.createdAt, detail.totalTimeSpent, detail.status, now)
    : null;

  return (
    <>
      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {loading ? <p className="py-16 text-center text-muted">Loading…</p> : null}

      {!loading && detail ? (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => downloadJobRunLog(detail)}
            >
              Download log
            </Button>
          </div>

          <section className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <Badge variant={statusClass(detail.status)}>{detail.status}</Badge>
              <span className="text-muted">#{detail.id}</span>
              <span className="text-[0.82rem] tabular-nums text-muted">
                {formatTime(detail.createdAt)}
              </span>
              <span className="ml-auto text-[0.82rem] tabular-nums text-muted">
                {formatDuration(duration)}
              </span>
            </div>
            <p className="m-0 text-[0.95rem] font-semibold">
              {detail.summary || "(no summary)"}
            </p>
            {formatTokens(detail.tokens) ? (
              <p className="m-0 mt-2 text-[0.82rem] tabular-nums text-muted">
                {formatTokens(detail.tokens)}
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-surface p-6">
            <h3 className="mb-4 text-[1.1rem] font-semibold">Entries</h3>
            {detail.entries.length === 0 ? (
              <p className="m-0 text-muted">No entries recorded.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {!loading && !detail && error == null ? (
        <p className="m-0 text-muted">Job run not found.</p>
      ) : null}
    </>
  );
}
