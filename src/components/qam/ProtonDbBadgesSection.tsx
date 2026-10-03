import { DropdownItem, Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { ProtonDbIcon } from "../../protondb/Icon";

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
  label: string;
}> = [
  { data: "bottom-left", label: "Bottom left" },
  { data: "top-left", label: "Top left" },
  { data: "top-right", label: "Top right" },
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
  const conflictNotice = featureConflictNotice(snapshot.conflict, "ProtonDB badges", settings.enabled);
  const updateSetting = <K extends keyof ProtonDbBadgeSettings>(key: K, value: ProtonDbBadgeSettings[K]) => {
    void onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <CollapsibleSection title="ProtonDB badges" icon={<ProtonDbIcon size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <ToggleField
          label="Enable ProtonDB badges"
          description="Show community ProtonDB game tiers on Steam game surfaces. This is separate from Valve's compatibility status."
          checked={settings.enabled}
          disabled={enableDisabled}
          onChange={(enabled) => updateSetting("enabled", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Home game covers"
          description="Show a tier badge on Home covers."
          checked={settings.home}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("home", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Library game covers"
          description="Show a tier badge on Library covers."
          checked={settings.library}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("library", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Game view"
          description="Show a ProtonDB tier button on the game's details page."
          checked={settings.gameView}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("gameView", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Store"
          description="Show a ProtonDB tier badge on the Steam Store page."
          checked={settings.store}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("store", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Covers only on focus or hover"
          description="Hide Home and Library cover badges until a game cover is focused or hovered."
          checked={settings.focusOnly}
          disabled={dependentControlsDisabled}
          onChange={(enabled) => updateSetting("focusOnly", enabled)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCoverPositionControlRef}>
        <DropdownItem
          label="Cover badge position"
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
            <div style={compactTextStyle}>Loading ProtonDB badge preferences…</div>
          ) : null}
          <div style={compactTextStyle}>
            Ratings come directly from ProtonDB. They describe community experience, not Valve's compatibility rating; unmatched games and games without a ProtonDB tier are hidden.
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
