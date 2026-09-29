import { Field, PanelSectionRow } from "@decky/ui";
import { CollapsibleSection } from "./CollapsibleSection";

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
    <CollapsibleSection title="Versions" defaultExpanded={true}>
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
    </CollapsibleSection>
  );
}
