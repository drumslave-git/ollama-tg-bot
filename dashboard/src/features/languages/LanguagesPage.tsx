import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ChatLanguage } from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveData } from "@llm-tg-bot/dashboard/liveSocket";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-3 py-2 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-danger/40 bg-surface-hover px-3 py-2 text-sm font-semibold text-danger transition-opacity hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50";
const fieldLabel = "flex min-w-40 flex-col gap-1 text-xs font-semibold text-muted";
const fieldInput =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent";

function emptyDraft() {
  return { chatId: "", language: "" };
}

export function LanguagesPage() {
  const { apiOnline } = useDashboard();
  const online = apiOnline === true;

  const [languages, setLanguages] = useState<ChatLanguage[]>([]);
  const [defaultLanguage, setDefaultLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [editLanguage, setEditLanguage] = useState("");
  const [busyChatId, setBusyChatId] = useState<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!online) return;
      if (!silent) setLoading(true);
      try {
        const payload = await api.getLanguages();
        setLanguages(payload.languages);
        setDefaultLanguage(payload.defaultLanguage);
        setError(null);
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

  useLiveData(
    useCallback(
      (event) => {
        if (!event.tableIds || event.tableIds.includes("chat_languages")) {
          void load(true);
        }
      },
      [load],
    ),
    online,
  );

  const sorted = useMemo(
    () => [...languages].sort((a, b) => a.chatId - b.chatId),
    [languages],
  );

  const createLanguage = async () => {
    const chatId = Number(draft.chatId);
    const language = draft.language.trim();
    if (!Number.isFinite(chatId) || !language) return;

    setCreating(true);
    try {
      await api.createLanguage(chatId, language);
      setDraft(emptyDraft());
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row: ChatLanguage) => {
    setEditingChatId(row.chatId);
    setEditLanguage(row.language);
  };

  const saveEdit = async (chatId: number) => {
    const language = editLanguage.trim();
    if (!language) return;
    setBusyChatId(chatId);
    try {
      await api.updateLanguage(chatId, language);
      setEditingChatId(null);
      setEditLanguage("");
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusyChatId(null);
    }
  };

  const removeLanguage = async (chatId: number) => {
    if (!confirm(`Remove language setting for chat ${chatId}?`)) return;
    setBusyChatId(chatId);
    try {
      await api.deleteLanguage(chatId);
      if (editingChatId === chatId) setEditingChatId(null);
      setError(null);
      await load(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusyChatId(null);
    }
  };

  if (!online) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Languages</h2>
        <p className="mt-1.5 text-xs text-muted">
          API must be online to view language settings.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Languages</h2>
        <p className="m-0 max-w-xl text-[0.92rem] text-muted">
          Required Telegram reply language per chat or group. Chats without a
          row use <code className="font-mono">{defaultLanguage}</code>.
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
          void createLanguage();
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className={fieldLabel}>
            <span>Chat ID</span>
            <input
              type="text"
              className={`${fieldInput} min-w-44`}
              value={draft.chatId}
              onChange={(e) => setDraft({ ...draft, chatId: e.target.value })}
              placeholder="Telegram chat ID"
            />
          </label>
          <label className={`${fieldLabel} min-w-52 flex-1`}>
            <span>Language</span>
            <input
              type="text"
              className={`${fieldInput} w-full`}
              value={draft.language}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}
              placeholder="English"
            />
          </label>
          <button
            type="submit"
            className={primaryBtn}
            disabled={
              creating ||
              !draft.chatId.trim() ||
              !draft.language.trim() ||
              !Number.isFinite(Number(draft.chatId))
            }
          >
            {creating ? "..." : "Add setting"}
          </button>
        </div>
      </form>

      {loading && languages.length === 0 ? (
        <p className="text-xs text-muted">Loading language settings...</p>
      ) : null}

      {!loading && languages.length === 0 && error == null ? (
        <p className="text-xs text-muted">
          No custom language settings. All chats use {defaultLanguage}.
        </p>
      ) : null}

      {sorted.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-bg text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Chat / group</th>
                <th className="px-3.5 py-2.5 font-semibold">Language</th>
                <th className="w-44 px-3.5 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isEditing = editingChatId === row.chatId;
                return (
                  <tr key={row.chatId} className="border-t border-border">
                    <td className="px-3.5 py-3 align-middle">
                      <code className="font-mono">{row.chatId}</code>
                    </td>
                    <td className="px-3.5 py-3 align-middle">
                      {isEditing ? (
                        <input
                          type="text"
                          className={`${fieldInput} w-full`}
                          value={editLanguage}
                          onChange={(e) => setEditLanguage(e.target.value)}
                        />
                      ) : (
                        row.language
                      )}
                    </td>
                    <td className="px-3.5 py-3 align-middle">
                      <div className="flex flex-wrap gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className={secondaryBtn}
                              disabled={busyChatId === row.chatId}
                              onClick={() => void saveEdit(row.chatId)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={secondaryBtn}
                              disabled={busyChatId === row.chatId}
                              onClick={() => setEditingChatId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={secondaryBtn}
                            disabled={busyChatId === row.chatId}
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className={dangerBtn}
                          disabled={busyChatId === row.chatId}
                          onClick={() => void removeLanguage(row.chatId)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
