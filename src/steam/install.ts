import { getDebugLogging } from "../backend";
import * as log from "../log";
import { hasSteamInternals, Unpatch } from "./core";
import { installUnmatchedAppLinksHider } from "./appLinks";
import {
  configureActivityMetadataLoader,
  installActivityRefreshedListener,
  installCommunityFeedPatch,
  installNativeActivityStorePatch,
  installNativeNewsHistoryRedirects,
  installNativePartnerEventStorePatch,
  refreshDeckyNativeActivityForApp,
} from "./activity";
import {
  applyMetadata,
  ensureMetadataCache,
  installMetadataPatches,
  setBypassTraceEnabled,
  tryEnrichScreenshotsForApp,
  tryFetchMetadataForApp,
} from "./metadataPatch";
import { installMainWindowHistoryRedirect, installSteamNavigationRedirect } from "./navigationRedirect";
import { installClickTrace, installHistoryInstanceTrace, installNavigationTrace } from "./diagnostics";
import { setContextMenuTraceEnabled } from "../contextMenuPatch";
import { installGameDetailReentryShield, installRouterRenderPatches } from "./routerPatches";

declare const appStore: any;
declare const appDetailsStore: any;

export const installSteamPatches = (): Unpatch => {
  configureActivityMetadataLoader(ensureMetadataCache);
  const unpatchers: Unpatch[] = [];
  let patchesCancelled = false;
  const safeInstallStep = (label: string, run: () => void) => {
    try {
      run();
    } catch (error) {
      log.warn("patch", `install step failed: ${label}`, error);
    }
  };
  safeInstallStep("unmatchedAppLinksHider", () => installUnmatchedAppLinksHider(unpatchers));
  // Activity news use Steam's own AppActivityStore and native Activity renderer.
  safeInstallStep("nativeActivityStorePatch", () => installNativeActivityStorePatch(unpatchers));
  safeInstallStep("nativePartnerEventStorePatch", () => installNativePartnerEventStorePatch(unpatchers));
  installActivityRefreshedListener(unpatchers);
  const overviewProto = appStore?.allApps?.[0]?.__proto__;
  const detailsProto = appDetailsStore?.__proto__;

  if (!hasSteamInternals() || !overviewProto || !detailsProto) {
    let cancelled = false;
    let delayedUnpatch: Unpatch | null = null;
    let retryId: number | undefined;
    const retry = () => {
      if (cancelled) return;
      if (hasSteamInternals()) {
        delayedUnpatch = installSteamPatches();
        return;
      }
      retryId = window.setTimeout(retry, 500);
    };
    retry();
    return () => {
      cancelled = true;
      if (retryId) window.clearTimeout(retryId);
      delayedUnpatch?.();
    };
  }

  safeInstallStep("steamNavigationRedirect", () => installSteamNavigationRedirect(unpatchers));
  safeInstallStep("mainWindowHistoryRedirect", () => installMainWindowHistoryRedirect(unpatchers));
  void getDebugLogging()
    .then((debugLoggingEnabled) => {
      if (patchesCancelled) return;
      setBypassTraceEnabled(debugLoggingEnabled);
      setContextMenuTraceEnabled(debugLoggingEnabled);
      if (!debugLoggingEnabled) return;
      safeInstallStep("navigationTrace", () => installNavigationTrace(unpatchers));
      safeInstallStep("historyInstanceTrace", () => installHistoryInstanceTrace(unpatchers));
      safeInstallStep("clickTrace", () => installClickTrace(unpatchers));
    })
    .catch((error) => {
      log.warn("patch", "debug logging setting load failed; diagnostic traces disabled", error);
    });

  installNativeNewsHistoryRedirects(unpatchers);
  installMetadataPatches(unpatchers);
  installCommunityFeedPatch(unpatchers);
  installRouterRenderPatches(unpatchers, {
    ensureMetadataCache,
    applyMetadata,
    tryEnrichScreenshotsForApp,
    tryFetchMetadataForApp,
    refreshDeckyNativeActivityForApp,
  });
  safeInstallStep("gameDetailReentryShield", () => installGameDetailReentryShield(unpatchers));

  return () => {
    patchesCancelled = true;
    setBypassTraceEnabled(false);
    setContextMenuTraceEnabled(false);
    unpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (error) {
        log.error("patch", "unpatch failed", error);
      }
    });
  };
};
