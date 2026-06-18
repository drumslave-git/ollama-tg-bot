import type {
  ModuleJobDebugSnapshot,
  ModuleJobRun,
  ModuleJobStep,
} from "@llm-tg-bot/dashboard/api";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusClass(status: string): string {
  if (status === "running" || status === "scheduled") return "ok";
  if (status === "failed") return "error";
  if (status === "cancelled") return "warn";
  return "";
}

function RunSteps({ steps }: { steps: ModuleJobStep[] }) {
  if (steps.length === 0) {
    return <p className="muted">No steps recorded.</p>;
  }
  return (
    <ol className="module-job-steps">
      {steps.map((step, index) => (
        <li key={`${step.at}-${index}`}>
          <div className="module-job-step-head">
            <span className="mono">{formatTime(step.at)}</span>
            <strong>{step.label}</strong>
          </div>
          {step.detail && Object.keys(step.detail).length > 0 ? (
            <pre className="debug-json">{JSON.stringify(step.detail, null, 2)}</pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function RunCard({ run }: { run: ModuleJobRun }) {
  return (
    <article className={`module-job-run ${statusClass(run.status)}`}>
      <header className="module-job-run-head">
        <strong>
          Run #{run.id} · {run.status}
        </strong>
        <span className="muted">
          {formatTime(run.startedAt ?? run.scheduledAt)} →{" "}
          {formatTime(run.finishedAt)}
        </span>
      </header>
      {run.error ? <p className="field-error">{run.error}</p> : null}
      <RunSteps steps={run.steps} />
    </article>
  );
}

export interface ModuleJobDebugPanelProps {
  title: string;
  snapshot: ModuleJobDebugSnapshot | null;
  loading?: boolean;
  error?: string | null;
  extraSummary?: Array<{ label: string; value: string | number }>;
}

export function ModuleJobDebugPanel({
  title,
  snapshot,
  loading = false,
  error = null,
  extraSummary = [],
}: ModuleJobDebugPanelProps) {
  if (loading) {
    return (
      <section className="card">
        <h3>{title}</h3>
        <p className="muted">Loading job debug…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card">
        <h3>{title}</h3>
        <p className="field-error">{error}</p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="card">
        <h3>{title}</h3>
        <p className="muted">No debug data.</p>
      </section>
    );
  }

  const runs = [
    ...(snapshot.currentRun ? [snapshot.currentRun] : []),
    ...snapshot.recentRuns.filter(
      (run) => run.id !== snapshot.currentRun?.id,
    ),
  ];

  return (
    <section className="card module-job-debug">
      <h3>{title}</h3>
      <div className="module-job-summary">
        <span className={`badge ${statusClass(snapshot.status)}`}>
          Status: {snapshot.status}
        </span>
        {extraSummary.map((item) => (
          <span className="badge" key={item.label}>
            {item.label}: {item.value}
          </span>
        ))}
        <span className="muted">Updated {formatTime(snapshot.lastUpdatedAt)}</span>
      </div>
      {runs.length === 0 ? (
        <p className="hint">No background job runs recorded yet.</p>
      ) : (
        <div className="module-job-runs">{runs.map((run) => (
          <RunCard key={run.id} run={run} />
        ))}</div>
      )}
    </section>
  );
}
