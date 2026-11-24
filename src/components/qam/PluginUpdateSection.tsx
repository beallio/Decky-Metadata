import {
  ButtonItem,
  ConfirmModal,
  Field,
  Navigation,
  PanelSectionRow,
  showModal,
  ToggleField,
} from "@decky/ui";
import { FaExclamationTriangle } from "react-icons/fa";
import { IoMdRefresh } from "react-icons/io";
import {
  UPDATE_CHECK_UI_TIMEOUT_MS,
  usePluginUpdateController,
} from "../../updater/pluginUpdateController";
import { PluginInstallAction } from "../../updater/installAction";
import { formatDateTime, translateBackendError, useT } from "../../i18n";
import { BusySpinner, inlineStatusStyle } from "../../styles";

export function PluginUpdateBody() {
  const t = useT();
  const {
    effectiveCurrentVersion,
    updateChannel,
    automaticUpdateChecks,
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
  } = usePluginUpdateController();
  const isLocalBuild = effectiveCurrentVersion.includes("+");
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
      return <span style={inlineStatusStyle("active")}><BusySpinner />{t("qam.update.checking")}</span>;
    }
    if (errorMessage) {
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
    <>
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
          disabled={!settingsLoaded}
          onChange={handleToggleChannel}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label={t("qam.update.autoCheck")}
          description={t("qam.update.autoCheckDescription")}
          checked={automaticUpdateChecks}
          disabled={!settingsLoaded}
          onChange={(enabled: boolean) => void setAutomaticUpdateChecks(enabled)}
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

      {errorMessage && (
        <PanelSectionRow>
          <Field focusable={false} padding="standard" bottomSeparator="none">
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

      {candidate && (
        <PluginInstallAction
          candidate={candidate}
          currentVersion={effectiveCurrentVersion}
          isChecking={isChecking}
          isInstalling={isInstalling}
          isHandoffPending={isHandoffPending}
          onInstall={install}
        />
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
          onClick={() => void checkNow()}
          disabled={isChecking || isInstalling}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {isChecking ? <BusySpinner /> : <IoMdRefresh />}
            <span>{t("qam.update.checkNow")}</span>
          </div>
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}
