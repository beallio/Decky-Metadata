import { findModuleChild } from "@decky/ui";
import { autoFetchMetadata, fetchMetadata, frontendLog, getAllMetadata, saveMetadata } from "../backend";
import { MetadataData } from "../types";
import * as log from "../log";
import {
  Unpatch,
  appName,
  cleanTitle,
  currentRoutePath,
  gameDetailAppIdFromPath,
  getOverview,
  isNonSteamApp,
  isNonSteamAppWithoutPatchedMethod,
  metadataCache,
  patchMethod,
  safeAfterPatch,
  consumeRouteShield,
  metadataState,
} from "./core";

declare const appStore: any;
declare const appDetailsStore: any;
declare const appDetailsCache: any;

let bypassTraceEnabled = false;
const bypassArmTraceAt: Record<string, number> = {};

const bIsModTraceAt: Record<string, number> = {};
const traceBIsModDecision = (
  appId: number,
  path: string,
  originalRet: any,
  finalRet: boolean,
  reason: string,
  shieldState: any,
  bypassCounterBefore: number,
  bypassCounterAfter: number,
  hasCache: boolean
) => {
  if (!bypassTraceEnabled) return;
  const now = Date.now();
  const key = `${appId}-${reason}`;
  if (now - (bIsModTraceAt[key] || 0) < 1000) return;
  bIsModTraceAt[key] = now;
  void frontendLog("trace", "BIsModOrShortcut decision", {
    appId,
    path,
    originalRet,
    finalRet,
    reason,
    shieldState,
    bypassCounterBefore,
    bypassCounterAfter,
    hasCache,
  }).catch(() => undefined);
};


export const setBypassTraceEnabled = (enabled: boolean) => {
  bypassTraceEnabled = !!enabled;
  if (!bypassTraceEnabled) {
    Object.keys(bypassArmTraceAt).forEach((key) => delete bypassArmTraceAt[key]);
    Object.keys(bIsModTraceAt).forEach((key) => delete bIsModTraceAt[key]);
  }
};

export const isBypassTraceEnabled = () => bypassTraceEnabled;

const traceBypassArm = (source: "GetPerClientData" | "BHasRecentlyLaunched") => {
  if (!bypassTraceEnabled) return;
  const now = Date.now();
  if (now - (bypassArmTraceAt[source] || 0) < 1000) return;
  bypassArmTraceAt[source] = now;
  void frontendLog("trace", "bypass armed", { source }).catch(() => undefined);
};

const traceBypassTruthWindowHit = (appId: number, bypassCounter: number) => {
  if (!bypassTraceEnabled) return;
  if (!Number.isFinite(appId) || !metadataCache[String(appId)]) return;
  const routeAppId = gameDetailAppIdFromPath(currentRoutePath());
  if (routeAppId !== appId) return;
  void frontendLog("trace", "bypass truth window hit", { appId, bypassCounter }).catch(() => undefined);
};

const shortcutAppIdForSteamAppId = (steamAppId: number): number | null => {
  if (!Number.isFinite(steamAppId) || steamAppId <= 0) return null;
  for (const [shortcutAppIdText, metadata] of Object.entries(metadataCache)) {
    const shortcutAppId = Number(shortcutAppIdText);
    const metadataSteamAppId = Number((metadata as MetadataData | undefined)?.steam_appid);
    if (
      Number.isFinite(shortcutAppId) &&
      shortcutAppId > 0 &&
      metadataSteamAppId === steamAppId
    ) {
      return shortcutAppId;
    }
  }
  return null;
};

