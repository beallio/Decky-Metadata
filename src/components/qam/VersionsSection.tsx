import { Field, PanelSectionRow } from "@decky/ui";
import { FaInfoCircle } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { t } from "../../i18n";
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
            <div>{t("qam.versions.plugin", { version: pluginVersion.trim() || t("common.unknown") })}</div>
            <div>{t("qam.versions.decky", { version: deckyVersion.trim() || t("common.unknown") })}</div>
            <div>{t("qam.versions.steamos", { version: steamosVersion.trim() || t("common.unknown") })}</div>
            <div>{t("qam.versions.controllers", { types: formatConnectedControllerTypes(controllerTypes) })}</div>
          </div>
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
