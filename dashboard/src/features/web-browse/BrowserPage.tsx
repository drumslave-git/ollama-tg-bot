import { useCallback, useEffect, useState } from "react";
import {
  api,
  type BrowserAgentProcessingDetail,
  type BrowserAgentRun,
  type BrowserAgentRunStatus,
} from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import {
  EntryRow,
  downloadBrowserRunLog,
} from "@llm-tg-bot/dashboard/pages/debug/DebugProcessingEntries";

const STATUS_CLASS: Record<BrowserAgentRunStatus, string> = {
  queued: "border-border bg-surface-hover text-muted",
  running: "border-accent/40 bg-accent/10 text-accent",
  completed: "border-accent/40 bg-accent/10 text-text",
  failed: "border-danger/40 bg-danger/10 text-danger",
};

function LiveStatusCard() {
  const { stats } = useDashboard();
  const running = stats?.browserAgentStatus === "running";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            running ? "bg-accent" : "bg-muted/40"
          }`}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">
          Agent {running ? "running" : "idle"}
        </span>
        {stats?.browserAgentQueued ? (
          <span className="text-xs text-muted">
            · {stats.browserAgentQueued} queued
          </span>
        ) : null}
      </div>
      {running ? (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">Goal</dt>
          <dd className="m-0 break-words text-text">
            {stats?.browserAgentGoal ?? "—"}
          </dd>
          <dt className="text-muted">Step</dt>
          <dd className="m-0 text-text">{stats?.browserAgentStep ?? 0}</dd>
          <dt className="text-muted">Action</dt>
          <dd className="m-0 break-words text-text">
            {stats?.browserAgentAction ?? "—"}
          </dd>
          <dt className="text-muted">URL</dt>
          <dd className="m-0 break-all text-text">
            {stats?.browserAgentUrl ?? "—"}
          </dd>
          {stats?.browserAgentDownload ? (
            <>
              <dt className="text-muted">Download</dt>
              <dd className="m-0 break-words font-mono text-text">
                {stats.browserAgentDownload}
              </dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="m-0 text-xs text-muted">
          No browsing run is active. Runs start when the owner asks the bot to
          research something online.
        </p>
      )}
    </div>
  );
}

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-3 py-1.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function RunDetail({ run }: { run: BrowserAgentRun }) {
  const [processing, setProcessing] =
    useState<BrowserAgentProcessingDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { processing: proc } = await api.getBrowserRun(run.id);
        setProcessing(proc);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [run.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (
          !event.tableIds ||
          event.tableIds.includes("browser_agent_processing_entries") ||
          event.tableIds.includes("browser_agent_processings")
        ) {
          void load(true);
        }
      },
      [load],
    ),
    true,
  );

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-bg px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {processing ? `${processing.entries.length} entries` : "…"}
        </span>
        <button
          type="button"
          className={secondaryBtn}
          disabled={!processing}
          onClick={() => downloadBrowserRunLog(run, processing)}
        >
          Download log
        </button>
      </div>
      {loading && !processing ? (
        <p className="px-1 py-1 text-xs text-muted">Loading steps…</p>
      ) : !processing || processing.entries.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted">No steps recorded yet.</p>
      ) : (
        processing.entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))
      )}
    </div>
  );
}

export function BrowserPage() {
  const { apiOnline } = useDashboard();
  const online = apiOnline === true;
  const [runs, setRuns] = useState<BrowserAgentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!online) return;
      if (!silent) setLoading(true);
      try {
        const { runs: rows } = await api.getBrowserRuns();
        setRuns(rows);
        setError(null);
      } catch (err) {
        setError(err);
        setRuns([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [online],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    useCallback(
      (event) => {
        if (!event.tableIds || event.tableIds.includes("browser_agent_runs")) {
          void load(true);
        }
      },
      [load],
    ),
    online,
  );

  if (!online) {
    return (
      <p className="text-xs text-muted">
        API must be online to view browsing runs.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="m-0 text-2xl font-bold tracking-tight">Web browsing agent</h2>
        <p className="m-0 mt-1 text-sm text-muted">
          Background runs the agent has performed. Click a run to see every step
          and screenshot. Updates live.
        </p>
      </header>

      <LiveStatusCard />

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {loading && runs.length === 0 ? (
        <p className="text-xs text-muted">Loading runs…</p>
      ) : null}

      {!loading && runs.length === 0 && error == null ? (
        <p className="text-xs text-muted">
          No browsing runs yet. They appear when the owner asks the bot to
          research something online.
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {runs.map((run) => {
          const isOpen = expanded === run.id;
          return (
            <li
              key={run.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <button
                type="button"
                className="flex w-full cursor-pointer items-start justify-between gap-3 px-3.5 py-2.5 text-left"
                onClick={() => setExpanded(isOpen ? null : run.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[run.status]}`}
                    >
                      {run.status}
                    </span>
                    <span className="font-mono text-xs text-muted">#{run.id}</span>
                    <span className="font-mono text-xs text-muted">
                      {run.stepCount} step{run.stepCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="m-0 break-words text-sm font-medium leading-snug">
                    {run.goal}
                  </p>
                  {run.result ? (
                    <p className="m-0 mt-1 break-words text-xs text-muted">
                      {run.result}
                    </p>
                  ) : null}
                </div>
                <time
                  className="shrink-0 text-xs text-muted"
                  dateTime={run.createdAt}
                >
                  {new Date(run.createdAt).toLocaleString()}
                </time>
              </button>
              {isOpen ? <RunDetail run={run} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
