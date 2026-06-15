import { useCallback, useEffect, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { SettingsNumberField } from "@llm-tg-bot/dashboard/SettingsNumberField";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import {
  api,
  DEFAULT_MOOD_VALUES,
  MOOD_KEYS,
  type MoodKey,
  type MoodValues,
  type Personality,
} from "@llm-tg-bot/dashboard/api";
import { useLiveMood, useLivePersonalities } from "@llm-tg-bot/dashboard/liveSocket";

function moodDraftKey(personalityId: number): string {
  return String(personalityId);
}

export function PersonalityMoodDefaultsPanel() {
  const { configBlocked } = useDashboard();
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activeId, setActiveId] = useState(0);
  const [traitHints, setTraitHints] = useState<Record<MoodKey, string> | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, MoodValues>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveOkId, setSaveOkId] = useState<number | null>(null);

  const syncDrafts = useCallback((list: Personality[]) => {
    setDrafts(
      Object.fromEntries(
        list.map((p) => [moodDraftKey(p.id), { ...p.moodDefaults }]),
      ),
    );
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (configBlocked) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [data, mood] = await Promise.all([
          api.getPersonalities(),
          api.getMood(),
        ]);
        setPersonalities(data.personalities);
        setActiveId(data.activePersonalityId);
        setTraitHints(mood.traitHints);
        syncDrafts(data.personalities);
      } catch (err) {
        setError(err);
        setPersonalities([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [configBlocked, syncDrafts],
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

  useLiveMood(
    useCallback((mood) => {
      setTraitHints(mood.traitHints);
    }, []),
    !configBlocked,
  );

  async function savePersonalityMood(id: number) {
    const draft = drafts[moodDraftKey(id)];
    if (!draft) return;

    setSavingId(id);
    setSaveOkId(null);
    setError(null);
    try {
      const { personality } = await api.updatePersonality(id, {
        moodDefaults: draft,
      });
      setPersonalities((list) =>
        list.map((p) => (p.id === id ? personality : p)),
      );
      setDrafts((prev) => ({
        ...prev,
        [moodDraftKey(id)]: { ...personality.moodDefaults },
      }));
      setSaveOkId(id);
      window.setTimeout(() => setSaveOkId(null), 2000);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  }

  function resetDraft(id: number) {
    const personality = personalities.find((p) => p.id === id);
    if (!personality) return;
    setDrafts((prev) => ({
      ...prev,
      [moodDraftKey(id)]: { ...personality.moodDefaults },
    }));
  }

  function updateDraft(id: number, next: MoodValues) {
    setDrafts((prev) => ({ ...prev, [moodDraftKey(id)]: next }));
  }

  if (loading && personalities.length === 0) {
    return <p className="loading">Loading character mood defaults…</p>;
  }

  return (
    <section className="card">
      <div className="section-head">
        <h3 className="section-title">Character mood defaults</h3>
      </div>
      <p className="hint">
        Baseline mood (0–5 per trait) for each character personality. Global
        mood drifts back toward the active character&apos;s defaults during
        cooldown. Create and name personalities on the Character page.
      </p>

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {personalities.length === 0 ? (
        <p className="hint">
          No personalities yet — mood defaults apply once you create a character
          on the Character page.
        </p>
      ) : (
        <div className="personality-list">
          {personalities.map((personality) => {
            const draft =
              drafts[moodDraftKey(personality.id)] ??
              personality.moodDefaults ??
              DEFAULT_MOOD_VALUES;
            const isActive = personality.id === activeId;
            const isDirty = MOOD_KEYS.some(
              (key) => draft[key] !== personality.moodDefaults[key],
            );

            return (
              <article
                key={personality.id}
                className={`personality-card${isActive ? " personality-card-active" : ""}`}
              >
                <div className="personality-card-head">
                  <div className="personality-card-title">
                    <h4>{personality.name}</h4>
                    {isActive ? (
                      <span className="badge badge-ok">Active character</span>
                    ) : null}
                  </div>
                </div>

                <div className="personality-mood-section">
                  <div className="mood-grid">
                    {MOOD_KEYS.map((key) => (
                      <SettingsNumberField
                        key={key}
                        id={`mood-default-${personality.id}-${key}`}
                        label={key}
                        hint={traitHints?.[key]}
                        value={draft[key]}
                        min={0}
                        max={5}
                        step={1}
                        variant="slider"
                        disabled={configBlocked || savingId === personality.id}
                        onChange={(value) =>
                          updateDraft(personality.id, {
                            ...draft,
                            [key]: value,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="actions compact-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      configBlocked ||
                      savingId === personality.id ||
                      !isDirty
                    }
                    onClick={() => void savePersonalityMood(personality.id)}
                  >
                    {savingId === personality.id ? "Saving…" : "Save defaults"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      configBlocked || savingId === personality.id || !isDirty
                    }
                    onClick={() => resetDraft(personality.id)}
                  >
                    Reset
                  </button>
                  {saveOkId === personality.id ? (
                    <span className="hint">Saved</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
