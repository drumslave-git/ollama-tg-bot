import React from "react";
import { Hint, SectionTitle } from "../ui/Layout";

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
      <SectionTitle className="mt-6">Owner account</SectionTitle>
      <div className="flex flex-col gap-1">
        <label htmlFor="ownerUsername">Telegram username</label>
        <input
          id="ownerUsername"
          type="text"
          value={ownerUsername}
          onChange={(e) => onOwnerUsernameChange(e.target.value.replace(/^@+/, ""))}
          placeholder="username (without @)"
        />
        <Hint>
          The person who runs this bot. Their numeric id is resolved via
          the Telegram API when you save — they must message the bot at
          least once first (e.g. <code className="font-mono text-[0.85em]">/start</code> or{" "}
          <code className="font-mono text-[0.85em]">/id</code>).
          Leave empty to disable.
        </Hint>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ownerUserId">Resolved user id</label>
        <input
          id="ownerUserId"
          className="cursor-default bg-bg font-mono text-muted focus:outline-none"
          type="text"
          readOnly
          tabIndex={-1}
          value={ownerUserId}
          placeholder="Not resolved yet"
        />
        <Hint>Set automatically when you save a username. Read-only.</Hint>
      </div>
    </>
  );
};

export default OwnerSection;
