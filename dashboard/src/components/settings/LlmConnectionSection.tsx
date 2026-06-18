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
  draftModel: string;
  sectionErrorLlm: any;
  sectionErrorModels: any;
  onTestConnection: () => void;
  onRefreshModels: () => void;
  onModelChange: (value: string) => void;
  onDismissLlmError: () => void;
  onDismissModelsError: () => void;
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
  draftModel,
  sectionErrorLlm,
  sectionErrorModels,
  onTestConnection,
  onRefreshModels,
  onModelChange,
  onDismissLlmError,
  onDismissModelsError,
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
        </>
      ) : null}
    </>
  );
};

export default LlmConnectionSection;