const ensureDetailsOverviewSafeFields = (appId: number) => {
  try {
    const appData = appDetailsStore?.GetAppData?.(appId);
    const details = appData?.details;
    const overview = getOverview(appId);
    if (!details || !isNonSteamApp(overview)) return;

    const detailsAppId = Number(details.unAppID ?? details.appid ?? details.nAppID ?? 0);
    const detailsOverview = Number.isFinite(detailsAppId) && detailsAppId > 0 ? getOverview(detailsAppId) : null;

    // Steam's play bar calls GetAppOverviewByAppID(details.unAppID).BIsApplicationOrTool().
    // For non-Steam games that have been enriched with official Steam data, the first
    // page render can temporarily expose a details object whose unAppID points nowhere
    // in the local library. Keep it tied to the actual shortcut AppID so SteamUI never
    // dereferences a null overview during the first open.
    if (!detailsOverview) {
      details.unAppID = appId;
    }

    // Some SteamUI reactions iterate these arrays while details are still being
    // bootstrapped. Non-Steam shortcut details can miss them on first render.
    if (!Array.isArray(details.vecDLC)) details.vecDLC = [];
    if (!Array.isArray(details.vecChildConfigApps)) details.vecChildConfigApps = [];
    if (!Array.isArray(details.vecScreenShots)) details.vecScreenShots = [];

    if (details.appid == null) details.appid = appId;
    if (details.nAppID == null) details.nAppID = appId;
  } catch (_error) {
    // Best-effort guard only; never block Steam's native bootstrap.
  }
};


export const refreshMetadataCache = async () => {
  const all = await getAllMetadata();
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  Object.assign(metadataCache, all || {});
  metadataState.metadataLoaded = true;
  Object.keys(metadataCache).forEach((key) => applyMetadata(Number(key)));
};

export const ensureMetadataCache = async () => {
  if (metadataState.metadataLoaded) return;
  if (!metadataState.metadataLoadPromise) {
    metadataState.metadataLoadPromise = refreshMetadataCache().finally(() => {
      metadataState.metadataLoadPromise = null;
    });
  }
  await metadataState.metadataLoadPromise;
};

export const startMetadataBootstrap = (): Unpatch => {
  let cancelled = false;
  let attempts = 0;
  const tick = async () => {
    if (cancelled) return;
    try {
      await ensureMetadataCache();
      Object.keys(metadataCache).forEach((key) => applyMetadata(Number(key)));
    } catch (error) {
      log.warn("bridge", "metadata bootstrap failed", error);
    }
    attempts += 1;
    if (!cancelled && attempts < 24) {
      window.setTimeout(tick, 500);
    }
  };
  void tick();
  return () => {
    cancelled = true;
  };
};

export const applyMetadata = (appId: number) => {
  const overview = getOverview(appId);
  if (!isNonSteamApp(overview)) return;
  const metadata = metadataCache[String(appId)];
  if (!metadata) return;

  try {
    if (typeof metadata.rating === "number") {
      overview.metacritic_score = metadata.rating;
    }
    if (
      typeof metadata.deck_compat_category === "number" &&
      metadata.deck_compat_category >= 1 &&
      metadata.deck_compat_category <= 3
    ) {
      const category = metadata.deck_compat_category & 3;
      const prevPacked = Number(overview.steam_hw_compat_category_packed) || 0;
      // bits 0-1 = steam_deck_compat_category; bits 2-3 = verified-filter copy; keep bits >= 4
      overview.steam_hw_compat_category_packed =
        (prevPacked & ~0xf) | category | (category << 2);
    }
    if (!overview.m_setStoreCategories) {
      overview.m_setStoreCategories = new Set<number>();
    }
    metadata.store_categories?.forEach((category) => {
      overview.m_setStoreCategories.add(Number(category));
    });
  } catch (_error) {
    // Steam objects are not always writable during early bootstrap.
  }

  const appData = appDetailsStore?.GetAppData?.(appId);
  if (!appData) return;
  ensureDetailsOverviewSafeFields(appId);

  const description = metadata.description || metadata.short_description || "";
  appData.descriptionsData = {
    strFullDescription: description,
    strSnippet: description,
  };
  appData.associationData = {
    rgDevelopers: (metadata.developers || []).map((developer) => ({
      strName: developer.name,
      strURL: developer.url || "",
    })),
    rgPublishers: (metadata.publishers || []).map((publisher) => ({
      strName: publisher.name,
      strURL: publisher.url || "",
    })),
    rgFranchises: [],
  };

  try {
    const releaseDate = metadata.release_date;
    if (typeof releaseDate === "number" && releaseDate > 0) {
      overview.rt_original_release_date = releaseDate;
      overview.rt_steam_release_date = releaseDate;
    }
  } catch (_error) {
    // Steam objects are not always writable during early bootstrap.
  }

  const screenshots = steamScreenshotsFromMetadata(appId, metadata);
  if (screenshots.length) {
    const screenshotData = {
      rgScreenshots: screenshots,
      screenshots,
      vecScreenshots: screenshots,
      vecScreenShots: screenshots,
    };
    appData.screenshots = screenshotData;
    if (appData.details) {
      appData.details.nScreenshots = screenshots.length;
      appData.details.vecScreenShots = screenshots;
      appData.details.bCommunityMarketPresence = true;
    }
  }

  try {
    appDetailsCache?.SetCachedDataForApp?.(
      appId,
      "descriptions",
      1,
      appData.descriptionsData
    );
    appDetailsCache?.SetCachedDataForApp?.(
      appId,
      "associations",
      1,
      appData.associationData
    );
    if (screenshots.length) {
      appDetailsCache?.SetCachedDataForApp?.(
        appId,
        "screenshots",
        1,
        appData.screenshots
      );
    }
  } catch (_error) {
    // Cache writes can fail if the page has not finished creating app data.
  }
};

