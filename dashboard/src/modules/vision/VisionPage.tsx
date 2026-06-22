import { useCallback, useEffect, useState } from "react";
import { api } from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { SettingsNumberField } from "@llm-tg-bot/dashboard/SettingsNumberField";

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function VisionPage() {
  const { apiOnline } = useDashboard();
  const [backfillDebounceSec, setBackfillDebounceSec] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (apiOnline !== true) return;
    setLoading(true);
    setError(null);
    try {
      const config = await api.getVisionModuleConfig();
      setBackfillDebounceSec(config.backfillDebounceSec);
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
      const updated = await api.updateVisionModuleConfig({ backfillDebounceSec });
      setBackfillDebounceSec(updated.backfillDebounceSec);
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
      <h3 className="mb-5 text-[1.1rem] font-semibold">Vision backfill</h3>
      <p className="mt-1.5 text-xs text-muted">
        After the message queue is idle, wait this long before describing stored
        base64 media in chat history.
      </p>
      {loading ? <p className="text-muted">Loading…</p> : null}
      {error ? (
        <p className="mt-1.5 text-sm leading-snug text-danger">{error}</p>
      ) : null}
      {!loading ? (
        <>
          <SettingsNumberField
            id="visionBackfillDebounceSec"
            label="Backfill delay (seconds)"
            value={backfillDebounceSec}
            min={5}
            max={600}
            step={5}
            disabled={apiOnline !== true || saving}
            onChange={setBackfillDebounceSec}
          />
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={primaryBtn}
              onClick={() => void save()}
              disabled={apiOnline !== true || saving}
            >
              {saving ? "Saving…" : "Save module settings"}
            </button>
            {saved ? <span className="text-muted">Saved</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
