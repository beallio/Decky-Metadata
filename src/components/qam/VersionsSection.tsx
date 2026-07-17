import { Field, PanelSection, PanelSectionRow } from "@decky/ui";

import { compactTextStyle } from "../../styles";

type VersionsSectionProps = {
  pluginVersion: string;
  deckyVersion: string;
  steamosVersion: string;
};

export function VersionsSection({
  pluginVersion,
  deckyVersion,
  steamosVersion,
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
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
