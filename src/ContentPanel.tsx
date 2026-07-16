import { showModal } from "@decky/ui";
import { useCallback, useEffect, useState } from "react";

import {
  clearMetadataCache,
  getDebugLogging,
  getDelistedIndexStatus,
  getMissingMetadataCount,
  getPluginLogs,
  getPluginVersion,
  getScanProgress,
  refreshDelistedIndex,
  setDebugLogging,
  startScanMissing,
} from "./backend";
import { DelistedIndexSection } from "./components/qam/DelistedIndexSection";
import { LogsSection } from "./components/qam/LogsSection";
import { MetadataSection } from "./components/qam/MetadataSection";
import { PluginLogModal } from "./components/qam/PluginLogModal";
import { VersionsSection } from "./components/qam/VersionsSection";
import * as log from "./log";
import { metadataCache, refreshMetadataCache } from "./steam";
import { qamPanelStyle } from "./styles";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import { GameOption } from "./types";
import { useNonSteamGames } from "./useNonSteamGames";

// Version is fetched from the backend on mount; "" means not yet loaded.
export const PLUGIN_VERSION = "";

const scanCompleteMessage = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}) => {
  const total = Number(progress.total || 0);
  if (!total) return "Refresh complete";
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed
    ? `Refresh complete: ${assigned}/${total} saved, ${failed} not matched`
    : `Refresh complete: ${assigned}/${total} saved`;
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
  const [cacheBusy, setCacheBusy] = useState(false);
  const [delistedStatus, setDelistedStatus] = useState<{
    count: number;
    fetched_at: number;
  } | null>(null);
  const [delistedBusy, setDelistedBusy] = useState(false);
  const [logsBusy, setLogsBusy] = useState(false);
  const [debugLogging, setDebugLoggingState] = useState(false);
  const [debugLoggingBusy, setDebugLoggingBusy] = useState(false);
  const [pluginVersion, setPluginVersion] = useState(PLUGIN_VERSION);

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
    if (debugLoggingBusy) return;
    setDebugLoggingBusy(true);
    setDebugLoggingState(enabled);
    log.setVerboseLogging(enabled);
    try {
      const saved = await setDebugLogging(enabled);
      setDebugLoggingState(saved);
      log.setVerboseLogging(saved);
      log.info("bridge", "debug logging setting updated", saved);
    } catch (error) {
      log.warn("bridge", "debug logging setting update failed", error);
    } finally {
      setDebugLoggingBusy(false);
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
          toastSuccess("Metadata", "Refresh complete");
        }
      }, 800);
    } catch (error) {
      setBusy(false);
      setScanStatusKind("error");
      setScanMessage(String(error));
      toastError("Metadata refresh failed", String(error));
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

  const viewLogs = async () => {
    if (logsBusy) return;
    setLogsBusy(true);
    try {
      const logs = await getPluginLogs();
      let modal: ReturnType<typeof showModal> | undefined;
      modal = showModal(
        <PluginLogModal logs={logs} closeModal={() => modal?.Close()} />
      );
    } catch (error) {
      log.warn("bridge", "plugin log load failed", error);
      toastError("Logs", "Plugin logs could not be loaded");
    } finally {
      setLogsBusy(false);
    }
  };

  const delistedStatusText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `${delistedStatus.count} delisted apps · updated ${epochToDate(delistedStatus.fetched_at)}`
      : "Delisted index not downloaded yet";

  return (
    <div style={qamPanelStyle}>
      <MetadataSection
        detectedCount={games.length}
        savedCount={metadataCount}
        missingCount={missing}
        scanBusy={busy}
        scanMessage={scanMessage}
        scanStatusKind={scanStatusKind}
        cacheBusy={cacheBusy}
        onRefreshMetadata={() => void scanMissing()}
        onClearCache={() => void clearCache()}
      />
      <DelistedIndexSection
        statusText={delistedStatusText}
        busy={delistedBusy}
        onRefresh={() => void refreshDelisted()}
      />
      <LogsSection
        logsBusy={logsBusy}
        debugLogging={debugLogging}
        debugLoggingBusy={debugLoggingBusy}
        onViewLogs={() => void viewLogs()}
        onToggleDebugLogging={(enabled) => void saveDebugLogging(enabled)}
      />
      <VersionsSection pluginVersion={pluginVersion} />
    </div>
  );
};
