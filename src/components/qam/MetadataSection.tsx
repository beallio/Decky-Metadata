import { ButtonItem, DropdownItem, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";

import {
  ButtonLabel,
  compactTextStyle,
  inlineStatusStyle,
  rowStackStyle,
  sectionHeadingStyle,
} from "../../styles";
import { space } from "../../tokens";
import type { StatusKind } from "../../tokens";
import type { DeckCompatibilityCategory } from "../../types";

const compatibilityDefaultOptions: Array<{
  data: DeckCompatibilityCategory | null;
  label: string;
}> = [
  { data: null, label: "Automatic — use matched Steam status" },
  { data: 3, label: "Verified" },
  { data: 2, label: "Playable" },
  { data: 1, label: "Unsupported" },
  { data: 0, label: "Unknown" },
];

type MetadataSectionProps = {
  detectedCount: number;
  savedCount: number;
  missingCount: number;
  scanBusy: boolean;
  scanMessage: string;
  scanStatusKind: StatusKind;
  cacheBusy: boolean;
  compatibilityDefault: DeckCompatibilityCategory | null;
  compatibilityDefaultLoaded: boolean;
  compatibilityDefaultBusy: boolean;
  compatibilityDefaultError: string;
  compatibilityDefaultMatchedOnly: boolean;
  compatibilityDefaultScopeBusy: boolean;
  onRefreshMetadata: () => void;
  onClearCache: () => void;
  onCompatibilityDefaultChange: (category: DeckCompatibilityCategory | null) => void;
  onCompatibilityDefaultMatchedOnlyChange: (matchedOnly: boolean) => void;
  onCompatibilityDefaultMenuWillOpen: () => void;
  onCompatibilityDefaultControlRef: (element: HTMLDivElement | null) => void;
};

export function MetadataSection({
  detectedCount,
  savedCount,
  missingCount,
  scanBusy,
  scanMessage,
  scanStatusKind,
  cacheBusy,
  compatibilityDefault,
  compatibilityDefaultLoaded,
  compatibilityDefaultBusy,
  compatibilityDefaultError,
  compatibilityDefaultMatchedOnly,
  compatibilityDefaultScopeBusy,
  onRefreshMetadata,
  onClearCache,
  onCompatibilityDefaultChange,
  onCompatibilityDefaultMatchedOnlyChange,
  onCompatibilityDefaultMenuWillOpen,
  onCompatibilityDefaultControlRef,
}: MetadataSectionProps) {
  return (
    <PanelSection title="Metadata">
      <PanelSectionRow>
        <Field
          focusable={true}
          highlightOnFocus={false}
          preferredFocus={true}
          childrenLayout="below"
          padding="standard"
          bottomSeparator="none"
        >
          <div style={rowStackStyle}>
            <div>
              <b>{"Detected non-Steam games"}:</b> {detectedCount}
            </div>
            <div>
              <b>{"Metadata saved"}:</b> {savedCount}
            </div>
            <div>
              <b>{"Missing metadata"}:</b> {missingCount}
            </div>
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCompatibilityDefaultControlRef}>
          <DropdownItem
            label="Default compatibility status"
            rgOptions={compatibilityDefaultOptions}
            selectedOption={compatibilityDefault}
            disabled={!compatibilityDefaultLoaded || compatibilityDefaultBusy}
            onMenuWillOpen={() => {
              onCompatibilityDefaultMenuWillOpen();
            }}
            onChange={(option) => onCompatibilityDefaultChange(option.data)}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Apply only to matched games"
          description="Shortcuts without saved metadata keep their original Steam status."
          bottomSeparator="none"
          checked={compatibilityDefaultMatchedOnly}
          disabled={
            !compatibilityDefaultLoaded ||
            compatibilityDefaultBusy ||
            compatibilityDefaultScopeBusy ||
            compatibilityDefault === null
          }
          onChange={onCompatibilityDefaultMatchedOnlyChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="none"
        >
          <div style={compactTextStyle}>
            {compatibilityDefaultMatchedOnly
              ? "This applies now to existing and new non-Steam shortcuts that have saved metadata, including games with a Steam match. Per-game choices take priority."
              : "This applies now to existing and new non-Steam shortcuts, including games with a Steam match. Per-game choices take priority."}
          </div>
          <div style={compactTextStyle}>
            {"Follow Valve is a per-game choice. Manual and default categories are your choices, not Valve certification."}
          </div>
          {compatibilityDefaultError ? (
            <div style={inlineStatusStyle("error")}>{compatibilityDefaultError}</div>
          ) : null}
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={scanBusy || detectedCount === 0}
          onClick={onRefreshMetadata}
        >
          {scanBusy ? (
            <ButtonLabel busy={true}>{"Refreshing..."}</ButtonLabel>
          ) : (
            "Refresh metadata"
          )}
        </ButtonItem>
        {scanBusy || scanMessage ? (
          <div style={inlineStatusStyle(scanStatusKind)}>
            {scanMessage || "Refreshing metadata..."}
          </div>
        ) : null}
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="none"
        >
          <div style={compactTextStyle}>
            Find and save metadata for detected non-Steam games that do not have a match yet.
          </div>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>Metadata cache</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={cacheBusy || scanBusy}
          onClick={onClearCache}
        >
          {cacheBusy ? (
            <ButtonLabel busy={true}>{"Clearing..."}</ButtonLabel>
          ) : (
            "Clear cache"
          )}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="standard"
        >
          <div style={{ ...compactTextStyle, paddingBottom: space.md }}>
            Clear saved matches and metadata so games can be matched again.
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
