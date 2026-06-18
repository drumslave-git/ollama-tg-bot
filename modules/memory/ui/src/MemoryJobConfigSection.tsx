import { useCallback, useEffect, useState } from "react";
import { api } from "@llm-tg-bot/dashboard/api";
import { SettingsNumberField } from "@llm-tg-bot/dashboard/SettingsNumberField";

export function MemoryJobConfigSection({
  apiOnline,
}: {
  apiOnline: boolean;
}) {
  const [extractionDebounceSec, setExtractionDebounceSec] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!apiOnline) return;
    setLoading(true);
    setError(null);
    try {
      const config = await api.getMemoryModuleConfig();
      setExtractionDebounceSec(config.extractionDebounceSec);
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
      const updated = await api.updateMemoryModuleConfig({
        extractionDebounceSec,
      });
      setExtractionDebounceSec(updated.extractionDebounceSec);
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
      <h3>Background extraction</h3>
      <p className="hint">
        After the message queue is idle, wait this long before extracting
        memories from recent history.
      </p>
      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
      {!loading ? (
        <>
          <SettingsNumberField
            id="memoryExtractionDebounceSec"
            label="Extraction delay (seconds)"
            value={extractionDebounceSec}
            min={5}
            max={600}
            step={5}
            disabled={!apiOnline || saving}
            onChange={setExtractionDebounceSec}
          />
          <div className="actions">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!apiOnline || saving}
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
