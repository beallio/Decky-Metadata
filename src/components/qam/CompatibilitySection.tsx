import { DropdownItem, Field, PanelSectionRow } from "@decky/ui";
import { SiSteamdeck } from "react-icons/si";

import { t } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { compactTextStyle, inlineStatusStyle } from "../../styles";
import { space } from "../../tokens";
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../../types";
import { CollapsibleSection } from "./CollapsibleSection";

const compatibilityDefaultOptions: Array<{
  data: DeckCompatibilityCategory | null;
  labelKey: MessageKey;
}> = [
  { data: null, labelKey: "qam.compatibility.option.automatic" },
  { data: 3, labelKey: "common.compatibility.verified" },
  { data: 2, labelKey: "common.compatibility.playable" },
  { data: 1, labelKey: "common.compatibility.unsupported" },
  { data: 0, labelKey: "common.compatibility.unknown" },
];

const compatibilityDefaultScopeOptions: Array<{
  data: CompatibilityDefaultScope;
  labelKey: MessageKey;
}> = [
  { data: "steam", labelKey: "qam.compatibility.scope.steam" },
  { data: "no-steam", labelKey: "qam.compatibility.scope.noSteam" },
  { data: "metadata", labelKey: "qam.compatibility.scope.metadata" },
  { data: "all", labelKey: "qam.compatibility.scope.all" },
];

const dropdownValueStyle = { whiteSpace: "normal" } as const;
const secondaryHelpStyle = { ...compactTextStyle, marginTop: space.sm } as const;

const scopeDescriptionKeys: Record<CompatibilityDefaultScope, MessageKey> = {
  steam: "qam.compatibility.scopeDesc.steam",
  "no-steam": "qam.compatibility.scopeDesc.noSteam",
  metadata: "qam.compatibility.scopeDesc.metadata",
  all: "qam.compatibility.scopeDesc.all",
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
  const categoryOptions = compatibilityDefaultOptions.map((option) => ({
    data: option.data,
    label: t(option.labelKey),
  }));
  const scopeOptions = compatibilityDefaultScopeOptions.map((option) => ({
    data: option.data,
    label: t(option.labelKey),
  }));

  return (
    <CollapsibleSection title={t("qam.compatibility.title")} icon={<SiSteamdeck size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <div ref={onCompatibilityDefaultControlRef}>
          <DropdownItem
            label={t("qam.compatibility.label.default")}
            layout="below"
            childrenContainerWidth="max"
            rgOptions={categoryOptions}
            selectedOption={compatibilityDefault}
            disabled={!compatibilityDefaultLoaded || compatibilityDefaultBusy || compatibilityDefaultScopeBusy}
            onMenuWillOpen={() => {
              onCompatibilityDefaultMenuWillOpen("category");
            }}
            onChange={(option) => onCompatibilityDefaultChange(option.data)}
            renderButtonValue={() => (
              <span style={dropdownValueStyle}>
                {categoryOptions.find((option) => option.data === compatibilityDefault)?.label}
              </span>
            )}
          />
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={onCompatibilityDefaultScopeControlRef}>
          <DropdownItem
            label={t("qam.compatibility.label.scope")}
            layout="below"
            childrenContainerWidth="max"
            bottomSeparator="none"
            rgOptions={scopeOptions}
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
                {scopeOptions.find((option) => option.data === compatibilityDefaultScope)?.label}
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
            {t("qam.compatibility.scopeHelp", {
              description: t(scopeDescriptionKeys[compatibilityDefaultScope]),
            })}
          </div>
          <div style={secondaryHelpStyle}>
            {t("qam.compatibility.note")}
          </div>
          {compatibilityDefaultError ? (
            <div style={inlineStatusStyle("error")}>{compatibilityDefaultError}</div>
          ) : null}
        </Field>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
