import { DialogControlsSection, Field } from "@decky/ui";

import { useT } from "../../i18n";
import { formatConnectedControllerTypes } from "../../steam/controllerTypes";

type VersionsSectionProps = {
  pluginVersion: string;
  deckyVersion: string;
  steamosVersion: string;
  controllerTypes: number[];
};

export function VersionsBody({
  pluginVersion,
  deckyVersion,
  steamosVersion,
  controllerTypes,
}: VersionsSectionProps) {
  const t = useT();
  const unknown = t("common.unknown");
  const marker = "\u0000";
  // The label is the text before the value; Steam labels carry no trailing colon.
  const label = (key: string, param: string) =>
    t(key, { [param]: marker }).split(marker)[0].replace(/\s*[：:]?\s*$/, "");

  return (
    <DialogControlsSection>
      {/* Focusable so the D-pad can enter this read-only page and read each row. */}
      <Field label={label("qam.versions.plugin", "version")} focusable highlightOnFocus>
        {pluginVersion.trim() || unknown}
      </Field>
      <Field label={label("qam.versions.decky", "version")} focusable highlightOnFocus>
        {deckyVersion.trim() || unknown}
      </Field>
      <Field label={label("qam.versions.steamos", "version")} focusable highlightOnFocus>
        {steamosVersion.trim() || unknown}
      </Field>
      <Field label={label("qam.versions.controllerTypes", "types")} focusable highlightOnFocus>
        {formatConnectedControllerTypes(controllerTypes)}
      </Field>
    </DialogControlsSection>
  );
}

