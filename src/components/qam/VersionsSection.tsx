import { Field, PanelSectionRow } from "@decky/ui";
import { FaInfoCircle } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { useT } from "../../i18n";
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
  const t = useT();
  const unknown = t("common.unknown");

  return (
    <CollapsibleSection title={t("qam.versions.title")} icon={<FaInfoCircle size={16} />} defaultExpanded={true}>
      <PanelSectionRow>
        <Field
          focusable={true}
          highlightOnFocus={true}
          childrenLayout="below"
          padding="standard"
          bottomSeparator="none"
        >
          <div style={compactTextStyle}>
            <div>{t("qam.versions.plugin", { version: pluginVersion.trim() || unknown })}</div>
            <div>{t("qam.versions.decky", { version: deckyVersion.trim() || unknown })}</div>
            <div>{t("qam.versions.steamos", { version: steamosVersion.trim() || unknown })}</div>
            <div>{t("qam.versions.controllerTypes", { types: formatConnectedControllerTypes(controllerTypes) })}</div>
          </div>
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
