import React from "react";

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
      <h3 className="section-title">Bot behavior</h3>
      <div className="field toggle-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={thinkingEnabled}
            onChange={(e) => onThinkingEnabledChange(e.target.checked)}
          />
          Enable thinking
        </label>
        <p className="hint">
          Requests separate model reasoning when the backend supports{" "}
          <code>reasoning_effort</code>.
        </p>
      </div>

      {thinkingEnabled && (
        <>
          <div className="field toggle-row nested">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={sendThinkingEnabled}
                onChange={(e) => onSendThinkingEnabledChange(e.target.checked)}
              />
              Send reasoning to Telegram
            </label>
            <p className="hint">
              Post reasoning as a separate message before the reply.
            </p>
          </div>

          <div className="field nested">
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
            <p className="hint">
              Controls how much computation the model spends on reasoning.
            </p>
          </div>
        </>
      )}

      <div className="field toggle-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={maintenanceModeEnabled}
            onChange={(e) => onMaintenanceModeChange(e.target.checked)}
          />
          Maintenance mode
        </label>
        <p className="hint">
          When enabled, only the owner can trigger LLM-backed behavior. In
          groups, the owner must also @mention the bot (e.g.{" "}
          <code>@your_bot hello</code>). Other users are ignored silently.
        </p>
      </div>

      <div className="field toggle-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={randomReplyEnabled}
            onChange={(e) => onRandomReplyEnabledChange(e.target.checked)}
          />
          Random replies in group chats
        </label>
      </div>

      {randomReplyEnabled && (
        <div className="field">
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

      <div className="field toggle-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={reactToEveryImage}
            onChange={(e) => onReactToEveryImageChange(e.target.checked)}
          />
          React to every image
        </label>
        <p className="hint">
          In group chats, comment on photos and image files even when
          they are not addressed to the bot (requires a vision model).
        </p>
      </div>
    </>
  );
};

export default BotBehaviorSection;
