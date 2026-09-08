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
  setCompatibilityDefault,
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
import {
  compatibilityDefaultLoadedSnapshot,
  compatibilityDefaultSnapshot,
  compatibilityLifecycleSnapshot,
  ensureCompatibilityDefault,
  isCompatibilityLifecycleCurrent,
  metadataCache,
  refreshMetadataCache,
  setConfirmedCompatibilityDefault,
  subscribeCompatibilityRevision,
} from "./steam";
import {
  clearCompatibilityDropdownReturn,
  consumeCompatibilityDropdownReturn,
  hasCompatibilityDropdownReturn,
  isCompatibilityDropdownReturnReady,
  isCompatibilityDropdownSelectionReturn,
  noteCompatibilityDropdownControlUnmounted,
  noteCompatibilityDropdownReturnVisible,
  noteCompatibilityDropdownSelectionSaved,
  requestCompatibilityDropdownReturn,
} from "./qamCompatibilityFocus";
import { qamPanelStyle } from "./styles";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import {
  GameOption,
  DeckCompatibilityCategory,
  UpdateChannel,
} from "./types";
import {
  resolveLoadedUpdateSettings,
  resolveSavedUpdateSettings,
} from "./updater/updateSettings";
import { useNonSteamGames } from "./useNonSteamGames";
import { getConnectedControllerTypes } from "./steam";

// Version is fetched from the backend on mount; "" means not yet loaded.
export const PLUGIN_VERSION = "";
// Steam can take over a second to register the fresh QAM control after its
// native popup returns. This caps one return handoff at roughly three seconds.
const COMPATIBILITY_DROPDOWN_RETURN_FOCUS_MAX_FRAMES = 360;
const COMPATIBILITY_DROPDOWN_RETURN_SETTLE_FRAMES = 2;
const COMPATIBILITY_DROPDOWN_SELECTION_SETTLE_FRAMES = 180;
const COMPATIBILITY_DROPDOWN_RETURN_FOCUS_STABLE_FRAMES = 3;

type NativeFocusNode = {
  Element?: Element;
  m_rgChildren?: NativeFocusNode[];
  BTakeFocus?: () => boolean;
};

type NativeNavigationTree = {
  Root?: NativeFocusNode;
};

