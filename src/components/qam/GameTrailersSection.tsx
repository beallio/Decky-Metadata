import { DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";

import { useT } from "../../i18n";
import { inlineStatusStyle, sectionHeadingStyle } from "../../styles";
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
  const enableDisabled = disabled || (Boolean(state.conflict.pluginName) && !state.settings.enabled);
  const conflictNotice = featureConflictNotice(state.conflict, t("qam.trailers.conflictFeature"), state.settings.enabled);
  const display = state.displayWidth && state.displayHeight
    ? t("qam.trailers.displayPixels", { width: state.displayWidth, height: state.displayHeight })
    : t("qam.trailers.displayUnavailable");

  return (
    <>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.enableLabel")}
          description={`${t("qam.trailers.enableDescription")} ${t("qam.trailers.footnote")}`}
          checked={state.settings.enabled}
          disabled={enableDisabled}
          onChange={onEnabledChange}
        />
      </PanelSectionRow>
      {conflictNotice ? (
        <PanelSectionRow>
          <Field focusable={false} padding="none" bottomSeparator="none">
            <div style={inlineStatusStyle("warning")}>{conflictNotice}</div>
          </Field>
        </PanelSectionRow>
      ) : null}
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("qam.trailers.detailHeading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.detailLabel")}
          description={t("qam.trailers.detailDescription")}
          checked={state.settings.detailEnabled}
          disabled={dependentDisabled}
          onChange={onDetailEnabledChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label={t("qam.trailers.detailDelayLabel")}
          description={t("qam.trailers.detailDelayDescription")}
          value={state.settings.detailFadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={dependentDisabled}
          onChange={onDetailFadeInDelayChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.audioLabel")}
          description={t("qam.trailers.audioDescription")}
          checked={state.settings.audioEnabled}
          disabled={dependentDisabled}
          onChange={onAudioChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.hideLogoLabel")}
          description={t("qam.trailers.hideLogoDescription")}
          checked={state.settings.hideLogoDuringTrailer}
          disabled={dependentDisabled}
          onChange={onHideLogoChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("qam.trailers.homeHeading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.homeLabel")}
          description={t("qam.trailers.homeDescription")}
          checked={state.settings.homeEnabled}
          disabled={dependentDisabled}
          onChange={onHomeEnabledChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label={t("qam.trailers.homeDelayLabel")}
          description={t("qam.trailers.homeDelayDescription")}
          value={state.settings.homeFadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={dependentDisabled}
          onChange={onHomeFadeInDelayChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label={t("qam.trailers.qualityLabel")}
          layout="below"
          childrenContainerWidth="max"
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
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          label={t("qam.trailers.displayLabel")}
          childrenLayout="below"
          description={state.status}
          padding="standard"
          bottomSeparator="none"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ fontSize: "14px", color: colors.textSecondary }}>
            {t("qam.trailers.displayTarget", { display, height: state.targetHeight })}
          </div>
        </Field>
      </PanelSectionRow>
      {state.settingsError ? (
        <PanelSectionRow>
          <Field focusable={false} padding="none" bottomSeparator="none">
            <div style={inlineStatusStyle("error")}>{state.settingsError}</div>
          </Field>
        </PanelSectionRow>
      ) : null}
    </>
  );
}

