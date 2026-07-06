import React from "react";
import { Hint, SectionTitle } from "../ui/Layout";
import { SettingsNumberField } from "../../SettingsNumberField";

export interface BrowserAgentValues {
  browserAgentConcurrency: number;
  browserDownloadMaxMb: number;
}

interface BrowserAgentSectionProps extends BrowserAgentValues {
  disabled?: boolean;
  onChange: (patch: Partial<BrowserAgentValues>) => void;
}

const BrowserAgentSection: React.FC<BrowserAgentSectionProps> = ({
  browserAgentConcurrency,
  browserDownloadMaxMb,
  disabled,
  onChange,
}) => {
  return (
    <>
      <SectionTitle className="mt-6">Web browsing agent</SectionTitle>
      <Hint>
        The bot runs a background agent (owner only, via the{" "}
        <code className="font-mono text-[0.85em]">browse_web</code> tool)
        that navigates the web, extracts info, and downloads files, then reports
        back into the chat. It runs each goal to completion — there is no step or
        time limit; a run stops on its own or when it detects it is looping.
      </Hint>

      <div className="ml-4 flex flex-col gap-4 border-l border-border pl-4">
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
    </>
  );
};

export default BrowserAgentSection;
