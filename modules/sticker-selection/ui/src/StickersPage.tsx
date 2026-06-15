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
      <div className="page">
        <p className="loading">Loading sticker settings…</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="page">
        <p className="hint">Sticker settings are not available.</p>
      </div>
    );
  }

  const stickerPackRequired =
    draft.stickersEnabled && draft.stickerPackName.trim() === "";

  return (
    <div className="page">
      <header className="page-header">
        <h2>Stickers</h2>
        <p className="page-desc">
          Configure outgoing Telegram sticker replies: enable the feature, set
          how often stickers are sent, and load a sticker pack for the model to
          choose from.
        </p>
      </header>

      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => void save()} />
      ) : null}

      {saveOk ? (
        <div className="alert success page-alert">Saved</div>
      ) : null}

      <section className="card">
        <fieldset disabled={configBlocked} className="form-fieldset">
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
            <p className="field-error model-config-save-block">
              Sticker pack name is required when stickers are enabled.
            </p>
          ) : null}

          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
              disabled={saving || configBlocked || stickerPackRequired}
            >
              {saving ? "Saving…" : "Save sticker settings"}
            </button>
            <button
              type="button"
              className="secondary"
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