const steamScreenshotsFromMetadata = (appId: number, metadata: MetadataData) =>
  (metadata.screenshots || [])
    .filter((image) => image?.url)
    .slice(0, 10)
    .map((image, index) => ({
      appid: appId,
      id: image.id || `${appId}-${index}`,
      nScreenshotID: index + 1,
      strCaption: image.caption || metadata.title || "",
      strImageURL: image.url,
      strThumbnailURL: image.url,
      strURL: image.url,
      url: image.url,
      nWidth: image.width || 1280,
      nHeight: image.height || 720,
      width: image.width || 1280,
      height: image.height || 720,
      bSpoiler: false,
    }));

export const tryFetchMetadataForApp = async (appId: number) => {
  await ensureMetadataCache();
  if (metadataCache[String(appId)] || metadataState.loadingMetadata.has(appId)) return;
  const overview = getOverview(appId);
  if (!isNonSteamApp(overview)) return;
  metadataState.loadingMetadata.add(appId);
  try {
    const metadata = await autoFetchMetadata(appId, appName(appId));
    if (metadata) {
      metadataCache[String(appId)] = metadata;
      applyMetadata(appId);
      window.dispatchEvent(new Event("decky-metadata:updated"));
    }
  } finally {
    metadataState.loadingMetadata.delete(appId);
  }
};

export const tryEnrichScreenshotsForApp = async (appId: number) => {
  await ensureMetadataCache();
  const metadata = metadataCache[String(appId)];
  if (
    !metadata ||
    metadata.screenshots?.length ||
    metadataState.loadingScreenshots.has(appId) ||
    String(metadata.source || "").toUpperCase() !== "IGN"
  ) {
    return;
  }
  const source = metadata.source_url || String(metadata.id || "");
  if (!source) return;
  metadataState.loadingScreenshots.add(appId);
  try {
    const refreshed = await fetchMetadata(source);
    if (refreshed?.screenshots?.length) {
      const saved = await saveMetadata(appId, {
        ...metadata,
        screenshots: refreshed.screenshots,
      });
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      window.dispatchEvent(new Event("decky-metadata:updated"));
    }
  } catch (error) {
    log.warn("bridge", "screenshot enrichment failed", error);
  } finally {
    metadataState.loadingScreenshots.delete(appId);
  }
};

