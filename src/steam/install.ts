import { frontendLog, getDebugLogging } from "../backend";
import * as log from "../log";
import { toastWarn } from "../toast";
import {
  getOverview,
  isNonSteamAppWithoutPatchedMethod,
  metadataCache,
  steamPatchTargetsReady,
  Unpatch,
} from "./core";
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
import {
  installGameDetailReentryShield,
  installNonSteamQuickLinkPolicy,
  installRouterRenderPatches,
} from "./routerPatches";
import {
  ControllerLayoutFailure,
  installControllerLayouts,
} from "./controllerLayouts";
import { resolveControllerLayoutContext } from "./controllerLayoutPolicy";

const resolveInstalledControllerLayoutContext = (displayedAppid: number) => {
  const overview = getOverview(displayedAppid);
  return resolveControllerLayoutContext({
    displayedAppid,
    isNonSteamShortcut: isNonSteamAppWithoutPatchedMethod(overview),
    metadata: metadataCache[String(displayedAppid)],
  });
};

const reportControllerLayoutFailure = (failure: ControllerLayoutFailure): void => {
  log.warn("controller-layouts", "supplemental layouts disabled", failure);
  void frontendLog(
    "patch",
    "controller layout supplementation disabled",
    failure,
    "warning",
  ).catch(() => undefined);
};

export const installSteamPatches = (): Unpatch => {
  configureActivityMetadataLoader(ensureMetadataCache);
  const unpatchers: Unpatch[] = [];
  let patchesCancelled = false;
  let installStarted = false;
  let attempts = 0;
  let retryId: number | undefined;
  const safeInstallStep = (label: string, run: () => void) => {
    try {
      run();
    } catch (error) {
      log.warn("patch", `install step failed: ${label}`, error);
    }
  };
  const install = () => {
    if (patchesCancelled || installStarted) return;
    installStarted = true;

    safeInstallStep("unmatchedAppLinksHider", () => installUnmatchedAppLinksHider(unpatchers));
    // Activity news use Steam's own AppActivityStore and native Activity renderer.
    safeInstallStep("nativeActivityStorePatch", () => installNativeActivityStorePatch(unpatchers));
    safeInstallStep("nativePartnerEventStorePatch", () => installNativePartnerEventStorePatch(unpatchers));
    installActivityRefreshedListener(unpatchers);

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
    safeInstallStep("nonSteamQuickLinkPolicy", () =>
      installNonSteamQuickLinkPolicy(unpatchers)
    );
    // Install last so an unrelated synchronous patch failure cannot strand
    // controller-layout descriptors outside the normal aggregate teardown.
    safeInstallStep("controllerLayouts", () => installControllerLayouts(unpatchers, {
      resolveContext: resolveInstalledControllerLayoutContext,
      reportFailure: reportControllerLayoutFailure,
      notify: toastWarn,
    }));
    void frontendLog("patch", "steam patches installed", {
      attempts,
      unpatcherCount: unpatchers.length,
    }, "info").catch(() => undefined);
  };

  const tick = () => {
    retryId = undefined;
    if (patchesCancelled) return;
    attempts += 1;
    if (steamPatchTargetsReady()) {
      try {
        install();
      } catch (error) {
        log.warn("patch", "installSteamPatches failed", error);
        void frontendLog("patch", "installSteamPatches failed", {
          error: error instanceof Error ? error.stack || error.message : String(error),
        }, "error").catch(() => undefined);
      }
      return;
    }
    if (attempts >= 240) {
      void frontendLog("patch", "steam patches NOT installed", { attempts }, "warning").catch(() => undefined);
      return;
    }
    retryId = window.setTimeout(tick, 500);
  };

  if (steamPatchTargetsReady()) {
    install();
  } else {
    retryId = window.setTimeout(tick, 500);
  }

  return () => {
    patchesCancelled = true;
    if (retryId !== undefined) {
      window.clearTimeout(retryId);
      retryId = undefined;
    }
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
