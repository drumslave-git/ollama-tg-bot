import { useCallback, useEffect, useState } from "react";
import { api } from "@llm-tg-bot/dashboard/api";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { SettingsNumberField } from "@llm-tg-bot/dashboard/SettingsNumberField";

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
    <section className="card">
      <h3>Vision backfill</h3>
      <p className="hint">
        After the message queue is idle, wait this long before describing stored
        base64 media in chat history.
      </p>
      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
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
          <div className="actions">
            <button
              type="button"
              onClick={() => void save()}
              disabled={apiOnline !== true || saving}
            >
              {saving ? "Saving…" : "Save module settings"}
            </button>
            {saved ? <span className="muted">Saved</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
