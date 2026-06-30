import { useCallback, useEffect, useState } from "react";
import {
  api,
  type TaskDebugGroup,
  type TaskFireDetail,
  type TaskFireListItem,
} from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { EntryRow } from "@llm-tg-bot/dashboard/pages/debug/DebugProcessingEntries";

const itemBtn =
  "flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left text-inherit hover:border-accent hover:bg-accent/6";

function statusColor(status: string): string {
  if (status === "processed") return "text-accent";
  if (status === "error") return "text-danger";
  if (status === "processing") return "text-warning";
  return "text-muted";
}

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function TaskFiresDebug() {
  const { apiOnline } = useDashboard();
  const online = apiOnline === true;
  const [groups, setGroups] = useState<TaskDebugGroup[]>([]);
  const [task, setTask] = useState<TaskDebugGroup | null>(null);
  const [fires, setFires] = useState<TaskFireListItem[]>([]);
  const [fire, setFire] = useState<TaskFireDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const loadGroups = useCallback(async () => {
    if (!online) return;
    try {
      setGroups((await api.getDebugTaskGroups()).tasks);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [online]);

  const loadFires = useCallback(
    async (taskId: number) => {
      try {
        setFires((await api.getDebugTaskFires(taskId)).fires);
      } catch (err) {
        setError(err);
      }
    },
    [],
  );

  const loadFire = useCallback(async (id: number) => {
    try {
      setFire((await api.getDebugTaskFire(id)).fire);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useLiveData(
    useCallback(
      (event) => {
        if (event.tableIds && !event.tableIds.includes("task_processings")) {
          return;
        }
        void loadGroups();
        if (fire) void loadFire(fire.id);
        else if (task) void loadFires(task.taskId);
      },
      [loadGroups, loadFire, loadFires, fire, task],
    ),
    online,
  );

  if (!online) return null;

  // ----- Fire detail (entries) -----
  if (fire) {
    return (
      <section className="flex flex-col gap-3">
        <button
          type="button"
          className="self-start text-sm text-accent hover:underline"
          onClick={() => setFire(null)}
        >
          ← Back to fires
        </button>
        <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`font-semibold uppercase ${statusColor(fire.status)}`}>
              {fire.status}
            </span>
            <span className="text-muted">{fmtTime(fire.createdAt)}</span>
            <span className="text-muted">{fmtDuration(fire.totalTimeSpent)}</span>
          </div>
          {fire.taskInstruction ? (
            <p className="m-0 text-sm text-muted">{fire.taskInstruction}</p>
          ) : null}
          <p className="m-0 text-sm font-semibold">{fire.summary || "(no output)"}</p>
        </div>
        <div className="flex flex-col gap-2">
          {fire.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      </section>
    );
  }

  // ----- Fire list for a task -----
  if (task) {
    return (
      <section className="flex flex-col gap-3">
        <button
          type="button"
          className="self-start text-sm text-accent hover:underline"
          onClick={() => setTask(null)}
        >
          ← Back to tasks
        </button>
        <h3 className="m-0 text-base font-semibold">{task.label}</h3>
        {fires.length === 0 ? (
          <p className="text-xs text-muted">No fires recorded.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {fires.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className={itemBtn}
                  onClick={() => void loadFire(f.id)}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`font-semibold uppercase ${statusColor(f.status)}`}>
                      {f.status}
                    </span>
                    <span className="text-muted">{fmtTime(f.createdAt)}</span>
                    <span className="text-muted">{f.entryCount} entries</span>
                    <span className="ml-auto text-muted">
                      {fmtDuration(f.totalTimeSpent)}
                    </span>
                  </div>
                  <p className="m-0 text-sm">{f.summary || "(no output)"}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // ----- Task groups -----
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="m-0 text-base font-semibold">Task fire traces</h3>
        <p className="m-0 text-sm text-muted">
          Per-fire processing entries (prompt assembly, LLM request/response,
          reply parsing, delivery). Grouped by task, last {20} fires each. Updates
          live.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-muted">
          No task fires recorded yet. They appear when scheduled tasks run.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {groups.map((g) => (
            <li key={g.taskId}>
              <button
                type="button"
                className={itemBtn}
                onClick={() => {
                  setTask(g);
                  void loadFires(g.taskId);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{g.label}</strong>
                  <span className="text-xs text-muted">{fmtTime(g.latestAt)}</span>
                </div>
                <span className="text-xs text-muted">
                  {g.fireCount} fire{g.fireCount === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error != null ? (
        <p className="text-xs text-danger">Failed to load task traces.</p>
      ) : null}
    </section>
  );
}
