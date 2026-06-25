import React from "react";
import { afterPatch, findInReactTree, findModuleChild, Navigation, Spinner, DialogButton } from "@decky/ui";
import { routerHook } from "@decky/api";
import {
  autoFetchMetadata,
  enrichCommunityMedia,
  fetchAchievements,
  fetchMetadata,
  getAchievementSettings,
  getAllMetadata,
  resolveRetroAchievementsFromPath,
  saveMetadata,
} from "./backend";
import {
  AchievementSettings,
  AchievementsResponse,
  MetadataData,
  SteamAchievement,
  StoreCategory,
} from "./types";

declare const appStore: any;
declare const appDetailsStore: any;
declare const appDetailsCache: any;
declare const appAchievementProgressCache: any;
declare const SteamClient: any;

type Unpatch = () => void;

export const metadataCache: Record<string, MetadataData> = {};
export const achievementsCache: Record<string, AchievementsResponse> = {};

const NON_STEAM_APP_TYPE = 1073741824;
const GAME_DETAIL_ROUTES = [
  "/library/app/:appid",
  "/library/details/:appid",
  "/library/:collection/app/:appid",
];
const GAME_ACHIEVEMENT_ROUTES = [
  "/library/app/:appid/achievements",
  "/library/app/:appid/achievements/:rest",
  "/library/details/:appid/achievements",
  "/library/details/:appid/achievements/:rest",
  "/library/:collection/app/:appid/achievements",
  "/library/:collection/app/:appid/achievements/:rest",
];
export const PLAYHUB_ACHIEVEMENTS_ROUTE = "/playhub-metadata/achievements/:appid";


let achievementSettingsCache: AchievementSettings | null = null;
let bypassCounter = 0;
let bypassBypass = 0;
let metadataLoaded = false;
let metadataLoadPromise: Promise<void> | null = null;
const loadingMetadata = new Set<number>();
const loadingAchievements = new Set<number>();
const loadingScreenshots = new Set<number>();
const loadingCommunityMedia = new Set<number>();
let steamAchievementStoreRef: any = null;

const shouldShowAchievements = (appId: number) => {
  const key = String(appId);
  if (achievementsCache[key]?.steam?.nTotal) return true;
  if (achievementSettingsCache?.retroachievements?.game_ids?.[key]) return true;
  if (achievementSettingsCache?.xbox?.title_ids?.[key]) return true;

  const source = achievementSettingsCache?.achievement_sources?.[key] ?? "auto";
  if (source === "disabled") return false;
  if (source === "xbox") return !!achievementSettingsCache?.xbox?.enabled;
  if (source === "retroachievements") return !!achievementSettingsCache?.retroachievements?.enabled;

  // Auto mode must be allowed to show the section before a title id exists,
  // otherwise Xbox/UWPHook auto-detection never gets a chance to run. The backend
  // still refuses non-UWPHook Xbox calls and avoids RetroAchievements network
  // calls unless a RA id/hash was resolved.
  return !!achievementSettingsCache?.xbox?.enabled || !!achievementSettingsCache?.retroachievements?.enabled;
};

export const cleanTitle = (value: string) =>
  String(value || "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isNonSteamAppWithoutPatchedMethod = (overview: any): boolean => {
  if (!overview) return false;
  if (Number(overview?.app_type) === NON_STEAM_APP_TYPE) return true;
  try {
    if (overview?.BIsShortcut?.()) return true;
  } catch (_error) {
    return false;
  }
  const appId = Number(overview?.appid);
  return Number.isFinite(appId) && !!metadataCache[String(appId)];
};

const currentRoutePath = () => {
  const steamRouter =
    (globalThis as any).Router ?? (globalThis as any).window?.Router;
  return (
    steamRouter?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location
      ?.pathname ||
    (globalThis as any).window?.location?.pathname ||
    ""
  );
};

export const isNonSteamApp = (overview: any): boolean => {
  if (isNonSteamAppWithoutPatchedMethod(overview)) return true;
  try {
    if (overview?.BIsModOrShortcut?.()) return true;
  } catch (_error) {
    return false;
  }
  return false;
};

export const getOverview = (appId: number): any | null => {
  try {
    return appStore?.GetAppOverviewByAppID?.(appId) ?? null;
  } catch (_error) {
    return null;
  }
};

export const appName = (appId: number): string => {
  const overview = getOverview(appId);
  return cleanTitle(
    overview?.display_name ||
      overview?.localized_name ||
      overview?.name ||
      `App ${appId}`
  );
};

export const refreshMetadataCache = async () => {
  const all = await getAllMetadata();
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  Object.assign(metadataCache, all || {});
  metadataLoaded = true;
  Object.keys(metadataCache).forEach((key) => applyMetadata(Number(key)));
};

