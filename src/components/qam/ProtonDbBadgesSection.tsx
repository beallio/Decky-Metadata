import { DropdownItem, Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { ProtonDbIcon } from "../../protondb/Icon";

import { useT } from "../../i18n";
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

const dropdownValueStyle = { whiteSpace: "normal" } as const;

export function ProtonDbBadgesSection({
  initiallyExpanded = false, snapshot, onSettingsChange,
  onCoverPositionChange, onCoverPositionMenuWillOpen, onCoverPositionControlRef,
}: ProtonDbBadgesSectionProps) {
  const t = useT();
  const coverPositionOptions: Array<{
    data: ProtonDbBadgeSettings["coverPosition"];
    label: string;
  }> = [
    { data: "bottom-left", label: t("qam.protondb.positionBottomLeft") },
    { data: "top-left", label: t("qam.protondb.positionTopLeft") },
    { data: "top-right", label: t("qam.protondb.positionTopRight") },
  ];
  const { settings } = snapshot;
  const controlsDisabled = !snapshot.settingsLoaded || snapshot.busy;
  const dependentControlsDisabled = controlsDisabled || !settings.enabled;
  const enableDisabled = controlsDisabled || (Boolean(snapshot.conflict.pluginName) && !settings.enabled);
  const conflictNotice = featureConflictNotice(snapshot.conflict, t("qam.protondb.title"), settings.enabled);
  const updateSetting = <K extends keyof ProtonDbBadgeSettings>(key: K, value: ProtonDbBadgeSettings[K]) => {
    void onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <CollapsibleSection title={t("qam.protondb.title")} icon={<ProtonDbIcon size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.enableLabel")}
          description={t("qam.protondb.enableDescription")}
          checked={settings.enabled}
          disabled={enableDisabled}
          onChange={(enabled) => updateSetting("enabled", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.homeLabel")}
          description={t("qam.protondb.homeDescription")}
          checked={settings.home}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("home", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.libraryLabel")}
          description={t("qam.protondb.libraryDescription")}
          checked={settings.library}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("library", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.gameViewLabel")}
          description={t("qam.protondb.gameViewDescription")}
          checked={settings.gameView}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("gameView", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.storeLabel")}
          description={t("qam.protondb.storeDescription")}
          checked={settings.store}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("store", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.protondb.focusOnlyLabel")}
          description={t("qam.protondb.focusOnlyDescription")}
          checked={settings.focusOnly}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("focusOnly", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCoverPositionControlRef}>
        <DropdownItem
          label={t("qam.protondb.positionLabel")}
          layout="below"
          childrenContainerWidth="max"
          bottomSeparator="none"
          rgOptions={coverPositionOptions}
          selectedOption={settings.coverPosition}
          disabled={dependentControlsDisabled}
          onMenuWillOpen={onCoverPositionMenuWillOpen}
          onChange={(option) => { void onCoverPositionChange(option.data); }}
          renderButtonValue={() => (
            <span style={dropdownValueStyle}>
              {coverPositionOptions.find((option) => option.data === settings.coverPosition)?.label}
            </span>
          )}
        />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
          {!snapshot.settingsLoaded ? (
            <div style={compactTextStyle}>{t("qam.protondb.loadingPreferences")}</div>
          ) : null}
          <div style={compactTextStyle}>
            {t("qam.protondb.footnote")}
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
