import { useCallback, useEffect, useState } from "react";
import { api, type GeneralMemoryFact } from "@llm-tg-bot/dashboard/api";
import { useLiveMemory } from "@llm-tg-bot/dashboard/liveSocket";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";

interface GeneralMemoriesPanelProps {
  apiOnline: boolean;
  embedded?: boolean;
}

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-danger/40 bg-surface-hover px-4 py-2.5 text-sm font-semibold text-danger transition-opacity hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50";
const sectionShell = (embedded: boolean) =>
  embedded ? "flex flex-col gap-4" : "rounded-lg border border-border bg-surface p-6";
const pageDesc = "m-0 max-w-xl text-[0.92rem] text-muted";

export function GeneralMemoriesPanel({
  apiOnline,
  embedded = false,
}: GeneralMemoriesPanelProps) {
  const [facts, setFacts] = useState<GeneralMemoryFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [addFactText, setAddFactText] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getGeneralMemories();
        setFacts(data.facts);
      } catch (err) {
        setError(err);
        setFacts([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveMemory(
    "general",
    useCallback(() => {
      void load(true);
    }, [load]),
    apiOnline,
  );

  const upsertFact = (record: GeneralMemoryFact) => {
    setFacts((prev) => {
      const idx = prev.findIndex((f) => f.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [...prev, record].sort((a, b) => a.id - b.id);
    });
  };

  const startEdit = (id: number, fact: string) => {
    setEditingId(id);
    setEditText(fact);
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
      const { fact } = await api.updateGeneralMemory(id, trimmed);
      upsertFact(fact);
      cancelEdit();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  };

  const addFact = async () => {
    const trimmed = addFactText.trim();
    if (trimmed.length < 2) return;

    setSavingId("new");
    try {
      const { fact } = await api.createGeneralMemory(trimmed);
      upsertFact(fact);
      setAddFactText("");
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  };

  const removeFact = async (id: number) => {
    setDeletingId(id);
    try {
      await api.deleteGeneralMemory(id);
      setFacts((prev) => prev.filter((f) => f.id !== id));
      if (editingId === id) cancelEdit();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setDeletingId(null);
    }
  };

  const clearAll = async () => {
    if (!confirm(`Remove all ${facts.length} general memories?`)) return;

    setClearing(true);
    try {
      await api.clearGeneralMemories();
      setFacts([]);
      cancelEdit();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setClearing(false);
    }
  };

  if (!apiOnline) {
    return (
      <section className={sectionShell(embedded)}>
        {embedded ? (
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
                General memory
              </h2>
              <p className={pageDesc}>
                Shared facts, terms, and knowledge used in every chat.
              </p>
            </div>
          </header>
        ) : (
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
            General memory
          </h2>
        )}
        <p className="mt-1.5 text-xs text-muted">
          API must be online to view stored memories.
        </p>
      </section>
    );
  }

  const header = embedded ? (
    <header className="mb-1 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
          General memory
        </h2>
        <p className={pageDesc}>
          Facts, terms, and knowledge shared across all chats. {facts.length}{" "}
          total. Updates live.
        </p>
      </div>
      {facts.length > 0 ? (
        <button
          type="button"
          className={dangerBtn}
          disabled={clearing}
          onClick={() => void clearAll()}
        >
          {clearing ? "…" : "Clear all"}
        </button>
      ) : null}
    </header>
  ) : (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
          General memory
        </h2>
        <p className="mt-1.5 text-xs text-muted">
          Facts, terms, and knowledge shared across all chats. {facts.length}{" "}
          total. Updates live.
        </p>
      </div>
      {facts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={dangerBtn}
            disabled={clearing}
            onClick={() => void clearAll()}
          >
            {clearing ? "…" : "Clear all"}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <section className={sectionShell(embedded)}>
      {header}

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <form
        className="mb-5 rounded-lg border border-border bg-bg p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void addFact();
        }}
      >
        <p className="mb-2.5 mt-0 text-xs text-muted">
          Add glossary terms, project facts, or standing instructions that apply
          everywhere.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs text-muted">
            <span>Fact</span>
            <input
              type="text"
              className="w-full min-w-40 resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
              value={addFactText}
              onChange={(e) => setAddFactText(e.target.value)}
              placeholder="e.g. API means Application Programming Interface here"
              maxLength={500}
            />
          </label>
          <button
            type="submit"
            className={primaryBtn}
            disabled={savingId === "new" || addFactText.trim().length < 2}
          >
            {savingId === "new" ? "…" : "Add"}
          </button>
        </div>
      </form>

      {loading && facts.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted">Loading memories…</p>
      ) : null}

      {!loading && facts.length === 0 && error == null ? (
        <p className="mt-1.5 text-xs text-muted">
          No general memories yet. The bot can learn them from chat, or add facts
          above.
        </p>
      ) : null}

      {facts.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {facts.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <textarea
                      className="min-h-10 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
                      rows={2}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={500}
                    />
                  ) : (
                    <p className="mb-1.5 break-words leading-snug">{item.fact}</p>
                  )}
                  <time className="text-xs text-muted" dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className={primaryBtn}
                        disabled={
                          savingId === item.id || editText.trim().length < 2
                        }
                        onClick={() => void saveEdit(item.id)}
                      >
                        {savingId === item.id ? "…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={secondaryBtn}
                        disabled={savingId === item.id}
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
                        title="Edit this memory"
                        disabled={deletingId === item.id}
                        onClick={() => startEdit(item.id, item.fact)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={dangerBtn}
                        title="Delete this memory"
                        disabled={deletingId === item.id}
                        onClick={() => void removeFact(item.id)}
                      >
                        {deletingId === item.id ? "…" : "Remove"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