export const installMetadataPatches = (unpatchers: Unpatch[]) => {
  const overviewProto = appStore?.allApps?.[0]?.__proto__;
  const detailsProto = appDetailsStore?.__proto__;
  if (!overviewProto || !detailsProto) return;

  if (appStore?.GetAppOverviewByAppID) {
    unpatchers.push(
      patchMethod(appStore, "GetAppOverviewByAppID", (_thisValue, original, args) => {
        const requestedAppId = Number(args[0]);
        const result = original(...args);
        if (result || !Number.isFinite(requestedAppId) || requestedAppId <= 0) {
          return result;
        }
        const shortcutAppId = shortcutAppIdForSteamAppId(requestedAppId);
        if (!shortcutAppId || shortcutAppId === requestedAppId) return result;
        try {
          const shortcutOverview = original(shortcutAppId);
          if (isNonSteamAppWithoutPatchedMethod(shortcutOverview)) return shortcutOverview;
        } catch (_error) {
          // Fall through to Steam's native null result.
        }
        return result;
      })
    );
  }

  unpatchers.push(
    patchMethod(detailsProto, "GetDescriptions", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      const overview = getOverview(appId);
      const originalResult = original(...args);
      if (isNonSteamApp(overview)) {
        ensureDetailsOverviewSafeFields(appId);
        const metadata = metadataCache[String(appId)];
        if (metadata) {
          applyMetadata(appId);
          const appData = appDetailsStore?.GetAppData?.(appId);
          // Keep Steam's first-run detail bootstrap intact. Returning Decky data
          // before Steam has created the native details object can make SteamUI
          // render the play bar with an invalid/null AppOverview and crash on
          // BIsApplicationOrTool during the first page open.
          if (appData?.details && appData?.descriptionsData) {
            return appData.descriptionsData;
          }
        } else {
          void ensureMetadataCache().then(() => {
            if (metadataCache[String(appId)]) {
              applyMetadata(appId);
              void tryEnrichScreenshotsForApp(appId);
            } else {
              void tryFetchMetadataForApp(appId);
            }
          });
        }
      }
      return originalResult;
    })
  );

  unpatchers.push(
    patchMethod(detailsProto, "GetAssociations", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      const originalResult = original(...args);
      const overview = getOverview(appId);
      if (isNonSteamApp(overview)) ensureDetailsOverviewSafeFields(appId);
      if (isNonSteamApp(overview) && metadataCache[String(appId)]) {
        applyMetadata(appId);
        const appData = appDetailsStore?.GetAppData?.(appId);
        if (appData?.details && appData?.associationData) {
          return appData.associationData;
        }
      }
      return originalResult;
    })
  );


  unpatchers.push(
    patchMethod(overviewProto, "BHasStoreCategory", (thisValue, original, args) => {
      if (isNonSteamApp(thisValue)) {
        const category = Number(args[0]);
        const metadata = metadataCache[String(thisValue.appid)];
        if (metadata?.store_categories?.includes(category)) return true;
      }
      return original(...args);
    })
  );

  if (overviewProto?.BIsModOrShortcut) {
    unpatchers.push(
      safeAfterPatch(overviewProto, "BIsModOrShortcut", function (this: any, _args: any[], ret: any) {
        const appId = Number(this?.appid);
        const path = currentRoutePath();
        const hasCache = !!metadataCache[String(appId)];
        const bypassCounterBefore = metadataState.bypassCounter;

        const shieldBefore = metadataState.routeShield ? { ...metadataState.routeShield } : null;
        const shieldHit = consumeRouteShield(appId);
        const shieldAfter = metadataState.routeShield ? { ...metadataState.routeShield } : null;
        const shieldState = { before: shieldBefore, after: shieldAfter, hit: shieldHit };

        if (!isNonSteamAppWithoutPatchedMethod(this)) {
          traceBIsModDecision(appId, path, ret, ret, "not-nonsteam", shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache);
          return ret;
        }
        if (ret !== true) {
          traceBIsModDecision(appId, path, ret, ret, "original-not-shortcut", shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache);
          return ret;
        }

        if (shieldHit) {
          traceBIsModDecision(appId, path, ret, false, "render-shield", shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache);
          return false;
        }

        if (path === "/library/home") {
          traceBIsModDecision(appId, path, ret, false, "home-special-case", shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache);
          return false;
        }

        if (metadataState.bypassCounter > 0) {
          metadataState.bypassCounter -= 1;
        }

        const shouldBypass = metadataState.bypassCounter === -1 || metadataState.bypassCounter > 0;
        const reason = shouldBypass ? "truth-window" : "normal-shortcut";

        traceBIsModDecision(appId, path, ret, shouldBypass, reason, shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache);
        if (shouldBypass) {
          traceBypassTruthWindowHit(appId, metadataState.bypassCounter);
        }
        return shouldBypass;
      }).unpatch
    );
  }

  if (detailsProto?.BHasRecentlyLaunched) {
    unpatchers.push(
      safeAfterPatch(detailsProto, "BHasRecentlyLaunched", (_args: any[], ret: any) => {
        const wasIdle = metadataState.bypassCounter === 0;
        metadataState.bypassCounter = 4;
        if (wasIdle) traceBypassArm("BHasRecentlyLaunched");
        return ret;
      }).unpatch
    );
  }

  ["GetGameID", "GetPrimaryAppID"].forEach((methodName) => {
    if (!overviewProto?.[methodName]) return;
    unpatchers.push(
      patchMethod(overviewProto, methodName, (_thisValue, original, args) => {
        metadataState.bypassCounter = -1;
        const ret = original(...args);
        metadataState.bypassCounter = 0;
        return ret;
      })
    );
  });

  if (overviewProto?.GetCanonicalReleaseDate) {
    unpatchers.push(
      patchMethod(overviewProto, "GetCanonicalReleaseDate", (thisValue, original, args) => {
        const metadata = metadataCache[String(thisValue?.appid)];
        if (isNonSteamApp(thisValue) && metadata?.release_date) {
          return metadata.release_date;
        }
        return original(...args);
      })
    );
  }

  if (overviewProto?.GetPerClientData) {
    unpatchers.push(
      safeAfterPatch(overviewProto, "GetPerClientData", (_args: any[], ret: any) => {
        const wasIdle = metadataState.bypassCounter === 0;
        metadataState.bypassCounter = 4;
        if (wasIdle) traceBypassArm("GetPerClientData");
        return ret;
      }).unpatch
    );
  }

  try {
    const appDetailsSections = findModuleChild((module: any) => {
      if (typeof module !== "object") return undefined;
      for (const prop in module) {
        try {
          if (typeof module[prop]?.prototype?.GetSections === "function") {
            return module[prop];
          }
        } catch (_error) {
          continue;
        }
      }
      return undefined;
    });
    if (appDetailsSections?.prototype?.GetSections) {
      unpatchers.push(
        safeAfterPatch(
          appDetailsSections.prototype,
          "GetSections",
          function (this: any, _args: any[], ret: Set<string>) {
            const overview = this?.props?.overview;
            const appId = Number(overview?.appid);
            if (appId && isNonSteamApp(overview)) ensureDetailsOverviewSafeFields(appId);
            if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
              metadataState.lastObservedGameDetailAppId = appId;
              const metadata = metadataCache[String(appId)];
              if (metadata?.screenshots?.length) {
                ret.add("screenshots");
              } else {
                void tryEnrichScreenshotsForApp(appId);
              }
              ret.add("community");
              // Add the real Steam Activity section too. News are deliberately
              // served through the Activity feed patch, not the Community feed.
              ret.add("activity");
            }
            return ret;
          }
        ).unpatch
      );
    }
  } catch (error) {
    log.warn("patch", "app details sections patch skipped", error);
  }
};

