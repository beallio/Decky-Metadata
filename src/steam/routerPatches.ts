import { routerHook } from "@decky/api";
import { findInReactTree } from "@decky/ui";
import { frontendLog } from "../backend";
import {
  GAME_ACTIVITY_ROUTES,
  GAME_DETAIL_ROUTES,
  Unpatch,
  appIdFromReactTree,
  currentGameDetailAppId,
  gameDetailAppIdFromPath,
  getOverview,
  isNonSteamApp,
  metadataCache,
  metadataState,
  overviewFromReactTree,
  patchMethod,
  safeAfterPatch,
} from "./core";
import { isBypassTraceEnabled } from "./metadataPatch";

type RouterPatchDeps = {
  ensureMetadataCache: () => Promise<void>;
  applyMetadata: (appId: number) => void;
  tryEnrichScreenshotsForApp: (appId: number) => Promise<void>;
  tryFetchMetadataForApp: (appId: number) => Promise<void>;
  refreshDeckyNativeActivityForApp: (appId: number) => Promise<any>;
};

export const installRouterRenderPatches = (unpatchers: Unpatch[], deps: RouterPatchDeps) => {
  const {
    ensureMetadataCache,
    applyMetadata,
    tryEnrichScreenshotsForApp,
    tryFetchMetadataForApp,
    refreshDeckyNativeActivityForApp,
  } = deps;
  GAME_DETAIL_ROUTES.forEach((route) => {
    const patch = routerHook.addPatch(route, (tree: any) => {
      const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);
      if (routeProps?.renderFunc) {
        const renderPatch = safeAfterPatch(routeProps, "renderFunc", (_args: any[], ret: any) => {
          const overview = ret?.props?.children?.props?.overview || overviewFromReactTree(ret);
          const appId = Number(overview?.appid || appIdFromReactTree(ret) || currentGameDetailAppId());
          const appOverview = overview || getOverview(appId);
          if (appId && isNonSteamApp(appOverview)) {
            metadataState.lastObservedGameDetailAppId = appId;
            metadataState.bypassBypass = 11;
            void ensureMetadataCache().then(() => {
              applyMetadata(appId);
              void tryEnrichScreenshotsForApp(appId);
              void tryFetchMetadataForApp(appId);
            });
            void refreshDeckyNativeActivityForApp(appId);
            return ret;
          }
          return ret;
        });
        unpatchers.push(renderPatch.unpatch);
      }
      return tree;
    });
    unpatchers.push(() => routerHook.removePatch(route, patch));
  });

  GAME_ACTIVITY_ROUTES.forEach((route) => {
    const patch = routerHook.addPatch(route, (tree: any) => {
      const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);
      if (routeProps?.renderFunc) {
        const renderPatch = safeAfterPatch(routeProps, "renderFunc", (_args: any[], ret: any) => {
          const treeAppId = appIdFromReactTree(ret);
          const appId = currentGameDetailAppId() || treeAppId;
          const overview = overviewFromReactTree(ret) || getOverview(appId);
          if (appId && isNonSteamApp(overview)) {
            metadataState.lastObservedGameDetailAppId = appId;
            void ensureMetadataCache().then(() => {
              applyMetadata(appId);
            });
            void refreshDeckyNativeActivityForApp(appId);
            return ret;
          }
          return ret;
        });
        unpatchers.push(renderPatch.unpatch);
      }
      return tree;
    });
    unpatchers.push(() => routerHook.removePatch(route, patch));
  });
};

export const installGameDetailReentryShield = (unpatchers: Unpatch[]) => {
  const shieldUnpatchers: Unpatch[] = [];
  let cancelled = false;
  let retryId: number | undefined;
  let attempts = 0;

  const clearRetry = () => {
    if (retryId !== undefined) {
      window.clearTimeout(retryId);
      retryId = undefined;
    }
  };

  const mainWindowHistory = () =>
    (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ??
    (globalThis as any)?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;

  const armShieldForPath = (path: string, trigger: string) => {
    try {
      const appId = gameDetailAppIdFromPath(path);
      if (appId <= 0) return;
      const overview = getOverview(appId);
      if (!isNonSteamApp(overview) || !metadataCache[String(appId)]) return;
      metadataState.bypassBypass = 11;
      if (isBypassTraceEnabled()) {
        void frontendLog("trace", "reentry shield armed", { appId, trigger }).catch(() => undefined);
      }
    } catch (_error) {
      // Steam navigation must continue even if the shield probe fails.
    }
  };

  const destinationPath = (history: any, targetIndex: number): string => {
    if (!Array.isArray(history?.entries) || !Number.isInteger(history?.index)) return "";
    if (targetIndex < 0 || targetIndex >= history.entries.length) return "";
    const entry = history.entries[targetIndex];
    return String(entry?.pathname || entry?.location?.pathname || "");
  };

  const patchHistoryMethod = (history: any, methodName: "goBack" | "go") => {
    const unpatch = patchMethod(history, methodName, (_thisValue, original, args) => {
      try {
        const index = Number(history?.index);
        const offset = methodName === "goBack" ? -1 : Number(args[0]);
        if (Number.isInteger(index) && Number.isFinite(offset)) {
          armShieldForPath(destinationPath(history, index + offset), methodName);
        }
      } catch (_error) {
        // Fall through to native navigation.
      }
      return original(...args);
    });
    const patched = history?.[methodName];
    shieldUnpatchers.push(() => {
      try {
        if (history?.[methodName] === patched) {
          unpatch();
        }
      } catch (_error) {
        // Best effort teardown.
      }
    });
  };

  const listenToHistory = (history: any) => {
    try {
      const unlisten = history.listen((location: any) => {
        armShieldForPath(location?.pathname || "", "listen");
      });
      if (typeof unlisten === "function") {
        shieldUnpatchers.push(() => {
          try {
            unlisten();
          } catch (_error) {
            // Best effort teardown.
          }
        });
      }
    } catch (_error) {
      // Optional fallback only.
    }
  };

  const tryInstall = () => {
    if (cancelled) return;
    const history = mainWindowHistory();
    if (
      history &&
      (typeof history.goBack === "function" ||
        typeof history.go === "function" ||
        typeof history.listen === "function")
    ) {
      clearRetry();
      if (typeof history.goBack === "function") patchHistoryMethod(history, "goBack");
      if (typeof history.go === "function") patchHistoryMethod(history, "go");
      if (typeof history.listen === "function") listenToHistory(history);
      return;
    }
    attempts += 1;
    if (attempts < 30) {
      retryId = window.setTimeout(tryInstall, 500);
    }
  };

  tryInstall();

  unpatchers.push(() => {
    cancelled = true;
    clearRetry();
    shieldUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
  });
};
