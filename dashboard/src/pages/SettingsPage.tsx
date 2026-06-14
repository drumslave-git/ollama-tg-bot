import { useMemo, useState } from "react";
import { useDashboard } from "../context/DashboardContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { ModelConfigPanel } from "../components/ModelConfigPanel";
import {
  analyzeModelConfig,
  hasModelConfigErrors,
} from "../modelConfig";
import { api, type StickerCatalog } from "../api";
import LlmConnectionSection from "../components/settings/LlmConnectionSection";
import OwnerSection from "../components/settings/OwnerSection";
import BotBehaviorSection from "../components/settings/BotBehaviorSection";
import StickersSection from "../components/settings/StickersSection";
import VisionSection from "../components/settings/VisionSection";

export function SettingsPage() {
  const {
    settings,
    draft,
    setDraft,
    models,
    vramAvailableGb,
    contextBudget,
    derivedHistoryLimits,
    sectionErrors,
    setSectionError,
    configBlocked,
    showModelSelection,
    modelOptions,
    verifiedApiBaseUrl,
    testingLlm,
    modelsLoading,
    saving,
    testLlmConnection,
    invalidateLlmVerification,
    fetchModelsForHost,
    save,
    load,
  } = useDashboard();

  const modelConfigIssues = useMemo(() => {
    if (!draft || !contextBudget) return [];
    return analyzeModelConfig(draft, contextBudget, derivedHistoryLimits ?? undefined).issues;
  }, [draft, contextBudget, derivedHistoryLimits]);
  const modelConfigInvalid =
    vramAvailableGb == null || hasModelConfigErrors(modelConfigIssues);

  const [stickerCatalog, setStickerCatalog] = useState<StickerCatalog | null>(
    null,
  );
  const [stickersLoading, setStickersLoading] = useState(false);
  const [stickersError, setStickersError] = useState<unknown | null>(null);

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

  if (!draft) {
    return (
      <div className="page">
        <section className="card">
          {sectionErrors.settings != null ? (
            <ErrorBanner
              error={sectionErrors.settings}
              compact
              onRetry={() => void load()}
            />
          ) : (
            <p className="hint">No settings loaded.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Settings</h2>
        <p className="page-desc">
          LLM connection, model, owner account, and performance limits.
        </p>
      </header>

      <section className="card">
        <fieldset disabled={configBlocked} className="form-fieldset">
          <LlmConnectionSection
            apiBaseUrl={draft.apiBaseUrl}
            verifiedApiBaseUrl={verifiedApiBaseUrl}
            testingLlm={testingLlm}
            modelsLoading={modelsLoading}
            configBlocked={configBlocked}
            showModelSelection={showModelSelection}
            models={models}
            modelOptions={modelOptions}
            draftModel={draft.model}
            sectionErrorLlm={sectionErrors.llm}
            sectionErrorModels={sectionErrors.models}
            onApiBaseUrlChange={(apiBaseUrl) => {
              invalidateLlmVerification(apiBaseUrl);
              setDraft({ ...draft, apiBaseUrl });
            }}
            onTestConnection={() => void testLlmConnection()}
            onRefreshModels={() => verifiedApiBaseUrl && void fetchModelsForHost(verifiedApiBaseUrl)}
            onModelChange={(model) => setDraft({ ...draft, model })}
            onDismissLlmError={() => setSectionError("llm", null)}
            onDismissModelsError={() => setSectionError("models", null)}
          />

          <OwnerSection
            ownerUsername={draft.ownerUsername}
            ownerUserId={draft.ownerUserId}
            onOwnerUsernameChange={(ownerUsername) => setDraft({ ...draft, ownerUsername })}
          />

          <BotBehaviorSection
            maintenanceModeEnabled={draft.maintenanceModeEnabled}
            randomReplyEnabled={draft.randomReplyEnabled}
            randomReplyChance={draft.randomReplyChance}
            reactToEveryImage={draft.reactToEveryImage}
            thinkingEnabled={draft.thinkingEnabled}
            sendThinkingEnabled={draft.sendThinkingEnabled}
            reasoningEffort={draft.reasoningEffort}
            onMaintenanceModeChange={(maintenanceModeEnabled) => setDraft({ ...draft, maintenanceModeEnabled })}
            onRandomReplyEnabledChange={(randomReplyEnabled) => setDraft({ ...draft, randomReplyEnabled })}
            onRandomReplyChanceChange={(randomReplyChance) => setDraft({ ...draft, randomReplyChance })}
            onReactToEveryImageChange={(reactToEveryImage) => setDraft({ ...draft, reactToEveryImage })}
            onThinkingEnabledChange={(thinkingEnabled) => setDraft({ ...draft, thinkingEnabled, sendThinkingEnabled: thinkingEnabled ? draft.sendThinkingEnabled : false })}
            onSendThinkingEnabledChange={(sendThinkingEnabled) => setDraft({ ...draft, sendThinkingEnabled })}
            onReasoningEffortChange={(reasoningEffort) => setDraft({ ...draft, reasoningEffort })}
          />

          <StickersSection
            stickersEnabled={draft.stickersEnabled}
            stickerReplyChance={draft.stickerReplyChance}
            stickerPackName={draft.stickerPackName}
            stickersLoading={stickersLoading}
            configBlocked={configBlocked}
            stickersError={stickersError == null ? null : String(stickersError)}
            stickerCatalog={stickerCatalog}
            onStickersEnabledChange={(stickersEnabled) => setDraft({ ...draft, stickersEnabled })}
            onStickerReplyChanceChange={(stickerReplyChance) => setDraft({ ...draft, stickerReplyChance })}
            onStickerPackNameChange={(stickerPackName) => setDraft({ ...draft, stickerPackName })}
            onRefreshStickers={() => void refreshStickers()}
            onLoadStickers={() => void loadStickers()}
            onDismissStickersError={() => setStickersError(null)}
          />

          <ModelConfigPanel
            draft={draft}
            disabled={configBlocked}
            onChange={(next) => setDraft(next)}
          />

          <VisionSection
            visionMaxDimension={draft.visionMaxDimension}
            configBlocked={configBlocked}
            onVisionMaxDimensionChange={(visionMaxDimension) => setDraft({ ...draft, visionMaxDimension })}
          />

          {sectionErrors.save != null ? (
            <ErrorBanner
              error={sectionErrors.save}
              compact
              onDismiss={() => setSectionError("save", null)}
            />
          ) : null}

          {modelConfigInvalid ? (
            <p className="field-error model-config-save-block">
              {vramAvailableGb == null
                ? "VRAM_AVAILABLE must be set on the server before saving model settings."
                : "Fix model parameter errors before saving."}
            </p>
          ) : null}

          <div className="actions">
            <button
              type="button"
              onClick={() => void save()}
              disabled={
                saving || !draft || configBlocked || modelConfigInvalid
              }
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => settings && setDraft(settings)}
              disabled={!settings}
            >
              Reset
            </button>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
