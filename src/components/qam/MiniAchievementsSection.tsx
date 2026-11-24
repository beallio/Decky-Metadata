import { DialogControlsSection, Field, ToggleField } from "@decky/ui";
import { useT } from "../../i18n";
import { inlineStatusStyle } from "../../styles";
import type { MiniAchievementsSnapshot } from "../../steam/miniAchievementsController";
import { featureConflictNotice } from "../../pluginConflicts";

type MiniAchievementsSectionProps = {
  state: MiniAchievementsSnapshot;
  onEnabledChange: (enabled: boolean) => void;
};

export function MiniAchievementsBody({ state, onEnabledChange }: MiniAchievementsSectionProps) {
  const t = useT();
  const enableDisabled = !state.settingsLoaded || state.busy ||
    (Boolean(state.conflict.pluginName) && !state.enabled);
  const conflictNotice = featureConflictNotice(state.conflict, t("qam.miniAchievements.conflictFeature"), state.enabled);
  return (
    <DialogControlsSection>
      <ToggleField
        label={t("qam.miniAchievements.enableLabel")}
        description={`${t("qam.miniAchievements.enableDescription")} ${t("qam.miniAchievements.footnote")}`}
        checked={state.enabled}
        disabled={enableDisabled}
        onChange={onEnabledChange}
      />
      {(conflictNotice || state.settingsError) ? (
        <Field focusable={false} childrenLayout="below" padding="none">
          {conflictNotice && <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>}
          {state.settingsError && <div style={inlineStatusStyle("error")}>{state.settingsError}</div>}
        </Field>
      ) : null}
    </DialogControlsSection>
  );
}
