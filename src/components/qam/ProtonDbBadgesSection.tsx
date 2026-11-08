import { DropdownItem, Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { ProtonDbIcon } from "../../protondb/Icon";

import { t } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { compactTextStyle, inlineStatusStyle } from "../../styles";
import type { ProtonDbBadgeSnapshot } from "../../protondb/controller";
import type { ProtonDbBadgeSettings } from "../../types";
import { featureConflictNotice } from "../../pluginConflicts";
import { CollapsibleSection } from "./CollapsibleSection";

type ProtonDbBadgesSectionProps = {
  initiallyExpanded?: boolean;
  snapshot: ProtonDbBadgeSnapshot;
  onSettingsChange: (settings: ProtonDbBadgeSettings) => Promise<boolean>;
  onCoverPositionChange: (position: ProtonDbBadgeSettings["coverPosition"]) => Promise<boolean>;
  onCoverPositionMenuWillOpen: () => void;
  onCoverPositionControlRef: (element: HTMLDivElement | null) => void;
};

const coverPositionOptions: Array<{
  data: ProtonDbBadgeSettings["coverPosition"];
  labelKey: MessageKey;
}> = [
  { data: "bottom-left", labelKey: "qam.protondb.position.bottomLeft" },
  { data: "top-left", labelKey: "qam.protondb.position.topLeft" },
  { data: "top-right", labelKey: "qam.protondb.position.topRight" },
];

const dropdownValueStyle = { whiteSpace: "normal" } as const;

export function ProtonDbBadgesSection({
  initiallyExpanded = false, snapshot, onSettingsChange,
  onCoverPositionChange, onCoverPositionMenuWillOpen, onCoverPositionControlRef,
}: ProtonDbBadgesSectionProps) {
  const { settings } = snapshot;
  const controlsDisabled = !snapshot.settingsLoaded || snapshot.busy;
  const dependentControlsDisabled = controlsDisabled || !settings.enabled;
  const enableDisabled = controlsDisabled || (Boolean(snapshot.conflict.pluginName) && !settings.enabled);
  const conflictNotice = featureConflictNotice(snapshot.conflict, t("qam.protondb.feature"), settings.enabled);
  const positionOptions = coverPositionOptions.map((option) => ({
    data: option.data,
    label: t(option.labelKey),
  }));
  const updateSetting = <K extends keyof ProtonDbBadgeSettings>(key: K, value: ProtonDbBadgeSettings[K]) => {
    void onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <CollapsibleSection title={t("qam.protondb.title")} icon={<ProtonDbIcon size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.enable")}
          description={t("qam.protondb.enableDesc")}
          checked={settings.enabled}
          disabled={enableDisabled}
          onChange={(enabled) => updateSetting("enabled", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.home")}
          description={t("qam.protondb.homeDesc")}
          checked={settings.home}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("home", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.library")}
          description={t("qam.protondb.libraryDesc")}
          checked={settings.library}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("library", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.gameView")}
          description={t("qam.protondb.gameViewDesc")}
          checked={settings.gameView}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("gameView", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.store")}
          description={t("qam.protondb.storeDesc")}
          checked={settings.store}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("store", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.focusOnly")}
          description={t("qam.protondb.focusOnlyDesc")}
          checked={settings.focusOnly}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("focusOnly", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCoverPositionControlRef}>
        <DropdownItem
          label={t("qam.protondb.position")}
          layout="below"
          childrenContainerWidth="max"
          bottomSeparator="none"
          rgOptions={positionOptions}
          selectedOption={settings.coverPosition}
          disabled={dependentControlsDisabled}
          onMenuWillOpen={onCoverPositionMenuWillOpen}
          onChange={(option) => { void onCoverPositionChange(option.data); }}
          renderButtonValue={() => (
            <span style={dropdownValueStyle}>
              {positionOptions.find((option) => option.data === settings.coverPosition)?.label}
            </span>
          )}
        />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
          {!snapshot.settingsLoaded ? (
            <div style={compactTextStyle}>{t("qam.protondb.loading")}</div>
          ) : null}
          <div style={compactTextStyle}>
            {t("qam.protondb.note")}
          </div>
          {conflictNotice ? (
            <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>
          ) : null}
          {snapshot.settingsError ? (
            <div style={inlineStatusStyle("error")}>{snapshot.settingsError}</div>
          ) : null}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
