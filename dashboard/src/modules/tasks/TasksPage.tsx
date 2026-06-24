import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type Task,
  type TaskInputPayload,
  type TaskScheduleKind,
} from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-danger/40 bg-surface-hover px-4 py-2.5 text-sm font-semibold text-danger transition-opacity hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50";
const fieldInput =
  "rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text";
const fieldLabel = "flex flex-col gap-1.5 text-xs text-muted";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TaskDraft {
  chatId: string;
  instruction: string;
  scheduleKind: TaskScheduleKind;
  timeOfDay: string;
  weekdays: number[];
  runDate: string;
}

function emptyDraft(): TaskDraft {
  return {
    chatId: "",
    instruction: "",
    scheduleKind: "daily",
    timeOfDay: "09:00",
    weekdays: [1, 2, 3, 4, 5],
    runDate: "",
  };
}

function draftFromTask(task: Task): TaskDraft {
  return {
    chatId: String(task.chatId),
    instruction: task.instruction,
    scheduleKind: task.scheduleKind,
    timeOfDay: task.timeOfDay,
    weekdays: task.weekdays ?? [1, 2, 3, 4, 5],
    runDate: task.runDate ?? "",
  };
}

function describe(task: Task): string {
  const time = task.timeOfDay;
  if (task.scheduleKind === "daily") return `Every day at ${time}`;
  if (task.scheduleKind === "once") return `Once on ${task.runDate ?? "?"} at ${time}`;
  const days = (task.weekdays ?? []).map((d) => WEEKDAY_LABELS[d]).join(", ");
  return `Every ${days || "?"} at ${time}`;
}

/** Render the next-run instant in the task's own timezone (matches the label). */
function formatNextRun(task: Task): string {
  if (!task.nextRunAt) return "no upcoming run";
  const date = new Date(task.nextRunAt);
  try {
    return date.toLocaleString(undefined, { timeZone: task.timezone });
  } catch {
    return date.toLocaleString();
  }
}

function draftToPayload(draft: TaskDraft): TaskInputPayload {
  return {
    chatId: Number(draft.chatId),
    instruction: draft.instruction.trim(),
    scheduleKind: draft.scheduleKind,
    timeOfDay: draft.timeOfDay,
    weekdays: draft.scheduleKind === "weekly" ? draft.weekdays : undefined,
    runDate: draft.scheduleKind === "once" ? draft.runDate : null,
  };
}

