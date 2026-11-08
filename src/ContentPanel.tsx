import {
  Focusable,
  getFocusNavController,
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
  setCompatibilityDefaultScope,
  setDebugLogging,
  setUpdateChannel,
  startScanMissing,
} from "./backend";
import { CompatibilitySection } from "./components/qam/CompatibilitySection";
import { GameTrailersSection } from "./components/qam/GameTrailersSection";
import { LogsSection } from "./components/qam/LogsSection";
import { MiniAchievementsSection } from "./components/qam/MiniAchievementsSection";
import { MetadataSection } from "./components/qam/MetadataSection";
import { PluginLogModal } from "./components/qam/PluginLogModal";
import { PluginUpdateSection } from "./components/qam/PluginUpdateSection";
import { VersionsSection } from "./components/qam/VersionsSection";
import { ProtonDbBadgesSection } from "./components/qam/ProtonDbBadgesSection";
import { HltbSection } from "./components/qam/HltbSection";
import { getLocale, t, useLocale } from "./i18n";
import { hltbController } from "./hltb/gameView";
import { hltbStore } from "./hltb/store";
import * as log from "./log";
import {
  compatibilityDefaultLoadedSnapshot,
  compatibilityDefaultScopeSnapshot,
  compatibilityDefaultSnapshot,
  compatibilityLifecycleSnapshot,
  ensureCompatibilityDefault,
  isCompatibilityLifecycleCurrent,
  metadataCache,
  refreshMetadataCache,
  setConfirmedCompatibilityDefault,
  setConfirmedCompatibilityDefaultScope,
  subscribeCompatibilityRevision,
} from "./steam";
import {
  beginCompatibilityPolicySave,
  claimCompatibilityDropdownFocusAttempt,
  clearCompatibilityDropdownReturn,
  compatibilityPolicySaveSnapshot,
  compatibilityDropdownReturnOrigin,
  consumeCompatibilityDropdownReturn,
  discardStaleCompatibilityPolicySave,
  hasPendingCompatibilityPolicySave,
  hasCompatibilityDropdownReturn,
  isCompatibilityDropdownReturnReady,
  isCompatibilityDropdownSelectionReturn,
  noteCompatibilityDropdownControlUnmounted,
  noteCompatibilityDropdownReturnVisible,
  noteCompatibilityDropdownSelectionSaved,
  requestCompatibilityDropdownReturn,
  settleCompatibilityPolicySave,
  subscribeCompatibilityPolicySave,
} from "./qamCompatibilityFocus";
import { qamPanelStyle } from "./styles";
import { toastError, toastSuccess } from "./toast";
import type { StatusKind } from "./tokens";
import {
  GameOption,
  CompatibilityDefaultScope,
  DeckCompatibilityCategory,
  UpdateChannel,
} from "./types";
import {
  resolveLoadedUpdateSettings,
  resolveSavedUpdateSettings,
} from "./updater/updateSettings";
import { useNonSteamGames } from "./useNonSteamGames";
import { getConnectedControllerTypes } from "./steam";
import { trailerController } from "./trailers/controller";
import { miniAchievementsController } from "./steam/miniAchievementsController";
import { protonDbBadgeController } from "./protondb/controller";

// Version is fetched from the backend on mount; "" means not yet loaded.
export const PLUGIN_VERSION = "";
// Keep retrying native focus while Steam rebuilds the navigation tree. The
// shared attempt count keeps the handoff bounded across QAM remounts.
const COMPATIBILITY_DROPDOWN_RETURN_FOCUS_MAX_FRAMES = 900;
const COMPATIBILITY_DROPDOWN_RETURN_SETTLE_FRAMES = 2;
const COMPATIBILITY_DROPDOWN_SELECTION_SETTLE_FRAMES = 2;
const COMPATIBILITY_DROPDOWN_RETURN_FOCUS_STABLE_FRAMES = 12;
const GAMEPAD_DIRECTION_BUTTONS = new Set([9, 10, 11, 12]);
const GAMEPAD_BACK_BUTTON = 2;

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
    const ownerDocument = element.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (
      !ownerWindow
      || ownerWindow.closed
      || ownerWindow.document !== ownerDocument
      || ownerDocument.visibilityState !== "visible"
    ) return false;
    // Steam may leave the QAM context inactive after its native dropdown closes.
    // A focus node can then report success without painting gamepad focus.
    const focusNav = getFocusNavController();
    if (!focusNav?.m_ActiveContext && focusNav?.m_LastActiveContext) {
      focusNav.FindAnActiveContext?.();
    }
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
  if (!total) return t("qam.metadata.refreshComplete");
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed
    ? t("qam.metadata.refreshCompleteFailed", { assigned, total, failed })
    : t("qam.metadata.refreshCompleteSaved", { assigned, total });
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

