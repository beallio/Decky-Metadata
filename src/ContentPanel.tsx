import { Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useCallback, useEffect, useState } from "react";
import {
  getDebugLogging,
  getActivityRefreshProgress,
  setDebugLogging,
  startRefreshSteamActivities,
  startScanMissing,
  getMissingMetadataCount,
  getScanProgress,
  clearMetadataCache,
  getDelistedIndexStatus,
  getPluginVersion,
  refreshDelistedIndex,
} from "./backend";
import * as log from "./log";
import { metadataCache, refreshMetadataCache } from "./steam";
import { GameOption } from "./types";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import {
  actionButtonStackStyle,
  BusySpinner,
  ButtonLabel,
  compactTextStyle,
  diagnosticsGridStyle,
  diagnosticsRowStyle,
  diagnosticsValueStyle,
  FocusableButton,
  inlineStatusStyle,
  qamPanelStyle,
  rowStackStyle,
  sectionHeadingStyle,
  spacedButtonRowStyle,
} from "./styles";
import { useNonSteamGames } from "./useNonSteamGames";

// Version is fetched from the backend on mount; "" means not yet loaded.
export const PLUGIN_VERSION = "";

export const splitVersion = (version: string): { base: string; commit: string | null } => {
  const trimmed = String(version || "").trim();
  const separator = trimmed.indexOf("+");
  if (separator < 0) {
    return { base: trimmed, commit: null };
  }
  const base = trimmed.slice(0, separator).trim();
  const commit = trimmed.slice(separator + 1).trim();
  return { base, commit: commit || null };
};

const scanCompleteMessage = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}) => {
  const total = Number(progress.total || 0);
  if (!total) return "Scan complete";
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed
    ? `Scan complete: ${assigned}/${total} saved, ${failed} not matched`
    : `Scan complete: ${assigned}/${total} saved`;
};

const scanCompleteStatusKind = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}): StatusKind => {
  const total = Number(progress.total || 0);
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed > 0 || (total > 0 && assigned < total) ? "warning" : "success";
};

const activityCompleteMessage = (progress: {
  total?: number;
  assigned?: number;
}) => {
  const total = Number(progress.total || 0);
  if (!total) return "Activity refresh complete";
  return `Activity refresh complete: ${Number(progress.assigned || 0)}/${total} updated`;
};

