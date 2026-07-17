import {
  Focusable,
  getGamepadNavigationTrees,
  NavEntryPositionPreferences,
  showModal,
} from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearMetadataCache,
  getDebugLogging,
  getDelistedIndexStatus,
  getMissingMetadataCount,
  getPluginLogs,
  getPluginVersion,
  getScanProgress,
  getSystemVersions,
  getUpdateSettings,
  refreshDelistedIndex,
  setAutomaticUpdateChecks,
  setDebugLogging,
  setUpdateChannel,
  startScanMissing,
} from "./backend";
import { DelistedIndexSection } from "./components/qam/DelistedIndexSection";
import { LogsSection } from "./components/qam/LogsSection";
import { MetadataSection } from "./components/qam/MetadataSection";
import { PluginLogModal } from "./components/qam/PluginLogModal";
import { PluginUpdateSection } from "./components/qam/PluginUpdateSection";
import { VersionsSection } from "./components/qam/VersionsSection";
import * as log from "./log";
import { metadataCache, refreshMetadataCache } from "./steam";
import { qamPanelStyle } from "./styles";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import {
  GameOption,
  UpdateChannel,
} from "./types";
import {
  resolveLoadedUpdateSettings,
  resolveSavedUpdateSettings,
} from "./updater/updateSettings";
import { useNonSteamGames } from "./useNonSteamGames";

// Version is fetched from the backend on mount; "" means not yet loaded.
export const PLUGIN_VERSION = "";

type NativeFocusNode = {
  Element?: HTMLElement;
  m_rgChildren?: NativeFocusNode[];
  BTakeFocus?: () => boolean;
};

type NativeNavigationTree = {
  Root?: NativeFocusNode;
};

const takePreferredPanelFocus = (element: HTMLDivElement): boolean => {
  try {
    const trees = (getGamepadNavigationTrees() || []) as NativeNavigationTree[];
    for (const tree of trees) {
      const pending = tree.Root ? [tree.Root] : [];
      while (pending.length) {
        const node = pending.pop();
        if (!node) continue;
        if (node.Element === element && typeof node.BTakeFocus === "function") {
          return Boolean(node.BTakeFocus());
        }
        if (Array.isArray(node.m_rgChildren)) {
          pending.push(...node.m_rgChildren);
        }
      }
    }
  } catch (error) {
    log.warn("qam", "preferred metadata focus unavailable", error);
  }
  return false;
};

const findScrollViewport = (element: HTMLElement): HTMLElement | null => {
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

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

const epochToUsDate = (value?: number | null) => {
  if (!value) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${date.getUTCFullYear()}`;
};

export const Content = () => {
  const focusFrame = useRef<number | null>(null);
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
  const [deckyVersion, setDeckyVersion] = useState("");
  const [steamosVersion, setSteamosVersion] = useState("");
  const [updateChannel, setUpdateChannelState] =
    useState<UpdateChannel>("stable");
  const [automaticUpdateChecks, setAutomaticUpdateChecksState] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const focusPanel = useCallback((element: HTMLDivElement | null) => {
    if (focusFrame.current !== null) {
      window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    }
    if (element) {
      focusFrame.current = window.requestAnimationFrame(() => {
        focusFrame.current = null;
        takePreferredPanelFocus(element);
        // Taking focus scrolls the summary up, hiding the panel's "Metadata"
        // title (Steam's gamepad focus scroll ignores CSS scroll-padding). The
        // summary is the first row, so snap the viewport back to the top on
        // entry to keep the title visible.
        const viewport = findScrollViewport(element);
        if (viewport) {
          window.requestAnimationFrame(() => {
            viewport.scrollTop = 0;
          });
        }
      });
    }
  }, []);

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
    void getUpdateSettings()
      .then((settings) => {
        if (cancelled) return;
        const resolved = resolveLoadedUpdateSettings(settings);
        setUpdateChannelState(resolved.update_channel);
        setAutomaticUpdateChecksState(resolved.automatic_update_checks);
      })
      .catch((error) => {
        if (!cancelled) {
          setUpdateChannelState("stable");
          setAutomaticUpdateChecksState(true);
          log.warn("bridge", "update settings load failed", error);
        }
      })
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSystemVersions()
      .then((versions) => {
        if (!cancelled) {
          setDeckyVersion(versions.decky || "");
          setSteamosVersion(versions.steamos || "");
        }
      })
      .catch((error) => log.warn("bridge", "system versions load failed", error));
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

  const saveUpdateChannel = async (enabled: boolean) => {
    const previous = updateChannel;
    const requested: UpdateChannel = enabled ? "development" : "stable";
    setUpdateChannelState(requested);
    try {
      const saved = await setUpdateChannel(requested);
      if ("status" in saved) {
        const rolledBack = resolveSavedUpdateSettings(
          {
            update_channel: previous,
            automatic_update_checks: automaticUpdateChecks,
          },
          saved
        );
        setUpdateChannelState(rolledBack.update_channel);
        toastError("Updates", saved.message || "Update channel could not be saved");
        return;
      }
      setUpdateChannelState(saved.update_channel);
      setAutomaticUpdateChecksState(saved.automatic_update_checks);
    } catch (error) {
      setUpdateChannelState(previous);
      log.warn("bridge", "update channel save failed", error);
    }
  };

  const saveAutomaticUpdateChecks = async (enabled: boolean) => {
    const previous = automaticUpdateChecks;
    setAutomaticUpdateChecksState(enabled);
    try {
      const saved = await setAutomaticUpdateChecks(enabled);
      if ("status" in saved) {
        const rolledBack = resolveSavedUpdateSettings(
          {
            update_channel: updateChannel,
            automatic_update_checks: previous,
          },
          saved
        );
        setAutomaticUpdateChecksState(rolledBack.automatic_update_checks);
        toastError(
          "Updates",
          saved.message || "Automatic update setting could not be saved"
        );
        return;
      }
      setUpdateChannelState(saved.update_channel);
      setAutomaticUpdateChecksState(saved.automatic_update_checks);
    } catch (error) {
      setAutomaticUpdateChecksState(previous);
      log.warn("bridge", "automatic update setting save failed", error);
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
      toastSuccess("Delisted Steam games", "Delisted Steam games updated");
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toastError("Delisted Steam games", "Delisted Steam games refresh failed");
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

  const delistedCountText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `Delisted games: ${delistedStatus.count.toLocaleString("en-US")}`
      : "Delisted Steam games not downloaded yet";
  const delistedDateText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `Last updated: ${epochToUsDate(delistedStatus.fetched_at)}`
      : "";

  return (
    <Focusable
      ref={focusPanel}
      preferredFocus={true}
      navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}
      style={qamPanelStyle}
    >
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
        countText={delistedCountText}
        dateText={delistedDateText}
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
      <PluginUpdateSection
        currentVersion={pluginVersion}
        updateChannel={updateChannel}
        automaticUpdateChecks={automaticUpdateChecks}
        settingsLoaded={settingsLoaded}
        onToggleUpdateChannel={(enabled) => void saveUpdateChannel(enabled)}
        onToggleAutomaticUpdateChecks={(enabled) =>
          void saveAutomaticUpdateChecks(enabled)
        }
        onInstallVersionConfirmed={setPluginVersion}
      />
      <VersionsSection
        pluginVersion={pluginVersion}
        deckyVersion={deckyVersion}
        steamosVersion={steamosVersion}
      />
    </Focusable>
  );
};
