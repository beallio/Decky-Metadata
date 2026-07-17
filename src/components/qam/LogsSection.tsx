import { ButtonItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";

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
    <PanelSection title="Logs">
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
          bottomSeparator="none"
          checked={debugLogging}
          disabled={debugLoggingBusy}
          onChange={onToggleDebugLogging}
        />
      </PanelSectionRow>
    </PanelSection>
  );
}
