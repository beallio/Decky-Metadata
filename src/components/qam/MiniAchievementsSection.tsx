import { Field, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaTrophy } from "react-icons/fa";
import { useT } from "../../i18n";
import { inlineStatusStyle } from "../../styles";
import type { MiniAchievementsSnapshot } from "../../steam/miniAchievementsController";
import { featureConflictNotice } from "../../pluginConflicts";
import { CollapsibleSection } from "./CollapsibleSection";

type MiniAchievementsSectionProps = {
  state: MiniAchievementsSnapshot;
  onEnabledChange: (enabled: boolean) => void;
};

export function MiniAchievementsSection({ state, onEnabledChange }: MiniAchievementsSectionProps) {
  const t = useT();
  const enableDisabled = !state.settingsLoaded || state.busy ||
    (Boolean(state.conflict.pluginName) && !state.enabled);
  const conflictNotice = featureConflictNotice(state.conflict, t("qam.miniAchievements.conflictFeature"), state.enabled);
  return (
    <CollapsibleSection title={t("qam.miniAchievements.title")} icon={<FaTrophy size={16} />}>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.miniAchievements.enableLabel")}
          description={t("qam.miniAchievements.enableDescription")}
          checked={state.enabled}
          disabled={enableDisabled}
          onChange={onEnabledChange}
          bottomSeparator="none"
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <Field focusable={false} childrenLayout="below" padding="none" bottomSeparator="none">
          <div style={{ fontSize: "13px", lineHeight: "1.4", color: "#cbd5e1" }}>
            {t("qam.miniAchievements.footnote")}
          </div>
          {conflictNotice && <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>}
          {state.settingsError && <div style={inlineStatusStyle("error")}>{state.settingsError}</div>}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
