import { useCallback, useEffect, useState } from "react";
import { api, type Personality } from "../api";
import { useDashboard } from "../context/DashboardContext";
import { useLivePersonalities } from "../liveSocket";
import { ErrorBanner } from "../components/ErrorBanner";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import {
  Card,
  Hint,
  Page,
  PageHeader,
  SectionTitle,
} from "../components/ui/Layout";
import { cn } from "../lib/cn";
import { PersonalityMoodDefaultsPanel } from "../features/mood-evaluation/PersonalityMoodDefaultsPanel";

export function CharacterPage() {
  const {
    settings,
    configBlocked,
    setDraft,
    setSectionError,
    sectionErrors,
  } = useDashboard();

  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activeId, setActiveId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (configBlocked) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getPersonalities();
        setPersonalities(data.personalities);
        setActiveId(data.activePersonalityId);
        setDraft((d) =>
          d ? { ...d, activePersonalityId: data.activePersonalityId } : d,
        );
      } catch (err) {
        setError(err);
        setPersonalities([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [configBlocked, setDraft],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLivePersonalities(
    useCallback(() => {
      void load(true);
    }, [load]),
    !configBlocked,
  );

  async function activatePersonality(id: number) {
    setActivatingId(id);
    setSectionError("save", null);
    try {
      const updated = await api.updateSettings({ activePersonalityId: id });
      setActiveId(updated.activePersonalityId);
      setDraft(updated);
    } catch (err) {
      setSectionError("save", err);
    } finally {
      setActivatingId(null);
    }
  }

  function startEdit(personality: Personality) {
    setEditingId(personality.id);
    setEditName(personality.name);
    setEditPrompt(personality.prompt);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPrompt("");
  }

  async function saveEdit(id: number) {
    setSavingId(id);
    setSectionError("save", null);
    try {
      const { personality } = await api.updatePersonality(id, {
        name: editName,
        prompt: editPrompt,
      });
      setPersonalities((list) =>
        list.map((p) => (p.id === id ? personality : p)),
      );
      cancelEdit();
    } catch (err) {
      setSectionError("save", err);
    } finally {
      setSavingId(null);
    }
  }

  async function createPersonality() {
    const name = newName.trim();
    if (!name) return;
    setSavingId("new");
    setSectionError("save", null);
    try {
      const { personality } = await api.createPersonality(name, newPrompt);
      setPersonalities((list) => [...list, personality]);
      setNewName("");
      setNewPrompt("");
      if (personalities.length === 0) {
        await activatePersonality(personality.id);
      }
    } catch (err) {
      setSectionError("save", err);
    } finally {
      setSavingId(null);
    }
  }

  async function removePersonality(id: number) {
    const personality = personalities.find((p) => p.id === id);
    if (!personality) return;
    if (!window.confirm(`Delete personality "${personality.name}"?`)) return;

    setDeletingId(id);
    setSectionError("save", null);
    try {
      const result = await api.deletePersonality(id);
      setPersonalities((list) => list.filter((p) => p.id !== id));
      setActiveId(result.activePersonalityId);
      setDraft((d) =>
        d ? { ...d, activePersonalityId: result.activePersonalityId } : d,
      );
      if (editingId === id) cancelEdit();
    } catch (err) {
      setSectionError("save", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Character"
        description={
          <>
            Manage personalities and choose which one the bot uses for every
            reply, including each character&apos;s mood default baselines.
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-1">
          <label>Default system prompt</label>
          <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 font-mono text-[0.78rem] leading-snug text-muted">
            {settings?.baseSystemPrompt ?? "…"}
          </pre>
          <Hint>
            Always applied. Each personality below adds tone, role, and extra
            rules on top of this base.
          </Hint>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <SectionTitle className="m-0">Personalities</SectionTitle>
        </div>

        {error != null ? (
          <ErrorBanner
            error={error}
            compact
            onRetry={() => void load()}
            onDismiss={() => setError(null)}
          />
        ) : null}

        {sectionErrors.save != null ? (
          <ErrorBanner
            error={sectionErrors.save}
            compact
            onDismiss={() => setSectionError("save", null)}
          />
        ) : null}

        {personalities.length === 0 && !loading ? (
          <Hint>
            No personalities yet — the bot uses only the base system prompt.
            Create one below when you want a custom character layer.
          </Hint>
        ) : activeId === 0 && !loading ? (
          <Hint>
            No active personality — the bot uses only the base system prompt.
          </Hint>
        ) : null}

        <div className="flex flex-col gap-4">
          {personalities.map((personality) => {
            const isActive = personality.id === activeId;
            const isEditing = editingId === personality.id;

            return (
              <article
                key={personality.id}
                className={cn(
                  "rounded-[10px] border border-border bg-bg p-4",
                  isActive &&
                    "border-accent/45 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.15)]",
                )}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={configBlocked}
                        aria-label="Personality name"
                      />
                    ) : (
                      <h4 className="m-0 text-base">{personality.name}</h4>
                    )}
                    {isActive ? <Badge variant="ok">Active</Badge> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!isActive ? (
                      <Button
                        variant="secondary"
                        onClick={() => void activatePersonality(personality.id)}
                        disabled={
                          configBlocked || activatingId === personality.id
                        }
                      >
                        {activatingId === personality.id
                          ? "Activating…"
                          : "Use this"}
                      </Button>
                    ) : null}
                    {isEditing ? (
                      <>
                        <Button
                          onClick={() => void saveEdit(personality.id)}
                          disabled={
                            configBlocked ||
                            savingId === personality.id ||
                            !editName.trim()
                          }
                        >
                          {savingId === personality.id ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={cancelEdit}
                          disabled={savingId === personality.id}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => startEdit(personality)}
                        disabled={configBlocked}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => void removePersonality(personality.id)}
                      disabled={
                        configBlocked || deletingId === personality.id
                      }
                    >
                      {deletingId === personality.id ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <textarea
                    rows={8}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    disabled={configBlocked}
                    placeholder="Personality, tone, topics, extra rules…"
                  />
                ) : (
                  <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 font-mono text-[0.78rem] leading-snug text-text">
                    {personality.prompt.trim() || "(empty — base prompt only)"}
                  </pre>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <SectionTitle className="mt-0">New personality</SectionTitle>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-personality-name">Name</label>
            <input
              id="new-personality-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={configBlocked}
              placeholder="e.g. Friendly helper"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="new-personality-prompt">Custom prompt</label>
            <textarea
              id="new-personality-prompt"
              rows={6}
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              disabled={configBlocked}
              placeholder="Personality, tone, topics, extra rules…"
            />
          </div>
          <Button
            className="mt-3"
            onClick={() => void createPersonality()}
            disabled={configBlocked || savingId === "new" || !newName.trim()}
          >
            {savingId === "new" ? "Creating…" : "Create personality"}
          </Button>
        </div>
      </Card>

      <PersonalityMoodDefaultsPanel />
    </Page>
  );
}