export const allNonSteamGames = async (): Promise<{ appid: number; name: string; exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string }[]> => {
  const byId = new Map<number, { appid: number; name: string; exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string }>();
  const addEntry = (entry: any) => {
    const appid = Number(
      entry?.appid ?? entry?.app_id ?? entry?.unAppID ?? entry?.nAppID ?? entry
    );
    if (!Number.isFinite(appid) || appid <= 0) return;
    const overview = getOverview(appid);
    const nonSteam = entry?.isNonSteam === true || isNonSteamApp(overview);
    if (!nonSteam) return;
    const previous = byId.get(appid) || ({} as { appid?: number; name?: string; exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string });
    byId.set(appid, {
      ...previous,
      appid,
      name: cleanTitle(
        overview?.display_name ||
          overview?.localized_name ||
          entry?.name ||
          entry?.title ||
          previous.name ||
          `App ${appid}`
      ),
      exe: entry?.exe || previous.exe || "",
      start_dir: entry?.start_dir || previous.start_dir || "",
      launch_options: entry?.launch_options || previous.launch_options || "",
      shortcut_path: entry?.shortcut_path || previous.shortcut_path || "",
    });
  };

  try {
    appStore?.allApps?.forEach?.(addEntry);
    appStore?.m_mapAppOverview?.forEach?.(addEntry);
  } catch (_error) {
    // Continue with backend fallback.
  }

  try {
    const localShortcuts = await import("../backend").then((m) => m.getLocalShortcuts());
    localShortcuts.forEach(addEntry);
  } catch (_error) {
    // Optional fallback.
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
};
