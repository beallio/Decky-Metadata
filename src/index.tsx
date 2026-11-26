import { routerHook } from "@decky/api";
import { definePlugin } from "@decky/ui";
import { FaTags } from "react-icons/fa6";
import { Content } from "./ContentPanel";
import { MetadataPage } from "./MetadataPage";
import { SettingsPage } from "./SettingsPage";
import {
  refreshOpenSettingsRoute,
  rememberSettingsTabForReload,
  SETTINGS_ROUTE,
  SettingsTitleView,
} from "./settingsRoute";
import contextMenuPatch, { LibraryContextMenu } from "./contextMenuPatch";
import { frontendLog, getDebugLogging, getNativeCssClasses } from "./backend";
import * as log from "./log";
import { setNativeCssClasses } from "./steam/nativeCssClasses";
import { metadataScanStore } from "./metadataScan";
import { loadNonSteamGames } from "./useNonSteamGames";
import { pluginUpdateController } from "./updater/pluginUpdateController";
import { startTrailerController } from "./trailers/controller";
import { startMiniAchievementsController } from "./steam/miniAchievementsController";
import { protonDbBadgeController } from "./protondb/controller";
import { installProtonDbCoverBadges } from "./protondb/covers";
import { resetProtonDbAppIdResolution } from "./protondb/identity";
import { installProtonDbGameView } from "./protondb/gameView";
import { installStoreInfoRow } from "./storeRow";
import { startPluginConflicts } from "./pluginConflicts";
import { hltbController } from "./hltb/gameView";
import { refreshLanguage } from "./i18n";
import { releaseProviderCache } from "./providerCache";
import {
  installSteamPatches,
  beginCompatibilityLifecycle,
  cancelCompatibilityDefaultLoad,
  discardRetainedCompatibilityState,
  ensureCompatibilityDefault,
  refreshMetadataCache,
  retainCompatibilityBaselinesForReload,
  restoreAllCompatibilityBaselines,
  startMetadataBootstrap,
} from "./steam";

const METADATA_ROUTE = "/decky-metadata/:appid";

const installInPlaceReloadGuard = (onFailedReload: () => void) => {
  const loader = (globalThis as any).DeckyPluginLoader;
  if (!loader || typeof loader.importPlugin !== "function") {
    return { isPending: () => false, unpatch: () => undefined };
  }
  const original = loader.importPlugin;
  let pending = false;
  const guardedImport = async function (this: any, name: string, ...args: any[]) {
    const isThisPlugin = name === "Decky Metadata";
    if (isThisPlugin) pending = true;
    try {
      return await original.call(this, name, ...args);
    } catch (error) {
      if (isThisPlugin && pending) onFailedReload();
      throw error;
    } finally {
      if (isThisPlugin) pending = false;
    }
  };
  loader.importPlugin = guardedImport;
  return {
    isPending: () => pending,
    unpatch: () => {
      if (loader.importPlugin === guardedImport) loader.importPlugin = original;
    },
  };
};

