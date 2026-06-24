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

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const badgeOk =
  "rounded-full border border-accent/35 bg-surface px-3 py-1.5 text-xs font-semibold text-accent";

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
    return (
      <p className="py-16 text-center text-muted">
        Loading character mood defaults…
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="m-0 text-[0.95rem] font-semibold text-text">
          Character mood defaults
        </h3>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Baseline mood (0–5 per trait) for each character personality. Global
        mood drifts back toward the active character&apos;s defaults during
        cooldown. Create and name personalities above.
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
        <p className="mt-1.5 text-xs text-muted">
          No personalities yet — mood defaults apply once you create a character
          above.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
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
                className={`rounded-[10px] border bg-bg p-4 ${
                  isActive
                    ? "border-accent/45 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.15)]"
                    : "border-border"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="m-0 text-base">{personality.name}</h4>
                    {isActive ? (
                      <span className={badgeOk}>Active character</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 sm:gap-x-4">
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

                <div className="mb-2 mt-0 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={primaryBtn}
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
                    className={secondaryBtn}
                    disabled={
                      configBlocked || savingId === personality.id || !isDirty
                    }
                    onClick={() => resetDraft(personality.id)}
                  >
                    Reset
                  </button>
                  {saveOkId === personality.id ? (
                    <span className="mt-1.5 text-xs text-muted">Saved</span>
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
