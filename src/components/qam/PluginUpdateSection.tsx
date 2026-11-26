import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  DropdownItem,
  Field,
  Navigation,
  showModal,
  ToggleField,
} from "@decky/ui";
import { useEffect, useState } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import {
  UPDATE_CHECK_UI_TIMEOUT_MS,
  usePluginUpdateController,
} from "../../updater/pluginUpdateController";
import { canInstallCandidate } from "../../updater/installAction";
import { formatDateTime, translateBackendError, useT } from "../../i18n";
import { ButtonLabel, inlineStatusStyle } from "../../styles";
import { statusColor } from "../../tokens";
import type { UpdateChannel } from "../../types";

// Matches SteamOS Settings -> System -> Software Updates: briefly show "Up-to-date"
// disabled right after a clean check before returning the button to "Check For Updates".
export const UP_TO_DATE_COOLDOWN_MS = 4_000;

const dropdownValueStyle = { whiteSpace: "normal" } as const;

export function PluginUpdateBody() {
  const t = useT();
  const {
    pluginVersion,
    updateChannel,
    automaticUpdateChecks,
    testingTabEnabled,
    settingsLoaded,
    candidate,
    checkResult,
    errorMessage,
    checkTimedOut,
    isChecking,
    isInstalling,
    isHandoffPending,
    checkNow,
    install,
    setUpdateChannel,
    setAutomaticUpdateChecks,
    setTestingTabEnabled,
  } = usePluginUpdateController();

  const [upToDateCooldown, setUpToDateCooldown] = useState(false);

  useEffect(() => {
    if (isChecking || errorMessage || checkResult?.status !== "current" || !checkResult.checked_at) {
      setUpToDateCooldown(false);
      return;
    }
    const checkedMs = Date.parse(checkResult.checked_at);
    const remaining = Number.isFinite(checkedMs) ? UP_TO_DATE_COOLDOWN_MS - (Date.now() - checkedMs) : 0;
    if (remaining <= 0) {
      setUpToDateCooldown(false);
      return;
    }
    setUpToDateCooldown(true);
    const timer = globalThis.setTimeout(() => setUpToDateCooldown(false), remaining);
    return () => globalThis.clearTimeout(timer);
  }, [isChecking, errorMessage, checkResult?.status, checkResult?.checked_at]);

  const isLocalBuild = pluginVersion.includes("+");
  const canInstall = candidate !== null && canInstallCandidate(candidate, pluginVersion);
  const installedLabel = pluginVersion
    ? `v${pluginVersion}${isLocalBuild ? ` ${t("qam.update.localBuild")}` : ""}`
    : "";

  const handleChannelChange = (next: UpdateChannel) => {
    if (next === updateChannel) return;
    if (next === "development") {
      showModal(
        <ConfirmModal
          strTitle={t("qam.update.enableDevelopmentTitle")}
          strDescription={t("qam.update.receiveDevelopmentDescription")}
          onOK={() => void setUpdateChannel(true)}
        />,
      );
    } else {
      void setUpdateChannel(false);
    }
  };

  const handleApplyClick = () => {
    if (!candidate) return;
    if (candidate.action === "downgrade_to_stable") {
      showModal(
        <ConfirmModal
          strTitle={t("qam.update.confirmRevertTitle")}
          strDescription={t("qam.update.confirmRevertBody", { version: candidate.version })}
          onOK={() => install(candidate)}
        />,
      );
    } else {
      void install(candidate);
    }
  };

  const primaryBusy = isChecking || isInstalling || isHandoffPending;
  const primaryDisabled = primaryBusy || upToDateCooldown;

  const getPrimaryButtonText = (): string => {
    if (isHandoffPending) return t("qam.update.waitingForDecky");
    if (isInstalling) return t("qam.update.applying");
    if (isChecking) return t("qam.update.checking");
    if (candidate && canInstall) {
      switch (candidate.action) {
        case "move_to_stable":
          return t("qam.update.moveToStableShort");
        case "downgrade_to_stable":
          return t("qam.update.revertToStableShort");
        default:
          return t("qam.update.apply");
      }
    }
    if (upToDateCooldown) return t("qam.update.upToDateButton");
    return t("qam.update.checkForUpdates");
  };

  const onPrimaryAction = () => {
    if (candidate && canInstall) {
      handleApplyClick();
    } else {
      void checkNow();
    }
  };

  const unavailableText = candidate && !canInstall
    ? (isLocalBuild && candidate.channel !== "stable"
      ? t("qam.update.localBuildOnlyStable")
      : t("qam.update.manualInstallUnavailable"))
    : null;

  const getSoftwareUpdatesDescription = () => {
    if (candidate) {
      const channelName = candidate.channel === "development"
        ? t("qam.update.channelDevelopment")
        : t("qam.update.channelStable");
      const versionLine = pluginVersion
        ? t("qam.update.versionArrow", { current: pluginVersion, next: candidate.version, channel: channelName })
        : t("qam.update.newVersion", { version: candidate.version, channel: channelName });
      return (
        <>
          <div>{versionLine}</div>
          {candidate.action === "downgrade_to_stable" && (
            <div style={{ color: statusColor("warning") }}>{t("qam.update.downgradeWarning")}</div>
          )}
          {unavailableText && (
            <div style={{ color: statusColor("error") }}>{unavailableText}</div>
          )}
        </>
      );
    }
    if (checkResult?.status === "current" && checkResult.checked_at) {
      const upToDateLine = t("qam.update.upToDateLastChecked", {
        date: formatDateTime(new Date(checkResult.checked_at)),
      });
      return installedLabel ? `${installedLabel} · ${upToDateLine}` : upToDateLine;
    }
    if (checkResult?.checked_at) {
      const checkedLine = t("qam.update.lastChecked", {
        date: formatDateTime(new Date(checkResult.checked_at)),
      });
      return installedLabel ? `${installedLabel} · ${checkedLine}` : checkedLine;
    }
    return installedLabel || t("qam.update.neverChecked");
  };

  const errorHeading = checkResult?.status === "failed"
    ? (checkTimedOut
      ? t("qam.update.checkInterrupted", { seconds: UPDATE_CHECK_UI_TIMEOUT_MS / 1000 })
      : t("qam.update.checkFailed"))
    : t("updater.installation.failedTitle");

  const channelOptions: Array<{ data: UpdateChannel; label: string }> = [
    { data: "stable", label: t("qam.update.channelOptionStable") },
    { data: "development", label: t("qam.update.channelOptionDevelopment") },
  ];

  return (
    <>
      <DialogControlsSection>
        <Field
          label={t("qam.update.softwareUpdates")}
          description={getSoftwareUpdatesDescription()}
          icon={candidate ? <FaExclamationTriangle style={{ color: statusColor("warning") }} /> : undefined}
          childrenContainerWidth="fixed"
        >
          <DialogButton onClick={onPrimaryAction} disabled={primaryDisabled}>
            <ButtonLabel busy={primaryBusy}>{getPrimaryButtonText()}</ButtonLabel>
          </DialogButton>
        </Field>
        {errorMessage && (
          <Field focusable={false} childrenLayout="below">
            <div style={inlineStatusStyle("error")}>
              <span style={{ flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
                <FaExclamationTriangle />
              </span>
              <div>
                <div>{errorHeading}</div>
                <div>{translateBackendError(errorMessage)}</div>
                {checkResult?.status === "failed" && checkResult.retry_after && (
                  <div>
                    {t("qam.update.tryAgainAfter", { date: formatDateTime(new Date(checkResult.retry_after)) })}
                  </div>
                )}
              </div>
            </div>
          </Field>
        )}
        {candidate && (
          <ButtonItem
            layout="inline"
            label={t("qam.update.viewReleaseNotes")}
            onClick={() => Navigation.NavigateToExternalWeb(candidate.release_url)}
          >
            {t("settings.action.view")}
          </ButtonItem>
        )}
        <DropdownItem
          label={t("qam.update.channelLabel")}
          description={
            updateChannel === "development"
              ? t("qam.update.receiveDevelopmentDescription")
              : t("qam.update.channelStableDescription")
          }
          rgOptions={channelOptions}
          selectedOption={updateChannel}
          disabled={!settingsLoaded || isInstalling || isHandoffPending}
          onChange={(option) => handleChannelChange(option.data)}
          renderButtonValue={() => (
            <span style={dropdownValueStyle}>
              {channelOptions.find((option) => option.data === updateChannel)?.label}
            </span>
          )}
        />
        <ToggleField
          label={t("qam.update.autoCheck")}
          description={t("qam.update.autoCheckDescription")}
          checked={automaticUpdateChecks}
          disabled={!settingsLoaded || isInstalling || isHandoffPending}
          onChange={(enabled: boolean) => void setAutomaticUpdateChecks(enabled)}
        />
      </DialogControlsSection>
      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.update.developerHeading")}</DialogControlsSectionHeader>
        <ToggleField
          label={t("qam.update.enableTestingTab")}
          description={t("qam.update.enableTestingTabDescription")}
          checked={testingTabEnabled}
          disabled={!settingsLoaded || isInstalling || isHandoffPending}
          onChange={(enabled: boolean) => void setTestingTabEnabled(enabled)}
        />
      </DialogControlsSection>
    </>
  );
}