const epochToDate = (value?: number | null) => {
  if (!value) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export const Content = () => {
  const { games, loadGames } = useNonSteamGames();
  const [metadataCount, setMetadataCount] = useState(0);
  const [missing, setMissing] = useState(0);
  const [busy, setBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanStatusKind, setScanStatusKind] = useState<StatusKind>("idle");
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [activityStatusKind, setActivityStatusKind] = useState<StatusKind>("idle");
  const [cacheBusy, setCacheBusy] = useState(false);
  const [delistedStatus, setDelistedStatus] = useState<{
    count: number;
    fetched_at: number;
  } | null>(null);
  const [delistedBusy, setDelistedBusy] = useState(false);
  const [debugLogging, setDebugLoggingState] = useState(false);
  const [pluginVersion, setPluginVersion] = useState(PLUGIN_VERSION);

  const parsedPluginVersion = splitVersion(pluginVersion);

  const updateMissingCount = useCallback((currentGames: GameOption[]) => {
    void getMissingMetadataCount(currentGames)
      .then(setMissing)
      .catch((error) => log.warn("bridge", "missing metadata count load failed", error));
  }, []);

  const refresh = useCallback(async () => {
    await refreshMetadataCache();
    const loadedGames = await loadGames();
    setMetadataCount(Object.keys(metadataCache).length);
    updateMissingCount(loadedGames);
  }, [loadGames, updateMissingCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDelistedStatus = useCallback(async () => {
    try {
      setDelistedStatus(await getDelistedIndexStatus());
    } catch (error) {
      log.warn("bridge", "delisted index status load failed", error);
    }
  }, []);

  useEffect(() => {
    void loadDelistedStatus();
  }, [loadDelistedStatus]);

  useEffect(() => {
    let cancelled = false;
    void getPluginVersion()
      .then((version) => {
        if (!cancelled && version) {
          setPluginVersion(version);
        }
      })
      .catch((error) => log.warn("bridge", "plugin version load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDebugLogging()
      .then((enabled) => {
        if (!cancelled) {
          setDebugLoggingState(enabled);
          log.setVerboseLogging(enabled);
        }
      })
      .catch((error) => log.warn("bridge", "debug logging setting load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDebugLogging = async (enabled: boolean) => {
    setDebugLoggingState(enabled);
    log.setVerboseLogging(enabled);
    try {
      const saved = await setDebugLogging(enabled);
      setDebugLoggingState(saved);
      log.setVerboseLogging(saved);
      log.info("bridge", "debug logging setting updated", saved);
    } catch (error) {
      log.warn("bridge", "debug logging setting update failed", error);
    }
  };

  const scanMissing = async () => {
    if (busy) return;
    setBusy(true);
    setScanMessage("");
    setScanStatusKind("active");
    try {
      await startScanMissing(games);
      const interval = window.setInterval(async () => {
        const progress = await getScanProgress();
        setScanStatusKind("active");
        setScanMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (!progress.running) {
          window.clearInterval(interval);
          await refresh();
          setBusy(false);
          setScanStatusKind(scanCompleteStatusKind(progress));
          setScanMessage(scanCompleteMessage(progress));
          toastSuccess("Scan", "Scan complete");
        }
      }, 800);
    } catch (error) {
      setBusy(false);
      setScanStatusKind("error");
      setScanMessage(String(error));
      toastError("Scan failed", String(error));
    }
  };

  const refreshActivities = async () => {
    if (activityBusy) return;
    setActivityBusy(true);
    setActivityStatusKind("active");
    setActivityMessage("Refreshing Activity...");
    try {
      await startRefreshSteamActivities(games);
      const interval = window.setInterval(async () => {
        const progress = await getActivityRefreshProgress();
        setActivityStatusKind("active");
        setActivityMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (!progress.running) {
          window.clearInterval(interval);
          await refreshMetadataCache();
          setMetadataCount(Object.keys(metadataCache).length);
          updateMissingCount(games);
          setActivityBusy(false);
          setActivityStatusKind("success");
          setActivityMessage(activityCompleteMessage(progress));
          window.dispatchEvent(new Event("decky-metadata:activity-refreshed"));
          window.dispatchEvent(new Event("decky-metadata:updated"));
          toastSuccess("Activity", activityCompleteMessage(progress));
        }
      }, 800);
    } catch (error) {
      setActivityBusy(false);
      setActivityStatusKind("error");
      setActivityMessage(String(error));
      toastError("Activity failed", String(error));
    }
  };


  const clearCache = async () => {
    if (cacheBusy || busy) return;
    setCacheBusy(true);
    try {
      await clearMetadataCache();
      await refreshMetadataCache();
      if (games.length) {
        void startScanMissing(games).catch((error) => {
          log.warn("bridge", "metadata scan start after clear cache failed", error);
        });
      }
      setMetadataCount(Object.keys(metadataCache).length);
      updateMissingCount(games);
      toastSuccess("Cache", "Metadata cache cleared");
    } catch (error) {
      toastError("Cache clear failed", String(error));
    } finally {
      setCacheBusy(false);
    }
  };

  const refreshDelisted = async () => {
    if (delistedBusy) return;
    setDelistedBusy(true);
    try {
      const result = await refreshDelistedIndex();
      if (!result.ok) {
        throw new Error("Delisted index refresh failed");
      }
      toastSuccess("Delisted index", "Delisted index updated");
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toastError("Delisted index", "Delisted index refresh failed");
    } finally {
      setDelistedBusy(false);
    }
  };

  const delistedStatusText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `${delistedStatus.count} delisted apps · updated ${epochToDate(delistedStatus.fetched_at)}`
      : "Delisted index not downloaded yet";


  return (
    <div style={qamPanelStyle}>
      <PanelSection>
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
            <div style={rowStackStyle}>
              <div>
                <b>{"Detected non-Steam games"}:</b> {games.length}
              </div>
              <div>
                <b>{"Metadata saved"}:</b> {metadataCount}
              </div>
              <div>
                <b>{"Missing metadata"}:</b> {missing}
              </div>
            </div>
          </Field>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection>
        <PanelSectionRow>
          <div style={spacedButtonRowStyle}>
            <div style={actionButtonStackStyle}>
              <FocusableButton
                className="DialogButton"
                disabled={busy || !games.length}
                onClick={scanMissing}
              >
                {busy ? (
                  <ButtonLabel busy={true}>{"Scanning..."}</ButtonLabel>
                ) : (
                  <ButtonLabel>{"Scan metadata"}</ButtonLabel>
                )}
              </FocusableButton>
              {busy || scanMessage ? (
                <div style={inlineStatusStyle(scanStatusKind)}>{scanMessage || "Scanning..."}</div>
              ) : null}
            </div>
            <div style={actionButtonStackStyle}>
              <FocusableButton
                className="DialogButton"
                disabled={activityBusy || busy || !games.length}
                onClick={refreshActivities}
              >
                {activityBusy ? "Refreshing Activity..." : "Refresh Activity"}
              </FocusableButton>
              {activityBusy || activityMessage ? (
                <div style={inlineStatusStyle(activityStatusKind)}>{activityMessage || "Refreshing Activity..."}</div>
              ) : null}
            </div>
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={sectionHeadingStyle}>{"Metadata cache"}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <div style={compactTextStyle}>{"Clear cached Steam matches and metadata so games re-fetch and re-match."}</div>
            <div style={inlineStatusStyle(delistedBusy ? "active" : "idle")}>
              {delistedBusy ? (
                <BusySpinner />
              ) : null}
              <span>{delistedStatusText}</span>
            </div>
            <FocusableButton
              className="DialogButton"
              disabled={delistedBusy}
              onClick={refreshDelisted}
            >
              {delistedBusy ? (
                <ButtonLabel busy={true}>{"Refreshing..."}</ButtonLabel>
              ) : (
                <ButtonLabel>{"Refresh delisted index"}</ButtonLabel>
              )}
            </FocusableButton>
            <FocusableButton
              className="DialogButton"
              disabled={cacheBusy || busy}
              onClick={clearCache}
            >
              {"Clear cache"}
            </FocusableButton>
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={sectionHeadingStyle}>{"Diagnostics"}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            highlightOnFocus={false}
            label="Debug Logging"
            checked={debugLogging}
            onChange={(checked) => void saveDebugLogging(checked)}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Versions">
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
            <div style={diagnosticsGridStyle}>
              <div style={diagnosticsRowStyle}>
                <span>{"Plugin"}</span>
                <span style={diagnosticsValueStyle}>{parsedPluginVersion.base}</span>
              </div>
              <div style={diagnosticsRowStyle}>
                <span>{"Commit"}</span>
                <span style={diagnosticsValueStyle}>{parsedPluginVersion.commit || "local"}</span>
              </div>
              <div style={diagnosticsRowStyle}>
                <span>{"Delisted index"}</span>
                <span style={diagnosticsValueStyle}>{delistedStatusText}</span>
              </div>
              <div style={diagnosticsRowStyle}>
                <span>{"Metadata"}</span>
                <span style={diagnosticsValueStyle}>{metadataCount}</span>
              </div>
            </div>
          </Field>
        </PanelSectionRow>
      </PanelSection>
    </div>
  );
};
