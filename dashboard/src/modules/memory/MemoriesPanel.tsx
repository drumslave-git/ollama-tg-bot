import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type GroupMemoryFact, type UserMemoryFact } from "@llm-tg-bot/dashboard/api";
import { useLiveMemory } from "@llm-tg-bot/dashboard/liveSocket";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";

export type MemoryKind = "user" | "group";

interface MemoriesPanelProps {
  apiOnline: boolean;
  kind: MemoryKind;
  /** When true, skip outer card chrome (used on dedicated page). */
  embedded?: boolean;
}

type UserGroup = {
  userId: string;
  facts: UserMemoryFact[];
};

type ChatGroup = {
  groupId: string;
  facts: GroupMemoryFact[];
};

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-danger/40 bg-surface-hover px-4 py-2.5 text-sm font-semibold text-danger transition-opacity hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50";
const sectionShell = (embedded: boolean) =>
  embedded ? "flex flex-col gap-4" : "rounded-lg border border-border bg-surface p-6";
const pageDesc = "m-0 max-w-xl text-[0.92rem] text-muted";

const COPY: Record<
  MemoryKind,
  {
    title: string;
    desc: string;
    offlineDesc: string;
    entityLabel: string;
    entityIdKey: "userId" | "groupId";
    clearLabel: string;
    confirmClear: (id: string, count: number) => string;
    addHint: string;
  }
> = {
  user: {
    title: "User memories",
    desc: "View and edit facts stored per Telegram user.",
    offlineDesc: "Facts the bot learned from Telegram users.",
    entityLabel: "User",
    entityIdKey: "userId",
    clearLabel: "Clear user",
    confirmClear: (id, count) =>
      `Remove all ${count} memories for user ${id}?`,
    addHint: "Create or replace memory content for any Telegram user ID.",
  },
  group: {
    title: "Group memories",
    desc: "View and edit facts stored per Telegram group.",
    offlineDesc: "Facts the bot learned from Telegram groups.",
    entityLabel: "Chat",
    entityIdKey: "groupId",
    clearLabel: "Clear group",
    confirmClear: (id, count) =>
      `Remove all ${count} memories for group ${id}?`,
    addHint: "Create or replace memory content for any Telegram group ID.",
  },
};

