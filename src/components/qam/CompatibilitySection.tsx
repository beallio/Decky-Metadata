import { DropdownItem, Field, PanelSectionRow } from "@decky/ui";
import { SiSteamdeck } from "react-icons/si";

import { compactTextStyle, inlineStatusStyle } from "../../styles";
import { space } from "../../tokens";
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../../types";
import { CollapsibleSection } from "./CollapsibleSection";

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

const dropdownValueStyle = { whiteSpace: "normal" } as const;
const secondaryHelpStyle = { ...compactTextStyle, marginTop: space.sm } as const;

const scopeDescriptions: Record<CompatibilityDefaultScope, string> = {
  steam: "Applies to saved records with a valid Steam App ID.",
  "no-steam": "Applies to saved records without a Steam ID, including manual and provider records.",
  metadata: "Applies to every saved metadata record, with or without a Steam ID.",
  all: "Applies to every native non-Steam shortcut, including shortcuts without a record.",
};

type CompatibilitySectionProps = {
  initiallyExpanded?: boolean;
  compatibilityDefault: DeckCompatibilityCategory | null;
  compatibilityDefaultLoaded: boolean;
  compatibilityDefaultBusy: boolean;
  compatibilityDefaultError: string;
  compatibilityDefaultScope: CompatibilityDefaultScope;
  compatibilityDefaultScopeBusy: boolean;
  onCompatibilityDefaultChange: (category: DeckCompatibilityCategory | null) => void;
  onCompatibilityDefaultScopeChange: (scope: CompatibilityDefaultScope) => void;
  onCompatibilityDefaultMenuWillOpen: (origin: "category" | "scope") => void;
  onCompatibilityDefaultControlRef: (element: HTMLDivElement | null) => void;
  onCompatibilityDefaultScopeControlRef: (element: HTMLDivElement | null) => void;
};

export function CompatibilitySection({
  initiallyExpanded = false,
  compatibilityDefault,
  compatibilityDefaultLoaded,
  compatibilityDefaultBusy,
  compatibilityDefaultError,
  compatibilityDefaultScope,
  compatibilityDefaultScopeBusy,
  onCompatibilityDefaultChange,
  onCompatibilityDefaultScopeChange,
  onCompatibilityDefaultMenuWillOpen,
  onCompatibilityDefaultControlRef,
  onCompatibilityDefaultScopeControlRef,
}: CompatibilitySectionProps) {
  return (
    <CollapsibleSection title="Compatibility status" icon={<SiSteamdeck size={16} />} defaultExpanded={initiallyExpanded}>
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
            renderButtonValue={() => (
              <span style={dropdownValueStyle}>
                {compatibilityDefaultOptions.find((option) => option.data === compatibilityDefault)?.label}
              </span>
            )}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCompatibilityDefaultScopeControlRef}>
          <DropdownItem
            label="Apply default to"
            layout="below"
            childrenContainerWidth="max"
            bottomSeparator="none"
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
              <span style={dropdownValueStyle}>
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
            {`${scopeDescriptions[compatibilityDefaultScope]} Per-game choices take priority.`}
          </div>
          <div style={secondaryHelpStyle}>
            {"Follow Valve is a per-game choice. Manual and default categories are your choices, not Valve certification."}
          </div>
          {compatibilityDefaultError ? (
            <div style={inlineStatusStyle("error")}>{compatibilityDefaultError}</div>
          ) : null}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
