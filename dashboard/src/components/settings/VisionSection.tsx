import React from "react";
import { SettingsNumberField } from "../../SettingsNumberField";
import { SectionTitle } from "../ui/Layout";

interface VisionSectionProps {
  visionMaxDimension: number;
  configBlocked: boolean;
  onVisionMaxDimensionChange: (value: number) => void;
}

const VisionSection: React.FC<VisionSectionProps> = ({
  visionMaxDimension,
  configBlocked,
  onVisionMaxDimensionChange,
}) => {
  return (
    <>
      <SectionTitle className="mt-6">Vision</SectionTitle>
      <SettingsNumberField
        id="visionMaxDimension"
        label="Image max edge (px)"
        hint="Smaller images = faster vision requests."
        value={visionMaxDimension}
        min={256}
        max={2048}
        step={64}
        disabled={configBlocked}
        onChange={onVisionMaxDimensionChange}
      />
    </>
  );
};

export default VisionSection;
