import { routerHook } from "@decky/api";
import { findInReactTree, findModuleChild } from "@decky/ui";
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
  armRouteShield,
  clearRouteShield,
} from "./core";
import { isBypassTraceEnabled } from "./metadataPatch";

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

// The quick-links row (Store Page / Community Hub / Discussions / …) only
// renders because the BIsModOrShortcut spoof makes the app look like a real
// Steam title; for never-on-Steam games every link is dead. The row's element
// is not reachable from the route render tree — Steam's page host mounts the
// Game Info content through several function-component boundaries — so the
// suppression hooks the section wrapper class (the component that registers
// sections via parent.RegisterSection(name, el)): its render output holds the
// info-section content element, whose render in turn creates the links row.

const isReactElement = (node: any): boolean =>
  !!node &&
  typeof node === "object" &&
  typeof node.$$typeof === "symbol" &&
  String(node.$$typeof).includes("react.");

// Walks elements and arrays through children chains only. It must never
// iterate class instances such as the MobX-backed overview/details stores:
// touching their keys inside an observer render subscribes that render to
// everything and can wedge the renderer.
const findChildElements = (
  root: any,
  predicate: (node: any) => boolean,
  out: any[]
): void => {
  const stack = [root];
  let budget = 500;
  while (stack.length && budget-- > 0 && out.length < 8) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    if (!isReactElement(node)) continue;
    try {
      if (predicate(node)) {
        out.push(node);
        continue;
      }
    } catch (_error) {
      // Keep walking when a candidate's props are not inspectable.
    }
    const children = node.props?.children;
    if (children && typeof children === "object") stack.push(children);
  }
};

const isQuickLinksElement = (node: any): boolean => {
  const props = node?.props;
  return (
    !!props &&
    typeof props === "object" &&
    "overview" in props &&
    "details" in props &&
    "workshopVisible" in props &&
    "marketPresence" in props
  );
};

const isInfoSectionBoundary = (node: any): boolean => {
  const props = node?.props;
  return (
    !!props &&
    typeof props === "object" &&
    "overview" in props &&
    "details" in props &&
    typeof node.type === "function" &&
    !node.type.prototype?.isReactComponent &&
    !(node.type as any).__dmQuickLinksWrapper
  );
};

const NullQuickLinks = () => null;
const quickLinksWrapperCache = new Map<any, any>();

export const installNeverOnSteamQuickLinksSuppression = (unpatchers: Unpatch[]) => {
  const sectionClass = findModuleChild((module: any) => {
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
  if (!sectionClass?.prototype?.render) return;
  unpatchers.push(
    safeAfterPatch(sectionClass.prototype, "render", function (this: any, _args: any[], ret: any) {
      try {
        if (this?.props?.name !== "info") return ret;
        const boundaries: any[] = [];
        findChildElements(ret, isInfoSectionBoundary, boundaries);
        for (const element of boundaries) {
          if (!isNeverOnSteam(Number(element.props?.overview?.appid))) continue;
          const original = element.type;
          let wrapper = quickLinksWrapperCache.get(original);
          if (!wrapper) {
            wrapper = (props: any) => {
              const rendered = original(props);
              try {
                if (isNeverOnSteam(Number(props?.overview?.appid))) {
                  const linkRows: any[] = [];
                  findChildElements(rendered, isQuickLinksElement, linkRows);
                  for (const row of linkRows) row.type = NullQuickLinks;
                }
              } catch (_error) {
                // Leave the native output untouched on shape changes.
              }
              return rendered;
            };
            wrapper.__dmQuickLinksWrapper = true;
            quickLinksWrapperCache.set(original, wrapper);
          }
          element.type = wrapper;
        }
      } catch (_error) {
        // Steam's native render tree must remain usable if its shape changes.
      }
      return ret;
    }).unpatch
  );
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
