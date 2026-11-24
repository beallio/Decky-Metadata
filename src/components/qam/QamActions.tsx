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
