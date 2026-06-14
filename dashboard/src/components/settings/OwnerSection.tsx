import React from "react";

interface OwnerSectionProps {
  ownerUsername: string;
  ownerUserId: string;
  onOwnerUsernameChange: (value: string) => void;
}

const OwnerSection: React.FC<OwnerSectionProps> = ({
  ownerUsername,
  ownerUserId,
  onOwnerUsernameChange,
}) => {
  return (
    <>
      <h3 className="section-title">Owner account</h3>
      <div className="field">
        <label htmlFor="ownerUsername">Telegram username</label>
        <input
          id="ownerUsername"
          type="text"
          value={ownerUsername}
          onChange={(e) => onOwnerUsernameChange(e.target.value.replace(/^@+/, ""))}
          placeholder="username (without @)"
        />
        <p className="hint">
          The person who runs this bot. Their numeric id is resolved via
          the Telegram API when you save — they must message the bot at
          least once first (e.g. <code>/start</code> or <code>/id</code>).
          Leave empty to disable.
        </p>
      </div>
      <div className="field">
        <label htmlFor="ownerUserId">Resolved user id</label>
        <input
          id="ownerUserId"
          className="input-readonly"
          type="text"
          readOnly
          tabIndex={-1}
          value={ownerUserId}
          placeholder="Not resolved yet"
        />
        <p className="hint">
          Set automatically when you save a username. Read-only.
        </p>
      </div>
    </>
  );
};

export default OwnerSection;
