import { DropdownItem, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";

import { inlineStatusStyle } from "../../styles";
import type { TrailerControllerSnapshot } from "../../trailers/controller";
import type { TrailerQuality } from "../../types";

const qualityOptions: Array<{ data: TrailerQuality; label: string }> = [
  { data: "auto", label: "Auto — match display" },
  { data: 720, label: "720p" },
  { data: 1080, label: "1080p" },
  { data: 1440, label: "1440p" },
  { data: 2160, label: "2160p" },
];

type GameTrailersSectionProps = {
  state: TrailerControllerSnapshot;
  onEnabledChange: (enabled: boolean) => void;
  onAudioChange: (enabled: boolean) => void;
  onHideLogoChange: (hide: boolean) => void;
  onQualityChange: (quality: TrailerQuality) => void | Promise<boolean>;
  onQualityMenuWillOpen: () => void;
  onQualityControlRef: (element: HTMLDivElement | null) => void;
};

export function GameTrailersSection({
  state,
  onEnabledChange,
  onAudioChange,
  onHideLogoChange,
  onQualityChange,
  onQualityMenuWillOpen,
  onQualityControlRef,
}: GameTrailersSectionProps) {
  const disabled = !state.settingsLoaded || state.busy;
  const display = state.displayWidth && state.displayHeight
    ? `${state.displayWidth} × ${state.displayHeight} pixels`
    : "Unavailable";

  return (
    <PanelSection title="Game trailers">
      <PanelSectionRow>
        <ToggleField
          label="Enabled"
          description="Show a Steam trailer on native game pages and shortcuts with a saved Steam match."
          checked={state.settings.enabled}
          disabled={disabled}
          onChange={onEnabledChange}
        />
      </PanelSectionRow>
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
          description={state.status}
          padding="standard"
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
          bottomSeparator="standard"
        >
          <div style={{ fontSize: "13px", lineHeight: "1.4", color: "#cbd5e1" }}>
            Steam artwork stays visible until a playable trailer is ready. Trailers stream from Steam and are not saved for offline playback.
          </div>
          {state.settingsError && (
            <div style={inlineStatusStyle("error")}>{state.settingsError}</div>
          )}
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