export const ensureMetadataCache = async () => {
  if (metadataLoaded) return;
  if (!metadataLoadPromise) {
    metadataLoadPromise = refreshMetadataCache().finally(() => {
      metadataLoadPromise = null;
    });
  }
  await metadataLoadPromise;
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
      console.warn("[Playhub Metadata] metadata bootstrap failed", error);
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

export const refreshRaSettings = async () => {
  achievementSettingsCache = await getAchievementSettings();
  return achievementSettingsCache;
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

const playhubCommunityId = (appId: number, index: number) =>
  `90909${String(appId).padStart(10, "0")}${String(index).padStart(2, "0")}`;

const isPlayhubCommunityId = (value: unknown) =>
  typeof value === "string" && value.startsWith("90909");

const interleavedCommunityMedia = (metadata: MetadataData) => {
  const ign = (metadata.screenshots || [])
    .filter((image) => image?.url)
    .map((image) => ({ kind: "image" as const, source: "IGN", image }));
  const videos = (metadata.community_videos || [])
    .filter((video) => video?.id)
    .slice(0, 10)
    .map((video) => ({ kind: "video" as const, source: "YouTube", video }));
  const webImages = (metadata.community_images || [])
    .filter((image) => image?.url)
    .slice(0, 10)
    .map((image) => ({ kind: "image" as const, source: "RAWG", image }));
  const buckets = [ign, videos, webImages];
  const mixed: Array<
    | { kind: "image"; source: string; image: NonNullable<MetadataData["screenshots"]>[number] }
    | { kind: "video"; source: string; video: NonNullable<MetadataData["community_videos"]>[number] }
  > = [];
  let index = 0;
  while (buckets.some((bucket) => index < bucket.length)) {
    for (const bucket of buckets) {
      const item = bucket[index];
      if (item) mixed.push(item as any);
    }
    index += 1;
  }
  return mixed;
};

const steamCommunityItemsFromMetadata = (appId: number, metadata: MetadataData) =>
  interleavedCommunityMedia(metadata).map((item, index) => {
    if (item.kind === "video") {
      const video = item.video;
      return {
        appid: appId,
        consumer_appid: appId,
        published_file_id: playhubCommunityId(appId, index),
        publishedfileid: playhubCommunityId(appId, index),
        type: 4,
        title: video.title || `${metadata.title} video`,
        description: video.title || metadata.title || "",
        preview_image_url:
          video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        full_image_url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
        youtube_video_id: video.id,
        image_width: 1280,
        image_height: 720,
        spoiler_tag: false,
        content_descriptorids: [],
        reactions: [],
        creator: {
          steamid: "76561197960287930",
          name: "YouTube",
          avatar: "",
        },
        time_created: Math.floor(Date.now() / 1000) - index * 60,
        votes_up: 0,
        votes_down: 0,
        num_comments_public: 0,
      };
    }
    const image = item.image;
    return {
      appid: appId,
      consumer_appid: appId,
      published_file_id: playhubCommunityId(appId, index),
      publishedfileid: playhubCommunityId(appId, index),
      type: 5,
      title:
        image.caption ||
        `${metadata.title || "Screenshot"}${item.source ? ` (${item.source})` : ""}`,
      description: image.caption || metadata.title || "",
      preview_image_url: image.url,
      full_image_url: image.url,
      image_width: image.width || 1280,
      image_height: image.height || 720,
      spoiler_tag: false,
      content_descriptorids: [],
      reactions: [],
      creator: {
        steamid: "76561197960287930",
        name: "Playhub Metadata",
        avatar: "",
      },
      time_created: Math.floor(Date.now() / 1000) - index * 60,
      votes_up: 0,
      votes_down: 0,
      num_comments_public: 0,
    };
  });

const communityPayloadForApp = async (appId: number) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  await ensureMetadataCache();
  let metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  if (!metadata.screenshots?.length) {
    await tryEnrichScreenshotsForApp(appId);
    metadata = metadataCache[String(appId)];
  }
  if (!metadata?.community_enriched_at) {
    await tryEnrichCommunityMediaForApp(appId);
    metadata = metadataCache[String(appId)];
  }
  const hub = metadata ? steamCommunityItemsFromMetadata(appId, metadata) : [];
  return hub.length ? { hub } : null;
};

export const applyAchievementPayload = (
  appId: number,
  payload: AchievementsResponse | null
) => {
  if (!payload?.steam?.nTotal) return;
  clearAchievementStoreMapsForApp(appId);
  achievementsCache[String(appId)] = payload;
  if (steamAchievementStoreRef) primeAchievementStore(steamAchievementStoreRef, appId, payload);
  const appData = appDetailsStore?.GetAppData?.(appId);
  if (appData?.details) {
    appData.details.achievements = payload.steam;
    appData.bLoadingAchievments = false;
  }
  try {
    appDetailsCache?.SetCachedDataForApp?.(
      appId,
      "achievements",
      2,
      payload.steam
    );
  } catch (_error) {
    // Best effort, same cache route used by Steam.
  }
  try {
    if (appAchievementProgressCache?.m_achievementProgress) {
      appAchievementProgressCache.m_achievementProgress.mapCache.set(appId, {
        all_unlocked: payload.progress.achieved === payload.progress.total,
        appid: appId,
        cache_time: Date.now(),
        percentage: payload.progress.percentage,
        total: payload.progress.total,
        unlocked: payload.progress.achieved,
      });
      appAchievementProgressCache.SaveCacheFile?.();
    }
  } catch (_error) {
    // Progress cache is optional across Steam client versions.
  }
  try {
    appDetailsStore?.GetAchievements?.(appId);
  } catch (_error) {
    // Touching the getter nudges Steam into re-reading the cached achievement data.
  }
  window.dispatchEvent(new Event("playhub-metadata:achievements-updated"));
};

const emptySteamAchievementsPayload = () => ({
  nAchieved: 0,
  nTotal: 0,
  vecAchievedHidden: [],
  vecHighlight: [],
  vecUnachieved: [],
});

const clearAchievementStoreMapsForApp = (appId: number) => {
  const keys = [appId, String(appId)];
  const store = steamAchievementStoreRef;
  if (!store) return;
  try {
    for (const key of keys) {
      for (const mapName of [
        "m_mapMyAchievements",
        "m_mapAchievements",
        "m_mapGlobalAchievements",
        "m_mapGlobalAchievementPercentages",
        "m_mapAchievementPercentages",
      ]) {
        const map = store?.[mapName];
        map?.delete?.(key);
        if (map?.set && (mapName.includes("Global") || mapName.includes("Percent"))) {
          map.set(key, { loading: false, data: {} });
        }
        if (map?.set && (mapName === "m_mapMyAchievements" || mapName === "m_mapAchievements")) {
          map.set(key, emptyAchievementUserPayload());
        }
      }
    }
  } catch (error) {
    console.warn("[Playhub Metadata] failed to clear achievement store maps", error);
  }
};

export const clearAchievementsForApp = (appId: number) => {
  const key = String(appId);
  delete achievementsCache[key];
  const empty = emptySteamAchievementsPayload();
  clearAchievementStoreMapsForApp(appId);
  try {
    const appData = appDetailsStore?.GetAppData?.(appId);
    if (appData?.details) {
      appData.details.achievements = empty;
      appData.bLoadingAchievments = false;
    }
  } catch (_error) {
    // Best effort.
  }
  try {
    appDetailsCache?.SetCachedDataForApp?.(appId, "achievements", 2, empty);
  } catch (_error) {
    // Best effort.
  }
  try {
    appAchievementProgressCache?.m_achievementProgress?.mapCache?.delete?.(appId);
    appAchievementProgressCache?.m_achievementProgress?.mapCache?.delete?.(String(appId));
    appAchievementProgressCache?.SaveCacheFile?.();
  } catch (_error) {
    // Best effort.
  }
  window.dispatchEvent(new Event("playhub-metadata:achievements-updated"));
};

export const clearAchievementsForApps = (appIds: number[]) => {
  for (const appId of appIds) {
    if (Number.isFinite(appId) && appId > 0) clearAchievementsForApp(appId);
  }
};

export const isUwphookGameOption = (game: { exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string; name?: string }) => {
  const text = `${game?.exe || ""} ${game?.start_dir || ""} ${game?.launch_options || ""} ${game?.shortcut_path || ""} ${game?.name || ""}`.toLowerCase().replace(/\\/g, "/");
  return text.includes("uwphook.exe") || text.includes("/uwphook/uwphook.exe") || text.includes("briano/uwphook");
};

const flushTrueAchievementsNativeCache = async () => {
  try {
    const settings = achievementSettingsCache ?? (await refreshRaSettings());
    const ids = settings?.xbox?.title_ids || {};
    Object.keys(ids).forEach((key) => {
      const appId = Number(key);
      if (appId) clearAchievementsForApp(appId);
    });
  } catch (error) {
    console.warn("[Playhub Metadata] failed to flush stale achievement cache", error);
  }
};

const primeAchievementStore = (store: any, appId: number, payload: AchievementsResponse | null) => {
  if (!payload) return;
  try {
    const keys = [appId, String(appId)];
    for (const key of keys) {
      if (payload.global) {
        store?.m_mapGlobalAchievements?.set?.(key, payload.global);
        store?.m_mapGlobalAchievementPercentages?.set?.(key, payload.global);
        store?.m_mapAchievementPercentages?.set?.(key, payload.global);
      }
      if (payload.user) {
        store?.m_mapMyAchievements?.set?.(key, payload.user);
        store?.m_mapAchievements?.set?.(key, payload.user);
      }
    }
  } catch (error) {
    console.warn("[Playhub Metadata] failed to prime achievement store", error);
  }
};

const emptyAchievementUserPayload = () => ({
  loading: false,
  data: {
    achieved: {},
    hidden: {},
    unachieved: {},
  },
});

export const tryFetchMetadataForApp = async (appId: number) => {
  await ensureMetadataCache();
  if (metadataCache[String(appId)] || loadingMetadata.has(appId)) return;
  const overview = getOverview(appId);
  if (!isNonSteamApp(overview)) return;
  loadingMetadata.add(appId);
  try {
    const metadata = await autoFetchMetadata(appId, appName(appId));
    if (metadata) {
      metadataCache[String(appId)] = metadata;
      applyMetadata(appId);
      window.dispatchEvent(new Event("playhub-metadata:updated"));
    }
  } finally {
    loadingMetadata.delete(appId);
  }
};

export const tryEnrichScreenshotsForApp = async (appId: number) => {
  await ensureMetadataCache();
  const metadata = metadataCache[String(appId)];
  if (
    !metadata ||
    metadata.screenshots?.length ||
    loadingScreenshots.has(appId) ||
    String(metadata.source || "").toUpperCase() !== "IGN"
  ) {
    return;
  }
  const source = metadata.source_url || String(metadata.id || "");
  if (!source) return;
  loadingScreenshots.add(appId);
  try {
    const refreshed = await fetchMetadata(source);
    if (refreshed?.screenshots?.length) {
      const saved = await saveMetadata(appId, {
        ...metadata,
        screenshots: refreshed.screenshots,
      });
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      window.dispatchEvent(new Event("playhub-metadata:updated"));
    }
  } catch (error) {
    console.warn("[Playhub Metadata] screenshot enrichment failed", error);
  } finally {
    loadingScreenshots.delete(appId);
  }
};

export const tryEnrichCommunityMediaForApp = async (appId: number) => {
  await ensureMetadataCache();
  const metadata = metadataCache[String(appId)];
  const enrichedRecently =
    metadata?.community_enriched_at &&
    Date.now() / 1000 - Number(metadata.community_enriched_at) < 7 * 24 * 60 * 60;
  if (!metadata || enrichedRecently || loadingCommunityMedia.has(appId)) {
    return;
  }

  loadingCommunityMedia.add(appId);
  try {
    const enriched = await enrichCommunityMedia(
      appId,
      metadata.title || appName(appId),
      metadata.source_url || ""
    );
    if (enriched) {
      metadataCache[String(appId)] = enriched;
      applyMetadata(appId);
      window.dispatchEvent(new Event("playhub-metadata:updated"));
    }
  } catch (error) {
    console.warn("[Playhub Metadata] community media enrichment failed", error);
  } finally {
    loadingCommunityMedia.delete(appId);
  }
};

export const getAppDetails = async (appId: number): Promise<any | null> =>
  new Promise((resolve) => {
    let timeoutId: number | undefined;
    try {
      const { unregister } = SteamClient.Apps.RegisterForAppDetails(
        appId,
        (details: any) => {
          window.clearTimeout(timeoutId);
          unregister();
          resolve(details);
        }
      );
      timeoutId = window.setTimeout(() => {
        unregister();
        resolve(null);
      }, 1000);
    } catch (_error) {
      window.clearTimeout(timeoutId);
      resolve(null);
    }
  });

const loadAchievementsForApp = async (appId: number) => {
  if (achievementsCache[String(appId)] || loadingAchievements.has(appId)) {
    return achievementsCache[String(appId)];
  }
  const overview = getOverview(appId);
  if (!isNonSteamApp(overview)) return null;
  const settings = achievementSettingsCache ?? (await refreshRaSettings());
  const hasAnyProvider =
    !!settings?.retroachievements?.enabled || !!settings?.xbox?.enabled;
  if (!hasAnyProvider) return null;

  const appKey = String(appId);
  const source = settings?.achievement_sources?.[appKey] ?? "auto";
  const hasXboxMatch = !!settings?.xbox?.title_ids?.[appKey];
  const shouldClearStaleXbox = hasXboxMatch || source === "xbox";
  if (shouldClearStaleXbox) {
    // Steam can keep old native achievement data around even after the plugin
    // data folders are deleted. Clear the native cache before loading TA data
    // so old OpenXBL payloads cannot leak into the page.
    clearAchievementsForApp(appId);
  }

  loadingAchievements.add(appId);
  try {
    let payload = await fetchAchievements(appId);
    if (!payload && shouldClearStaleXbox) {
      clearAchievementsForApp(appId);
      return null;
    }
    if (!payload) {
      const details = await getAppDetails(appId);
      const launchPath = `${details?.strShortcutExe || ""} ${
        details?.strShortcutLaunchOptions || ""
      }`;
      if (launchPath.trim()) {
        payload = await resolveRetroAchievementsFromPath(
          appId,
          launchPath,
          appName(appId)
        );
      }
    }
    if (payload) applyAchievementPayload(appId, payload);
    return payload || achievementsCache[String(appId)] || null;
  } catch (error) {
    console.error("[Playhub Metadata] achievements fetch failed", error);
    return achievementsCache[String(appId)] || null;
  } finally {
    loadingAchievements.delete(appId);
  }
};

const patchMethod = (
  target: any,
  methodName: string,
  replacement: (thisValue: any, original: (...args: any[]) => any, args: any[]) => any
): Unpatch => {
  if (!target?.[methodName]) return () => undefined;
  const original = target[methodName];
  target[methodName] = function patchedMethod(...args: any[]) {
    return replacement(this, original.bind(this), args);
  };
  return () => {
    target[methodName] = original;
  };
};

let achievementStorePatchInstalled = false;

const tryInstallAchievementStorePatch = (unpatchers: Unpatch[]): boolean => {
  if (achievementStorePatchInstalled) return true;
  try {
    const achievementsStore = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      for (const prop in module) {
        const candidate = module[prop];
        if (candidate?.m_mapMyAchievements || candidate?.m_mapGlobalAchievements) return candidate;
      }
      return undefined;
    });
    if (!achievementsStore) return false;
    steamAchievementStoreRef = achievementsStore;

    const proto = achievementsStore.__proto__ ?? achievementsStore;
    if (achievementsStore?.LoadMyAchievements || proto?.LoadMyAchievements) {
      unpatchers.push(
        patchMethod(
          proto,
          "LoadMyAchievements",
          (thisValue, original, args) => {
            const appId = Number(args[0]);
            if (!isNonSteamApp(getOverview(appId))) {
              return original(...args);
            }
            const cached = achievementsCache[String(appId)];
            if (cached) {
              primeAchievementStore(thisValue, appId, cached);
              return Promise.resolve(cached.user ?? emptyAchievementUserPayload());
            }
            return loadAchievementsForApp(appId)
              .then((payload) => {
                primeAchievementStore(thisValue, appId, payload);
                return payload?.user ?? emptyAchievementUserPayload();
              })
              .catch((error) => {
                console.error("[Playhub Metadata] LoadMyAchievements failed", error);
                return emptyAchievementUserPayload();
              });
          }
        )
      );
    }

    for (const methodName of [
      "LoadGlobalAchievements",
      "LoadGlobalAchievementPercentages",
      "LoadAchievementPercentages",
    ]) {
      if (!(achievementsStore?.[methodName] || proto?.[methodName])) continue;
      unpatchers.push(
        patchMethod(proto, methodName, (thisValue, original, args) => {
          const appId = Number(args[0]);
          if (!isNonSteamApp(getOverview(appId))) {
            return original(...args);
          }
          const cached = achievementsCache[String(appId)];
          if (cached) {
            primeAchievementStore(thisValue, appId, cached);
            return Promise.resolve(cached.global ?? { loading: false, data: {} });
          }
          return loadAchievementsForApp(appId).then((payload) => {
            primeAchievementStore(thisValue, appId, payload);
            return payload?.global ?? { loading: false, data: {} };
          });
        })
      );
    }

    achievementStorePatchInstalled = true;
    return true;
  } catch (error) {
    console.warn("[Playhub Metadata] achievement store patch skipped", error);
    return false;
  }
};


