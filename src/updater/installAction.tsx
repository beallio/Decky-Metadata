import {
  ButtonItem,
  ConfirmModal,
  Field,
  PanelSectionRow,
  showModal,
} from "@decky/ui";
import type { PluginUpdateCandidate } from "../types";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { ButtonLabel, inlineStatusStyle } from "../styles";
import { isDeckyInstallerAvailable } from "./deckyInstaller";

export type PluginInstallActionProps = {
  candidate: PluginUpdateCandidate;
  currentVersion: string;
  isChecking: boolean;
  isInstalling: boolean;
  isHandoffPending: boolean;
  onInstall: (candidate: PluginUpdateCandidate) => Promise<void>;
  inline?: boolean;
  /** Settings row text (inline only): the candidate version, and any warning about it. */
  label?: ReactNode;
  description?: ReactNode;
};

export function canInstallCandidate(candidate: PluginUpdateCandidate, currentVersion: string): boolean {
  return isDeckyInstallerAvailable() && (!currentVersion.includes("+") || candidate.channel === "stable");
}

export function PluginInstallAction({
  candidate,
  currentVersion,
  isChecking,
  isInstalling,
  isHandoffPending,
  onInstall,
  inline = false,
  label,
  description,
}: PluginInstallActionProps) {
  const t = useT();
  const isLocalBuild = currentVersion.includes("+");
  const canInstall = canInstallCandidate(candidate, currentVersion);
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

  if (canInstall) {
    const actionText = isHandoffPending
      ? t("qam.update.waitingForDecky")
      : isInstalling
        ? t("qam.update.preparing")
        : getActionText();
    return inline ? (
      <ButtonItem
        layout="inline"
        label={label}
        description={description}
        onClick={handleInstallClick}
        disabled={isChecking || isInstalling || isHandoffPending}
      >
        <ButtonLabel busy={isInstalling || isHandoffPending}>{actionText}</ButtonLabel>
      </ButtonItem>
    ) : (
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator="none"
          onClick={handleInstallClick}
          disabled={isChecking || isInstalling || isHandoffPending}
        >
          <ButtonLabel busy={isInstalling || isHandoffPending}>{actionText}</ButtonLabel>
        </ButtonItem>
      </PanelSectionRow>
    );
  }
  const unavailableText = isLocalBuild && candidate.channel !== "stable"
    ? t("qam.update.localBuildOnlyStable")
    : t("qam.update.manualInstallUnavailable");
  return inline ? (
    <Field label={label} description={description} childrenLayout="below" focusable highlightOnFocus>
      <div style={inlineStatusStyle("error")}>{unavailableText}</div>
    </Field>
  ) : (
    <PanelSectionRow>
      <Field focusable={true} highlightOnFocus={true} padding="standard">
        <div style={inlineStatusStyle("error")}>{unavailableText}</div>
      </Field>
    </PanelSectionRow>
  );
}
