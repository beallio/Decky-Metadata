import { ButtonItem, DropdownItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";

import {
  ButtonLabel,
  compactTextStyle,
  inlineStatusStyle,
  rowStackStyle,
  sectionHeadingStyle,
} from "../../styles";
import { space } from "../../tokens";
import type { StatusKind } from "../../tokens";
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../../types";

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

const compatibilityDefaultScopeOptions: Array<{
  data: CompatibilityDefaultScope;
  label: string;
}> = [
  { data: "steam", label: "Steam-matched games" },
  { data: "no-steam", label: "Saved games without a Steam ID" },
  { data: "metadata", label: "All games with saved metadata" },
  { data: "all", label: "All non-Steam games" },
];

const scopeDescription = (scope: CompatibilityDefaultScope) => ({
  steam: "Applies to saved records with a valid Steam App ID.",
  "no-steam": "Applies to saved records without a Steam ID, including manual and provider records.",
  metadata: "Applies to every saved metadata record, with or without a Steam ID.",
  all: "Applies to every native non-Steam shortcut, including shortcuts without a record.",
}[scope]);

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
  compatibilityDefaultScope: CompatibilityDefaultScope;
  compatibilityDefaultScopeBusy: boolean;
  onRefreshMetadata: () => void;
  onClearCache: () => void;
  onCompatibilityDefaultChange: (category: DeckCompatibilityCategory | null) => void;
  onCompatibilityDefaultScopeChange: (scope: CompatibilityDefaultScope) => void;
  onCompatibilityDefaultMenuWillOpen: (origin: "category" | "scope") => void;
  onCompatibilityDefaultControlRef: (element: HTMLDivElement | null) => void;
  onCompatibilityDefaultScopeControlRef: (element: HTMLDivElement | null) => void;
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
  compatibilityDefaultScope,
  compatibilityDefaultScopeBusy,
  onRefreshMetadata,
  onClearCache,
  onCompatibilityDefaultChange,
  onCompatibilityDefaultScopeChange,
  onCompatibilityDefaultMenuWillOpen,
  onCompatibilityDefaultControlRef,
  onCompatibilityDefaultScopeControlRef,
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
            layout="below"
            childrenContainerWidth="max"
            rgOptions={compatibilityDefaultOptions}
            selectedOption={compatibilityDefault}
            disabled={!compatibilityDefaultLoaded || compatibilityDefaultBusy || compatibilityDefaultScopeBusy}
            onMenuWillOpen={() => {
              onCompatibilityDefaultMenuWillOpen("category");
            }}
            onChange={(option) => onCompatibilityDefaultChange(option.data)}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCompatibilityDefaultScopeControlRef}>
          <DropdownItem
            label="Apply default to"
            layout="below"
            childrenContainerWidth="max"
            rgOptions={compatibilityDefaultScopeOptions}
            selectedOption={compatibilityDefaultScope}
            disabled={
              !compatibilityDefaultLoaded ||
              compatibilityDefaultBusy ||
              compatibilityDefaultScopeBusy ||
              compatibilityDefault === null
            }
            onMenuWillOpen={() => onCompatibilityDefaultMenuWillOpen("scope")}
            onChange={(option) => onCompatibilityDefaultScopeChange(option.data)}
            renderButtonValue={() => (
              <span style={{ whiteSpace: "normal" }}>
                {compatibilityDefaultScopeOptions.find((option) => option.data === compatibilityDefaultScope)?.label}
              </span>
            )}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field
          focusable={false}
          childrenLayout="below"
          padding="none"
          bottomSeparator="none"
        >
          <div style={compactTextStyle}>
            {`${scopeDescription(compatibilityDefaultScope)} Per-game choices take priority.`}
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
