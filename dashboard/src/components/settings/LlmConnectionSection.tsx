import React from "react";
import { ErrorBanner } from "../ErrorBanner";

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
      <h3 className="section-title">LLM connection</h3>
      <div className="field">
        <label>OpenAI-compatible API base URL</label>
        <p className="hint">
          Set <code>LLM_BASE_URL</code> in <code>.env</code> and restart the
          server.
        </p>
        <p className="mono">{llmBaseUrl || "(not configured)"}</p>
        <p className="hint">
          {llmApiKeyConfigured
            ? "API key configured via LLM_API_KEY."
            : "No LLM_API_KEY set (local servers usually skip this)."}
        </p>
        <div className="field row">
          <button
            type="button"
            className="secondary"
            onClick={onTestConnection}
            disabled={testingLlm || modelsLoading || configBlocked || !llmBaseUrl}
          >
            {testingLlm ? "Testing…" : "Test connection"}
          </button>
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
          <p className="hint success-inline">
            Connected to LLM at {llmBaseUrl}
          </p>
        ) : llmBaseUrl ? (
          <p className="hint">
            Test the connection before choosing a model.
          </p>
        ) : null}
      </div>

      {showModelSelection ? (
        <>
          <div className="field row">
            <div className="grow">
              <label htmlFor="model">
                Model
                {models.length > 0 && (
                  <span className="label-meta">
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
            <button
              type="button"
              className="secondary"
              onClick={onRefreshModels}
              disabled={modelsLoading || configBlocked}
              title="Fetch models from /v1/models"
            >
              {modelsLoading ? "…" : "Refresh"}
            </button>
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
              <p className="hint warn">
                No models returned by this API base URL.
              </p>
            )}

          <p className="hint">
            Use a vision model (e.g. llava) for images and stickers.
          </p>
        </>
      ) : null}
    </>
  );
};

export default LlmConnectionSection;
