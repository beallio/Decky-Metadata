import { Field, PanelSection, PanelSectionRow } from "@decky/ui";

import { compactTextStyle } from "../../styles";
import { formatConnectedControllerTypes } from "../../steam/controllerTypes";

type VersionsSectionProps = {
  pluginVersion: string;
  deckyVersion: string;
  steamosVersion: string;
  controllerTypes: number[];
};

export function VersionsSection({
  pluginVersion,
  deckyVersion,
  steamosVersion,
  controllerTypes,
}: VersionsSectionProps) {
  return (
    <PanelSection title="Versions">
      <PanelSectionRow>
        <Field
          focusable={true}
          highlightOnFocus={true}
          childrenLayout="below"
          padding="standard"
          bottomSeparator="none"
        >
          <div style={compactTextStyle}>
            <div>Decky Metadata: {pluginVersion.trim() || "Unknown"}</div>
            <div>Decky: {deckyVersion.trim() || "Unknown"}</div>
            <div>SteamOS: {steamosVersion.trim() || "Unknown"}</div>
            <div>Controller Types: {formatConnectedControllerTypes(controllerTypes)}</div>
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