const routeAchievementAppId = () => achievementAppIdFromPath(currentRoutePath());

const achievementAppIdFromPath = (path: string) => {
  const match = String(path || "").match(/\/library\/(?:app|details|[^/]+\/app)\/(\d+)\/achievements(?:[/?#].*)?/)
    || String(path || "").match(/\/playhub-metadata\/achievements\/(\d+)(?:[/?#].*)?/);
  return Number(match?.[1] || 0);
};

const playhubAchievementsPath = (appId: number) => `/playhub-metadata/achievements/${appId}`;

const achievementDate = (value: number) => {
  if (!value) return "";
  try {
    return new Date(value * 1000).toLocaleDateString();
  } catch (_error) {
    return "";
  }
};

const allAchievementsFromPayload = (payload: AchievementsResponse | null): SteamAchievement[] => {
  const data = payload?.user?.data;
  if (!data) return [];
  return [
    ...Object.values(data.achieved || {}),
    ...Object.values(data.unachieved || {}),
    ...Object.values(data.hidden || {}),
  ];
};

const achievementImageUrl = (achievement: SteamAchievement) => {
  const candidates = [
    achievement.playhubImage,
    achievement.strImageURL,
    achievement.strImageUrl,
    achievement.strImage,
    achievement.strIconURL,
    achievement.strIcon,
    achievement.iconUrl,
    achievement.imageUrl,
  ].filter(Boolean) as string[];
  return candidates[0] || "";
};

const imageElement = (achievement: SteamAchievement, size = 96) => {
  const src = achievementImageUrl(achievement);
  const wrapperStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    flex: "0 0 auto",
    overflow: "hidden",
  };
  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "center center",
    display: "block",
  };
  return React.createElement(
    "div",
    { className: "playhub-achievement-art", style: wrapperStyle },
    src ? React.createElement("img", { src, style: imgStyle, referrerPolicy: "no-referrer" }) : null
  );
};

const XBOX_IMAGE_URL_RE = /(trueachievements|imagestore|xboxlive|xboxservices|microsoft|akamaized|store-images|dlassets)/i;
const isLikelyAchievementArtBox = (element: Element) => {
  const rect = (element as HTMLElement).getBoundingClientRect?.();
  if (!rect || rect.width < 18 || rect.height < 18) return false;
  // Steam can render achievement art into square tiles, wide cards, or small
  // strips depending on the page. Keep this bounded so large metadata artwork
  // is not touched, but do not require a square ratio.
  return rect.width <= 520 && rect.height <= 360;
};

const fixNativeAchievementImageStretch = (root: ParentNode = document) => {
  try {
    root.querySelectorAll?.("img").forEach((node) => {
      const img = node as HTMLImageElement;
      const src = img.currentSrc || img.src || img.srcset || img.getAttribute("src") || img.getAttribute("srcset") || "";
      const parent = img.parentElement as HTMLElement | null;
      const achievementArtTarget = isLikelyAchievementArtBox(img) || (!!parent && isLikelyAchievementArtBox(parent));
      if (!XBOX_IMAGE_URL_RE.test(src) || !achievementArtTarget) return;
      if (parent) {
        parent.style.setProperty("overflow", "hidden", "important");
        if (!parent.style.position) parent.style.setProperty("position", "relative", "important");
        parent.style.setProperty("background-color", "rgba(0,0,0,0.18)", "important");
      }
      img.style.setProperty("object-fit", "contain", "important");
      img.style.setProperty("object-position", "center center", "important");
      img.style.setProperty("width", "100%", "important");
      img.style.setProperty("height", "100%", "important");
      img.style.setProperty("max-width", "none", "important");
      img.style.setProperty("max-height", "none", "important");
      img.style.setProperty("display", "block", "important");
    });

    root.querySelectorAll?.("*").forEach((node) => {
      const el = node as HTMLElement;
      const bg = el.style?.backgroundImage || "";
      if (!bg || !XBOX_IMAGE_URL_RE.test(bg) || !isLikelyAchievementArtBox(el)) return;
      el.style.setProperty("background-size", "contain", "important");
      el.style.setProperty("background-position", "center center", "important");
      el.style.setProperty("background-repeat", "no-repeat", "important");
      el.style.setProperty("background-color", "rgba(0,0,0,0.18)", "important");
    });
  } catch (_error) {
    // Best effort: Steam changes this DOM often.
  }
};

const installAchievementImageCoverPatch = (unpatchers: Unpatch[]) => {
  const style = document.createElement("style");
  style.id = "playhub-achievement-cover-style";
  style.textContent = `
    .playhub-achievement-art {
      background-size: contain !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
    }
    .playhub-achievement-art > img {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      object-position: center center !important;
      display: block !important;
    }
    [style*="trueachievements"][style*="background-image"],
    [style*="imagestore"][style*="background-image"],
    [style*="xboxlive"][style*="background-image"],
    [style*="xboxservices"][style*="background-image"],
    [style*="store-images"][style*="background-image"],
    [style*="dlassets"][style*="background-image"],
    [style*="akamaized"][style*="background-image"] {
      background-size: contain !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
    }
    img[src*="trueachievements"],
    img[src*="imagestore"],
    img[src*="xboxlive"],
    img[src*="xboxservices"],
    img[src*="store-images"],
    img[src*="dlassets"],
    img[src*="akamaized"] {
      object-fit: contain !important;
      object-position: center center !important;
    }
  `;
  document.head.appendChild(style);
  unpatchers.push(() => style.remove());

  const run = () => fixNativeAchievementImageStretch(document);
  run();
  const interval = window.setInterval(run, 750);
  unpatchers.push(() => window.clearInterval(interval));

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) fixNativeAchievementImageStretch(node);
      });
    }
    run();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style", "class"] });
  unpatchers.push(() => observer.disconnect());

  window.addEventListener("playhub-metadata:achievements-updated", run);
  unpatchers.push(() => window.removeEventListener("playhub-metadata:achievements-updated", run));
};

