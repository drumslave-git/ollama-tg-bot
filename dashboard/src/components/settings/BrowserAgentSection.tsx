import React from "react";
import { Hint, SectionTitle } from "../ui/Layout";
import { SettingsNumberField } from "../../SettingsNumberField";

export interface BrowserAgentValues {
  browserAgentEnabled: boolean;
  browserAgentMaxSteps: number;
  browserAgentMaxSeconds: number;
  browserAgentConcurrency: number;
  browserDownloadMaxMb: number;
}

interface BrowserAgentSectionProps extends BrowserAgentValues {
  disabled?: boolean;
  onChange: (patch: Partial<BrowserAgentValues>) => void;
}

const checkboxLabelClass =
  "mb-0 flex cursor-pointer items-center gap-2.5 text-[0.95rem] text-text";

const BrowserAgentSection: React.FC<BrowserAgentSectionProps> = ({
  browserAgentEnabled,
  browserAgentMaxSteps,
  browserAgentMaxSeconds,
  browserAgentConcurrency,
  browserDownloadMaxMb,
  disabled,
  onChange,
}) => {
  return (
    <>
      <SectionTitle className="mt-6">Web browsing agent</SectionTitle>
      <div className="flex flex-col gap-1">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={browserAgentEnabled}
            onChange={(e) => onChange({ browserAgentEnabled: e.target.checked })}
          />
          Enable web browsing agent
        </label>
        <Hint>
          Exposes the <code className="font-mono text-[0.85em]">browser_agent_start</code>{" "}
          tool (owner only). The bot runs a background agent that navigates the web,
          extracts info, and downloads files, then reports back into the chat.
        </Hint>
      </div>

      {browserAgentEnabled && (
        <div className="ml-4 flex flex-col gap-4 border-l border-border pl-4">
          <SettingsNumberField
            id="browserAgentMaxSteps"
            label="Max steps per run"
            value={browserAgentMaxSteps}
            min={1}
            max={50}
            disabled={disabled}
            hint="Browsing actions the agent may take before it must report back."
            onChange={(v) => onChange({ browserAgentMaxSteps: v })}
          />
          <SettingsNumberField
            id="browserAgentMaxSeconds"
            label="Max seconds per run"
            value={browserAgentMaxSeconds}
            min={15}
            max={600}
            disabled={disabled}
            hint="Wall-clock time limit for one browsing run."
            onChange={(v) => onChange({ browserAgentMaxSeconds: v })}
          />
          <SettingsNumberField
            id="browserAgentConcurrency"
            label="Concurrent runs"
            value={browserAgentConcurrency}
            min={1}
            max={4}
            disabled={disabled}
            hint="How many browsing runs may execute at the same time."
            onChange={(v) => onChange({ browserAgentConcurrency: v })}
          />
          <SettingsNumberField
            id="browserDownloadMaxMb"
            label="Inline download limit (MB)"
            value={browserDownloadMaxMb}
            min={1}
            max={50}
            disabled={disabled}
            hint="Files up to this size are sent to the chat; larger ones are stored and linked."
            onChange={(v) => onChange({ browserDownloadMaxMb: v })}
          />
        </div>
      )}
    </>
  );
};

export default BrowserAgentSection;