export function MemoriesPanel({
  apiOnline,
  kind,
  embedded = false,
}: MemoriesPanelProps) {
  const copy = COPY[kind];
  const [userFacts, setUserFacts] = useState<UserMemoryFact[]>([]);
  const [groupFacts, setGroupFacts] = useState<GroupMemoryFact[]>([]);
  const facts = kind === "user" ? userFacts : groupFacts;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [addEntityId, setAddEntityId] = useState("");
  const [addFactText, setAddFactText] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        if (kind === "user") {
          const data = await api.getMemories();
          setUserFacts(data.facts);
        } else {
          const data = await api.getGroupMemories();
          setGroupFacts(data.facts);
        }
      } catch (err) {
        setError(err);
        if (kind === "user") setUserFacts([]);
        else setGroupFacts([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiOnline, kind],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveMemory(
    kind,
    useCallback(() => {
      void load(true);
    }, [load]),
    apiOnline,
  );

  const userGroups = useMemo((): UserGroup[] => {
    const map = new Map<string, UserMemoryFact[]>();
    for (const fact of userFacts) {
      const list = map.get(fact.userId) ?? [];
      list.push(fact);
      map.set(fact.userId, list);
    }
    return [...map.entries()]
      .map(([userId, userGroupFacts]) => ({ userId, facts: userGroupFacts }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
  }, [userFacts]);

  const chatGroups = useMemo((): ChatGroup[] => {
    const map = new Map<string, GroupMemoryFact[]>();
    for (const fact of groupFacts) {
      const list = map.get(fact.groupId) ?? [];
      list.push(fact);
      map.set(fact.groupId, list);
    }
    return [...map.entries()]
      .map(([groupId, groupGroupFacts]) => ({
        groupId,
        facts: groupGroupFacts,
      }))
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
  }, [groupFacts]);

  const upsertUserFact = (record: UserMemoryFact) => {
    setUserFacts((prev) => {
      const idx = prev.findIndex((f) => f.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [...prev, record].sort(
        (a, b) =>
          a.userId.localeCompare(b.userId) || a.id - b.id,
      );
    });
  };

  const upsertGroupFact = (record: GroupMemoryFact) => {
    setGroupFacts((prev) => {
      const idx = prev.findIndex((f) => f.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [...prev, record].sort(
        (a, b) =>
          a.groupId.localeCompare(b.groupId) || a.id - b.id,
      );
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
      if (kind === "user") {
        const { fact } = await api.updateMemory(id, trimmed);
        upsertUserFact(fact);
      } else {
        const { fact } = await api.updateGroupMemory(id, trimmed);
        upsertGroupFact(fact);
      }
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
    const entityId = addEntityId.trim();
    if (!entityId || trimmed.length < 2) return;

    setSavingId("new");
    try {
      if (kind === "user") {
        const { fact } = await api.createMemory(entityId, trimmed);
        upsertUserFact(fact);
      } else {
        const { fact } = await api.createGroupMemory(entityId, trimmed);
        upsertGroupFact(fact);
      }
      setAddEntityId("");
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
      if (kind === "user") {
        await api.deleteMemory(id);
        setUserFacts((prev) => prev.filter((f) => f.id !== id));
      } else {
        await api.deleteGroupMemory(id);
        setGroupFacts((prev) => prev.filter((f) => f.id !== id));
      }
      if (editingId === id) cancelEdit();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setDeletingId(null);
    }
  };

  const clearEntity = async (entityId: string) => {
    const count =
      kind === "user"
        ? (userGroups.find((g) => g.userId === entityId)?.facts.length ?? 0)
        : (chatGroups.find((g) => g.groupId === entityId)?.facts.length ?? 0);
    if (!confirm(copy.confirmClear(entityId, count))) return;

    setClearingId(entityId);
    try {
      if (kind === "user") {
        await api.clearUserMemories(entityId);
        setUserFacts((prev) => prev.filter((f) => f.userId !== entityId));
      } else {
        await api.clearGroupMemories(entityId);
        setGroupFacts((prev) => prev.filter((f) => f.groupId !== entityId));
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setClearingId(null);
    }
  };

  const renderFactActions = (
    item: UserMemoryFact | GroupMemoryFact,
    isEditing: boolean,
  ) => {
    if (isEditing) {
      return (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            className={primaryBtn}
            disabled={savingId === item.id || editText.trim().length < 2}
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
        </div>
      );
    }

    return (
      <div className="flex shrink-0 flex-wrap gap-1.5">
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
      </div>
    );
  };

  const renderFactItem = (item: UserMemoryFact | GroupMemoryFact) => {
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
              rows={6}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
          ) : (
            <p className="mb-1.5 break-words leading-snug">{item.fact}</p>
          )}
          <time className="text-xs text-muted" dateTime={item.createdAt}>
            {new Date(item.createdAt).toLocaleString()}
          </time>
        </div>
        {renderFactActions(item, isEditing)}
      </li>
    );
  };

  if (!apiOnline) {
    return (
      <section className={sectionShell(embedded)}>
        {!embedded ? (
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
            {copy.title}
          </h2>
        ) : (
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
                {copy.title}
              </h2>
              <p className={pageDesc}>{copy.offlineDesc}</p>
            </div>
          </header>
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
          {copy.title}
        </h2>
        <p className={pageDesc}>
          {copy.desc} {facts.length} total. Updates live.
        </p>
      </div>
    </header>
  ) : (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
          {copy.title}
        </h2>
        <p className="mt-1.5 text-xs text-muted">
          {copy.desc} {facts.length} total. Updates live.
        </p>
      </div>
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
        <p className="mb-2.5 mt-0 text-xs text-muted">{copy.addHint}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            <span>{copy.entityLabel} ID</span>
            <input
              type="text"
              className="min-w-40 rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
              value={addEntityId}
              onChange={(e) => setAddEntityId(e.target.value)}
              placeholder={
                kind === "user" ? "Telegram user ID" : "Telegram group ID"
              }
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs text-muted">
            <span>Memory</span>
            <textarea
              className="min-h-10 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-inherit text-text"
              rows={3}
              value={addFactText}
              onChange={(e) => setAddFactText(e.target.value)}
              placeholder="New fact to store…"
            />
          </label>
          <button
            type="submit"
            className={primaryBtn}
            disabled={
              savingId === "new" ||
              addFactText.trim().length < 2 ||
              !addEntityId.trim()
            }
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
          No memories stored yet. Create one above or let the bot learn from
          chat.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {kind === "user"
          ? userGroups.map((group) => (
              <div
                key={group.userId}
                className="overflow-hidden rounded-lg border border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-3.5 py-2.5">
                  <span>
                    {copy.entityLabel}{" "}
                    <code className="font-mono text-[0.88em]">
                      {group.userId}
                    </code>
                    <span className="ml-2 text-xs font-normal text-muted">
                      {" "}
                      ({group.facts.length})
                    </span>
                  </span>
                  <button
                    type="button"
                    className={dangerBtn}
                    disabled={clearingId === group.userId}
                    onClick={() => void clearEntity(group.userId)}
                  >
                    {clearingId === group.userId ? "…" : copy.clearLabel}
                  </button>
                </div>
                <ul className="m-0 list-none p-0">
                  {group.facts.map((item) => renderFactItem(item))}
                </ul>
              </div>
            ))
          : chatGroups.map((group) => (
              <div
                key={group.groupId}
                className="overflow-hidden rounded-lg border border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-3.5 py-2.5">
                  <span>
                    {copy.entityLabel}{" "}
                    <code className="font-mono text-[0.88em]">
                      {group.groupId}
                    </code>
                    <span className="ml-2 text-xs font-normal text-muted">
                      {" "}
                      ({group.facts.length})
                    </span>
                  </span>
                  <button
                    type="button"
                    className={dangerBtn}
                    disabled={clearingId === group.groupId}
                    onClick={() => void clearEntity(group.groupId)}
                  >
                    {clearingId === group.groupId ? "…" : copy.clearLabel}
                  </button>
                </div>
                <ul className="m-0 list-none p-0">
                  {group.facts.map((item) => renderFactItem(item))}
                </ul>
              </div>
            ))}
      </div>
    </section>
  );
}
