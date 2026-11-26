import { DialogControlsSection, DialogControlsSectionHeader, DropdownItem, Field, SliderField, ToggleField } from "@decky/ui";

import { useT } from "../../i18n";
import { inlineStatusStyle } from "../../styles";
import type { TrailerControllerSnapshot } from "../../trailers/controller";
import type { TrailerQuality } from "../../types";
import { colors } from "../../tokens";
import { featureConflictNotice } from "../../pluginConflicts";

type GameTrailersBodyProps = {
  state: TrailerControllerSnapshot;
  onEnabledChange: (enabled: boolean) => void;
  onDetailEnabledChange: (enabled: boolean) => void;
  onHomeEnabledChange: (enabled: boolean) => void;
  onAudioChange: (enabled: boolean) => void;
  onHideLogoChange: (hide: boolean) => void;
  onDetailFadeInDelayChange: (seconds: number) => void;
  onHomeFadeInDelayChange: (seconds: number) => void;
  onQualityChange: (quality: TrailerQuality) => void | Promise<boolean>;
};

export function GameTrailersBody({
  state,
  onEnabledChange,
  onDetailEnabledChange,
  onHomeEnabledChange,
  onAudioChange,
  onHideLogoChange,
  onDetailFadeInDelayChange,
  onHomeFadeInDelayChange,
  onQualityChange,
}: GameTrailersBodyProps) {
  const t = useT();
  const qualityOptions: Array<{ data: TrailerQuality; label: string }> = [
    { data: "auto", label: t("qam.trailers.qualityAuto") },
    { data: 720, label: "720p" },
    { data: 1080, label: "1080p" },
    { data: 1440, label: "1440p" },
    { data: 2160, label: "2160p" },
  ];
  const disabled = !state.settingsLoaded || state.busy;
  const dependentDisabled = disabled || !state.settings.enabled;
  const detailDependentDisabled = dependentDisabled || !state.settings.detailEnabled;
  const homeDependentDisabled = dependentDisabled || !state.settings.homeEnabled;
  const enableDisabled = disabled || (Boolean(state.conflict.pluginName) && !state.settings.enabled);
  const conflictNotice = featureConflictNotice(state.conflict, t("qam.trailers.conflictFeature"), state.settings.enabled);
  const display = state.displayWidth && state.displayHeight
    ? t("qam.trailers.displayPixels", { width: state.displayWidth, height: state.displayHeight })
    : t("qam.trailers.displayUnavailable");
  const actionableStatuses = new Set([
    t("trailers.otherPluginActive"),
    t("trailers.steamUiUnavailable"),
    t("trailers.runtimeConflict"),
    t("trailers.mediaSourceUnavailable"),
    t("trailers.autoplayBlocked"),
    t("trailers.settingsUnavailable"),
    t("trailers.matchesUnavailable"),
  ]);
  const displayStatus = actionableStatuses.has(state.status) ? state.status : undefined;

  return (
    <>
      <DialogControlsSection>
        <ToggleField
          label={t("qam.trailers.enableLabel")}
          description={`${t("qam.trailers.enableDescription")} ${t("qam.trailers.footnote")}`}
          checked={state.settings.enabled}
          disabled={enableDisabled}
          onChange={onEnabledChange}
        />
        <DropdownItem
          label={t("qam.trailers.qualityLabel")}
          rgOptions={qualityOptions}
          selectedOption={state.settings.quality}
          disabled={dependentDisabled}
          onChange={(option) => { void onQualityChange(option.data); }}
          renderButtonValue={() => (
            <span style={{ whiteSpace: "normal" }}>
              {qualityOptions.find((option) => option.data === state.settings.quality)?.label}
            </span>
          )}
        />
        <Field
          label={t("qam.trailers.displayLabel")}
          childrenLayout="below"
          description={displayStatus}
          padding="standard"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ color: colors.textSecondary }}>
            {t("qam.trailers.displayTarget", { display, height: state.targetHeight })}
          </div>
        </Field>
        {conflictNotice || state.settingsError ? (
          <Field focusable={false} childrenLayout="below" padding="none">
            {conflictNotice ? <div style={inlineStatusStyle("warning")}>{conflictNotice}</div> : null}
            {state.settingsError ? <div style={inlineStatusStyle("error")}>{state.settingsError}</div> : null}
          </Field>
        ) : null}
      </DialogControlsSection>
      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.trailers.detailHeading")}</DialogControlsSectionHeader>
        <ToggleField
          label={t("qam.trailers.detailLabel")}
          description={t("qam.trailers.detailDescription")}
          checked={state.settings.detailEnabled}
          disabled={dependentDisabled}
          onChange={onDetailEnabledChange}
        />
        <SliderField
          label={t("qam.trailers.detailDelayLabel")}
          description={t("qam.trailers.detailDelayDescription")}
          value={state.settings.detailFadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={detailDependentDisabled}
          onChange={onDetailFadeInDelayChange}
        />
        <ToggleField
          label={t("qam.trailers.audioLabel")}
          description={t("qam.trailers.audioDescription")}
          checked={state.settings.audioEnabled}
          disabled={detailDependentDisabled}
          onChange={onAudioChange}
        />
        <ToggleField
          label={t("qam.trailers.hideLogoLabel")}
          description={t("qam.trailers.hideLogoDescription")}
          checked={state.settings.hideLogoDuringTrailer}
          disabled={detailDependentDisabled}
          onChange={onHideLogoChange}
        />
      </DialogControlsSection>
      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.trailers.homeHeading")}</DialogControlsSectionHeader>
        <ToggleField
          label={t("qam.trailers.homeLabel")}
          description={t("qam.trailers.homeDescription")}
          checked={state.settings.homeEnabled}
          disabled={dependentDisabled}
          onChange={onHomeEnabledChange}
        />
        <SliderField
          label={t("qam.trailers.homeDelayLabel")}
          description={t("qam.trailers.homeDelayDescription")}
          value={state.settings.homeFadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={homeDependentDisabled}
          onChange={onHomeFadeInDelayChange}
        />
      </DialogControlsSection>
    </>
  );
}

