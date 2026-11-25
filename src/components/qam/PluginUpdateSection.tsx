import {
  ButtonItem,
  ConfirmModal,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Navigation,
  showModal,
  ToggleField,
} from "@decky/ui";
import { FaExclamationTriangle } from "react-icons/fa";
import {
  UPDATE_CHECK_UI_TIMEOUT_MS,
  usePluginUpdateController,
} from "../../updater/pluginUpdateController";
import { PluginInstallAction } from "../../updater/installAction";
import { formatDateTime, translateBackendError, useT } from "../../i18n";
import { BusySpinner, inlineStatusStyle, statusValueStyle } from "../../styles";
import { statusColor } from "../../tokens";
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
    installedReleasePublishedAt,
    checkNow,
    install,
    setUpdateChannel,
    setAutomaticUpdateChecks,
    setTestingTabEnabled,
  } = usePluginUpdateController();
  const isLocalBuild = pluginVersion.includes("+");
  const handleToggleChannel = (checked: boolean) => {
    if (checked) {
      showModal(
        <ConfirmModal
          strTitle={t("qam.update.enableDevelopmentTitle")}
          strDescription={t("qam.update.receiveDevelopmentDescription")}
          onOK={() => void setUpdateChannel(true)}
        />
      );
    } else {
      void setUpdateChannel(false);
    }
  };
  const getStatusContent = () => {
    if (isChecking) {
      return <span style={statusValueStyle("active")}><BusySpinner />{t("qam.update.checking")}</span>;
    }
    if (errorMessage) {
      return (
        <span style={statusValueStyle("error")}>
          {checkResult?.status === "failed"
            ? checkTimedOut
              ? t("qam.update.checkInterrupted", { seconds: UPDATE_CHECK_UI_TIMEOUT_MS / 1000 })
              : t("qam.update.checkFailed")
            : t("updater.installation.failedTitle")}
        </span>
      );
    }
    if (checkResult?.status === "current") {
      return <span style={statusValueStyle("success")}>{t("qam.update.upToDate")}</span>;
    }
    if (checkResult?.status === "available") {
      return (
        <span style={statusValueStyle("active")}>
          {candidate?.channel === "development" && pluginVersion.includes("dev") && !installedReleasePublishedAt
            ? t("qam.update.latestDevelopment")
            : t("qam.update.updateAvailable")}
        </span>
      );
    }
    return <span style={statusValueStyle("idle")}>{t("qam.update.neverChecked")}</span>;
  };
  const lastCheckedText = checkResult?.checked_at
    ? t("qam.update.lastChecked", { date: formatDateTime(new Date(checkResult.checked_at)) })
    : undefined;

  return (
    <>
      <DialogControlsSection>
        <Field label={t("qam.update.installedVersion")}>
          {pluginVersion} {isLocalBuild ? t("qam.update.localBuild") : ""}
        </Field>
        <ToggleField
          label={t("qam.update.receiveDevelopment")}
          description={t("qam.update.receiveDevelopmentDescription")}
          checked={updateChannel === "development"}
          disabled={!settingsLoaded || isInstalling || isHandoffPending}
          onChange={handleToggleChannel}
        />
        <ToggleField
          label={t("qam.update.autoCheck")}
          description={t("qam.update.autoCheckDescription")}
          checked={automaticUpdateChecks}
          disabled={!settingsLoaded || isInstalling || isHandoffPending}
          onChange={(enabled: boolean) => void setAutomaticUpdateChecks(enabled)}
        />
        <Field label={t("qam.update.status")} description={lastCheckedText}>
          {getStatusContent()}
        </Field>
        {errorMessage && (
          <Field focusable={false} childrenLayout="below">
            <div style={inlineStatusStyle("error")}>
              <span style={{ flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
                <FaExclamationTriangle />
              </span>
              <div>
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
          <PluginInstallAction
            candidate={candidate}
            currentVersion={pluginVersion}
            isChecking={isChecking}
            isInstalling={isInstalling}
            isHandoffPending={isHandoffPending}
            onInstall={install}
            inline
            label={t("qam.update.newVersion", {
              version: candidate.version,
              channel: candidate.channel === "development" ? t("qam.update.channelDevelopment") : t("qam.update.channelStable"),
            })}
            description={candidate.action === "downgrade_to_stable" ? (
              <span style={{ color: statusColor("warning") }}>{t("qam.update.downgradeWarning")}</span>
            ) : undefined}
          />
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
        <ButtonItem
          layout="inline"
          label={t("qam.update.checkNow")}
          onClick={() => void checkNow()}
          disabled={isChecking || isInstalling || isHandoffPending}
        >
          {t("settings.action.check")}
        </ButtonItem>
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
