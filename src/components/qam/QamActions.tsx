import { ButtonItem, PanelSectionRow } from "@decky/ui";
import { useT } from "../../i18n";
import { openSettings } from "../../settingsRoute";
import { PluginInstallAction, canInstallCandidate } from "../../updater/installAction";
import { usePluginUpdateController } from "../../updater/pluginUpdateController";

export function QamInstallRow() {
  const update = usePluginUpdateController();
  const candidate = update.candidate;
  if (!candidate || !canInstallCandidate(candidate, update.effectiveCurrentVersion)) return null;

  return (
    <PluginInstallAction
      candidate={candidate}
      currentVersion={update.effectiveCurrentVersion}
      isChecking={update.isChecking}
      isInstalling={update.isInstalling}
      isHandoffPending={update.isHandoffPending}
      onInstall={update.install}
    />
  );
}

export function OpenSettingsButton() {
  const t = useT();
  return (
    <PanelSectionRow>
      <ButtonItem layout="below" bottomSeparator="none" onClick={openSettings}>
        {t("settings.open")}
      </ButtonItem>
    </PanelSectionRow>
  );
}
