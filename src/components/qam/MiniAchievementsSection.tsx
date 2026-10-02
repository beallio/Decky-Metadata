import { Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaTrophy } from "react-icons/fa";
import { inlineStatusStyle } from "../../styles";
import type { MiniAchievementsSnapshot } from "../../steam/miniAchievementsController";
import { featureConflictNotice } from "../../pluginConflicts";
import { CollapsibleSection } from "./CollapsibleSection";

type MiniAchievementsSectionProps = {
  state: MiniAchievementsSnapshot;
  onEnabledChange: (enabled: boolean) => void;
};

export function MiniAchievementsSection({ state, onEnabledChange }: MiniAchievementsSectionProps) {
  const enableDisabled = !state.settingsLoaded || state.busy ||
    (Boolean(state.conflict.pluginName) && !state.enabled);
  const conflictNotice = featureConflictNotice(state.conflict, "mini achievements", state.enabled);
  return (
    <CollapsibleSection title="Mini achievements" icon={<FaTrophy size={16} />}>
      <PanelSectionRow>
        <ToggleField
          label="Enable mini achievements"
          description="Restore Steam's small achievement progress bar beside Play Time on game details pages. Off by default."
          checked={state.enabled}
          disabled={enableDisabled}
          onChange={onEnabledChange}
          bottomSeparator="none"
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
          <div style={{ fontSize: "13px", lineHeight: "1.4", color: "#cbd5e1" }}>
            This restores Steam's display; it does not add achievement tracking to non-Steam games.
          </div>
          {conflictNotice && <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>}
          {state.settingsError && <div style={inlineStatusStyle("error")}>{state.settingsError}</div>}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
