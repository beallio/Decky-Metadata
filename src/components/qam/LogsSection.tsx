import { ButtonItem, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaFileAlt } from "react-icons/fa";
import { t } from "../../i18n";
import { CollapsibleSection } from "./CollapsibleSection";

type LogsSectionProps = {
  logsBusy: boolean;
  debugLogging: boolean;
  debugLoggingBusy: boolean;
  onViewLogs: () => void;
  onToggleDebugLogging: (enabled: boolean) => void;
};

export function LogsSection({
  logsBusy,
  debugLogging,
  debugLoggingBusy,
  onViewLogs,
  onToggleDebugLogging,
}: LogsSectionProps) {
  return (
    <CollapsibleSection title={t("qam.logs.title")} icon={<FaFileAlt size={16} />}>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={logsBusy}
          onClick={onViewLogs}
        >
          {logsBusy ? t("common.loading") : t("qam.logs.view")}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("qam.logs.debug")}
          description={t("qam.logs.debugDesc")}
          bottomSeparator="none"
          checked={debugLogging}
          disabled={debugLoggingBusy}
          onChange={onToggleDebugLogging}
        />
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
