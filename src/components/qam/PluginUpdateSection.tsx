import {
  ButtonItem,
  ConfirmModal,
  Field,
  Navigation,
  PanelSectionRow,
  showModal,
  ToggleField,
} from "@decky/ui";
import { CollapsibleSection } from "./CollapsibleSection";
import { FaExclamationTriangle, FaSyncAlt } from "react-icons/fa";
import { IoMdRefresh } from "react-icons/io";
import {
  UPDATE_CHECK_UI_TIMEOUT_MS,
  usePluginUpdateController,
} from "../../updater/pluginUpdateController";

import { formatDateTime, translateBackendError, useT } from "../../i18n";
import { BusySpinner, ButtonLabel, inlineStatusStyle } from "../../styles";
import { PluginUpdateCandidate, UpdateChannel } from "../../types";
import {
  isDeckyInstallerAvailable,
} from "../../updater/deckyInstaller";



export interface PluginUpdateSectionProps {
  currentVersion: string;
  updateChannel: UpdateChannel;
  automaticUpdateChecks: boolean;
  settingsLoaded: boolean;
  onToggleUpdateChannel: (enabled: boolean) => void;
  onToggleAutomaticUpdateChecks: (enabled: boolean) => void;
  onInstallVersionConfirmed?: (version: string) => void;
}