export const takeNativeFocus = (element: Element | null): boolean => {
  if (!element) return false;
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

const compatibilityDropdownButton = (element: HTMLElement | null) =>
  element?.querySelector<HTMLButtonElement>('button[role="combobox"]') || null;

export const takeCompatibilityDropdownFocus = (element: HTMLElement | null): boolean => {
  const dropdown = compatibilityDropdownButton(element);
  if (!dropdown || dropdown.disabled || !dropdown.isConnected) return false;
  return takeNativeFocus(dropdown);
};

const hasCompatibilityDropdownFocus = (element: HTMLElement | null): boolean => {
  const dropdown = compatibilityDropdownButton(element);
  if (!dropdown) return false;
  const classes = typeof dropdown.className === "string" ? dropdown.className : "";
  return dropdown.ownerDocument.activeElement === dropdown
    || /(^|\s)gpfocus(\s|$)/.test(classes);
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
  const initialPanelFocusComplete = useRef(false);
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
  const [compatibilityDefault, setCompatibilityDefaultState] = useState<DeckCompatibilityCategory | null>(null);
  const [compatibilityDefaultLoaded, setCompatibilityDefaultLoaded] = useState(false);
  const [compatibilityDefaultBusy, setCompatibilityDefaultBusy] = useState(false);
  const [compatibilityDefaultError, setCompatibilityDefaultError] = useState("");
  const compatibilityDefaultLoadVersion = useRef(0);
  const [compatibilityDefaultControl, setCompatibilityDefaultControlState] =
    useState<HTMLDivElement | null>(null);
  const [compatibilityDropdownReturnVersion, setCompatibilityDropdownReturnVersion] = useState(0);
  const [controllerTypes, setControllerTypes] = useState<number[]>([]);

  const setCompatibilityDefaultControl = useCallback((element: HTMLDivElement | null) => {
    if (!element) noteCompatibilityDropdownControlUnmounted();
    setCompatibilityDefaultControlState(element);
  }, []);

  useEffect(() => {
    if (!compatibilityDefaultControl) return;
    const qamDocument = compatibilityDefaultControl.ownerDocument;
    const noteVisibleReturn = () => {
      if (qamDocument.visibilityState !== "visible") return;
      if (!noteCompatibilityDropdownReturnVisible()) return;
      setCompatibilityDropdownReturnVersion((version) => version + 1);
    };
    const observeVisibility = () => {
      if (qamDocument.visibilityState === "hidden") {
        noteCompatibilityDropdownControlUnmounted();
      } else {
        noteVisibleReturn();
      }
    };
    qamDocument.addEventListener("visibilitychange", observeVisibility);
    observeVisibility();
    return () => qamDocument.removeEventListener("visibilitychange", observeVisibility);
  }, [compatibilityDefaultControl]);

  const focusPanel = useCallback((element: HTMLDivElement | null) => {
    if (focusFrame.current !== null) {
      window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    }
    if (element && !initialPanelFocusComplete.current && !hasCompatibilityDropdownReturn()) {
      focusFrame.current = window.requestAnimationFrame(() => {
        focusFrame.current = null;
        if (initialPanelFocusComplete.current || hasCompatibilityDropdownReturn()) return;
        initialPanelFocusComplete.current = true;
        takeNativeFocus(element);
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

  useEffect(() => {
    if (
      !isCompatibilityDropdownReturnReady()
      || !compatibilityDefaultControl
      || !compatibilityDefaultLoaded
      || compatibilityDefaultBusy
    ) return;
    const control = compatibilityDefaultControl;
    const settleFrames = isCompatibilityDropdownSelectionReturn()
      ? COMPATIBILITY_DROPDOWN_SELECTION_SETTLE_FRAMES
      : COMPATIBILITY_DROPDOWN_RETURN_SETTLE_FRAMES;
    let cancelled = false;
    let frame: number | null = null;
    let attempts = 0;
    let stableFocusFrames = 0;
    const focusReturnedDropdown = () => {
      frame = null;
      if (
        cancelled
        || !isCompatibilityDropdownReturnReady()
        || !compatibilityDefaultLoaded
        || compatibilityDefaultBusy
      ) return;
      attempts += 1;
      if (attempts <= settleFrames) {
        frame = window.requestAnimationFrame(focusReturnedDropdown);
        return;
      }
      // The native menu hides and unmounts QAM before the replacement
      // combobox is registered in Steam's navigation tree. Retry only over
      // this bounded return transition, and only with Steam's BTakeFocus.
      if (hasCompatibilityDropdownFocus(control)) {
        stableFocusFrames += 1;
        if (stableFocusFrames >= COMPATIBILITY_DROPDOWN_RETURN_FOCUS_STABLE_FRAMES) {
          consumeCompatibilityDropdownReturn();
          initialPanelFocusComplete.current = true;
          return;
        }
        frame = window.requestAnimationFrame(focusReturnedDropdown);
        return;
      }
      stableFocusFrames = 0;
      takeCompatibilityDropdownFocus(control);
      if (attempts < COMPATIBILITY_DROPDOWN_RETURN_FOCUS_MAX_FRAMES) {
        frame = window.requestAnimationFrame(focusReturnedDropdown);
      } else {
        log.warn("qam", "compatibility dropdown return focus unavailable");
        clearCompatibilityDropdownReturn();
      }
    };
    frame = window.requestAnimationFrame(focusReturnedDropdown);
    return () => {
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [
    compatibilityDefaultBusy,
    compatibilityDefaultControl,
    compatibilityDefaultLoaded,
    compatibilityDropdownReturnVersion,
  ]);

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
    let cancelled = false;
    const requestVersion = compatibilityDefaultLoadVersion.current;
    void ensureCompatibilityDefault()
      .then((value) => {
        if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current) return;
        setCompatibilityDefaultState(value);
        setCompatibilityDefaultError("");
        setCompatibilityDefaultLoaded(true);
      })
      .catch((error) => {
        if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current) return;
        setCompatibilityDefaultError(`Compatibility default could not be loaded: ${String(error)}`);
        log.warn("bridge", "compatibility default load failed", error);
      });
    const unsubscribe = subscribeCompatibilityRevision(() => {
      if (cancelled || !compatibilityDefaultLoadedSnapshot()) return;
      setCompatibilityDefaultState(compatibilityDefaultSnapshot());
      setCompatibilityDefaultError("");
      setCompatibilityDefaultLoaded(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
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
    setControllerTypes(getConnectedControllerTypes());
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

  const saveCompatibilityDefault = async (category: DeckCompatibilityCategory | null) => {
    if (compatibilityDefaultBusy || !compatibilityDefaultLoaded) return;
    const previous = compatibilityDefault;
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    setCompatibilityDefaultBusy(true);
    setCompatibilityDefaultError("");
    compatibilityDefaultLoadVersion.current += 1;
    try {
      const saved = await setCompatibilityDefault(category);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const confirmed = setConfirmedCompatibilityDefault(saved, lifecycleGeneration);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      setCompatibilityDefaultState(confirmed);
      if (noteCompatibilityDropdownSelectionSaved()) {
        setCompatibilityDropdownReturnVersion((version) => version + 1);
      }
      toastSuccess("Compatibility", "Default compatibility status saved");
    } catch (error) {
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      setCompatibilityDefaultState(previous);
      const message = `Compatibility default could not be saved: ${String(error)}`;
      setCompatibilityDefaultError(message);
      toastError("Compatibility", message);
      log.warn("bridge", "compatibility default save failed", error);
    } finally {
      if (isCompatibilityLifecycleCurrent(lifecycleGeneration)) {
        setCompatibilityDefaultBusy(false);
      }
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
        compatibilityDefault={compatibilityDefault}
        compatibilityDefaultLoaded={compatibilityDefaultLoaded}
        compatibilityDefaultBusy={compatibilityDefaultBusy}
        compatibilityDefaultError={compatibilityDefaultError}
        onRefreshMetadata={() => void scanMissing()}
        onClearCache={() => void clearCache()}
        onCompatibilityDefaultChange={(category) => void saveCompatibilityDefault(category)}
        onCompatibilityDefaultMenuWillOpen={requestCompatibilityDropdownReturn}
        onCompatibilityDefaultControlRef={setCompatibilityDefaultControl}
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
        controllerTypes={controllerTypes}
      />
    </Focusable>
  );
};
