import { routerHook } from "@decky/api";
import { findInReactTree } from "@decky/ui";
import {
  GAME_ACTIVITY_ROUTES,
  GAME_DETAIL_ROUTES,
  Unpatch,
  appIdFromReactTree,
  currentGameDetailAppId,
  getOverview,
  isNonSteamApp,
  metadataState,
  overviewFromReactTree,
  safeAfterPatch,
} from "./core";

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
