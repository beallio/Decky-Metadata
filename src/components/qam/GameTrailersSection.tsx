import { DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { FaPlayCircle } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { t } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { inlineStatusStyle, sectionHeadingStyle } from "../../styles";
import { fontSize } from "../../tokens";
import type { TrailerControllerSnapshot } from "../../trailers/controller";
import type { TrailerQuality } from "../../types";
import { featureConflictNotice } from "../../pluginConflicts";

const viewHeadingStyle = { ...sectionHeadingStyle, fontSize: fontSize.lg } as const;

const qualityOptions: Array<{ data: TrailerQuality; labelKey?: MessageKey; label?: string }> = [
  { data: "auto", labelKey: "common.quality.auto" },
  { data: 720, label: "720p" },
  { data: 1080, label: "1080p" },
  { data: 1440, label: "1440p" },
  { data: 2160, label: "2160p" },
];

const qualityLabel = (option: (typeof qualityOptions)[number]): string =>
  option.labelKey ? t(option.labelKey) : option.label ?? "";

type GameTrailersSectionProps = {
  initiallyExpanded?: boolean;
  state: TrailerControllerSnapshot;
  onEnabledChange: (enabled: boolean) => void;
  onDetailEnabledChange: (enabled: boolean) => void;
  onHomeEnabledChange: (enabled: boolean) => void;
  onAudioChange: (enabled: boolean) => void;
  onHideLogoChange: (hide: boolean) => void;
  onDetailFadeInDelayChange: (seconds: number) => void;
  onHomeFadeInDelayChange: (seconds: number) => void;
  onQualityChange: (quality: TrailerQuality) => void | Promise<boolean>;
  onQualityMenuWillOpen: () => void;
  onQualityControlRef: (element: HTMLDivElement | null) => void;
};

export function GameTrailersSection({
  initiallyExpanded = false,
  state,
  onEnabledChange,
  onDetailEnabledChange,
  onHomeEnabledChange,
  onAudioChange,
  onHideLogoChange,
  onDetailFadeInDelayChange,
  onHomeFadeInDelayChange,
  onQualityChange,
  onQualityMenuWillOpen,
  onQualityControlRef,
}: GameTrailersSectionProps) {
  const disabled = !state.settingsLoaded || state.busy;
  const enableDisabled = disabled || (Boolean(state.conflict.pluginName) && !state.settings.enabled);
  const conflictNotice = featureConflictNotice(state.conflict, t("qam.trailers.feature"), state.settings.enabled);
  const selectedQuality = qualityOptions.find((option) => option.data === state.settings.quality);
  const display = state.displayWidth && state.displayHeight
    ? t("qam.trailers.display", { width: state.displayWidth, height: state.displayHeight })
    : t("common.unavailable");

  return (
    <CollapsibleSection title={t("qam.trailers.title")} icon={<FaPlayCircle size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.enable")}
          description={t("qam.trailers.enableDesc")}
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
        <div style={viewHeadingStyle}>{t("qam.trailers.detail.heading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.detail.enable")}
          description={t("qam.trailers.detail.enableDesc")}
          checked={state.settings.detailEnabled}
          disabled={disabled}
          onChange={onDetailEnabledChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label={t("qam.trailers.detail.delay")}
          description={t("qam.trailers.detail.delayDesc")}
          value={state.settings.detailFadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={!state.settingsLoaded}
          onChange={onDetailFadeInDelayChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.detail.audio")}
          description={t("qam.trailers.detail.audioDesc")}
          checked={state.settings.audioEnabled}
          disabled={disabled}
          onChange={onAudioChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.detail.hideLogo")}
          description={t("qam.trailers.detail.hideLogoDesc")}
          checked={state.settings.hideLogoDuringTrailer}
          disabled={disabled}
          onChange={onHideLogoChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={viewHeadingStyle}>{t("qam.trailers.home.heading")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.trailers.home.enable")}
          description={t("qam.trailers.home.enableDesc")}
          checked={state.settings.homeEnabled}
          disabled={disabled}
          onChange={onHomeEnabledChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label={t("qam.trailers.home.delay")}
          description={t("qam.trailers.home.delayDesc")}
          value={state.settings.homeFadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={!state.settingsLoaded}
          onChange={onHomeFadeInDelayChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onQualityControlRef}>
          <DropdownItem
            label={t("qam.trailers.quality")}
            layout="below"
            childrenContainerWidth="max"
            rgOptions={qualityOptions.map((option) => ({ data: option.data, label: qualityLabel(option) }))}
            selectedOption={state.settings.quality}
            disabled={disabled}
            onMenuWillOpen={onQualityMenuWillOpen}
            onChange={(option) => { void onQualityChange(option.data); }}
            renderButtonValue={() => (
              <span style={{ whiteSpace: "normal" }}>
                {selectedQuality ? qualityLabel(selectedQuality) : ""}
              </span>
            )}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          label={t("qam.trailers.bigPicture")}
          childrenLayout="below"
          description={state.status}
          padding="standard"
          bottomSeparator="none"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            {t("qam.trailers.target", { display, height: state.targetHeight })}
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="none"
        >
          <div style={{ fontSize: "13px", lineHeight: "1.4", color: "#cbd5e1" }}>
            {t("qam.trailers.help")}
          </div>
          {state.settingsError && (
            <div style={inlineStatusStyle("error")}>{state.settingsError}</div>
          )}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
