import React from "react";
import {
  UPDATE_CHECK_UI_TIMEOUT_MS,
  usePluginUpdateController,
} from "../../updater/pluginUpdateController";
import {
  ButtonItem,
  ConfirmModal,
  Field,
  PanelSection,
  PanelSectionRow,
  showModal,
  ToggleField,
  Spinner,
  Navigation
} from "@decky/ui";
import { FaExclamationTriangle } from "react-icons/fa";
import { IoMdRefresh } from "react-icons/io";

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
          strTitle="Enable Development Releases?"
          onOK={() => onToggleUpdateChannel(true)}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            Includes prerelease builds intended for testing. These builds may contain regressions.
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
          strTitle="Revert to Stable?"
          onOK={() => handleInstall(targetCandidate)}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            Are you sure you want to revert to stable v{targetCandidate.version}? This is a downgrade and could result in data loss or configuration issues.
          </div>
        </ConfirmModal>
      );
    } else {
      void handleInstall(targetCandidate);
    }
  };

  const isLocalBuild = effectiveCurrentVersion.includes("+");
  const isDeckyAvailable = isDeckyInstallerAvailable();

  const getActionText = (c: PluginUpdateCandidate) => {
    switch (c.action) {
      case "move_to_stable":
        return `Move to Stable v${c.version}`;
      case "downgrade_to_stable":
        return `Revert to Stable v${c.version}`;
      default:
        if (c.channel === "development") {
          return `Install development build v${c.version}`;
        }
        return `Update to v${c.version}`;
    }
  };

  const getStatusContent = () => {
    if (isChecking) {
      return (
        <>
          <Spinner size="small" style={{ color: "#1a9fff" }} />
          <span>Checking...</span>
        </>
      );
    }
    if (errorMsg) {
      return (
        <span style={{ color: "#f87171" }}>
          {errorMsg.includes("interrupted")
            ? `Check interrupted after ${UPDATE_CHECK_UI_TIMEOUT_MS / 1000} seconds`
            : "Failed to check"}
        </span>
      );
    }
    if (checkResult?.status === "current") {
      return <span style={{ color: "#4ade80" }}>Up to date</span>;
    }
    if (checkResult?.status === "available") {
      return (
        <span style={{ color: "#60a5fa" }}>
          {candidate?.channel === "development" && effectiveCurrentVersion.includes("dev") && !installedReleasePublishedAt
            ? "Latest available development build"
            : "Update available"}
        </span>
      );
    }
    return <span>Never checked</span>;
  };

  const lastCheckedText = checkResult?.checked_at
    ? `Last checked: ${new Date(checkResult.checked_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`
    : undefined;

  return (
    <PanelSection title="Updates">
      <PanelSectionRow>
        <Field
          label="Installed Version"
          padding="standard"
          focusable={true}
          highlightOnFocus={true}
        >
          <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            {effectiveCurrentVersion} {isLocalBuild ? "(Local Build)" : ""}
          </div>
        </Field>
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Receive development releases"
          description="Includes prerelease builds intended for testing. These builds may contain regressions."
          checked={updateChannel === "development"}
          onChange={handleToggleChannel}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Automatically check for updates"
          description="Checks in the background while the plugin is loaded."
          checked={automaticUpdateChecks}
          onChange={onToggleAutomaticUpdateChecks}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <Field
          label="Status"
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
                  Try again after {new Date(checkResult.retry_after).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </PanelSectionRow>
      )}

      {candidate && (
        <PanelSectionRow>
          <Field
            label="Candidate"
            padding="standard"
            focusable={true}
            highlightOnFocus={true}
          >
            <div style={{ fontSize: "14px", color: "#cbd5e1" }}>
            <div>New version: v{candidate.version} ({candidate.channel})</div>
            {candidate.action === "downgrade_to_stable" && (
              <div style={{ color: "#f87171", fontSize: "12px", marginTop: "4px" }}>
                Warning: Reverting to stable is a downgrade.
              </div>
            )}
            </div>
          </Field>
        </PanelSectionRow>
      )}

      {/* Local +build packages are intentionally never handed to Decky. */}
      {candidate && isDeckyAvailable && !isLocalBuild && (
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
                    <span>{isHandoffPending ? "Waiting for Decky..." : "Preparing..."}</span>
                  </>
                ) : (
                  <span>{getActionText(candidate)}</span>
                )}
              </div>
            </ButtonItem>
        </PanelSectionRow>
      )}

      {candidate && (!isDeckyAvailable || isLocalBuild) && (
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} padding="standard">
            <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "8px" }}>
              {isLocalBuild
                ? "Local builds cannot self-update. Install this release manually from GitHub Releases."
                : "Automatic installation is unavailable in this Decky environment. Install this release manually from GitHub Releases."}
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
              View Release Notes
            </ButtonItem>
        </PanelSectionRow>
      )}

      <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => checkNow()}
            disabled={isChecking || isInstalling}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {isChecking ? (
                <Spinner style={{ width: "16px", height: "16px", color: "#1a9fff" }} />
              ) : (
                <IoMdRefresh />
              )}
              <span>Check now</span>
            </div>
          </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
