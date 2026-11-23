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
          description={`${t("qam.miniAchievements.enableDescription")} ${t("qam.miniAchievements.footnote")}`}
          checked={state.enabled}
          disabled={enableDisabled}
          onChange={onEnabledChange}
          bottomSeparator="none"
        />
      </PanelSectionRow>
      {(conflictNotice || state.settingsError) ? (
        <PanelSectionRow>
          <Field focusable={false} padding="none" bottomSeparator="none">
            {conflictNotice && <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>}
            {state.settingsError && <div style={inlineStatusStyle("error")}>{state.settingsError}</div>}
          </Field>
        </PanelSectionRow>
      ) : null}
    </CollapsibleSection>
  );
}
