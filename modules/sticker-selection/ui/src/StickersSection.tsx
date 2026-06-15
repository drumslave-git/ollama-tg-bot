import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { api, type StickerCatalog } from "@llm-tg-bot/dashboard/api";

interface StickersSectionProps {
  stickersEnabled: boolean;
  stickerReplyChance: number;
  stickerPackName: string;
  stickersLoading: boolean;
  configBlocked: boolean;
  stickersError: string | null;
  stickerCatalog: StickerCatalog | null;
  onStickersEnabledChange: (value: boolean) => void;
  onStickerReplyChanceChange: (value: number) => void;
  onStickerPackNameChange: (value: string) => void;
  onRefreshStickers: () => void;
  onLoadStickers: () => void;
  onDismissStickersError: () => void;
}

export function StickersSection({
  stickersEnabled,
  stickerReplyChance,
  stickerPackName,
  stickersLoading,
  configBlocked,
  stickersError,
  stickerCatalog,
  onStickersEnabledChange,
  onStickerReplyChanceChange,
  onStickerPackNameChange,
  onRefreshStickers,
  onLoadStickers,
  onDismissStickersError,
}: StickersSectionProps) {
  return (
    <>
      <div className="field toggle-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={stickersEnabled}
            onChange={(e) => onStickersEnabledChange(e.target.checked)}
          />
          Let the bot send stickers from a pack
        </label>
        <p className="hint">
          After a text reply, a separate pass picks the best-matching sticker
          from your pack. Whether that pass runs is rolled locally from the
          frequency setting.
        </p>
      </div>

      {stickersEnabled ? (
        <>
          <div className="field">
            <label htmlFor="stickerReplyChance">
              Sticker frequency ({stickerReplyChance}%)
            </label>
            <input
              id="stickerReplyChance"
              type="range"
              min={0}
              max={100}
              value={stickerReplyChance}
              onChange={(e) =>
                onStickerReplyChanceChange(Number(e.target.value))
              }
            />
            <p className="hint">
              How often the bot should add a sticker after replying. Higher =
              stickers on most messages.
            </p>
          </div>

          <div className="field">
            <label htmlFor="stickerPackName">Sticker pack name</label>
            <div className="field row">
              <input
                id="stickerPackName"
                className="grow"
                value={stickerPackName}
                onChange={(e) =>
                  onStickerPackNameChange(e.target.value.replace(/^@/, ""))
                }
                placeholder="HotCherry or MyPack_by_botname"
              />
              <button
                type="button"
                className="secondary"
                onClick={onRefreshStickers}
                disabled={
                  stickersLoading || configBlocked || !stickerPackName.trim()
                }
              >
                {stickersLoading ? "Loading…" : "Load pack"}
              </button>
            </div>
            <p className="hint">
              Public set name from Telegram (the part after{" "}
              <code>t.me/addstickers/</code>). Save configuration after
              changing the name, then load the pack to preview stickers.
            </p>
          </div>

          {stickersError != null ? (
            <ErrorBanner
              error={stickersError}
              compact
              onRetry={onRefreshStickers}
              onDismiss={onDismissStickersError}
            />
          ) : null}

          {stickerCatalog?.loaded && stickerCatalog.stickers.length > 0 ? (
            <div className="field">
              <label>
                Stickers in pack ({stickerCatalog.stickers.length})
              </label>
              <p className="hint">
                Emojis are loaded from your sticker pack in Telegram. Reload
                the pack after you change them in @Stickers.
              </p>
              <div className="sticker-preview-grid">
                {stickerCatalog.stickers.map((s) => (
                  <div
                    key={s.index}
                    className="sticker-preview-card"
                    title={`Sticker ${s.index + 1}: ${s.emoji}`}
                  >
                    <span className="sticker-preview-index">
                      #{s.index + 1}
                    </span>
                    <img
                      src={api.stickerPreviewUrl(s.index)}
                      alt={`Sticker ${s.index + 1}`}
                      className="sticker-preview-image"
                      loading="lazy"
                    />
                    <span className="sticker-pack-emoji">{s.emoji}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : stickerCatalog && !stickersLoading ? (
            <p className="hint">
              {stickerCatalog.error
                ? `Could not load pack: ${stickerCatalog.error}`
                : "Load the pack to preview stickers."}
            </p>
          ) : null}

          {!stickerCatalog && !stickersLoading ? (
            <div className="actions compact-actions">
              <button
                type="button"
                className="secondary"
                onClick={onLoadStickers}
                disabled={configBlocked || stickersLoading}
              >
                Check loaded stickers
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