export default definePlugin(() => {
  void refreshLanguage();
  const stopPluginConflicts = startPluginConflicts();
  beginCompatibilityLifecycle();
  let retainedReloadBaselines = false;
  const reloadGuard = installInPlaceReloadGuard(() => {
    if (!retainedReloadBaselines) return;
    try {
      restoreAllCompatibilityBaselines();
    } finally {
      discardRetainedCompatibilityState();
      retainedReloadBaselines = false;
    }
  });
  void getDebugLogging()
    .then((enabled) => log.setVerboseLogging(enabled))
    .catch((error) => log.warn("bridge", "debug logging setting load failed", error));
  void getNativeCssClasses()
    .then((classes) => setNativeCssClasses(classes))
    .catch(() => undefined);
  void refreshMetadataCache();
  // The first QAM open then shows counts at once instead of waiting for its own Decky calls.
  void loadNonSteamGames()
    .then((games) => metadataScanStore.refreshCounts(games))
    .catch((error) => log.warn("bridge", "metadata count preload failed", error));
  void ensureCompatibilityDefault().catch((error) =>
    log.warn("bridge", "compatibility default load failed", error)
  );

  resetProtonDbAppIdResolution();
  protonDbBadgeController.mount();
  hltbController.mount();
  // Both features started their one shared read of the saved cache.
  releaseProviderCache();
  let unpatchSteam: (() => void) | undefined;
  try {
    unpatchSteam = installSteamPatches();
  } catch (error) {
    log.warn("bridge", "installSteamPatches failed", error);
    void frontendLog("patch", "installSteamPatches failed", {
      error: error instanceof Error ? error.stack || error.message : String(error),
    }, "error").catch(() => undefined);
  }
  const stopMetadataBootstrap = startMetadataBootstrap();
  const stopTrailerController = startTrailerController();
  const stopMiniAchievementsController = startMiniAchievementsController();
  const stopProtonDbCovers = installProtonDbCoverBadges();
  const stopProtonDbGameView = installProtonDbGameView();
  const stopStoreInfoRow = installStoreInfoRow();
  const menuPatch = contextMenuPatch(LibraryContextMenu);

  routerHook.addRoute(METADATA_ROUTE, () => <MetadataPage />, { exact: true });
  routerHook.addRoute(SETTINGS_ROUTE, () => <SettingsPage />, { exact: true });
  const cancelSettingsRefresh = refreshOpenSettingsRoute(routerHook);

  return {
    // Plugin identity used by Decky Loader (must match plugin.json "name" so
    // find_plugin_folder resolves this install for in-place self-update, and
    // must equal EXPECTED_PLUGIN_NAME + the manifest pluginName discovery checks).
    name: "Decky Metadata",
    // Display label shown in the QAM header; kept human-readable on purpose.
    titleView: <SettingsTitleView />,
    content: <Content />,
    icon: <FaTags />,
    onDismount() {
      cancelSettingsRefresh();
      rememberSettingsTabForReload();
      stopTrailerController();
      stopMiniAchievementsController();
      stopProtonDbCovers();
      stopStoreInfoRow();
      stopProtonDbGameView();
      protonDbBadgeController.stop();
      hltbController.stop();
      stopPluginConflicts();
      resetProtonDbAppIdResolution();
      try {
        metadataScanStore.dispose();
      } catch (error) {
        log.error("patch", "metadata scan stop failed", error);
      }
      try {
        pluginUpdateController.dispose();
      } catch (error) {
        log.error("patch", "plugin update controller stop failed", error);
      }
      const reloading = reloadGuard.isPending();
      // The bootstrap stopper invalidates the compatibility lifecycle. Retain
      // the held Game Info intent before it does so during an in-place import.
      try {
        if (reloading) {
          retainCompatibilityBaselinesForReload();
          retainedReloadBaselines = true;
        }
      } catch (error) {
        log.error("patch", "compatibility reload state retain failed", error);
      }
      try {
        menuPatch?.unpatch?.();
      } catch (error) {
        log.error("patch", "context menu unpatch failed", error);
      }
      try {
        stopMetadataBootstrap?.();
      } catch (error) {
        log.error("patch", "metadata bootstrap stop failed", error);
      }
      try {
        if (!reloading) {
          restoreAllCompatibilityBaselines();
        }
      } catch (error) {
        log.error("patch", "compatibility baseline restore failed", error);
      }
      try {
        cancelCompatibilityDefaultLoad();
      } catch (error) {
        log.error("patch", "compatibility default load stop failed", error);
      }
      try {
        unpatchSteam?.();
      } catch (error) {
        log.error("patch", "Steam unpatch failed", error);
      }
      reloadGuard.unpatch();
      try {
        routerHook.removeRoute(METADATA_ROUTE);
      } catch (error) {
        log.error("patch", "route remove failed", error);
      }
      try {
        routerHook.removeRoute(SETTINGS_ROUTE);
      } catch (error) {
        log.error("patch", "settings route remove failed", error);
      }
    },
  };
});