export function PluginUpdateSection({
  currentVersion,
  updateChannel,
  automaticUpdateChecks,
  settingsLoaded,
  onToggleUpdateChannel,
  onToggleAutomaticUpdateChecks,
  onInstallVersionConfirmed
}: PluginUpdateSectionProps) {
  const t = useT();
  const {
    effectiveCurrentVersion,
    candidate,
    checkResult,
    errorMessage: errorMsg,
    checkTimedOut,
    isChecking,
    isInstalling,
    isHandoffPending,
    installedReleasePublishedAt,
    checkNow,
    install: handleInstall,
  } = usePluginUpdateController({
    currentVersion,
    updateChannel,
    automaticUpdateChecks,
    settingsLoaded,
    onInstallVersionConfirmed,
  });

  const handleToggleChannel = (checked: boolean) => {
    if (checked) {
      showModal(
        <ConfirmModal
          strTitle={t("qam.update.enableDevelopmentTitle")}
          strDescription={t("qam.update.receiveDevelopmentDescription")}
          onOK={() => onToggleUpdateChannel(true)}
        />
      );
    } else {
      onToggleUpdateChannel(false);
    }
  };

  const handleInstallClick = (targetCandidate: PluginUpdateCandidate) => {
    if (targetCandidate.action === "downgrade_to_stable") {
      showModal(
        <ConfirmModal
          strTitle={t("qam.update.confirmRevertTitle")}
          strDescription={t("qam.update.confirmRevertBody", { version: targetCandidate.version })}
          onOK={() => handleInstall(targetCandidate)}
        />
      );
    } else {
      void handleInstall(targetCandidate);
    }
  };

  const isLocalBuild = effectiveCurrentVersion.includes("+");
  const isDeckyAvailable = isDeckyInstallerAvailable();
  const canInstallCandidate =
    isDeckyAvailable && (!isLocalBuild || candidate?.channel === "stable");

  const getActionText = (c: PluginUpdateCandidate) => {
    switch (c.action) {
      case "move_to_stable":
        return t("qam.update.actionMoveToStable", { version: c.version });
      case "downgrade_to_stable":
        return t("qam.update.actionRevertToStable", { version: c.version });
      default:
        if (c.channel === "development") {
          return t("qam.update.actionInstallDevelopment", { version: c.version });
        }
        return t("qam.update.actionUpdate", { version: c.version });
    }
  };

  const getStatusContent = () => {
    if (isChecking) {
      return <span style={inlineStatusStyle("active")}><BusySpinner />{t("qam.update.checking")}</span>;
    }
    if (errorMsg) {
      return (
        <span style={inlineStatusStyle("error")}>
          {checkTimedOut
            ? t("qam.update.checkInterrupted", { seconds: UPDATE_CHECK_UI_TIMEOUT_MS / 1000 })
            : t("qam.update.checkFailed")}
        </span>
      );
    }
    if (checkResult?.status === "current") {
      return <span style={inlineStatusStyle("success")}>{t("qam.update.upToDate")}</span>;
    }
    if (checkResult?.status === "available") {
      return (
        <span style={inlineStatusStyle("active")}>
          {candidate?.channel === "development" && effectiveCurrentVersion.includes("dev") && !installedReleasePublishedAt
            ? t("qam.update.latestDevelopment")
            : t("qam.update.updateAvailable")}
        </span>
      );
    }
    return <span style={inlineStatusStyle("idle")}>{t("qam.update.neverChecked")}</span>;
  };

  const lastCheckedText = checkResult?.checked_at
    ? t("qam.update.lastChecked", { date: formatDateTime(new Date(checkResult.checked_at)) })
    : undefined;

  return (
    <CollapsibleSection title={t("qam.update.title")} icon={<FaSyncAlt size={16} />}>
      <PanelSectionRow>
        <Field
          label={t("qam.update.installedVersion")}
          padding="standard"
          focusable={true}
          highlightOnFocus={true}
        >
          {effectiveCurrentVersion} {isLocalBuild ? t("qam.update.localBuild") : ""}
        </Field>
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label={t("qam.update.receiveDevelopment")}
          description={t("qam.update.receiveDevelopmentDescription")}
          checked={updateChannel === "development"}
          onChange={handleToggleChannel}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label={t("qam.update.autoCheck")}
          description={t("qam.update.autoCheckDescription")}
          checked={automaticUpdateChecks}
          onChange={onToggleAutomaticUpdateChecks}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <Field
          label={t("qam.update.status")}
          description={lastCheckedText}
          padding="standard"
          focusable={true}
          highlightOnFocus={true}
        >
          {getStatusContent()}
        </Field>
      </PanelSectionRow>

      {errorMsg && (
        <PanelSectionRow>
          <Field focusable={false} padding="standard" bottomSeparator="none">
            <div style={inlineStatusStyle("error")}>
              <span style={{ flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
                <FaExclamationTriangle />
              </span>
              <div>
                <div>{translateBackendError(errorMsg)}</div>
                {checkResult?.status === "failed" && checkResult.retry_after && (
                  <div>
                    {t("qam.update.tryAgainAfter", { date: formatDateTime(new Date(checkResult.retry_after)) })}
                  </div>
                )}
              </div>
            </div>
          </Field>
        </PanelSectionRow>
      )}

      {candidate && (
        <PanelSectionRow>
          <Field
            label={t("qam.update.candidate")}
            padding="standard"
            focusable={true}
            highlightOnFocus={true}
          >
            <div style={{ fontSize: "14px" }}>
              <div>{t("qam.update.newVersion", {
                version: candidate.version,
                channel: candidate.channel === "development" ? t("qam.update.channelDevelopment") : t("qam.update.channelStable"),
              })}</div>
              {candidate.action === "downgrade_to_stable" && (
                <div style={inlineStatusStyle("warning")}>{t("qam.update.downgradeWarning")}</div>
              )}
            </div>
          </Field>
        </PanelSectionRow>
      )}

      {/* A local +build may hand off only to a canonical stable release. */}
      {candidate && canInstallCandidate && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => handleInstallClick(candidate)}
            disabled={isChecking || isInstalling}
          >
            <ButtonLabel busy={isInstalling}>
              {isInstalling
                ? isHandoffPending ? t("qam.update.waitingForDecky") : t("qam.update.preparing")
                : getActionText(candidate)}
            </ButtonLabel>
          </ButtonItem>
          </PanelSectionRow>
      )}

      {candidate && !canInstallCandidate && (
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} padding="standard">
            <div style={inlineStatusStyle("error")}>
              {isLocalBuild && candidate.channel !== "stable"
                ? t("qam.update.localBuildOnlyStable")
                : t("qam.update.manualInstallUnavailable")}
            </div>
          </Field>
        </PanelSectionRow>
      )}

      {candidate && (
        <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={() => Navigation.NavigateToExternalWeb(candidate.release_url)}
            >
              {t("qam.update.viewReleaseNotes")}
            </ButtonItem>
        </PanelSectionRow>
      )}

      <PanelSectionRow>
          <ButtonItem
            layout="below"
            bottomSeparator="none"
            onClick={() => checkNow()}
            disabled={isChecking || isInstalling}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {isChecking ? (
                <BusySpinner />
              ) : (
                <IoMdRefresh />
              )}
              <span>{t("qam.update.checkNow")}</span>
            </div>
          </ButtonItem>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
