import { Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaTrophy } from "react-icons/fa";
import { t } from "../../i18n";
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
  const conflictNotice = featureConflictNotice(state.conflict, t("qam.achievements.feature"), state.enabled);
  return (
    <CollapsibleSection title={t("qam.achievements.title")} icon={<FaTrophy size={16} />}>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.achievements.enable")}
          description={t("qam.achievements.enableDesc")}
          checked={state.enabled}
          disabled={enableDisabled}
          onChange={onEnabledChange}
          bottomSeparator="none"
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
          <div style={{ fontSize: "13px", lineHeight: "1.4", color: "#cbd5e1" }}>
            {t("qam.achievements.note")}
          </div>
          {conflictNotice && <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>}
          {state.settingsError && <div style={inlineStatusStyle("error")}>{state.settingsError}</div>}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
