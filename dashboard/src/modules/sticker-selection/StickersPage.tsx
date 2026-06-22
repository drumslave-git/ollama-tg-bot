import { useCallback, useEffect, useState } from "react";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { api, type StickerCatalog } from "@llm-tg-bot/dashboard/api";
import { StickersSection } from "./StickersSection";

interface StickerSettingsDraft {
  stickersEnabled: boolean;
  stickerReplyChance: number;
  stickerPackName: string;
}

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function stickerFieldsFromSettings(
  settings: Pick<
    StickerSettingsDraft,
    "stickersEnabled" | "stickerReplyChance" | "stickerPackName"
  >,
): StickerSettingsDraft {
  return {
    stickersEnabled: settings.stickersEnabled,
    stickerReplyChance: settings.stickerReplyChance,
    stickerPackName: settings.stickerPackName,
  };
}

export function StickersPage() {
  const { settings, configBlocked, load } = useDashboard();
  const [draft, setDraft] = useState<StickerSettingsDraft | null>(null);
  const [stickerCatalog, setStickerCatalog] = useState<StickerCatalog | null>(
    null,
  );
  const [stickersLoading, setStickersLoading] = useState(false);
  const [stickersError, setStickersError] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const applySettings = useCallback((next: StickerSettingsDraft) => {
    setDraft(next);
  }, []);

  useEffect(() => {
    if (!settings) {
      setLoading(false);
      return;
    }
    applySettings(stickerFieldsFromSettings(settings));
    setLoading(false);
  }, [settings, applySettings]);

  async function loadStickers() {
    setStickersLoading(true);
    setStickersError(null);
    try {
      setStickerCatalog(await api.getStickers());
    } catch (err) {
      setStickersError(err);
    } finally {
      setStickersLoading(false);
    }
  }

  async function refreshStickers() {
    setStickersLoading(true);
    setStickersError(null);
    try {
      setStickerCatalog(await api.refreshStickers());
    } catch (err) {
      setStickersError(err);
    } finally {
      setStickersLoading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveOk(false);
    setError(null);
    try {
      await api.updateSettings({
        stickersEnabled: draft.stickersEnabled,
        stickerReplyChance: draft.stickerReplyChance,
        stickerPackName: draft.stickerPackName,
      });
      await load();
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2000);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div className="flex flex-col gap-5">
        <p className="py-16 text-center text-muted">
          Loading sticker settings…
        </p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex flex-col gap-5">
        <p className="mt-1.5 text-xs text-muted">
          Sticker settings are not available.
        </p>
      </div>
    );
  }

  const stickerPackRequired =
    draft.stickersEnabled && draft.stickerPackName.trim() === "";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Stickers</h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Configure outgoing Telegram sticker replies: enable the feature, set
            how often stickers are sent, and load a sticker pack for the model to
            choose from.
          </p>
        </div>
      </header>

      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void save()} />
      ) : null}

      {saveOk ? (
        <div className="mb-4 rounded-lg border border-accent/35 bg-accent/10 px-4 py-3 text-sm text-accent">
          Saved
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <fieldset
          disabled={configBlocked}
          className="m-0 min-w-0 border-none p-0 disabled:pointer-events-none disabled:opacity-55"
        >
          <StickersSection
            stickersEnabled={draft.stickersEnabled}
            stickerReplyChance={draft.stickerReplyChance}
            stickerPackName={draft.stickerPackName}
            stickersLoading={stickersLoading}
            configBlocked={configBlocked}
            stickersError={
              stickersError == null ? null : String(stickersError)
            }
            stickerCatalog={stickerCatalog}
            onStickersEnabledChange={(stickersEnabled) =>
              setDraft({ ...draft, stickersEnabled })
            }
            onStickerReplyChanceChange={(stickerReplyChance) =>
              setDraft({ ...draft, stickerReplyChance })
            }
            onStickerPackNameChange={(stickerPackName) =>
              setDraft({ ...draft, stickerPackName })
            }
            onRefreshStickers={() => void refreshStickers()}
            onLoadStickers={() => void loadStickers()}
            onDismissStickersError={() => setStickersError(null)}
          />

          {stickerPackRequired ? (
            <p className="mb-3 mt-1.5 text-sm leading-snug text-danger">
              Sticker pack name is required when stickers are enabled.
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryBtn}
              onClick={() => void save()}
              disabled={saving || configBlocked || stickerPackRequired}
            >
              {saving ? "Saving…" : "Save sticker settings"}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() =>
                settings && applySettings(stickerFieldsFromSettings(settings))
              }
              disabled={!settings || saving}
            >
              Reset
            </button>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
