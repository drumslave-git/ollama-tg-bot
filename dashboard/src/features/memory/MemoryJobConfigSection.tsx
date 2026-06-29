import { useCallback, useEffect, useState } from "react";
import { api } from "@llm-tg-bot/dashboard/api";
import { SettingsNumberField } from "@llm-tg-bot/dashboard/SettingsNumberField";

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function MemoryJobConfigSection({
  apiOnline,
}: {
  apiOnline: boolean;
}) {
  const [enabled, setEnabled] = useState(true);
  const [runHour, setRunHour] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!apiOnline) return;
    setLoading(true);
    setError(null);
    try {
      const config = await api.getMemoryConfig();
      setEnabled(config.enabled);
      setRunHour(config.runHour);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [apiOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateMemoryConfig({ enabled, runHour });
      setEnabled(updated.enabled);
      setRunHour(updated.runHour);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h3 className="mb-5 text-[1.1rem] font-semibold">Memory consolidation</h3>
      <p className="mt-1.5 text-xs text-muted">
        Once per day (after the chosen local hour, while the queue is idle), the
        bot folds each entity's pending notes into its consolidated, embedded
        memory record and removes the processed notes.
      </p>
      {loading ? <p className="text-muted">Loading…</p> : null}
      {error ? (
        <p className="mt-1.5 text-sm leading-snug text-danger">{error}</p>
      ) : null}
      {!loading ? (
        <>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!apiOnline || saving}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enable daily consolidation</span>
          </label>
          <div className="mt-3">
            <SettingsNumberField
              id="memoryRunHour"
              label="Run hour (0–23, local time)"
              value={runHour}
              min={0}
              max={23}
              step={1}
              disabled={!apiOnline || saving || !enabled}
              onChange={setRunHour}
            />
          </div>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={primaryBtn}
              onClick={() => void save()}
              disabled={!apiOnline || saving}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            {saved ? <span className="text-muted">Saved</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
