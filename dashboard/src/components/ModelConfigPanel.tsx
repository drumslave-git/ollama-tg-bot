import { useMemo, useState } from "react";
import type { ContextBudget, Settings } from "../api";
import { useDashboard } from "../context/DashboardContext";
import { SettingsNumberField } from "../SettingsNumberField";
import {
  MODEL_CONFIG_GROUPS,
  analyzeModelConfig,
  applyModelConfigUpdate,
  issuesForField,
  numPredictHint,
  type ModelConfigIssue,
} from "../modelConfig";
import { MAX_NUM_CTX, MIN_NUM_CTX, NUM_CTX_STEP } from "../tokenBudget";
import { Hint, SectionTitle } from "./ui/Layout";

interface ModelConfigPanelProps {
  draft: Settings;
  disabled?: boolean;
  onChange: (settings: Settings) => void;
}

function limiterLabel(limitedBy: ContextBudget["limitedBy"]): string {
  switch (limitedBy) {
    case "manual":
      return "Your configured value";
    case "model_max":
      return "Capped to model maximum";
    case "generation_floor":
      return "Raised to fit generation budget";
    case "min_floor":
      return "Minimum context floor";
  }
}

const metaGridClass =
  "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-4 gap-y-2";

export function ModelConfigPanel({
  draft,
  disabled,
  onChange,
}: ModelConfigPanelProps) {
  const { contextBudget, derivedHistoryLimits, budgetLoading } = useDashboard();

  const analysis = useMemo(
    () =>
      contextBudget
        ? analyzeModelConfig(draft, contextBudget, derivedHistoryLimits ?? undefined)
        : null,
    [draft, contextBudget, derivedHistoryLimits],
  );
  const [rejectFlash, setRejectFlash] = useState<ModelConfigIssue | null>(null);

  function update(patch: Parameters<typeof applyModelConfigUpdate>[2]) {
    if (!contextBudget) return;
    const result = applyModelConfigUpdate(draft, contextBudget, patch);
    if (!result.ok) {
      setRejectFlash(result.issue);
      return;
    }
    setRejectFlash(null);
    onChange(result.settings);
  }

  if (!contextBudget || !analysis) {
    return (
      <div className="flex flex-col gap-1">
        <SectionTitle className="mt-6">Model parameters</SectionTitle>
        <Hint>
          {budgetLoading
            ? "Computing context budget…"
            : draft.model
              ? "Could not compute context budget. Check the selected model and try refreshing."
              : "Select a model to see context budget."}
        </Hint>
      </div>
    );
  }

  const predictIssues = issuesForField(analysis.issues, "numPredict");
  const numPredictError =
    rejectFlash?.field === "numPredict"
      ? rejectFlash.message
      : predictIssues[0]?.message;

  return (
    <div className="flex flex-col gap-1">
      <header className="mb-2">
        <SectionTitle className="mt-6">Model parameters</SectionTitle>
        <Hint className="mb-3">
          Set the context window manually. It is capped to the model&apos;s
          native maximum at request time. Adjust generation budget, thinking, and
          sampling below.
        </Hint>
      </header>

      <section
        className="mt-4 border-t border-border pt-4"
        aria-labelledby="model-ctx"
      >
        <h4 id="model-ctx" className="m-0 mb-1.5 text-sm font-semibold">
          {MODEL_CONFIG_GROUPS[0].title}
        </h4>
        <Hint className="mb-3">{MODEL_CONFIG_GROUPS[0].description}</Hint>
        <SettingsNumberField
          id="numCtx"
          label="Context window (tokens)"
          value={draft.numCtx}
          min={MIN_NUM_CTX}
          max={
            contextBudget.modelMaxCtx != null
              ? Math.min(MAX_NUM_CTX, contextBudget.modelMaxCtx)
              : MAX_NUM_CTX
          }
          step={NUM_CTX_STEP}
          variant="slider"
          disabled={disabled}
          hint="Total tokens the model holds per request (prompt + reply)."
          onChange={(numCtx) => update({ numCtx })}
        />
        <div className="mt-3 rounded-lg border border-border bg-surface-2 px-4 py-3.5">
          <dl className={metaGridClass}>
            <div className="flex flex-col gap-0.5">
              <dt className="m-0 text-xs uppercase tracking-wide text-muted">
                Effective
              </dt>
              <dd className="m-0 text-sm">
                {contextBudget.effectiveNumCtx.toLocaleString()} tokens
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="m-0 text-xs uppercase tracking-wide text-muted">
                Model
              </dt>
              <dd className="m-0 text-sm">{contextBudget.modelName || "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="m-0 text-xs uppercase tracking-wide text-muted">
                Model max
              </dt>
              <dd className="m-0 text-sm">
                {contextBudget.modelMaxCtx != null
                  ? `${contextBudget.modelMaxCtx.toLocaleString()} tokens`
                  : "unknown"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="m-0 text-xs uppercase tracking-wide text-muted">
                Effective set by
              </dt>
              <dd className="m-0 text-sm">{limiterLabel(contextBudget.limitedBy)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="m-0 text-xs uppercase tracking-wide text-muted">
                Generation max
              </dt>
              <dd className="m-0 text-sm">
                {analysis.maxNumPredict.toLocaleString()} tokens
              </dd>
            </div>
          </dl>
          {contextBudget.notes.length > 0 ? (
            <ul className="m-0 mt-2 list-disc pl-4 text-sm leading-relaxed text-muted">
              {contextBudget.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section
        className="mt-4 border-t border-border pt-4"
        aria-labelledby="model-gen"
      >
        <h4 id="model-gen" className="m-0 mb-1.5 text-sm font-semibold">
          {MODEL_CONFIG_GROUPS[1].title}
        </h4>
        <Hint className="mb-3">{MODEL_CONFIG_GROUPS[1].description}</Hint>
        <SettingsNumberField
          id="numPredict"
          label="Max generation tokens"
          value={draft.numPredict}
          min={32}
          max={analysis.maxNumPredict}
          step={32}
          variant="slider"
          disabled={disabled}
          error={numPredictError}
          hint={numPredictHint(analysis.maxNumPredict, contextBudget.effectiveNumCtx)}
          onChange={(numPredict) => update({ numPredict })}
        />
      </section>

      <section
        className="mt-4 border-t border-border pt-4"
        aria-labelledby="model-sample"
      >
        <h4 id="model-sample" className="m-0 mb-1.5 text-sm font-semibold">
          {MODEL_CONFIG_GROUPS[2].title}
        </h4>
        <Hint className="mb-3">{MODEL_CONFIG_GROUPS[2].description}</Hint>
        <SettingsNumberField
          id="temperature"
          label="Temperature"
          hint="Randomness for in-character replies and /explain."
          value={draft.temperature}
          min={0}
          max={2}
          step={0.1}
          variant="slider"
          disabled={disabled}
          onChange={(temperature) => update({ temperature })}
        />
        <SettingsNumberField
          id="topP"
          label="Top P (nucleus sampling)"
          hint="Lower = more focused; higher = more varied word choice."
          value={draft.topP}
          min={0.05}
          max={1}
          step={0.05}
          variant="slider"
          disabled={disabled}
          onChange={(topP) => update({ topP })}
        />
        <SettingsNumberField
          id="topK"
          label="Top K"
          hint="Candidate tokens per step. Lower = safer; higher = more diverse."
          value={draft.topK}
          min={1}
          max={200}
          step={1}
          variant="slider"
          disabled={disabled}
          onChange={(topK) => update({ topK })}
        />
        <SettingsNumberField
          id="repeatPenalty"
          label="Repeat penalty"
          hint="Above 1.0 reduces loops; below 1.0 allows more repetition."
          value={draft.repeatPenalty}
          min={0.8}
          max={2}
          step={0.05}
          variant="slider"
          disabled={disabled}
          onChange={(repeatPenalty) => update({ repeatPenalty })}
        />
      </section>

      <section
        className="mt-4 border-t border-border pt-4"
        aria-labelledby="model-timeout"
      >
        <h4 id="model-timeout" className="m-0 mb-1.5 text-sm font-semibold">
          {MODEL_CONFIG_GROUPS[3].title}
        </h4>
        <Hint className="mb-3">{MODEL_CONFIG_GROUPS[3].description}</Hint>
        <SettingsNumberField
          id="chatTimeoutSec"
          label="Timeout (seconds)"
          value={draft.chatTimeoutSec}
          min={30}
          max={600}
          variant="slider"
          disabled={disabled}
          onChange={(chatTimeoutSec) => update({ chatTimeoutSec })}
        />
      </section>

      <aside className="mt-5 rounded-lg border border-border bg-surface-2 px-4 py-3.5">
        <h4 className="m-0 mb-1.5 text-sm font-semibold">Derived reply limits</h4>
        <ul className="m-0 mt-2 list-disc pl-4 text-sm leading-relaxed text-muted">
          <li>
            Reply length guidance:{" "}
            <strong className="text-text">
              {analysis.derived.historyMaxReplyChars.toLocaleString()}
            </strong>{" "}
            chars
          </li>
          <li>
            Generation budget:{" "}
            <strong className="text-text">{analysis.derived.numPredict}</strong>{" "}
            tokens
          </li>
        </ul>
      </aside>
    </div>
  );
}
