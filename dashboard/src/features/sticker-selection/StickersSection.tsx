import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import { api, type StickerCatalog } from "@llm-tg-bot/dashboard/api";

interface StickersSectionProps {
  stickerReplyChance: number;
  stickerPackName: string;
  stickersLoading: boolean;
  configBlocked: boolean;
  stickersError: string | null;
  stickerCatalog: StickerCatalog | null;
  onStickerReplyChanceChange: (value: number) => void;
  onStickerPackNameChange: (value: string) => void;
  onRefreshStickers: () => void;
  onLoadStickers: () => void;
  onDismissStickersError: () => void;
}

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function StickersSection({
  stickerReplyChance,
  stickerPackName,
  stickersLoading,
  configBlocked,
  stickersError,
  stickerCatalog,
  onStickerReplyChanceChange,
  onStickerPackNameChange,
  onRefreshStickers,
  onLoadStickers,
  onDismissStickersError,
}: StickersSectionProps) {
  return (
    <>
      <p className="mb-4 mt-1.5 text-xs text-muted">
        After a text reply, a separate pass picks the best-matching sticker from
        the loaded pack. Whether that pass runs is rolled locally from the
        frequency setting. Leave the pack name empty to send no stickers.
      </p>

      <div className="mb-4">
        <label htmlFor="stickerReplyChance">
          Sticker frequency ({stickerReplyChance}%)
        </label>
        <input
          id="stickerReplyChance"
          type="range"
          min={0}
          max={100}
          value={stickerReplyChance}
          onChange={(e) => onStickerReplyChanceChange(Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-muted">
          How often the bot should add a sticker after replying. Higher =
          stickers on most messages.
        </p>
      </div>

      <div className="mb-4">
        <label htmlFor="stickerPackName">Sticker pack name</label>
        <div className="flex items-end gap-3">
          <input
            id="stickerPackName"
            className="min-w-0 flex-1"
            value={stickerPackName}
            onChange={(e) =>
              onStickerPackNameChange(e.target.value.replace(/^@/, ""))
            }
            placeholder="HotCherry or MyPack_by_botname"
          />
          <button
            type="button"
            className={secondaryBtn}
            onClick={onRefreshStickers}
            disabled={
              stickersLoading || configBlocked || !stickerPackName.trim()
            }
          >
            {stickersLoading ? "Loading…" : "Load pack"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Public set name from Telegram (the part after{" "}
          <code className="font-mono text-[0.85em]">t.me/addstickers/</code>).
          Save configuration after changing the name, then load the pack to
          preview stickers.
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
        <div className="mb-4">
          <label>Stickers in pack ({stickerCatalog.stickers.length})</label>
          <p className="mt-1.5 text-xs text-muted">
            Emojis are loaded from your sticker pack in Telegram. Reload the pack
            after you change them in @Stickers.
          </p>
          <div className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5 sm:gap-3">
            {stickerCatalog.stickers.map((s) => (
              <div
                key={s.index}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface-2 p-2"
                title={`Sticker ${s.index + 1}: ${s.emoji}`}
              >
                <span className="text-xs font-semibold text-muted">
                  #{s.index + 1}
                </span>
                <img
                  src={api.stickerPreviewUrl(s.index)}
                  alt={`Sticker ${s.index + 1}`}
                  className="h-16 w-16 object-contain"
                  loading="lazy"
                />
                <span className="text-2xl leading-none">{s.emoji}</span>
              </div>
            ))}
          </div>
        </div>
      ) : stickerCatalog && !stickersLoading ? (
        <p className="mt-1.5 text-xs text-muted">
          {stickerCatalog.error
            ? `Could not load pack: ${stickerCatalog.error}`
            : "Load the pack to preview stickers."}
        </p>
      ) : null}

      {!stickerCatalog && !stickersLoading ? (
        <div className="mb-2 mt-0 flex flex-wrap gap-3">
          <button
            type="button"
            className={secondaryBtn}
            onClick={onLoadStickers}
            disabled={configBlocked || stickersLoading}
          >
            Check loaded stickers
          </button>
        </div>
      ) : null}
    </>
  );
}
