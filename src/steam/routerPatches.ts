import { routerHook } from "@decky/api";
import { findInReactTree, findModuleChild } from "@decky/ui";
import { cloneElement } from "react";
import { frontendLog } from "../backend";
import * as log from "../log";
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
  armRouteShield,
  clearRouteShield,
} from "./core";
import { isBypassTraceEnabled } from "./metadataPatch";
import {
  findChildElements,
  isInfoSectionBoundary,
  isQuickLinksElement,
  isReactElement,
} from "./reactTreeWalk";
import { transformMatchedQuickLinks } from "./quickLinkPolicy";
import { resolveQuickLinkResources } from "./quickLinkResources";

type RouterPatchDeps = {
  ensureMetadataCache: () => Promise<void>;
  applyMetadata: (appId: number) => void;
  tryEnrichScreenshotsForApp: (appId: number) => Promise<void>;
  tryFetchMetadataForApp: (appId: number) => Promise<void>;
  refreshDeckyNativeActivityForApp: (appId: number) => Promise<any>;
};

const isNeverOnSteam = (appId: number): boolean => {
  try {
    const metadata = metadataCache[String(appId)];
    if (!metadata) return false;
    return !(Number(metadata.steam_appid) > 0);
  } catch (_error) {
    return false;
  }
};

// The quick-links row is not reachable from the route render tree. Steam's page
// host mounts Game Info through several function-component boundaries, so this
// hooks the class that registers the info section. Its output contains the
// function boundary whose render creates the native quick-links component.

const NullQuickLinks = () => null;
const infoSectionWrapperCache = new Map<any, any>();
const nativeQuickLinksWrapperCache = new Map<any, any>();

