import { useCallback, useEffect, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { SettingsNumberField } from "@llm-tg-bot/dashboard/SettingsNumberField";
import {
  api,
  type MoodKey,
  type MoodPayload,
  type MoodValues,
} from "@llm-tg-bot/dashboard/api";
import { useLiveMood } from "@llm-tg-bot/dashboard/liveSocket";

import { PersonalityMoodDefaultsPanel } from "./PersonalityMoodDefaultsPanel";

const MOOD_KEYS: MoodKey[] = [
  "irritated",
  "exhausted",
  "amused",
  "curious",
  "contemptuous",
  "gloomy",
  "impatient",
  "pleased",
  "suspicious",
];

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const dangerSecondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-danger/40 bg-surface-hover px-4 py-2.5 text-sm font-semibold text-danger transition-opacity hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50";

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function MoodPage() {
  const [payload, setPayload] = useState<MoodPayload | null>(null);
  const [draftCooldown, setDraftCooldown] = useState<number | null>(null);
  const [draftCurrent, setDraftCurrent] = useState<MoodValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const applyPayload = useCallback((data: MoodPayload) => {
    setPayload(data);
    setDraftCooldown(data.cooldownMinutes);
    setDraftCurrent(
      data.current ? { ...data.current.values } : { ...data.defaults },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyPayload(await api.getMood());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveMood(
    useCallback(
      (data) => {
        if (!refreshing && !saving) applyPayload(data);
      },
      [applyPayload, refreshing, saving],
    ),
  );

  async function refreshCurrent() {
    setRefreshing(true);
    setError(null);
    try {
      applyPayload(await api.refreshMood());
    } catch (err) {
      setError(err);
    } finally {
      setRefreshing(false);
    }
  }

  async function saveCooldown() {
    if (draftCooldown == null) return;
    setSaving(true);
    setSaveOk(false);
    setError(null);
    try {
      applyPayload(await api.updateMood({ cooldownMinutes: draftCooldown }));
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2000);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrent() {
    if (!draftCurrent) return;
    setSaving(true);
    setSaveOk(false);
    setError(null);
    try {
      applyPayload(await api.updateMood({ current: draftCurrent }));
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2000);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function resetCurrent() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.resetMood();
      applyPayload(updated);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !payload) {
    return (
      <div className="flex flex-col gap-5">
        <p className="py-16 text-center text-muted">Loading mood…</p>
      </div>
    );
  }

  const effective = payload?.current?.effectiveValues;
  const defaultsLabel = payload?.activePersonalityName
    ? `"${payload.activePersonalityName}" mood defaults`
    : "base mood defaults";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Mood</h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Global mood state, cooldown, and per-character mood default baselines.
            Cooldown drifts current mood back toward the active character&apos;s
            defaults in the background.
          </p>
        </div>
      </header>

      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void load()} />
      ) : null}

      {saveOk ? (
        <div className="mb-4 rounded-lg border border-accent/35 bg-accent/10 px-4 py-3 text-sm text-accent">
          Saved
        </div>
      ) : null}

      {draftCooldown != null ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-5 text-[1.1rem] font-semibold">Cooldown</h3>
          <p className="mt-1.5 text-xs text-muted">
            After inactivity, each trait drifts back toward {defaultsLabel} over
            this period.
          </p>

          <SettingsNumberField
            id="moodCooldown"
            label="Cooldown (minutes)"
            hint="Time until mood fully returns to the active character's defaults (5–1440)."
            value={draftCooldown}
            min={5}
            max={1440}
            step={5}
            disabled={saving}
            onChange={setDraftCooldown}
          />

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={primaryBtn}
              disabled={saving}
              onClick={() => void saveCooldown()}
            >
              {saving ? "Saving…" : "Save cooldown"}
            </button>
          </div>
        </section>
      ) : null}

      {draftCurrent ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">
              Current mood
            </h3>
            <button
              type="button"
              className={secondaryBtn}
              disabled={refreshing || saving}
              onClick={() => void refreshCurrent()}
            >
              {refreshing ? "Applying…" : "Apply cooldown now"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Background cooldown updates these values toward {defaultsLabel}.
            {payload?.current?.updatedAt
              ? ` Last interaction ${formatTime(payload.current.updatedAt)}.`
              : " Not set yet — character defaults apply until the first reply."}
          </p>

          {effective &&
          payload?.current &&
          MOOD_KEYS.some((key) => effective[key] !== payload.current!.values[key]) ? (
            <p className="mt-1.5 text-xs text-muted">
              Live decay (next background tick):{" "}
              <span className="inline-flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs [&_span]:text-muted">
                {MOOD_KEYS.map((key) => (
                  <span key={key} title={payload?.traitHints[key]}>
                    {key.slice(0, 3)}:{effective[key]}
                  </span>
                ))}
              </span>
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 sm:gap-x-4">
            {MOOD_KEYS.map((key) => (
              <SettingsNumberField
                key={key}
                id={`current-${key}`}
                label={key}
                hint={payload?.traitHints[key]}
                value={draftCurrent[key]}
                min={0}
                max={5}
                step={1}
                variant="slider"
                disabled={saving}
                onChange={(value) =>
                  setDraftCurrent({ ...draftCurrent, [key]: value })
                }
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              className={dangerSecondaryBtn}
              disabled={saving || !payload?.current}
              onClick={() => void resetCurrent()}
            >
              Reset to defaults
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={saving}
              onClick={() => void saveCurrent()}
            >
              {saving ? "Saving…" : "Save current mood"}
            </button>
          </div>
        </section>
      ) : null}

      <PersonalityMoodDefaultsPanel />
    </div>
  );
}
