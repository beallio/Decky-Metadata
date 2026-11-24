import {
  ButtonItem,
  ConfirmModal,
  Field,
  PanelSectionRow,
  showModal,
} from "@decky/ui";
import { PluginUpdateCandidate } from "../types";
import { useT } from "../i18n";
import { BusySpinner, ButtonLabel, inlineStatusStyle } from "../styles";
import { isDeckyInstallerAvailable } from "./deckyInstaller";

export type PluginInstallActionProps = {
  candidate: PluginUpdateCandidate;
  currentVersion: string;
  isChecking: boolean;
  isInstalling: boolean;
  isHandoffPending: boolean;
  onInstall: (candidate: PluginUpdateCandidate) => Promise<void>;
};

export function PluginInstallAction({
  candidate,
  currentVersion,
  isChecking,
  isInstalling,
  isHandoffPending,
  onInstall,
}: PluginInstallActionProps) {
  const t = useT();
  const isLocalBuild = currentVersion.includes("+");
  const canInstallCandidate =
    isDeckyInstallerAvailable() && (!isLocalBuild || candidate.channel === "stable");
  const getActionText = () => {
    switch (candidate.action) {
      case "move_to_stable":
        return t("qam.update.actionMoveToStable", { version: candidate.version });
      case "downgrade_to_stable":
        return t("qam.update.actionRevertToStable", { version: candidate.version });
      default:
        return candidate.channel === "development"
          ? t("qam.update.actionInstallDevelopment", { version: candidate.version })
          : t("qam.update.actionUpdate", { version: candidate.version });
    }
  };
  const handleInstallClick = () => {
    if (candidate.action === "downgrade_to_stable") {
      showModal(
        <ConfirmModal
          strTitle={t("qam.update.confirmRevertTitle")}
          strDescription={t("qam.update.confirmRevertBody", { version: candidate.version })}
          onOK={() => onInstall(candidate)}
        />
      );
    } else {
      void onInstall(candidate);
    }
  };

  return canInstallCandidate ? (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={handleInstallClick}
        disabled={isChecking || isInstalling}
      >
        <ButtonLabel busy={isInstalling}>
          {isInstalling
            ? isHandoffPending ? t("qam.update.waitingForDecky") : t("qam.update.preparing")
            : getActionText()}
        </ButtonLabel>
      </ButtonItem>
    </PanelSectionRow>
  ) : (
    <PanelSectionRow>
      <Field focusable={true} highlightOnFocus={true} padding="standard">
        <div style={inlineStatusStyle("error")}>
          {isLocalBuild && candidate.channel !== "stable"
            ? t("qam.update.localBuildOnlyStable")
            : t("qam.update.manualInstallUnavailable")}
        </div>
      </Field>
    </PanelSectionRow>
  );
}