const PlayhubAchievementsPage = ({ appId }: { appId: number }) => {
  const [payload, setPayload] = React.useState<AchievementsResponse | null>(
    achievementsCache[String(appId)] || null
  );
  const [loading, setLoading] = React.useState(!achievementsCache[String(appId)]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(!achievementsCache[String(appId)]);
    loadAchievementsForApp(appId).then((next) => {
      if (!cancelled) {
        setPayload(next || achievementsCache[String(appId)] || null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const achievements = allAchievementsFromPayload(payload)
    .slice()
    .sort((a, b) => (b.rtUnlocked || 0) - (a.rtUnlocked || 0));
  const unlocked = achievements.filter((item) => item.bAchieved).length;
  const total = achievements.length || payload?.progress?.total || 0;
  const percent = total ? Math.round((unlocked / total) * 100) : 0;
  const title = payload?.title || appName(appId);
  const provider = payload?.provider === "xbox" ? "Xbox" : "RetroAchievements";

  const content = loading
    ? React.createElement("div", { style: { padding: 24 } }, React.createElement(Spinner, null))
    : !achievements.length
      ? React.createElement("div", { style: { opacity: 0.72, padding: 24 } }, "No achievements loaded for this game.")
      : React.createElement(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 16,
            },
          },
          achievements.map((achievement) =>
            React.createElement(
              "div",
              {
                key: achievement.strID,
                style: {
                  display: "flex",
                  gap: 16,
                  padding: 16,
                  borderRadius: 12,
                  background: achievement.bAchieved
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(255,255,255,0.055)",
                  opacity: achievement.bAchieved ? 1 : 0.68,
                },
              },
              imageElement(achievement, 96),
              React.createElement(
                "div",
                { style: { minWidth: 0 } },
                React.createElement(
                  "div",
                  { style: { fontWeight: 700, fontSize: 18, marginBottom: 6 } },
                  achievement.strName || "Secret achievement"
                ),
                React.createElement(
                  "div",
                  { style: { opacity: 0.76, lineHeight: 1.35 } },
                  achievement.strDescription || ""
                ),
                achievement.bAchieved
                  ? React.createElement(
                      "div",
                      { style: { opacity: 0.65, marginTop: 12 } },
                      achievementDate(achievement.rtUnlocked)
                        ? `Unlocked on ${achievementDate(achievement.rtUnlocked)}`
                        : "Unlocked"
                    )
                  : React.createElement(
                      "div",
                      { style: { opacity: 0.58, marginTop: 12 } },
                      achievement.bHidden ? "Hidden" : "Locked"
                    )
              )
            )
          )
        );

  return React.createElement(
    "div",
    { style: { padding: 32, paddingBottom: 120, minHeight: "100vh", boxSizing: "border-box", overflowY: "auto" } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 22 } },
        React.createElement(
          DialogButton,
          { focusable: true, onClick: () => Navigation.NavigateBack(), style: { width: "auto" } },
          "Back"
        ),
        React.createElement(
          "div",
          null,
          React.createElement("div", { style: { fontSize: 32, fontWeight: 800 } }, "Achievements"),
          React.createElement(
            "div",
            { style: { opacity: 0.72, marginTop: 4 } },
            `${title} · ${provider} · ${unlocked}/${total} (${percent}%)`
          )
        )
      ),
      React.createElement(
        "div",
        { style: { height: 8, borderRadius: 999, background: "rgba(255,255,255,0.16)", overflow: "hidden", marginBottom: 24 } },
        React.createElement("div", {
          style: {
            width: `${Math.max(0, Math.min(100, percent))}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #a67cff, #ff2d6f)",
          },
        })
      ),
      content
  );
};


export const PlayhubAchievementsRoute = () => {
  const appId = routeAchievementAppId();
  return React.createElement(PlayhubAchievementsPage, { appId });
};

export const installSteamPatches = (): Unpatch => {
  const unpatchers: Unpatch[] = [];
  installAchievementImageCoverPatch(unpatchers);
  void flushTrueAchievementsNativeCache();
  window.setTimeout(() => void flushTrueAchievementsNativeCache(), 2500);
  const overviewProto = appStore?.allApps?.[0]?.__proto__;
  const detailsProto = appDetailsStore?.__proto__;

  if (!overviewProto || !detailsProto) {
    let cancelled = false;
    let delayedUnpatch: Unpatch | null = null;
    let retryId: number | undefined;
    const retry = () => {
      if (cancelled) return;
      const ready =
        appStore?.allApps?.[0]?.__proto__ && appDetailsStore?.__proto__;
      if (ready) {
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

  const redirectAchievementTarget = (target: any): string => {
    const raw = String(target || "");
    if (raw.includes("/playhub-metadata/achievements/")) return "";
    const appId = achievementAppIdFromPath(raw);
    if (appId && isNonSteamApp(getOverview(appId)) && shouldShowAchievements(appId)) {
      return playhubAchievementsPath(appId);
    }
    return "";
  };

  if ((Navigation as any)?.Navigate) {
    unpatchers.push(
      patchMethod(Navigation as any, "Navigate", (_thisValue, original, args) => {
        const redirected = redirectAchievementTarget(args[0]);
        if (redirected) return original(redirected);
        return original(...args);
      })
    );
  }

  try {
    const steamHistory = (globalThis as any).Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
    for (const methodName of ["push", "replace"]) {
      if (steamHistory?.[methodName]) {
        unpatchers.push(
          patchMethod(steamHistory, methodName, (_thisValue, original, args) => {
            const target = typeof args[0] === "string" ? args[0] : args[0]?.pathname;
            const redirected = redirectAchievementTarget(target);
            if (redirected) return original(redirected);
            return original(...args);
          })
        );
      }
    }
  } catch (error) {
    console.warn("[Playhub Metadata] history achievement redirect patch skipped", error);
  }

  try {
    for (const methodName of ["pushState", "replaceState"] as const) {
      const original = window.history?.[methodName];
      if (typeof original !== "function") continue;
      const patched = function (this: History, ...args: any[]) {
        const redirected = redirectAchievementTarget(args[2] || args[0]);
        if (redirected) {
          args[2] = redirected;
        }
        return original.apply(this, args as any);
      };
      (window.history as any)[methodName] = patched;
      unpatchers.push(() => {
        (window.history as any)[methodName] = original;
      });
    }
  } catch (error) {
    console.warn("[Playhub Metadata] window history redirect patch skipped", error);
  }

  const clickAchievementRedirect = (event: MouseEvent) => {
    try {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      const redirected = redirectAchievementTarget(anchor?.getAttribute?.("href") || anchor?.href || "");
      if (redirected) {
        event.preventDefault();
        event.stopPropagation();
        (Navigation as any)?.Navigate?.(redirected);
      }
    } catch (_error) {
      // Best effort only.
    }
  };
  document.addEventListener("click", clickAchievementRedirect, true);
  unpatchers.push(() => document.removeEventListener("click", clickAchievementRedirect, true));

  const routeGuard = () => {
    const path = currentRoutePath();
    const redirected = redirectAchievementTarget(path);
    if (redirected) {
      try {
        (Navigation as any)?.Navigate?.(redirected);
      } catch (_error) {
        // If the router is mid-transition, the route patch below will still catch.
      }
    }
  };
  const routeGuardTimer = window.setInterval(routeGuard, 250);
  unpatchers.push(() => window.clearInterval(routeGuardTimer));

  unpatchers.push(
    patchMethod(detailsProto, "GetDescriptions", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      const overview = getOverview(appId);
      if (isNonSteamApp(overview)) {
        const metadata = metadataCache[String(appId)];
        if (metadata) {
          applyMetadata(appId);
          return appDetailsStore?.GetAppData?.(appId)?.descriptionsData;
        }
        void ensureMetadataCache().then(() => {
          if (metadataCache[String(appId)]) {
            applyMetadata(appId);
            void tryEnrichScreenshotsForApp(appId);
          } else {
            void tryFetchMetadataForApp(appId);
          }
        });
      }
      return original(...args);
    })
  );

  unpatchers.push(
    patchMethod(detailsProto, "GetAssociations", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      const overview = getOverview(appId);
      if (isNonSteamApp(overview) && metadataCache[String(appId)]) {
        applyMetadata(appId);
      }
      return original(...args);
    })
  );

  unpatchers.push(
    patchMethod(detailsProto, "GetAchievements", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      if (isNonSteamApp(getOverview(appId))) {
        const payload = achievementsCache[String(appId)];
        if (payload?.steam) return payload.steam;
        void loadAchievementsForApp(appId);
      }
      return original(...args);
    })
  );

  unpatchers.push(
    patchMethod(overviewProto, "BHasStoreCategory", (thisValue, original, args) => {
      if (isNonSteamApp(thisValue)) {
        const category = Number(args[0]);
        const metadata = metadataCache[String(thisValue.appid)];
        if (metadata?.store_categories?.includes(category)) return true;
        if (
          category === StoreCategory.Achievements &&
          shouldShowAchievements(Number(thisValue.appid))
        ) {
          return true;
        }
      }
      return original(...args);
    })
  );

  if (overviewProto?.BIsModOrShortcut) {
    unpatchers.push(
      afterPatch(overviewProto, "BIsModOrShortcut", function (this: any, _args: any[], ret: any) {
        if (!isNonSteamAppWithoutPatchedMethod(this) || ret !== true) return ret;
        if (bypassBypass > 0) {
          bypassBypass -= 1;
          return false;
        }
        const path = currentRoutePath();
        if (path === "/library/home") return false;
        if (bypassCounter > 0) bypassCounter -= 1;
        return bypassCounter === -1 || bypassCounter > 0;
      }).unpatch
    );
  }

  if (detailsProto?.BHasRecentlyLaunched) {
    unpatchers.push(
      afterPatch(detailsProto, "BHasRecentlyLaunched", (_args: any[], ret: any) => {
        bypassCounter = 4;
        return ret;
      }).unpatch
    );
  }

  ["GetGameID", "GetPrimaryAppID"].forEach((methodName) => {
    if (!overviewProto?.[methodName]) return;
    unpatchers.push(
      patchMethod(overviewProto, methodName, (_thisValue, original, args) => {
        bypassCounter = -1;
        const ret = original(...args);
        bypassCounter = 0;
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
      afterPatch(overviewProto, "GetPerClientData", (_args: any[], ret: any) => {
        bypassCounter = 4;
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
        afterPatch(
          appDetailsSections.prototype,
          "GetSections",
          function (this: any, _args: any[], ret: Set<string>) {
            const overview = this?.props?.overview;
            const appId = Number(overview?.appid);
            if (appId && isNonSteamApp(overview) && shouldShowAchievements(appId)) {
              ret.add("achievements");
              void loadAchievementsForApp(appId);
            }
            if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
              if (metadataCache[String(appId)]?.screenshots?.length) {
                ret.add("screenshots");
              } else {
                void tryEnrichScreenshotsForApp(appId);
              }
              ret.add("community");
            }
            return ret;
          }
        ).unpatch
      );
    }
  } catch (error) {
    console.warn("[Playhub Metadata] app details sections patch skipped", error);
  }

  try {
    const httpClient = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      if (typeof module.g?.get === "function" && typeof module.g?.post === "function") {
        return module.g;
      }
      return undefined;
    });
    if (httpClient?.get) {
      unpatchers.push(
        patchMethod(
          httpClient,
          "get",
          (_thisValue, original, args) => {
            const url = String(args[0] || "");
            const match = url.match(/library\/appcommunityfeed\/(\d+)/);
            if (match) {
              const appId = Number(match[1]);
              return communityPayloadForApp(appId).then((payload) => {
                if (payload) return payload;
                return original(...args);
              });
            }
            return original(...args);
          }
        )
      );
    }
  } catch (error) {
    console.warn("[Playhub Metadata] community feed patch skipped", error);
  }

  try {
    const communityVoteModule = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      if (module.bJ && typeof module.dK === "function") return module;
      return undefined;
    });
    if (communityVoteModule?.dK) {
      unpatchers.push(
        patchMethod(
          communityVoteModule,
          "dK",
          (_thisValue, original, args) => {
            const ids = Array.isArray(args[0]) ? args[0] : [];
            if (ids.length && ids.every(isPlayhubCommunityId)) {
              const voteNone = communityVoteModule.bJ?.None ?? 0;
              return Promise.resolve(
                new Map(
                  ids.map((id: string) => [
                    id,
                    { vote: voteNone, bReported: false },
                  ])
                )
              );
            }
            return original(...args);
          }
        )
      );
    }
  } catch (error) {
    console.warn("[Playhub Metadata] community vote patch skipped", error);
  }

  tryInstallAchievementStorePatch(unpatchers);
  let achievementPatchAttempts = 0;
  const achievementPatchTimer = window.setInterval(() => {
    achievementPatchAttempts += 1;
    if (tryInstallAchievementStorePatch(unpatchers) || achievementPatchAttempts >= 30) {
      window.clearInterval(achievementPatchTimer);
    }
  }, 1000);
  unpatchers.push(() => window.clearInterval(achievementPatchTimer));

  // Do not routerHook.addPatch Steam's native achievement routes. In recent
  // Decky dev builds that can crash RouterHook.processList before our custom
  // page renders. Redirect navigation/history/clicks instead and let the
  // native route fall back safely if Steam opens it by another internal path.

  GAME_DETAIL_ROUTES.forEach((route) => {
    const patch = routerHook.addPatch(route, (tree: any) => {
      const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);
      if (routeProps?.renderFunc) {
        const renderPatch = afterPatch(routeProps, "renderFunc", (_args: any[], ret: any) => {
          const overview = ret?.props?.children?.props?.overview;
          const appId = Number(overview?.appid);
          if (appId && isNonSteamApp(overview)) {
            bypassBypass = 11;
            void ensureMetadataCache().then(() => {
              applyMetadata(appId);
              void tryEnrichScreenshotsForApp(appId);
              void tryFetchMetadataForApp(appId);
            });
            void loadAchievementsForApp(appId);
          }
          return ret;
        });
        unpatchers.push(renderPatch.unpatch);
      }
      return tree;
    });
    unpatchers.push(() => routerHook.removePatch(route, patch));
  });

  return () => {
    unpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (error) {
        console.error("[Playhub Metadata] unpatch failed", error);
      }
    });
  };
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
    const localShortcuts = await import("./backend").then((m) => m.getLocalShortcuts());
    localShortcuts.forEach(addEntry);
  } catch (_error) {
    // Optional fallback.
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
};