const localeDate = (value?: number | null) => {
  if (!value) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

export const Content = () => {
  // Re-check the Steam language whenever the panel mounts or the locale changes.
  useLocale();
  const [trailerSnapshot, setTrailerSnapshot] = useState(trailerController.getSnapshot());
  useEffect(() => trailerController.subscribe(() => {
    setTrailerSnapshot(trailerController.getSnapshot());
  }), []);
  const [miniAchievementsSnapshot, setMiniAchievementsSnapshot] = useState(miniAchievementsController.getSnapshot());
  useEffect(() => miniAchievementsController.subscribe(() => {
    setMiniAchievementsSnapshot(miniAchievementsController.getSnapshot());
  }), []);
  const [protonDbSnapshot, setProtonDbSnapshot] = useState(protonDbBadgeController.getSnapshot());
  useEffect(() => {
    const refresh = () => setProtonDbSnapshot(protonDbBadgeController.getSnapshot());
    const unsubscribe = protonDbBadgeController.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  const [hltbSnapshot, setHltbSnapshot] = useState(hltbController.getSnapshot());
  useEffect(() => {
    const refresh = () => setHltbSnapshot(hltbController.getSnapshot());
    const unsubscribe = hltbController.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  const initialCompatibilityPolicySave = compatibilityPolicySaveSnapshot();
  const initialPendingCompatibilityPolicySave =
    initialCompatibilityPolicySave
    && initialCompatibilityPolicySave.pendingKind !== null
      ? initialCompatibilityPolicySave
      : null;
  const focusFrame = useRef<number | null>(null);
  const initialPanelFocusComplete = useRef(false);
  const { games, loadGames } = useNonSteamGames();
  const [metadataCount, setMetadataCount] = useState(0);
  const [missing, setMissing] = useState(0);
  const [busy, setBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanStatusKind, setScanStatusKind] = useState<StatusKind>("idle");
  // One scan-progress poll is pending at a time; unmounting the panel stops polling.
  const scanPoll = useRef<{ timer: number | null; stopped: boolean }>({ timer: null, stopped: false });
  useEffect(() => {
    const poll = scanPoll.current;
    poll.stopped = false;
    return () => {
      poll.stopped = true;
      if (poll.timer !== null) window.clearTimeout(poll.timer);
      poll.timer = null;
    };
  }, []);
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
  const [compatibilityDefault, setCompatibilityDefaultState] = useState<DeckCompatibilityCategory | null>(
    initialPendingCompatibilityPolicySave?.category ?? compatibilityDefaultSnapshot(),
  );
  const [compatibilityDefaultLoaded, setCompatibilityDefaultLoaded] = useState(false);
  const [compatibilityDefaultBusy, setCompatibilityDefaultBusy] = useState(
    initialPendingCompatibilityPolicySave?.pendingKind === "category",
  );
  const [compatibilityDefaultError, setCompatibilityDefaultError] = useState(
    initialCompatibilityPolicySave?.error ?? "",
  );
  const [compatibilityDefaultScope, setCompatibilityDefaultScopeState] = useState<CompatibilityDefaultScope>(
    initialPendingCompatibilityPolicySave?.scope ?? compatibilityDefaultScopeSnapshot(),
  );
  const [compatibilityDefaultScopeBusy, setCompatibilityDefaultScopeBusy] = useState(
    initialPendingCompatibilityPolicySave?.pendingKind === "scope",
  );
  const compatibilityDefaultLoadVersion = useRef(0);
  const [compatibilityDefaultControl, setCompatibilityDefaultControlState] =
    useState<HTMLDivElement | null>(null);
  const [compatibilityDefaultScopeControl, setCompatibilityDefaultScopeControlState] =
    useState<HTMLDivElement | null>(null);
  const [trailerQualityControl, setTrailerQualityControlState] = useState<HTMLDivElement | null>(null);
  const [protonDbCoverControl, setProtonDbCoverControlState] = useState<HTMLDivElement | null>(null);
  const [hltbStyleControl, setHltbStyleControlState] = useState<HTMLDivElement | null>(null);
  const [compatibilityDropdownReturnVersion, setCompatibilityDropdownReturnVersion] = useState(0);
  const [controllerTypes, setControllerTypes] = useState<number[]>([]);

  const setCompatibilityDefaultControl = useCallback((element: HTMLDivElement | null) => {
    if (!element) noteCompatibilityDropdownControlUnmounted();
    setCompatibilityDefaultControlState(element);
  }, []);
  const setCompatibilityDefaultScopeControl = useCallback((element: HTMLDivElement | null) => {
    if (!element) noteCompatibilityDropdownControlUnmounted();
    setCompatibilityDefaultScopeControlState(element);
  }, []);
  const setTrailerQualityControl = useCallback((element: HTMLDivElement | null) => {
    if (!element) noteCompatibilityDropdownControlUnmounted();
    setTrailerQualityControlState(element);
  }, []);
  const setProtonDbCoverControl = useCallback((element: HTMLDivElement | null) => {
    if (!element) noteCompatibilityDropdownControlUnmounted();
    setProtonDbCoverControlState(element);
  }, []);
  const setHltbStyleControl = useCallback((element: HTMLDivElement | null) => {
    if (!element) noteCompatibilityDropdownControlUnmounted();
    setHltbStyleControlState(element);
  }, []);

  const synchronizeCompatibilityPolicySave = useCallback((
    fallbackCategory = compatibilityDefaultSnapshot(),
    fallbackScope = compatibilityDefaultScopeSnapshot(),
  ) => {
    const shared = compatibilityPolicySaveSnapshot();
    if (
      shared
      && shared.lifecycleGeneration === compatibilityLifecycleSnapshot()
      && shared.pendingKind !== null
    ) {
      setCompatibilityDefaultState(shared.category);
      setCompatibilityDefaultScopeState(shared.scope);
      setCompatibilityDefaultBusy(shared.pendingKind === "category");
      setCompatibilityDefaultScopeBusy(shared.pendingKind === "scope");
      setCompatibilityDefaultError(shared.error);
      return;
    }
    setCompatibilityDefaultState(fallbackCategory);
    setCompatibilityDefaultScopeState(fallbackScope);
    setCompatibilityDefaultBusy(false);
    setCompatibilityDefaultScopeBusy(false);
    setCompatibilityDefaultError(
      shared?.lifecycleGeneration === compatibilityLifecycleSnapshot()
        ? shared.error
        : "",
    );
  }, []);

  useEffect(() => {
    const mountedControl = compatibilityDefaultControl || compatibilityDefaultScopeControl || trailerQualityControl ||
      protonDbCoverControl || hltbStyleControl;
    if (!mountedControl) return;
    const qamDocument = mountedControl.ownerDocument;
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
  }, [compatibilityDefaultControl, compatibilityDefaultScopeControl, trailerQualityControl, protonDbCoverControl, hltbStyleControl]);

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
        // Native focus can scroll QAM past its title. Keep the panel header
        // visible when the initial focus settles.
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
    const origin = compatibilityDropdownReturnOrigin();
    const control = origin === "scope"
      ? compatibilityDefaultScopeControl
      : origin === "quality" ? trailerQualityControl
      : origin === "hltb-style" ? hltbStyleControl
      : origin === "protondb-cover-position" ? protonDbCoverControl : compatibilityDefaultControl;
    const loaded = origin === "quality" ? trailerSnapshot.settingsLoaded
      : origin === "hltb-style" ? hltbSnapshot.settingsLoaded
      : origin === "protondb-cover-position" ? protonDbSnapshot.settingsLoaded : compatibilityDefaultLoaded;
    const busy = origin === "quality" ? trailerSnapshot.busy
      : origin === "hltb-style" ? hltbSnapshot.busy
      : origin === "protondb-cover-position" ? protonDbSnapshot.busy : compatibilityDefaultBusy || compatibilityDefaultScopeBusy;
    if (!isCompatibilityDropdownReturnReady() || !control) return;
    let settleFramesRemaining = isCompatibilityDropdownSelectionReturn()
      ? COMPATIBILITY_DROPDOWN_SELECTION_SETTLE_FRAMES
      : COMPATIBILITY_DROPDOWN_RETURN_SETTLE_FRAMES;
    let cancelled = false;
    let frame: number | null = null;
    let listenersAttached = false;
    let stableFocusFrames = 0;
    const qamDocument = control.ownerDocument;
    const detachNavigationListeners = () => {
      if (!listenersAttached) return;
      qamDocument.removeEventListener("keydown", handleUserNavigation, true);
      qamDocument.removeEventListener("vgp_onbuttondown", handleUserNavigation, true);
      qamDocument.removeEventListener("pointerdown", handleUserNavigation, true);
      listenersAttached = false;
    };
    const releaseFocusLease = () => {
      if (isCompatibilityDropdownReturnReady()) {
        consumeCompatibilityDropdownReturn();
        initialPanelFocusComplete.current = true;
        if (frame !== null) {
          window.cancelAnimationFrame(frame);
          frame = null;
        }
      }
      detachNavigationListeners();
    };
    const handleUserNavigation = (event: Event) => {
      if (event.type === "vgp_onbuttondown") {
        const button = Number((event as CustomEvent).detail?.button);
        // B exits a visible QAM page; the native popup hides QAM while B cancels it.
        if (GAMEPAD_DIRECTION_BUTTONS.has(button)
          || (button === GAMEPAD_BACK_BUTTON && qamDocument.visibilityState === "visible")) {
          releaseFocusLease();
        }
        return;
      }
      if (event.type === "pointerdown") {
        releaseFocusLease();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes((event as KeyboardEvent).key)) {
        releaseFocusLease();
      }
    };
    qamDocument.addEventListener("keydown", handleUserNavigation, true);
    qamDocument.addEventListener("vgp_onbuttondown", handleUserNavigation, true);
    qamDocument.addEventListener("pointerdown", handleUserNavigation, true);
    listenersAttached = true;
    const focusReturnedDropdown = () => {
      frame = null;
      if (cancelled) return;
      if (!isCompatibilityDropdownReturnReady()) {
        detachNavigationListeners();
        return;
      }
      const ownerWindow = qamDocument.defaultView;
      if (!ownerWindow || ownerWindow.closed || ownerWindow.document !== qamDocument) {
        detachNavigationListeners();
        return;
      }
      if (qamDocument.visibilityState !== "visible") {
        detachNavigationListeners();
        return;
      }
      if (!loaded || busy) return;
      if (settleFramesRemaining > 0) {
        settleFramesRemaining -= 1;
        frame = window.requestAnimationFrame(focusReturnedDropdown);
        return;
      }
      if (!claimCompatibilityDropdownFocusAttempt(COMPATIBILITY_DROPDOWN_RETURN_FOCUS_MAX_FRAMES)) {
        log.warn("qam", "compatibility dropdown return focus unavailable");
        clearCompatibilityDropdownReturn();
        detachNavigationListeners();
        return;
      }
      // The native menu hides and unmounts QAM before the replacement
      // combobox is registered in Steam's navigation tree. Keep restoring the
      // returned control through trailer updates and combobox replacement.
      if (hasCompatibilityDropdownFocus(control)) {
        stableFocusFrames += 1;
        if (stableFocusFrames >= COMPATIBILITY_DROPDOWN_RETURN_FOCUS_STABLE_FRAMES) {
          initialPanelFocusComplete.current = true;
        }
      } else {
        stableFocusFrames = 0;
        takeCompatibilityDropdownFocus(control);
      }
      frame = window.requestAnimationFrame(focusReturnedDropdown);
    };
    frame = window.requestAnimationFrame(focusReturnedDropdown);
    return () => {
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      detachNavigationListeners();
    };
  }, [
    compatibilityDefaultBusy,
    compatibilityDefaultControl,
    compatibilityDefaultScopeBusy,
    compatibilityDefaultScopeControl,
    compatibilityDefaultLoaded,
    compatibilityDropdownReturnVersion,
    trailerQualityControl,
    trailerSnapshot.busy,
    trailerSnapshot.settingsLoaded,
    protonDbCoverControl,
    protonDbSnapshot.busy,
    protonDbSnapshot.settingsLoaded,
    hltbStyleControl,
    hltbSnapshot.busy,
    hltbSnapshot.settingsLoaded,
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
    discardStaleCompatibilityPolicySave(compatibilityLifecycleSnapshot());
    synchronizeCompatibilityPolicySave();
    const requestVersion = compatibilityDefaultLoadVersion.current;
    void ensureCompatibilityDefault()
      .then((value) => {
        if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current) return;
        synchronizeCompatibilityPolicySave(value, compatibilityDefaultScopeSnapshot());
        setCompatibilityDefaultLoaded(true);
      })
      .catch((error) => {
        if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current) return;
        const shared = compatibilityPolicySaveSnapshot();
        if (shared?.lifecycleGeneration === compatibilityLifecycleSnapshot()) {
          synchronizeCompatibilityPolicySave();
          return;
        }
        setCompatibilityDefaultError(
          t("qam.compatibility.loadFailed", { error: String(error) }),
        );
        log.warn("bridge", "compatibility default load failed", error);
      });
    const unsubscribeRevision = subscribeCompatibilityRevision(() => {
      if (cancelled || !compatibilityDefaultLoadedSnapshot()) return;
      synchronizeCompatibilityPolicySave();
      setCompatibilityDefaultLoaded(true);
    });
    const unsubscribeSave = subscribeCompatibilityPolicySave(() => {
      if (!cancelled) synchronizeCompatibilityPolicySave();
    });
    return () => {
      cancelled = true;
      unsubscribeRevision();
      unsubscribeSave();
    };
  }, [synchronizeCompatibilityPolicySave]);

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
    if (hasPendingCompatibilityPolicySave() || !compatibilityDefaultLoaded) return;
    const previous = compatibilityDefault;
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    const saveId = beginCompatibilityPolicySave(
      "category",
      lifecycleGeneration,
      previous,
      compatibilityDefaultScope,
    );
    compatibilityDefaultLoadVersion.current += 1;
    try {
      const saved = await setCompatibilityDefault(category);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const confirmed = setConfirmedCompatibilityDefault(saved, lifecycleGeneration);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, confirmed, compatibilityDefaultScope);
      if (noteCompatibilityDropdownSelectionSaved()) {
        setCompatibilityDropdownReturnVersion((version) => version + 1);
      }
      toastSuccess(t("toast.compatibility.title"), t("toast.compatibility.saved"));
    } catch (error) {
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const message = t("toast.compatibility.saveFailed", { error: String(error) });
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, previous, compatibilityDefaultScope, message);
      toastError(t("toast.compatibility.title"), message);
      log.warn("bridge", "compatibility default save failed", error);
    }
  };

  const saveCompatibilityDefaultScope = async (scope: CompatibilityDefaultScope) => {
    if (
      hasPendingCompatibilityPolicySave() ||
      !compatibilityDefaultLoaded ||
      compatibilityDefault === null
    ) return;
    const previous = compatibilityDefaultScope;
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    const saveId = beginCompatibilityPolicySave(
      "scope",
      lifecycleGeneration,
      compatibilityDefault,
      scope,
    );
    compatibilityDefaultLoadVersion.current += 1;
    try {
      const saved = await setCompatibilityDefaultScope(scope);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const confirmed = setConfirmedCompatibilityDefaultScope(saved, lifecycleGeneration);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, compatibilityDefault, confirmed);
      if (noteCompatibilityDropdownSelectionSaved()) {
        setCompatibilityDropdownReturnVersion((version) => version + 1);
      }
      toastSuccess(t("toast.compatibility.title"), t("toast.compatibility.scopeSaved"));
    } catch (error) {
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const message = t("toast.compatibility.scopeSaveFailed", { error: String(error) });
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, compatibilityDefault, previous, message);
      toastError(t("toast.compatibility.title"), message);
      log.warn("bridge", "compatibility default scope save failed", error);
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
        toastError(t("toast.updates.title"), saved.message || t("toast.updates.channelFailed"));
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
          t("toast.updates.title"),
          saved.message || t("toast.updates.autoFailed"),
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
    const failScan = (error: unknown) => {
      setBusy(false);
      setScanStatusKind("error");
      setScanMessage(String(error));
      toastError(t("qam.metadata.refreshFailed"), String(error));
    };
    try {
      await startScanMissing(games);
    } catch (error) {
      failScan(error);
      return;
    }
    const poll = scanPoll.current;
    const pollProgress = async () => {
      poll.timer = null;
      try {
        const progress = await getScanProgress();
        if (poll.stopped) return;
        setScanStatusKind("active");
        setScanMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (progress.running) {
          poll.timer = window.setTimeout(pollProgress, 800);
          return;
        }
        await refresh();
        if (poll.stopped) return;
        setBusy(false);
        setScanStatusKind(scanCompleteStatusKind(progress));
        setScanMessage(scanCompleteMessage(progress));
        toastSuccess(t("qam.metadata.title"), t("qam.metadata.refreshComplete"));
      } catch (error) {
        if (!poll.stopped) failScan(error);
      }
    };
    poll.timer = window.setTimeout(pollProgress, 800);
  };

  const clearCache = async () => {
    if (cacheBusy || busy) return;
    setCacheBusy(true);
    try {
      await clearMetadataCache();
      // Clear cache takes every game off the removed list; HLTB must ask again.
      hltbStore.reset();
      await refreshMetadataCache();
      if (games.length) {
        void startScanMissing(games).catch((error) => {
          log.warn("bridge", "metadata scan start after clear cache failed", error);
        });
      }
      setMetadataCount(Object.keys(metadataCache).length);
      updateMissingCount(games);
      toastSuccess(t("qam.cache.title"), t("qam.cache.cleared"));
    } catch (error) {
      toastError(t("qam.cache.clearFailed"), String(error));
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
        throw new Error(t("qam.delisted.refreshFailed"));
      }
      toastSuccess(t("qam.delisted.title"), t("qam.delisted.updated"));
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toastError(t("qam.delisted.title"), t("qam.delisted.refreshFailed"));
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
      toastError(t("qam.logs.title"), t("qam.logs.loadFailed"));
    } finally {
      setLogsBusy(false);
    }
  };

  const delistedCountText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? t("qam.delisted.count", { count: delistedStatus.count.toLocaleString(getLocale()) })
      : t("qam.delisted.notDownloaded");
  const delistedDateText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? t("qam.delisted.lastUpdated", { date: localeDate(delistedStatus.fetched_at) })
      : "";

  // A native dropdown remounts QAM; reopen its section before restoring focus.
  const returningDropdown = hasCompatibilityDropdownReturn()
    ? compatibilityDropdownReturnOrigin()
    : null;

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
        delistedCountText={delistedCountText}
        delistedDateText={delistedDateText}
        delistedBusy={delistedBusy}
        onRefreshMetadata={() => void scanMissing()}
        onClearCache={() => void clearCache()}
        onRefreshDelisted={() => void refreshDelisted()}
      />
      <CompatibilitySection
        initiallyExpanded={returningDropdown === "category" || returningDropdown === "scope"}
        compatibilityDefault={compatibilityDefault}
        compatibilityDefaultLoaded={compatibilityDefaultLoaded}
        compatibilityDefaultBusy={compatibilityDefaultBusy}
        compatibilityDefaultError={compatibilityDefaultError}
        compatibilityDefaultScope={compatibilityDefaultScope}
        compatibilityDefaultScopeBusy={compatibilityDefaultScopeBusy}
        onCompatibilityDefaultChange={(category) => void saveCompatibilityDefault(category)}
        onCompatibilityDefaultScopeChange={(scope) => void saveCompatibilityDefaultScope(scope)}
        onCompatibilityDefaultMenuWillOpen={requestCompatibilityDropdownReturn}
        onCompatibilityDefaultControlRef={setCompatibilityDefaultControl}
        onCompatibilityDefaultScopeControlRef={setCompatibilityDefaultScopeControl}
      />
      <ProtonDbBadgesSection
        initiallyExpanded={returningDropdown === "protondb-cover-position"}
        snapshot={protonDbSnapshot}
        onSettingsChange={(settings) => protonDbBadgeController.setSettings(settings)}
        onCoverPositionChange={async (coverPosition) => {
          requestCompatibilityDropdownReturn("protondb-cover-position");
          noteCompatibilityDropdownControlUnmounted();
          try {
            return await protonDbBadgeController.setSettings({
              ...protonDbBadgeController.getSnapshot().settings, coverPosition,
            });
          } finally {
            if (noteCompatibilityDropdownSelectionSaved()) {
              setCompatibilityDropdownReturnVersion(version => version + 1);
            }
          }
        }}
        onCoverPositionMenuWillOpen={() => {
          requestCompatibilityDropdownReturn("protondb-cover-position");
          noteCompatibilityDropdownControlUnmounted();
        }}
        onCoverPositionControlRef={setProtonDbCoverControl}
      />
      <HltbSection
        initiallyExpanded={returningDropdown === "hltb-style"}
        settings={hltbSnapshot.settings}
        settingsLoaded={hltbSnapshot.settingsLoaded}
        busy={hltbSnapshot.busy}
        conflict={hltbSnapshot.conflict}
        settingsError={hltbSnapshot.settingsError}
        cacheStatus={hltbSnapshot.cacheStatus}
        onSettingsChange={(settings) => hltbController.setSettings(settings)}
        onClearCache={() => hltbController.clearCache()}
        onStyleChange={async (style) => {
          requestCompatibilityDropdownReturn("hltb-style");
          noteCompatibilityDropdownControlUnmounted();
          try {
            return await hltbController.setSettings({ ...hltbController.getSnapshot().settings, style });
          } finally {
            if (noteCompatibilityDropdownSelectionSaved()) setCompatibilityDropdownReturnVersion((version) => version + 1);
          }
        }}
        onStyleMenuWillOpen={() => {
          requestCompatibilityDropdownReturn("hltb-style");
          noteCompatibilityDropdownControlUnmounted();
        }}
        onStyleControlRef={setHltbStyleControl}
      />
      <GameTrailersSection
        initiallyExpanded={returningDropdown === "quality"}
        state={trailerSnapshot}
        onEnabledChange={(enabled) => void trailerController.setEnabled(enabled)}
        onDetailEnabledChange={(enabled) => void trailerController.setDetailEnabled(enabled)}
        onHomeEnabledChange={(enabled) => void trailerController.setHomeEnabled(enabled)}
        onAudioChange={(enabled) => void trailerController.setAudioEnabled(enabled)}
        onHideLogoChange={(hide) => void trailerController.setHideLogoDuringTrailer(hide)}
        onDetailFadeInDelayChange={(seconds) => void trailerController.setDetailFadeInDelaySeconds(seconds)}
        onHomeFadeInDelayChange={(seconds) => void trailerController.setHomeFadeInDelaySeconds(seconds)}
        onQualityChange={async (quality) => {
          requestCompatibilityDropdownReturn("quality");
          noteCompatibilityDropdownControlUnmounted();
          try {
            return await trailerController.setQuality(quality);
          } finally {
            if (noteCompatibilityDropdownSelectionSaved()) {
              setCompatibilityDropdownReturnVersion((version) => version + 1);
            }
          }
        }}
        onQualityMenuWillOpen={() => {
          requestCompatibilityDropdownReturn("quality");
          noteCompatibilityDropdownControlUnmounted();
        }}
        onQualityControlRef={setTrailerQualityControl}
      />
      <MiniAchievementsSection
        state={miniAchievementsSnapshot}
        onEnabledChange={(enabled) => void miniAchievementsController.setEnabled(enabled)}
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
