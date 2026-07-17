import { Field, PanelSection, PanelSectionRow } from "@decky/ui";

import { compactTextStyle } from "../../styles";

type VersionsSectionProps = {
  pluginVersion: string;
};

export function VersionsSection({ pluginVersion }: VersionsSectionProps) {
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
            Decky Metadata: {pluginVersion.trim() || "Unknown"}
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
