import { ButtonItem, DialogControlsSection, ToggleField } from "@decky/ui";

import { useT } from "../../i18n";

type LogsSectionProps = {
  logsBusy: boolean;
  debugLogging: boolean;
  debugLoggingLoaded: boolean;
  debugLoggingBusy: boolean;
  onViewLogs: () => void;
  onToggleDebugLogging: (enabled: boolean) => void;
};

export function LogsBody({
  logsBusy,
  debugLogging,
  debugLoggingLoaded,
  debugLoggingBusy,
  onViewLogs,
  onToggleDebugLogging,
}: LogsSectionProps) {
  const t = useT();

  return (
    <DialogControlsSection>
      <ButtonItem
        layout="inline"
        label={t("qam.logs.view")}
        disabled={logsBusy}
        onClick={onViewLogs}
      >
        {t("settings.action.view")}
      </ButtonItem>
      <ToggleField
        label={t("qam.logs.debugLogging")}
        description={t("qam.logs.debugLoggingDescription")}
        checked={debugLogging}
        disabled={!debugLoggingLoaded || debugLoggingBusy}
        onChange={onToggleDebugLogging}
      />
    </DialogControlsSection>
  );
}
