import { ButtonItem, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaFileAlt } from "react-icons/fa";
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
    <CollapsibleSection title="Logs" icon={<FaFileAlt size={16} />}>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          disabled={logsBusy}
          onClick={onViewLogs}
        >
          {logsBusy ? "Loading..." : "View Logs"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Debug Logging"
          description="Enables verbose logging for troubleshooting."
          bottomSeparator="standard"
          checked={debugLogging}
          disabled={debugLoggingBusy}
          onChange={onToggleDebugLogging}
        />
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
