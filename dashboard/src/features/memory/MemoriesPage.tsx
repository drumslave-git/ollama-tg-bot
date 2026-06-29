import { useCallback, useEffect, useState } from "react";
import {
  api,
  type MemoryEntry,
  type MemoryRecord,
  type MemoryScope,
} from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveMemory } from "@llm-tg-bot/dashboard/liveSocket";
import { ButtonLink } from "@llm-tg-bot/dashboard/components/ui/Button";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-danger/40 bg-surface-hover px-4 py-2.5 text-sm font-semibold text-danger transition-opacity hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50";

function scopeLabel(r: { type: string; entityId: string | null }): string {
  if (r.type === "general") return "general";
  return `${r.type} ${r.entityId ?? "?"}`;
}

export function MemoriesPage() {
  const { apiOnline } = useDashboard();
  const online = apiOnline === true;

  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Pending-entry editing + creation state.
  const [entryEditingId, setEntryEditingId] = useState<number | null>(null);
  const [entryEditText, setEntryEditText] = useState("");
  const [newType, setNewType] = useState<MemoryScope>("user");
  const [newEntityId, setNewEntityId] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!online) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [recs, ents] = await Promise.all([
          api.getMemoryRecords(),
          api.getMemoryEntries(),
        ]);
        setRecords(recs.records);
        setEntries(ents.entries);
      } catch (err) {
        setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [online],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => void load(true), [load]);
  // The server emits one scope per change; subscribe to both.
  useLiveMemory("user", reload, online);
  useLiveMemory("general", reload, online);

  const startEdit = (r: MemoryRecord) => {
    setEditingId(r.id);
    setEditText(r.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };
  const saveEdit = async (id: number) => {
    const trimmed = editText.trim();
    if (trimmed.length < 2) return;
    setSavingId(id);
    try {
      const { record } = await api.updateMemoryRecord(id, trimmed);
      setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
      cancelEdit();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  };
  const removeRecord = async (id: number) => {
    if (!confirm("Delete this consolidated memory record?")) return;
    setBusyId(id);
    try {
      await api.deleteMemoryRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  };
  const removeEntry = async (id: number) => {
    setBusyId(id);
    try {
      await api.deleteMemoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  };
  const startEditEntry = (e: MemoryEntry) => {
    setEntryEditingId(e.id);
    setEntryEditText(e.content);
  };
  const cancelEditEntry = () => {
    setEntryEditingId(null);
    setEntryEditText("");
  };
  const saveEntry = async (id: number) => {
    const trimmed = entryEditText.trim();
    if (trimmed.length < 2) return;
    setSavingId(id);
    try {
      const { entry } = await api.updateMemoryEntry(id, trimmed);
      setEntries((prev) => prev.map((e) => (e.id === id ? entry : e)));
      cancelEditEntry();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  };
  const createEntry = async () => {
    const content = newContent.trim();
    const entityId = newType === "general" ? null : newEntityId.trim() || null;
    if (content.length < 2) return;
    if (newType === "user" && !entityId) return;
    setCreating(true);
    try {
      const { entry } = await api.createMemoryEntry(newType, entityId, content);
      setEntries((prev) => [entry, ...prev]);
      setNewContent("");
      setNewEntityId("");
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Memory</h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Consolidated long-term memory records (one per user, plus general),
            and raw notes awaiting the daily consolidation job. Scheduling is
            configured under Settings.
          </p>
        </div>
        <ButtonLink variant="secondary" to="/memory/debug">
          Job debug
        </ButtonLink>
      </header>

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {!online ? (
        <p className="text-xs text-muted">API must be online to view memory.</p>
      ) : null}

      {loading && records.length === 0 && entries.length === 0 ? (
        <p className="text-xs text-muted">Loading memory…</p>
      ) : null}

      {/* Consolidated records */}
      <section className="flex flex-col gap-3">
        <h3 className="text-[1.1rem] font-semibold">
          Consolidated records{" "}
          <span className="text-xs font-normal text-muted">
            ({records.length})
          </span>
        </h3>
        {records.length === 0 && !loading ? (
          <p className="text-xs text-muted">No consolidated records yet.</p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {records.map((r) => {
            const isEditing = editingId === r.id;
            return (
              <li
                key={r.id}
                className="overflow-hidden rounded-lg border border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-3.5 py-2.5">
                  <code className="font-mono text-[0.88em]">{scopeLabel(r)}</code>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className={primaryBtn}
                          disabled={savingId === r.id || editText.trim().length < 2}
                          onClick={() => void saveEdit(r.id)}
                        >
                          {savingId === r.id ? "…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className={secondaryBtn}
                          disabled={savingId === r.id}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={secondaryBtn}
                          disabled={busyId === r.id}
                          onClick={() => startEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={dangerBtn}
                          disabled={busyId === r.id}
                          onClick={() => void removeRecord(r.id)}
                        >
                          {busyId === r.id ? "…" : "Remove"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="px-3.5 py-3">
                  {isEditing ? (
                    <textarea
                      className="min-h-24 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
                      rows={8}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                  ) : (
                    <p className="m-0 whitespace-pre-wrap break-words leading-snug">
                      {r.content}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pending raw entries — full CRUD */}
      <section className="flex flex-col gap-3">
        <h3 className="text-[1.1rem] font-semibold">
          Pending notes{" "}
          <span className="text-xs font-normal text-muted">
            ({entries.length})
          </span>
        </h3>
        <p className="m-0 text-xs text-muted">
          Raw notes awaiting the next daily consolidation. Add one here to feed
          memory directly.
        </p>

        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            void createEntry();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>Scope</span>
            <select
              className="rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
              value={newType}
              onChange={(ev) => setNewType(ev.target.value as MemoryScope)}
              disabled={!online || creating}
            >
              <option value="user">user</option>
              <option value="general">general</option>
            </select>
          </label>
          {newType === "user" ? (
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>User ID</span>
              <input
                type="text"
                className="w-36 rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
                value={newEntityId}
                onChange={(ev) => setNewEntityId(ev.target.value)}
                placeholder="Telegram user ID"
                disabled={!online || creating}
              />
            </label>
          ) : null}
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
            <span>Note</span>
            <textarea
              className="min-h-10 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
              rows={2}
              value={newContent}
              onChange={(ev) => setNewContent(ev.target.value)}
              placeholder="A durable fact to remember…"
              disabled={!online || creating}
            />
          </label>
          <button
            type="submit"
            className={primaryBtn}
            disabled={
              !online ||
              creating ||
              newContent.trim().length < 2 ||
              (newType === "user" && !newEntityId.trim())
            }
          >
            {creating ? "…" : "Add note"}
          </button>
        </form>

        {entries.length === 0 && !loading ? (
          <p className="text-xs text-muted">No pending notes.</p>
        ) : null}
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border p-0">
          {entries.map((e) => {
            const isEditing = entryEditingId === e.id;
            return (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-[0.82em] text-muted">
                    {scopeLabel(e)}
                  </code>
                  {isEditing ? (
                    <textarea
                      className="mt-1 min-h-10 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
                      rows={3}
                      value={entryEditText}
                      onChange={(ev) => setEntryEditText(ev.target.value)}
                    />
                  ) : (
                    <p className="mb-0 mt-1 break-words leading-snug">
                      {e.content}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className={primaryBtn}
                        disabled={
                          savingId === e.id || entryEditText.trim().length < 2
                        }
                        onClick={() => void saveEntry(e.id)}
                      >
                        {savingId === e.id ? "…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={secondaryBtn}
                        disabled={savingId === e.id}
                        onClick={cancelEditEntry}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={secondaryBtn}
                        disabled={busyId === e.id}
                        onClick={() => startEditEntry(e)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={dangerBtn}
                        disabled={busyId === e.id}
                        onClick={() => void removeEntry(e.id)}
                      >
                        {busyId === e.id ? "…" : "Remove"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
