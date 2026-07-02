import React from "react";
import { Hint, SectionTitle } from "../ui/Layout";

interface BotBehaviorSectionProps {
  maintenanceModeEnabled: boolean;
  thinkingEnabled: boolean;
  reasoningEffort: "none" | "low" | "medium" | "high" | "max";
  onMaintenanceModeChange: (value: boolean) => void;
  onThinkingEnabledChange: (value: boolean) => void;
  onReasoningEffortChange: (
    value: "none" | "low" | "medium" | "high" | "max",
  ) => void;
}

const checkboxLabelClass =
  "mb-0 flex cursor-pointer items-center gap-2.5 text-[0.95rem] text-text";

const BotBehaviorSection: React.FC<BotBehaviorSectionProps> = ({
  maintenanceModeEnabled,
  thinkingEnabled,
  reasoningEffort,
  onMaintenanceModeChange,
  onThinkingEnabledChange,
  onReasoningEffortChange,
}) => {
  return (
    <>
      <SectionTitle className="mt-6">Bot behavior</SectionTitle>
      <div className="flex flex-col gap-1">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={thinkingEnabled}
            onChange={(e) => onThinkingEnabledChange(e.target.checked)}
          />
          Enable thinking
        </label>
        <Hint>
          Requests separate model reasoning when the backend supports{" "}
          <code className="font-mono text-[0.85em]">reasoning_effort</code>.
        </Hint>
      </div>

      {thinkingEnabled && (
        <div className="ml-4 flex flex-col gap-1 border-l border-border pl-4">
          <label htmlFor="reasoningEffort">Reasoning effort</label>
          <select
            id="reasoningEffort"
            value={reasoningEffort}
            onChange={(e) =>
              onReasoningEffortChange(
                e.target.value as "none" | "low" | "medium" | "high" | "max",
              )
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="max">Max</option>
          </select>
          <Hint>
            Controls how much computation the model spends on reasoning.
          </Hint>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={maintenanceModeEnabled}
            onChange={(e) => onMaintenanceModeChange(e.target.checked)}
          />
          Maintenance mode
        </label>
        <Hint>
          When enabled, only the owner can trigger LLM-backed behavior. In
          groups, the owner must also @mention the bot (e.g.{" "}
          <code className="font-mono text-[0.85em]">@your_bot hello</code>).
          Other users are ignored silently.
        </Hint>
      </div>
    </>
  );
};

export default BotBehaviorSection;
