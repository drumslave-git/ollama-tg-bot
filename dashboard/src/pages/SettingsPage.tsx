import { useMemo } from "react";
import { useDashboard } from "../context/DashboardContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { ModelConfigPanel } from "../components/ModelConfigPanel";
import {
  analyzeModelConfig,
  hasModelConfigErrors,
} from "../modelConfig";
import LlmConnectionSection from "../components/settings/LlmConnectionSection";
import OwnerSection from "../components/settings/OwnerSection";
import BotBehaviorSection from "../components/settings/BotBehaviorSection";
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
    llmConnectionVerified,
    testingLlm,
    modelsLoading,
    saving,
    testLlmConnection,
    fetchModels,
    save,
    load,
  } = useDashboard();

  const modelConfigIssues = useMemo(() => {
    if (!draft || !contextBudget) return [];
    return analyzeModelConfig(draft, contextBudget, derivedHistoryLimits ?? undefined).issues;
  }, [draft, contextBudget, derivedHistoryLimits]);
  const modelConfigInvalid =
    vramAvailableGb == null || hasModelConfigErrors(modelConfigIssues);

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
          LLM connection, model, owner account, and performance limits. Module
          features (memory, mood, stickers, etc.) are configured under Modules.
        </p>
      </header>

      <section className="card">
        <fieldset disabled={configBlocked} className="form-fieldset">
          <LlmConnectionSection
            llmBaseUrl={draft.llmBaseUrl}
            llmApiKeyConfigured={draft.llmApiKeyConfigured}
            llmConnectionVerified={llmConnectionVerified}
            testingLlm={testingLlm}
            modelsLoading={modelsLoading}
            configBlocked={configBlocked}
            showModelSelection={showModelSelection}
            models={models}
            modelOptions={modelOptions}
            draftModel={draft.model}
            sectionErrorLlm={sectionErrors.llm}
            sectionErrorModels={sectionErrors.models}
            onTestConnection={() => void testLlmConnection()}
            onRefreshModels={() => void fetchModels()}
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
