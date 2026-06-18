import React from "react";
import { Hint, SectionTitle } from "../ui/Layout";

interface BotBehaviorSectionProps {
  maintenanceModeEnabled: boolean;
  randomReplyEnabled: boolean;
  randomReplyChance: number;
  reactToEveryImage: boolean;
  thinkingEnabled: boolean;
  sendThinkingEnabled: boolean;
  reasoningEffort: "none" | "low" | "medium" | "high";
  onMaintenanceModeChange: (value: boolean) => void;
  onRandomReplyEnabledChange: (value: boolean) => void;
  onRandomReplyChanceChange: (value: number) => void;
  onReactToEveryImageChange: (value: boolean) => void;
  onThinkingEnabledChange: (value: boolean) => void;
  onSendThinkingEnabledChange: (value: boolean) => void;
  onReasoningEffortChange: (value: "none" | "low" | "medium" | "high") => void;
}

const checkboxLabelClass =
  "mb-0 flex cursor-pointer items-center gap-2.5 text-[0.95rem] text-text";

const BotBehaviorSection: React.FC<BotBehaviorSectionProps> = ({
  maintenanceModeEnabled,
  randomReplyEnabled,
  randomReplyChance,
  reactToEveryImage,
  thinkingEnabled,
  sendThinkingEnabled,
  reasoningEffort,
  onMaintenanceModeChange,
  onRandomReplyEnabledChange,
  onRandomReplyChanceChange,
  onReactToEveryImageChange,
  onThinkingEnabledChange,
  onSendThinkingEnabledChange,
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
        <>
          <div className="ml-4 flex flex-col gap-1 border-l border-border pl-4">
            <label className={checkboxLabelClass}>
              <input
                type="checkbox"
                checked={sendThinkingEnabled}
                onChange={(e) => onSendThinkingEnabledChange(e.target.checked)}
              />
              Send reasoning to Telegram
            </label>
            <Hint>
              Post reasoning as a separate message before the reply.
            </Hint>
          </div>

          <div className="ml-4 flex flex-col gap-1 border-l border-border pl-4">
            <label htmlFor="reasoningEffort">Reasoning effort</label>
            <select
              id="reasoningEffort"
              value={reasoningEffort}
              onChange={(e) =>
                onReasoningEffortChange(
                  e.target.value as "none" | "low" | "medium" | "high",
                )
              }
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <Hint>
              Controls how much computation the model spends on reasoning.
            </Hint>
          </div>
        </>
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

      <div className="flex flex-col gap-1">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={randomReplyEnabled}
            onChange={(e) => onRandomReplyEnabledChange(e.target.checked)}
          />
          Random replies in group chats
        </label>
      </div>

      {randomReplyEnabled && (
        <div className="flex flex-col gap-1">
          <label htmlFor="chance">
            Random reply chance ({randomReplyChance}%)
          </label>
          <input
            id="chance"
            type="range"
            min={0}
            max={100}
            value={randomReplyChance}
            onChange={(e) => onRandomReplyChanceChange(Number(e.target.value))}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={reactToEveryImage}
            onChange={(e) => onReactToEveryImageChange(e.target.checked)}
          />
          React to every image
        </label>
        <Hint>
          In group chats, comment on photos and image files even when
          they are not addressed to the bot (requires a vision model).
        </Hint>
      </div>
    </>
  );
};

export default BotBehaviorSection;
