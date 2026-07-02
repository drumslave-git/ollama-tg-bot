import React from "react";
import { ErrorBanner } from "../ErrorBanner";
import { Button } from "../ui/Button";
import { Hint, SectionTitle } from "../ui/Layout";

interface LlmConnectionSectionProps {
  llmBaseUrl: string;
  llmApiKeyConfigured: boolean;
  llmConnectionVerified: boolean;
  testingLlm: boolean;
  modelsLoading: boolean;
  configBlocked: boolean;
  showModelSelection: boolean;
  models: any[];
  modelOptions: { value: string; label: string }[];
  embeddingModelOptions: { value: string; label: string }[];
  embeddingBaseUrl: string;
  embeddingHostDistinct: boolean;
  embeddingApiKeyConfigured: boolean;
  embeddingModelsLoading: boolean;
  draftModel: string;
  draftEmbeddingModel: string;
  sectionErrorLlm: any;
  sectionErrorModels: any;
  sectionErrorEmbedding: any;
  onTestConnection: () => void;
  onRefreshModels: () => void;
  onRefreshEmbeddingModels: () => void;
  onModelChange: (value: string) => void;
  onEmbeddingModelChange: (value: string) => void;
  onDismissLlmError: () => void;
  onDismissModelsError: () => void;
  onDismissEmbeddingError: () => void;
}

const LlmConnectionSection: React.FC<LlmConnectionSectionProps> = ({
  llmBaseUrl,
  llmApiKeyConfigured,
  llmConnectionVerified,
  testingLlm,
  modelsLoading,
  configBlocked,
  showModelSelection,
  models,
  modelOptions,
  embeddingModelOptions,
  embeddingBaseUrl,
  embeddingHostDistinct,
  embeddingApiKeyConfigured,
  embeddingModelsLoading,
  draftModel,
  draftEmbeddingModel,
  sectionErrorLlm,
  sectionErrorModels,
  sectionErrorEmbedding,
  onTestConnection,
  onRefreshModels,
  onRefreshEmbeddingModels,
  onModelChange,
  onEmbeddingModelChange,
  onDismissLlmError,
  onDismissModelsError,
  onDismissEmbeddingError,
}) => {
  return (
    <>
      <SectionTitle className="mt-0">LLM connection</SectionTitle>
      <div className="flex flex-col gap-1">
        <label>OpenAI-compatible API base URL</label>
        <Hint>
          Set <code className="font-mono text-[0.85em]">LLM_BASE_URL</code> in{" "}
          <code className="font-mono text-[0.85em]">.env</code> and restart the
          server.
        </Hint>
        <p className="m-0 font-mono text-sm">{llmBaseUrl || "(not configured)"}</p>
        <Hint>
          {llmApiKeyConfigured
            ? "API key configured via LLM_API_KEY."
            : "No LLM_API_KEY set (local servers usually skip this)."}
        </Hint>
        <div className="flex items-end gap-3">
          <Button
            variant="secondary"
            onClick={onTestConnection}
            disabled={testingLlm || modelsLoading || configBlocked || !llmBaseUrl}
          >
            {testingLlm ? "Testing…" : "Test connection"}
          </Button>
        </div>
        {sectionErrorLlm != null ? (
          <ErrorBanner
            error={sectionErrorLlm}
            compact
            onRetry={onTestConnection}
            onDismiss={onDismissLlmError}
          />
        ) : null}
        {llmConnectionVerified ? (
          <Hint variant="success" className="mt-2">
            Connected to LLM at {llmBaseUrl}
          </Hint>
        ) : llmBaseUrl ? (
          <Hint>Test the connection before choosing a model.</Hint>
        ) : null}
      </div>

      {showModelSelection ? (
        <>
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="model">
                Model
                {models.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    {models.length} pulled locally
                  </span>
                )}
              </label>
              <select
                id="model"
                value={
                  modelOptions.some((o) => o.value === draftModel)
                    ? draftModel
                    : (modelOptions[0]?.value ?? "")
                }
                onChange={(e) => onModelChange(e.target.value)}
                disabled={modelsLoading}
              >
                {modelOptions.length === 0 ? (
                  <option value="" disabled>
                    {modelsLoading ? "Loading models…" : "No models found"}
                  </option>
                ) : (
                  modelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            <Button
              variant="secondary"
              onClick={onRefreshModels}
              disabled={modelsLoading || configBlocked}
              title="Fetch models from /v1/models"
            >
              {modelsLoading ? "…" : "Refresh"}
            </Button>
          </div>

          {sectionErrorModels != null ? (
            <ErrorBanner
              error={sectionErrorModels}
              compact
              onRetry={onRefreshModels}
              onDismiss={onDismissModelsError}
            />
          ) : null}

          {!modelsLoading &&
            models.length === 0 &&
            sectionErrorModels == null && (
              <Hint variant="warn">
                No models returned by this API base URL.
              </Hint>
            )}

          <Hint>
            Use a vision model (e.g. llava) for images and stickers.
          </Hint>

          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="embeddingModel">Embedding model</label>
              <select
                id="embeddingModel"
                value={
                  embeddingModelOptions.some(
                    (o) => o.value === draftEmbeddingModel,
                  )
                    ? draftEmbeddingModel
                    : ""
                }
                onChange={(e) => onEmbeddingModelChange(e.target.value)}
                disabled={modelsLoading || embeddingModelsLoading}
              >
                {embeddingModelOptions.some(
                  (o) => o.value === draftEmbeddingModel,
                ) ? null : (
                  <option value="" disabled>
                    {draftEmbeddingModel
                      ? `${draftEmbeddingModel} (not available on this host)`
                      : "Select an embedding model"}
                  </option>
                )}
                {embeddingModelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {embeddingHostDistinct ? (
              <Button
                variant="secondary"
                onClick={onRefreshEmbeddingModels}
                disabled={embeddingModelsLoading || configBlocked}
                title="Fetch models from the embedding host"
              >
                {embeddingModelsLoading ? "…" : "Refresh"}
              </Button>
            ) : null}
          </div>

          {embeddingHostDistinct ? (
            <Hint>
              Embedding host:{" "}
              <code className="font-mono text-[0.85em]">{embeddingBaseUrl}</code>{" "}
              (from <code className="font-mono text-[0.85em]">EMBEDDING_BASE_URL</code>).{" "}
              {embeddingApiKeyConfigured
                ? "API key configured."
                : "No embedding API key set."}
            </Hint>
          ) : null}

          {sectionErrorEmbedding != null ? (
            <ErrorBanner
              error={sectionErrorEmbedding}
              compact
              onRetry={onRefreshEmbeddingModels}
              onDismiss={onDismissEmbeddingError}
            />
          ) : null}

          <Hint>
            Used to embed daily history summaries for semantic recall (e.g.
            bge-m3). Changing to a model with a different vector dimension
            requires recreating the summaries table.
          </Hint>
        </>
      ) : null}
    </>
  );
};

export default LlmConnectionSection;
