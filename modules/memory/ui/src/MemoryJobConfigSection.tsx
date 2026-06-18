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
    <section className="rounded-lg border border-border bg-surface p-6">
      <h3 className="mb-5 text-[1.1rem] font-semibold">Background extraction</h3>
      <p className="mt-1.5 text-xs text-muted">
        After the message queue is idle, wait this long before extracting
        memories from recent history.
      </p>
      {loading ? <p className="text-muted">Loading…</p> : null}
      {error ? (
        <p className="mt-1.5 text-sm leading-snug text-danger">{error}</p>
      ) : null}
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
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={primaryBtn}
              onClick={() => void save()}
              disabled={!apiOnline || saving}
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
