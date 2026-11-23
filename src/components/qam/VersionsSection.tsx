import { Field, PanelSectionRow } from "@decky/ui";
import { FaInfoCircle } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { useT } from "../../i18n";
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
  const marker = "\u0000";
  const pluginLabel = t("qam.versions.plugin", { version: marker }).split(marker)[0].trimEnd();
  const deckyLabel = t("qam.versions.decky", { version: marker }).split(marker)[0].trimEnd();
  const steamosLabel = t("qam.versions.steamos", { version: marker }).split(marker)[0].trimEnd();
  const controllerTypesLabel = t("qam.versions.controllerTypes", { types: marker }).split(marker)[0].trimEnd();

  return (
    <CollapsibleSection title={t("qam.versions.title")} icon={<FaInfoCircle size={16} />} defaultExpanded={true}>
      <PanelSectionRow>
        <Field label={pluginLabel} focusable highlightOnFocus>
          {pluginVersion.trim() || unknown}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={deckyLabel} focusable highlightOnFocus>
          {deckyVersion.trim() || unknown}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={steamosLabel} focusable highlightOnFocus>
          {steamosVersion.trim() || unknown}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={controllerTypesLabel} focusable highlightOnFocus>
          {formatConnectedControllerTypes(controllerTypes)}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
