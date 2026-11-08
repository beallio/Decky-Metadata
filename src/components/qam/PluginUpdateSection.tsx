import React from "react";
import {
  UPDATE_CHECK_UI_TIMEOUT_MS,
  usePluginUpdateController,
} from "../../updater/pluginUpdateController";
import {
  ButtonItem,
  ConfirmModal,
  Field,
  PanelSectionRow,
  showModal,
  ToggleField,
  Spinner,
  Navigation
} from "@decky/ui";
import { CollapsibleSection } from "./CollapsibleSection";
import { FaExclamationTriangle, FaSyncAlt } from "react-icons/fa";
import { IoMdRefresh } from "react-icons/io";

import { t } from "../../i18n";
import { PluginUpdateCandidate, UpdateChannel } from "../../types";
import {
  isDeckyInstallerAvailable,
} from "../../updater/deckyInstaller";

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "20px",
  lineHeight: "20px",
};

const spinnerSlotStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  flex: "0 0 16px",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};


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
  const {
    effectiveCurrentVersion,
    candidate,
    checkResult,
    errorMessage: errorMsg,
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
          strTitle={t("qam.updates.confirmDev.title")}
          onOK={() => onToggleUpdateChannel(true)}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            {t("qam.updates.confirmDev.body")}
          </div>
        </ConfirmModal>
      );
    } else {
      onToggleUpdateChannel(false);
    }
  };

  const handleInstallClick = (targetCandidate: PluginUpdateCandidate) => {
    if (targetCandidate.action === "downgrade_to_stable") {
      showModal(
        <ConfirmModal
          strTitle={t("qam.updates.confirmRevert.title")}
          onOK={() => handleInstall(targetCandidate)}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            {t("qam.updates.confirmRevert.body", { version: targetCandidate.version })}
          </div>
        </ConfirmModal>
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
        return t("qam.updates.action.moveToStable", { version: c.version });
      case "downgrade_to_stable":
        return t("qam.updates.action.revertStable", { version: c.version });
      default:
        if (c.channel === "development") {
          return t("qam.updates.action.installDev", { version: c.version });
        }
        return t("qam.updates.action.update", { version: c.version });
    }
  };

  const getStatusContent = () => {
    if (isChecking) {
      return (
        <>
          <Spinner size="small" style={{ color: "#1a9fff" }} />
          <span>{t("qam.updates.checking")}</span>
        </>
      );
    }
    if (errorMsg) {
      return (
        <span style={{ color: "#f87171" }}>
          {errorMsg.includes("interrupted")
            ? t("qam.updates.interrupted", { seconds: UPDATE_CHECK_UI_TIMEOUT_MS / 1000 })
            : t("qam.updates.failed")}
        </span>
      );
    }
    if (checkResult?.status === "current") {
      return <span style={{ color: "#4ade80" }}>{t("qam.updates.upToDate")}</span>;
    }
    if (checkResult?.status === "available") {
      return (
        <span style={{ color: "#60a5fa" }}>
          {candidate?.channel === "development" && effectiveCurrentVersion.includes("dev") && !installedReleasePublishedAt
            ? t("qam.updates.latestDev")
            : t("qam.updates.available")}
        </span>
      );
    }
    return <span>{t("qam.updates.neverChecked")}</span>;
  };

  const lastCheckedText = checkResult?.checked_at
    ? t("qam.updates.lastChecked", {
      date: new Date(checkResult.checked_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }),
    })
    : undefined;

  return (
    <CollapsibleSection title={t("qam.updates.title")} icon={<FaSyncAlt size={16} />}>
      <PanelSectionRow>
        <Field
          label={t("qam.updates.installed")}
          childrenLayout="below"
          padding="standard"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            {effectiveCurrentVersion} {isLocalBuild ? t("qam.updates.localBuild") : ""}
          </div>
        </Field>
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label={t("qam.updates.dev")}
          description={t("qam.updates.devDesc")}
          checked={updateChannel === "development"}
          onChange={handleToggleChannel}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label={t("qam.updates.auto")}
          description={t("qam.updates.autoDesc")}
          checked={automaticUpdateChecks}
          onChange={onToggleAutomaticUpdateChecks}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <Field
          label={t("qam.updates.status")}
          description={lastCheckedText}
          padding="standard"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            {getStatusContent()}
          </div>
        </Field>
      </PanelSectionRow>

      {errorMsg && (
        <PanelSectionRow>
          <div style={{ display: "flex", gap: "8px", color: "#f87171", padding: "10px 15px", fontSize: "13px" }}>
            <span style={{ flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
              <FaExclamationTriangle />
            </span>
            <div>
              <div>{errorMsg}</div>
              {checkResult?.status === "failed" && checkResult.retry_after && (
                <div>
                  {t("qam.updates.retryAfter", { date: new Date(checkResult.retry_after).toLocaleString() })}
                </div>
              )}
            </div>
          </div>
        </PanelSectionRow>
      )}

      {candidate && (
        <PanelSectionRow>
          <Field
            label={t("qam.updates.candidate")}
            padding="standard"
            focusable={true}
            highlightOnFocus={true}
          >
            <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            <div>{t("qam.updates.newVersion", { version: candidate.version, channel: candidate.channel })}</div>
            {candidate.action === "downgrade_to_stable" && (
              <div style={{ color: "#f87171", fontSize: "12px", marginTop: "4px" }}>
                {t("qam.updates.downgradeWarning")}
              </div>
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
              <div style={buttonRowStyle}>
                {isInstalling ? (
                  <>
                    <div style={spinnerSlotStyle}>
                      <Spinner size="small" style={{ color: "#1a9fff" }} />
                    </div>
                    <span>{isHandoffPending ? t("qam.updates.waitingDecky") : t("qam.updates.preparing")}</span>
                  </>
                ) : (
                  <span>{getActionText(candidate)}</span>
                )}
              </div>
            </ButtonItem>
        </PanelSectionRow>
      )}

      {candidate && !canInstallCandidate && (
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} padding="standard">
            <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "8px" }}>
              {isLocalBuild && candidate.channel !== "stable"
                ? t("qam.updates.localOnly")
                : t("qam.updates.manualOnly")}
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
              {t("qam.updates.releaseNotes")}
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
                <Spinner style={{ width: "16px", height: "16px", color: "#1a9fff" }} />
              ) : (
                <IoMdRefresh />
              )}
              <span>{t("qam.updates.checkNow")}</span>
            </div>
          </ButtonItem>
      </PanelSectionRow>
    </CollapsibleSection>
  );
}