function ScheduleFields({
  draft,
  setDraft,
}: {
  draft: TaskDraft;
  setDraft: (next: TaskDraft) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={fieldLabel}>
        <span>Repeat</span>
        <select
          className={fieldInput}
          value={draft.scheduleKind}
          onChange={(e) =>
            setDraft({ ...draft, scheduleKind: e.target.value as TaskScheduleKind })
          }
        >
          <option value="once">Once</option>
          <option value="daily">Every day</option>
          <option value="weekly">Weekdays</option>
        </select>
      </label>

      <label className={fieldLabel}>
        <span>Time (HH:MM)</span>
        <input
          type="time"
          className={fieldInput}
          value={draft.timeOfDay}
          onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })}
        />
      </label>

      {draft.scheduleKind === "once" ? (
        <label className={fieldLabel}>
          <span>Date</span>
          <input
            type="date"
            className={fieldInput}
            value={draft.runDate}
            onChange={(e) => setDraft({ ...draft, runDate: e.target.value })}
          />
        </label>
      ) : null}

      {draft.scheduleKind === "weekly" ? (
        <div className={fieldLabel}>
          <span>Days</span>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {WEEKDAYS.map((day) => {
              const active = draft.weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  className={`cursor-pointer rounded-sm border px-2 py-1 text-xs ${
                    active
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border bg-transparent text-muted hover:text-text"
                  }`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      weekdays: active
                        ? draft.weekdays.filter((d) => d !== day.value)
                        : [...draft.weekdays, day.value],
                    })
                  }
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TasksPage() {
  const { apiOnline } = useDashboard();
  const online = apiOnline === true;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft>(emptyDraft);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!online) return;
      if (!silent) setLoading(true);
      try {
        const { tasks: rows } = await api.getTasks();
        setTasks(rows);
        setError(null);
      } catch (err) {
        setError(err);
        setTasks([]);
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
        if (!event.tableIds || event.tableIds.includes("tasks")) void load(true);
      },
      [load],
    ),
    online,
  );

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => b.id - a.id),
    [tasks],
  );

  const createTask = async () => {
    if (!Number.isFinite(Number(draft.chatId)) || draft.instruction.trim().length < 2) {
      return;
    }
    setCreating(true);
    try {
      await api.createTask(draftToPayload(draft));
      setDraft(emptyDraft());
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditDraft(draftFromTask(task));
  };

  const saveEdit = async (id: number) => {
    setBusyId(id);
    try {
      const payload = draftToPayload(editDraft);
      await api.updateTask(id, {
        instruction: payload.instruction,
        scheduleKind: payload.scheduleKind,
        timeOfDay: payload.timeOfDay,
        weekdays: payload.weekdays ?? null,
        runDate: payload.runDate ?? null,
      });
      setEditingId(null);
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (task: Task) => {
    setBusyId(task.id);
    try {
      await api.updateTask(task.id, { enabled: !task.enabled });
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  };

  const removeTask = async (id: number) => {
    if (!confirm(`Delete task #${id}?`)) return;
    setBusyId(id);
    try {
      await api.deleteTask(id);
      if (editingId === id) setEditingId(null);
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  };

  if (!online) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Tasks</h2>
        <p className="mt-1.5 text-xs text-muted">
          API must be online to view scheduled tasks.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Tasks</h2>
        <p className="m-0 max-w-xl text-[0.92rem] text-muted">
          Scheduled jobs that post an in-character message into a chat at a set time.
          {tasks.length > 0 ? ` ${tasks.length} total.` : ""} Times use the server
          timezone. Updates live.
        </p>
      </header>

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <form
        className="rounded-lg border border-border bg-bg p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void createTask();
        }}
      >
        <p className="mb-2.5 mt-0 text-xs text-muted">
          Create a task for a chat. The bot rephrases the instruction in-character on
          each run.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className={fieldLabel}>
              <span>Chat ID</span>
              <input
                type="text"
                className={`${fieldInput} min-w-40`}
                value={draft.chatId}
                onChange={(e) => setDraft({ ...draft, chatId: e.target.value })}
                placeholder="Telegram chat ID"
              />
            </label>
            <label className={`${fieldLabel} min-w-48 flex-1`}>
              <span>Instruction</span>
              <input
                type="text"
                className={`${fieldInput} w-full`}
                value={draft.instruction}
                onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
                placeholder="e.g. ask the team if standup is happening"
              />
            </label>
          </div>
          <ScheduleFields draft={draft} setDraft={setDraft} />
          <div>
            <button
              type="submit"
              className={primaryBtn}
              disabled={
                creating ||
                draft.instruction.trim().length < 2 ||
                !draft.chatId.trim()
              }
            >
              {creating ? "…" : "Create task"}
            </button>
          </div>
        </div>
      </form>

      {loading && tasks.length === 0 ? (
        <p className="text-xs text-muted">Loading tasks…</p>
      ) : null}

      {!loading && tasks.length === 0 && error == null ? (
        <p className="text-xs text-muted">
          No tasks yet. Create one above, or ask the bot in chat (owner only).
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {sorted.map((task) => {
          const isEditing = editingId === task.id;
          return (
            <li
              key={task.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 break-words leading-snug">
                    <span className="mr-2 font-mono text-xs text-muted">
                      #{task.id}
                    </span>
                    {task.instruction}
                  </p>
                  <p className="text-xs text-muted">
                    {describe(task)} · <code className="font-mono">{task.timezone}</code> · chat{" "}
                    <code className="font-mono">{task.chatId}</code>
                    {task.enabled ? "" : " · disabled"} · next {formatNextRun(task)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={busyId === task.id}
                    onClick={() => void toggleEnabled(task)}
                  >
                    {task.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={busyId === task.id}
                    onClick={() => (isEditing ? setEditingId(null) : startEdit(task))}
                  >
                    {isEditing ? "Close" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className={dangerBtn}
                    disabled={busyId === task.id}
                    onClick={() => void removeTask(task.id)}
                  >
                    {busyId === task.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-3 border-t border-border bg-bg px-3.5 py-3">
                  <label className={fieldLabel}>
                    <span>Instruction</span>
                    <input
                      type="text"
                      className={`${fieldInput} w-full`}
                      value={editDraft.instruction}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, instruction: e.target.value })
                      }
                    />
                  </label>
                  <ScheduleFields draft={editDraft} setDraft={setEditDraft} />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={
                        busyId === task.id || editDraft.instruction.trim().length < 2
                      }
                      onClick={() => void saveEdit(task.id)}
                    >
                      {busyId === task.id ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className={secondaryBtn}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
