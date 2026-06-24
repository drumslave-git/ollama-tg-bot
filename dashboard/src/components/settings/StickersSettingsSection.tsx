import { useCallback, useEffect, useState } from "react";
import { api, type StickerCatalog } from "../../api";
import { useDashboard } from "../../context/DashboardContext";
import { StickersSection } from "../../features/sticker-selection/StickersSection";

interface StickerDraft {
  stickerReplyChance: number;
  stickerPackName: string;
}

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent bg-accent-dim px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function StickersSettingsSection() {
  const { settings, configBlocked, load } = useDashboard();
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [stickerCatalog, setStickerCatalog] = useState<StickerCatalog | null>(
    null,
  );
  const [stickersLoading, setStickersLoading] = useState(false);
  const [stickersError, setStickersError] = useState<unknown | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sync = useCallback(() => {
    if (!settings) return;
    setDraft({
      stickerReplyChance: settings.stickerReplyChance,
      stickerPackName: settings.stickerPackName,
    });
  }, [settings]);

  useEffect(() => {
    sync();
  }, [sync]);

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
    setSaved(false);
    try {
      await api.updateSettings({
        stickerReplyChance: draft.stickerReplyChance,
        stickerPackName: draft.stickerPackName,
      });
      await load();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setStickersError(err);
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h3 className="mb-1 text-[1.1rem] font-semibold">Stickers</h3>
      <fieldset
        disabled={configBlocked}
        className="m-0 min-w-0 border-none p-0 disabled:pointer-events-none disabled:opacity-55"
      >
        <StickersSection
          stickerReplyChance={draft.stickerReplyChance}
          stickerPackName={draft.stickerPackName}
          stickersLoading={stickersLoading}
          configBlocked={configBlocked}
          stickersError={stickersError == null ? null : String(stickersError)}
          stickerCatalog={stickerCatalog}
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

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            className={primaryBtn}
            onClick={() => void save()}
            disabled={saving || configBlocked}
          >
            {saving ? "Saving…" : "Save sticker settings"}
          </button>
          {saved ? <span className="text-muted">Saved</span> : null}
        </div>
      </fieldset>
    </section>
  );
}
