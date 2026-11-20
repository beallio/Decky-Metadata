import { DropdownItem, Field, PanelSectionRow } from "@decky/ui";
import { SiSteamdeck } from "react-icons/si";

import { translateBackendError, useT } from "../../i18n";
import { inlineStatusStyle } from "../../styles";
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../../types";
import { CollapsibleSection } from "./CollapsibleSection";

const compatibilityDefaultData: ReadonlyArray<DeckCompatibilityCategory | null> = [null, 3, 2, 1, 0];
const compatibilityDefaultScopeData: ReadonlyArray<CompatibilityDefaultScope> = ["steam", "no-steam", "metadata", "all"];

const dropdownValueStyle = { whiteSpace: "normal" } as const;

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
  const t = useT();

  const categoryLabel = (category: DeckCompatibilityCategory | null) => {
    switch (category) {
      case null:
        return t("qam.compat.categoryAutomatic");
      case 3:
        return t("qam.compat.categoryVerified");
      case 2:
        return t("qam.compat.categoryPlayable");
      case 1:
        return t("qam.compat.categoryUnsupported");
      case 0:
        return t("qam.compat.categoryUnknown");
    }
  };

  const scopeLabel = (scope: CompatibilityDefaultScope) => {
    switch (scope) {
      case "steam":
        return t("qam.compat.scopeSteam");
      case "no-steam":
        return t("qam.compat.scopeNoSteam");
      case "metadata":
        return t("qam.compat.scopeMetadata");
      case "all":
        return t("qam.compat.scopeAll");
    }
  };

  const scopeDescription = (scope: CompatibilityDefaultScope) => {
    switch (scope) {
      case "steam":
        return t("qam.compat.scopeDescription.steam");
      case "no-steam":
        return t("qam.compat.scopeDescription.noSteam");
      case "metadata":
        return t("qam.compat.scopeDescription.metadata");
      case "all":
        return t("qam.compat.scopeDescription.all");
    }
  };

  const compatibilityDefaultOptions = compatibilityDefaultData.map((data) => ({
    data,
    label: categoryLabel(data),
  }));
  const compatibilityDefaultScopeOptions = compatibilityDefaultScopeData.map((data) => ({
    data,
    label: scopeLabel(data),
  }));
  const scopeHelpDescription = `${scopeDescription(compatibilityDefaultScope)} ${t("qam.compat.perGameNote")}`;
  return (
    <CollapsibleSection title={t("qam.compat.title")} icon={<SiSteamdeck size={16} />} defaultExpanded={initiallyExpanded}>
      <PanelSectionRow>
        <div ref={onCompatibilityDefaultControlRef}>
          <DropdownItem
            label={t("qam.compat.defaultStatus")}
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
            label={t("qam.compat.applyDefaultTo")}
            description={scopeHelpDescription}
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
      {compatibilityDefaultError ? (
        <PanelSectionRow>
          <Field focusable={false} padding="none" bottomSeparator="none">
            <div style={inlineStatusStyle("error")}>{translateBackendError(compatibilityDefaultError)}</div>
          </Field>
        </PanelSectionRow>
      ) : null}
    </CollapsibleSection>
  );
}