export const installNonSteamQuickLinkPolicy = (unpatchers: Unpatch[]) => {
  const maxAttempts = 5;
  let attempts = 0;
  let cancelled = false;
  let retryId: number | undefined;
  let policyUnpatch: Unpatch | undefined;
  let quickLinkResources: ReturnType<typeof resolveQuickLinkResources> | undefined;

  const clearRetry = () => {
    if (retryId !== undefined) {
      window.clearTimeout(retryId);
      retryId = undefined;
    }
  };

  const findSectionClass = () =>
    findModuleChild((module: any) => {
      if (typeof module !== "object") return undefined;
      for (const prop in module) {
        try {
          const candidate = module[prop];
          if (
            typeof candidate === "function" &&
            candidate.prototype?.isReactComponent &&
            typeof candidate.prototype.render === "function" &&
            String(candidate.prototype.render).includes("RegisterSection")
          ) {
            return candidate;
          }
        } catch (_error) {
          continue;
        }
      }
      return undefined;
    });

  const warnFingerprintMiss = () => {
    const fields = { attempt: attempts, maxAttempts };
    log.warn("patch", "non-Steam quick-links section target not found", fields);
    void frontendLog(
      "patch",
      "non-Steam quick-links section target not found",
      fields,
      "warning"
    ).catch(() => undefined);
  };

  const warnPolicyFailure = (message: string, fields: Record<string, unknown>) => {
    log.warn("patch", message, fields);
    void frontendLog("patch", message, fields, "warning").catch(() => undefined);
  };

  const policyWrapperFor = (original: any) => {
    let wrapper = nativeQuickLinksWrapperCache.get(original);
    if (wrapper) return wrapper;
    wrapper = (props: any) => {
      const nativeOutput = original(props);
      try {
        const appId = Number(props?.overview?.appid);
        const metadata = metadataCache[String(appId)];
        if (!metadata || !isNonSteamApp(props?.overview) || !(Number(metadata.steam_appid) > 0)) {
          return nativeOutput;
        }
        if (!isReactElement(nativeOutput) || !Array.isArray(nativeOutput.props?.links)) {
          warnPolicyFailure("matched quick-links output shape changed", { appId });
          return nativeOutput;
        }
        quickLinkResources ??= resolveQuickLinkResources();
        const links = transformMatchedQuickLinks(
          nativeOutput.props.links,
          {
            isNonSteamShortcut: true,
            steamAppid: Number(metadata.steam_appid),
            steamStoreState: metadata.steam_store_state || "unknown",
            hasDlc: Array.isArray(metadata.steam_dlc_appids) && metadata.steam_dlc_appids.length > 0,
            hasPointsShop: metadata.has_points_shop === true,
          },
          quickLinkResources,
        );
        return cloneElement(nativeOutput, { links });
      } catch (error) {
        warnPolicyFailure("matched quick-links transformation failed", {
          appId: Number(props?.overview?.appid) || 0,
          error: error instanceof Error ? error.message : String(error),
        });
        return nativeOutput;
      }
    };
    wrapper.__dmQuickLinksWrapper = true;
    nativeQuickLinksWrapperCache.set(original, wrapper);
    return wrapper;
  };

  const tryInstall = () => {
    retryId = undefined;
    if (cancelled || policyUnpatch) return;
    attempts += 1;
    const sectionClass = findSectionClass();
    if (!sectionClass?.prototype?.render) {
      warnFingerprintMiss();
      if (attempts < maxAttempts) {
        retryId = window.setTimeout(tryInstall, 500);
      }
      return;
    }

    policyUnpatch = safeAfterPatch(
      sectionClass.prototype,
      "render",
      function (this: any, _args: any[], ret: any) {
        try {
          if (this?.props?.name !== "info") return ret;
          const boundaries: any[] = [];
          findChildElements(ret, isInfoSectionBoundary, boundaries);
          for (const element of boundaries) {
            const appId = Number(element.props?.overview?.appid);
            if (!metadataCache[String(appId)] || !isNonSteamApp(element.props?.overview)) continue;
            const original = element.type;
            let wrapper = infoSectionWrapperCache.get(original);
            if (!wrapper) {
              wrapper = (props: any) => {
                const rendered = original(props);
                try {
                  const renderedAppId = Number(props?.overview?.appid);
                  const metadata = metadataCache[String(renderedAppId)];
                  if (!metadata || !isNonSteamApp(props?.overview)) return rendered;
                  const linkRows: any[] = [];
                  findChildElements(rendered, isQuickLinksElement, linkRows);
                  if (linkRows.length === 0) {
                    warnPolicyFailure("non-Steam quick-links row shape changed", {
                      appId: renderedAppId,
                    });
                  }
                  for (const row of linkRows) {
                    row.type = isNeverOnSteam(renderedAppId)
                      ? NullQuickLinks
                      : policyWrapperFor(row.type);
                  }
                } catch (error) {
                  warnPolicyFailure("non-Steam quick-links section traversal failed", {
                    appId: Number(props?.overview?.appid) || 0,
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
                return rendered;
              };
              wrapper.__dmQuickLinksWrapper = true;
              infoSectionWrapperCache.set(original, wrapper);
            }
            element.type = wrapper;
          }
        } catch (error) {
          warnPolicyFailure("non-Steam quick-links boundary traversal failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return ret;
      }
    ).unpatch;
  };

  unpatchers.push(() => {
    cancelled = true;
    clearRetry();
    policyUnpatch?.();
    policyUnpatch = undefined;
  });
  tryInstall();
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
            const previousAppId = metadataState.lastObservedGameDetailAppId;
            metadataState.lastObservedGameDetailAppId = appId;
            if (metadataCache[String(appId)]) {
              armRouteShield(appId, route, "route-render");
              if (isBypassTraceEnabled()) {
                void frontendLog("trace", "reentry shield armed", { appId, trigger: "route-render", path: route }).catch(() => undefined);
              }
            } else {
              if (isBypassTraceEnabled()) {
                void frontendLog("trace", "reentry shield skip", { trigger: "route-render", path: route, appId, reason: "no-metadata-cache" }).catch(() => undefined);
              }
            }
            void ensureMetadataCache().then(() => {
              applyMetadata(appId);
              void tryEnrichScreenshotsForApp(appId);
              void tryFetchMetadataForApp(appId);
            });
            if (previousAppId !== appId) {
              void refreshDeckyNativeActivityForApp(appId);
            }
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

  const armShieldForPath = (path: string, trigger: string, history?: any) => {
    try {
      const appId = gameDetailAppIdFromPath(path);
      const historySnapshot = history && Array.isArray(history.entries) ? {
        index: history.index,
        entriesLength: history.entries.length,
        destination: path
      } : undefined;

      if (appId <= 0) {
        if (isBypassTraceEnabled()) {
          void frontendLog("trace", "reentry shield skip", { trigger, path, reason: "no-appid", historySnapshot }).catch(() => undefined);
        }
        return;
      }
      const overview = getOverview(appId);
      if (!isNonSteamApp(overview)) {
        if (isBypassTraceEnabled()) {
          void frontendLog("trace", "reentry shield skip", { trigger, path, appId, reason: "not-nonsteam", historySnapshot }).catch(() => undefined);
        }
        return;
      }
      if (!metadataCache[String(appId)]) {
        if (isBypassTraceEnabled()) {
          void frontendLog("trace", "reentry shield skip", { trigger, path, appId, reason: "no-metadata-cache", historySnapshot }).catch(() => undefined);
        }
        return;
      }
      armRouteShield(appId, path, trigger);
      if (isBypassTraceEnabled()) {
        void frontendLog("trace", "reentry shield armed", { appId, trigger, path, historySnapshot }).catch(() => undefined);
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
          armShieldForPath(destinationPath(history, index + offset), methodName, history);
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
        armShieldForPath(location?.pathname || "", "listen", history);
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
    clearRouteShield();
    shieldUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
  });
};
