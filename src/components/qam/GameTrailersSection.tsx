import { DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { FaPlayCircle } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { inlineStatusStyle, sectionHeadingStyle } from "../../styles";
import type { TrailerControllerSnapshot } from "../../trailers/controller";
import type { TrailerQuality } from "../../types";
import { featureConflictNotice } from "../../pluginConflicts";

const qualityOptions: Array<{ data: TrailerQuality; label: string }> = [
  { data: "auto", label: "Auto — match display" },
  { data: 720, label: "720p" },
  { data: 1080, label: "1080p" },
  { data: 1440, label: "1440p" },
  { data: 2160, label: "2160p" },
];

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
  const conflictNotice = featureConflictNotice(state.conflict, "game trailers", state.settings.enabled);
  const display = state.displayWidth && state.displayHeight
    ? `${state.displayWidth} × ${state.displayHeight} pixels`
    : "Unavailable";

  return (
    <CollapsibleSection title="Game trailers" icon={<FaPlayCircle size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <ToggleField
          label="Enable trailers"
          description="Main switch for Detail and Home trailers. Turning it off keeps your choices for each view."
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
        <div style={sectionHeadingStyle}>Detail view</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Detail view trailers"
          description="Play a trailer over the artwork on a game's main Library page."
          checked={state.settings.detailEnabled}
          disabled={disabled}
          onChange={onDetailEnabledChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Detail fade-in delay"
          description="Wait from opening the game page before showing a ready trailer."
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
          label="Detail trailer audio"
          description="Fade in audio when a Detail trailer appears. Home trailers always stay muted."
          checked={state.settings.audioEnabled}
          disabled={disabled}
          onChange={onAudioChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Hide game logo during Detail trailers"
          description="Hide the game page logo while a trailer is visible. The logo returns when playback stops."
          checked={state.settings.hideLogoDuringTrailer}
          disabled={disabled}
          onChange={onHideLogoChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>Home view</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Home view trailers"
          description="Play a muted trailer over the Home background for the selected or hovered game."
          checked={state.settings.homeEnabled}
          disabled={disabled}
          onChange={onHomeEnabledChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Home fade-in delay"
          description="Wait before looking for a trailer. Moving to another game restarts this delay."
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
            label="Video quality"
            layout="below"
            childrenContainerWidth="max"
            rgOptions={qualityOptions}
            selectedOption={state.settings.quality}
            disabled={disabled}
            onMenuWillOpen={onQualityMenuWillOpen}
            onChange={(option) => { void onQualityChange(option.data); }}
            renderButtonValue={() => (
              <span style={{ whiteSpace: "normal" }}>
                {qualityOptions.find((option) => option.data === state.settings.quality)?.label}
              </span>
            )}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          label="Big Picture display"
          childrenLayout="below"
          description={state.status}
          padding="standard"
          bottomSeparator="none"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            {display} · target {state.targetHeight}p
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
            Steam artwork stays visible until a playable trailer is ready. Trailers stream from Steam or IGN and are not saved for offline playback.
          </div>
          {state.settingsError && (
            <div style={inlineStatusStyle("error")}>{state.settingsError}</div>
          )}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
