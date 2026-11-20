import { ButtonItem, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaFileAlt } from "react-icons/fa";
import { CollapsibleSection } from "./CollapsibleSection";

import { useT } from "../../i18n";
import { ButtonLabel } from "../../styles";

type LogsSectionProps = {
  logsBusy: boolean;
  debugLogging: boolean;
  debugLoggingLoaded: boolean;
  debugLoggingBusy: boolean;
  onViewLogs: () => void;
  onToggleDebugLogging: (enabled: boolean) => void;
};

export function LogsSection({
  logsBusy,
  debugLogging,
  debugLoggingLoaded,
  debugLoggingBusy,
  onViewLogs,
  onToggleDebugLogging,
}: LogsSectionProps) {
  const t = useT();

  return (
    <CollapsibleSection title={t("qam.logs.title")} icon={<FaFileAlt size={16} />}>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={logsBusy}
          onClick={onViewLogs}
        >
          {logsBusy ? <ButtonLabel busy>{t("qam.logs.loading")}</ButtonLabel> : t("qam.logs.view")}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.logs.debugLogging")}
          description={t("qam.logs.debugLoggingDescription")}
          bottomSeparator="none"
          checked={debugLogging}
          disabled={!debugLoggingLoaded || debugLoggingBusy}
        />
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
