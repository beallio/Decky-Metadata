import { DropdownItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { FaPlayCircle } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { inlineStatusStyle } from "../../styles";
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
  onAudioChange: (enabled: boolean) => void;
  onHideLogoChange: (hide: boolean) => void;
  onFadeInDelayChange: (seconds: number) => void;
  onQualityChange: (quality: TrailerQuality) => void | Promise<boolean>;
  onQualityMenuWillOpen: () => void;
  onQualityControlRef: (element: HTMLDivElement | null) => void;
};

export function GameTrailersSection({
  initiallyExpanded = false,
  state,
  onEnabledChange,
  onAudioChange,
  onHideLogoChange,
  onFadeInDelayChange,
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
          label="Enabled"
          description="Play a Steam trailer when available, or an IGN game trailer when Steam has none. Non-Steam shortcuts do not need a Steam match."
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
        <ToggleField
          label="Trailer audio"
          description="New trailers stay muted until the video appears, then audio fades in with it."
          checked={state.settings.audioEnabled}
          disabled={disabled}
          onChange={onAudioChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Hide game logo during trailers"
          description="Hide Steam's game logo only while a trailer is visible. The original logo returns when playback stops."
          checked={state.settings.hideLogoDuringTrailer}
          disabled={disabled}
          onChange={onHideLogoChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Trailer fade-in delay"
          description="Wait before showing the trailer over the game artwork. Audio fades in when the trailer appears."
          value={state.settings.fadeInDelaySeconds}
          min={0}
          max={10}
          step={1}
          showValue
          valueSuffix="s"
          disabled={!state.settingsLoaded}
          onChange={onFadeInDelayChange}
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
