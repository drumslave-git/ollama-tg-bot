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
import { StickersSettingsSection } from "../components/settings/StickersSettingsSection";
import { VisionBackfillSection } from "../components/settings/VisionBackfillSection";
import { MemoryJobConfigSection } from "../features/memory/MemoryJobConfigSection";
import { Button } from "../components/ui/Button";
import {
  Actions,
  Card,
  FieldError,
  Hint,
  Page,
  PageHeader,
} from "../components/ui/Layout";

export function SettingsPage() {
  const {
    apiOnline,
    settings,
    draft,
    setDraft,
    models,
    contextBudget,
    derivedHistoryLimits,
    sectionErrors,
    setSectionError,
    configBlocked,
    showModelSelection,
    modelOptions,
    embeddingModelOptions,
    embeddingModelsLoading,
    llmConnectionVerified,
    testingLlm,
    modelsLoading,
    saving,
    testLlmConnection,
    fetchModels,
    fetchEmbeddingModels,
    save,
    load,
  } = useDashboard();

  const modelConfigIssues = useMemo(() => {
    if (!draft || !contextBudget) return [];
    return analyzeModelConfig(draft, contextBudget, derivedHistoryLimits ?? undefined).issues;
  }, [draft, contextBudget, derivedHistoryLimits]);
  const modelConfigInvalid = hasModelConfigErrors(modelConfigIssues);

  if (!draft) {
    return (
      <Page>
        <Card>
          {sectionErrors.settings != null ? (
            <ErrorBanner
              error={sectionErrors.settings}
              compact
              onRetry={() => void load()}
            />
          ) : (
            <Hint>No settings loaded.</Hint>
          )}
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Settings"
        description={
          <>
            LLM connection, model, owner account, and performance limits, plus
            stickers, background maintenance, and vision backfill.
          </>
        }
      />

      <Card>
        <fieldset
          disabled={configBlocked}
          className="m-0 min-w-0 border-0 p-0 disabled:pointer-events-none disabled:opacity-55"
        >
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
            embeddingModelOptions={embeddingModelOptions}
            embeddingBaseUrl={draft.embeddingBaseUrl}
            embeddingHostDistinct={draft.embeddingHostDistinct}
            embeddingApiKeyConfigured={draft.embeddingApiKeyConfigured}
            embeddingModelsLoading={embeddingModelsLoading}
            draftModel={draft.model}
            draftEmbeddingModel={draft.embeddingModel}
            sectionErrorLlm={sectionErrors.llm}
            sectionErrorModels={sectionErrors.models}
            sectionErrorEmbedding={sectionErrors.embedding}
            onTestConnection={() => void testLlmConnection()}
            onRefreshModels={() => void fetchModels()}
            onRefreshEmbeddingModels={() => void fetchEmbeddingModels()}
            onModelChange={(model) => setDraft({ ...draft, model })}
            onEmbeddingModelChange={(embeddingModel) =>
              setDraft({ ...draft, embeddingModel })
            }
            onDismissLlmError={() => setSectionError("llm", null)}
            onDismissModelsError={() => setSectionError("models", null)}
            onDismissEmbeddingError={() => setSectionError("embedding", null)}
          />

          <OwnerSection
            ownerUsername={draft.ownerUsername}
            ownerUserId={draft.ownerUserId}
            onOwnerUsernameChange={(ownerUsername) => setDraft({ ...draft, ownerUsername })}
          />

          <BotBehaviorSection
            maintenanceModeEnabled={draft.maintenanceModeEnabled}
            thinkingEnabled={draft.thinkingEnabled}
            reasoningEffort={draft.reasoningEffort}
            onMaintenanceModeChange={(maintenanceModeEnabled) => setDraft({ ...draft, maintenanceModeEnabled })}
            onThinkingEnabledChange={(thinkingEnabled) => setDraft({ ...draft, thinkingEnabled })}
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
            <FieldError>Fix model parameter errors before saving.</FieldError>
          ) : null}

          <Actions>
            <Button
              onClick={() => void save()}
              disabled={
                saving || !draft || configBlocked || modelConfigInvalid
              }
            >
              {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => settings && setDraft(settings)}
              disabled={!settings}
            >
              Reset
            </Button>
          </Actions>
        </fieldset>
      </Card>

      <StickersSettingsSection />
      <MemoryJobConfigSection apiOnline={apiOnline === true} />
      <VisionBackfillSection />
    </Page>
  );
}
