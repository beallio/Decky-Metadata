import React from "react";
import { afterPatch, findInReactTree, findModuleChild, Navigation, Spinner, DialogButton, Focusable } from "@decky/ui";
import { routerHook, toaster } from "@decky/api";
import {
  autoFetchMetadata,
  enrichCommunityMedia,
  fetchAchievements,
  fetchMetadata,
  frontendLog,
  getAchievementSettings,
  getAllMetadata,
  resolveRetroAchievementsFromPath,
  saveMetadata,
  syncTrueAchievementsProgress,
  getPlatformCapabilities,
} from "./backend";
import {
  AchievementSettings,
  AchievementsResponse,
  MetadataData,
  SteamAchievement,
  StoreCategory,
} from "./types";
import { t } from "./i18n";
import * as log from "./log";

declare const appStore: any;
declare const appDetailsStore: any;
declare const appDetailsCache: any;
declare const appAchievementProgressCache: any;
declare const SteamClient: any;

export const patchInstallStatus = {
  achievements: "pending",
  activity: "pending",
  partnerEvents: "pending",
  contextMenu: "pending",
  router: "pending"
};

export const hasSteamInternals = () => !!(globalThis as any).SteamClient && typeof appStore !== "undefined" && !!appStore && typeof appDetailsStore !== "undefined" && !!appDetailsStore;
export const hasAchievementProgressCache = () => typeof appAchievementProgressCache !== "undefined" && !!appAchievementProgressCache;
export const hasActivityStore = () => !!(globalThis as any).appActivityStore;
export const hasAppDetailsStore = () => typeof appDetailsStore !== "undefined" && !!appDetailsStore;

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
const GAME_ACTIVITY_ROUTES = [
  "/library/app/:appid/activity",
  "/library/app/:appid/activity/:rest",
  "/library/details/:appid/activity",
  "/library/details/:appid/activity/:rest",
  "/library/:collection/app/:appid/activity",
  "/library/:collection/app/:appid/activity/:rest",
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
let lastObservedGameDetailAppId = 0;
let selectedDetailsTabHint = "";
let selectedDetailsTabHintAt = 0;
let selectedDetailsTabIndexHint: number | null = null;
let selectedDetailsTabIndexHintAt = 0;

let backgroundAchievementSyncTimer: number | undefined;
let backgroundAchievementSyncRunning = false;

const BACKGROUND_SYNC_CHECK_MS = 60 * 1000;
const BACKGROUND_SYNC_INITIAL_DELAY_MS = 20 * 1000;
const BACKGROUND_SYNC_LOCAL_PREFIX = "playhub-metadata:bg-achievement-sync:last";
const BACKGROUND_SYNC_SESSION_KEY = "playhub-metadata:bg-achievement-sync:pc-session";


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
  const location = steamRouter?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
  const windowLocation = (globalThis as any).window?.location;
  return [
    location?.pathname,
    location?.search,
    location?.hash,
    windowLocation?.pathname,
    windowLocation?.search,
    windowLocation?.hash,
    windowLocation?.href,
  ]
    .filter(Boolean)
    .join(" ");
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

export const steamAppIdForApp = (appId: number): number =>
  Number(metadataCache[String(appId)]?.steam_appid) || 0;

type SteamLinkTarget = {
  kind: "store" | "community";
  appId: number;
  replace: (mappedAppId: number) => string;
};

type SteamLinkRewrite = {
  url: string;
  rewrote: boolean;
  fromAppId?: number;
  toAppId?: number;
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

const steamWebLinkTarget = (url: string): SteamLinkTarget | null => {
  const match =
    url.match(/(?:https?:\/\/)?store\.steampowered\.com\/app\/(\d+)/i) ||
    url.match(/(?:https?:\/\/)?steamcommunity\.com\/app\/(\d+)/i);
  const queryMatch =
    match ||
    url.match(/(?:https?:\/\/)?(?:store\.steampowered\.com|steamcommunity\.com)\/[^?#]*\?(?:[^#&]*&)*appid=(\d+)/i);
  if (!queryMatch?.[1]) return null;
  const appId = Number(queryMatch[1]);
  if (!Number.isFinite(appId) || appId <= 0) return null;
  const kind = /steamcommunity\.com/i.test(queryMatch[0]) ? "community" : "store";
  const idIndex = queryMatch.index === undefined ? -1 : queryMatch.index + queryMatch[0].lastIndexOf(queryMatch[1]);
  if (idIndex < 0) return null;
  return {
    kind,
    appId,
    replace: (mappedAppId: number) =>
      `${url.slice(0, idIndex)}${mappedAppId}${url.slice(idIndex + queryMatch[1].length)}`,
  };
};

const steamProtocolLinkTarget = (url: string): SteamLinkTarget | null => {
  const storeMatch =
    url.match(/^steam:\/\/store\/(\d+)/i) ||
    url.match(/^steam:\/\/url\/StoreAppPage\/(\d+)/i);
  if (storeMatch?.[1]) {
    const appId = Number(storeMatch[1]);
    const idIndex = storeMatch.index === undefined ? -1 : storeMatch.index + storeMatch[0].lastIndexOf(storeMatch[1]);
    if (Number.isFinite(appId) && appId > 0 && idIndex >= 0) {
      return {
        kind: "store",
        appId,
        replace: (mappedAppId: number) =>
          `${url.slice(0, idIndex)}${mappedAppId}${url.slice(idIndex + storeMatch[1].length)}`,
      };
    }
  }

  const openUrlMatch = url.match(/^steam:\/\/openurl\/(.+)$/i);
  if (!openUrlMatch?.[1]) return null;
  const rawTarget = openUrlMatch[1];
  const decodedTarget = safeDecodeURIComponent(rawTarget);
  const nested = steamWebLinkTarget(decodedTarget) || steamWebLinkTarget(rawTarget);
  if (!nested) return null;
  return {
    kind: nested.kind,
    appId: nested.appId,
    replace: (mappedAppId: number) => `steam://openurl/${nested.replace(mappedAppId)}`,
  };
};

const steamLinkTarget = (url: string): SteamLinkTarget | null => {
  try {
    const rawUrl = String(url || "");
    return steamProtocolLinkTarget(rawUrl) || steamWebLinkTarget(rawUrl);
  } catch (_error) {
    return null;
  }
};

export const rewriteSteamLinkToMatchedApp = (url: string): SteamLinkRewrite => {
  try {
    const rawUrl = String(url || "");
    const target = steamLinkTarget(rawUrl);
    if (!target) return { url: rawUrl, rewrote: false };
    const mapped = steamAppIdForApp(target.appId);
    if (mapped > 0 && mapped !== target.appId) {
      return {
        url: target.replace(mapped),
        rewrote: true,
        fromAppId: target.appId,
        toAppId: mapped,
      };
    }
    return { url: rawUrl, rewrote: false };
  } catch (_error) {
    return { url: String(url || ""), rewrote: false };
  }
};

const rewriteSteamwebNavState = (state: any): { state: any; rewrote: boolean } => {
  try {
    if (!state || typeof state !== "object") return { state, rewrote: false };

    let clone: any;
    try {
      clone = structuredClone(state);
    } catch (_error) {
      return { state, rewrote: false };
    }

    let rewrote = false;
    const seen = new WeakSet<object>();
    const walk = (value: any, depth: number) => {
      if (!value || typeof value !== "object" || depth < 0) return;
      if (seen.has(value)) return;
      seen.add(value);

      const keys: Iterable<any> = Array.isArray(value) ? value.keys() : Object.keys(value);
      for (const key of keys) {
        const item = value[key];
        if (typeof item === "string") {
          const rewritten = rewriteSteamLinkToMatchedApp(item);
          if (rewritten.rewrote) {
            value[key] = rewritten.url;
            rewrote = true;
          }
          continue;
        }
        if (item && typeof item === "object") {
          walk(item, depth - 1);
        }
      }
    };

    walk(clone, 6);
    return { state: clone, rewrote };
  } catch (_error) {
    return { state, rewrote: false };
  }
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
      log.warn("bridge", "metadata bootstrap failed", error);
    }
    attempts += 1;
    if (!cancelled && attempts < 24) {
      window.setTimeout(tick, 500);
    }
  };
  void tick();
  const stopAchievementSync = startBackgroundAchievementSync();
  return () => {
    cancelled = true;
    stopAchievementSync?.();
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

const playhubCommunityId = (appId: number, index: number) =>
  `90909${String(appId).padStart(10, "0")}${String(index).padStart(2, "0")}`;

const isPlayhubCommunityId = (value: unknown) =>
  typeof value === "string" && value.startsWith("90909");

const PLAYHUB_COMMUNITY_YOUTUBE_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_IGN_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_RAWG_ICON = "data:image/png;base64,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";

const playhubCommunityProviderIcon = (source?: string) => {
  const cleanSource = String(source || "").trim().toLowerCase();
  if (cleanSource.includes("youtube")) return PLAYHUB_COMMUNITY_YOUTUBE_ICON;
  if (cleanSource.includes("rawg")) return PLAYHUB_COMMUNITY_RAWG_ICON;
  return PLAYHUB_COMMUNITY_IGN_ICON;
};

const playhubCommunityCreator = (source: string, avatar: string) => ({
  steamid: "76561197960287930",
  name: source || "Playhub Metadata",
  avatar,
  avatar_url: avatar,
  avatar_medium: avatar,
  avatar_full: avatar,
  avatarFullURL: avatar,
});


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

  // Keep Steam news out of the Community tab. News belongs to Activity, while
  // Community should stay screenshots/videos/community-style media only.
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
    const providerIconUrl = playhubCommunityProviderIcon(item.source);
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
        avatar: providerIconUrl,
        avatar_url: providerIconUrl,
        creator_avatar_url: providerIconUrl,
        author_avatar_url: providerIconUrl,
        owner_avatar_url: providerIconUrl,
        creator: playhubCommunityCreator("YouTube", providerIconUrl),
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
      avatar: providerIconUrl,
      avatar_url: providerIconUrl,
      creator_avatar_url: providerIconUrl,
      author_avatar_url: providerIconUrl,
      owner_avatar_url: providerIconUrl,
      creator: playhubCommunityCreator(item.source || "IGN", providerIconUrl),
      time_created: Math.floor(Date.now() / 1000) - index * 60,
      votes_up: 0,
      votes_down: 0,
      num_comments_public: 0,
    };
  });


const playhubActivityId = (appId: number, index: number, date: number) =>
  `playhub-activity-${appId}-${date || 0}-${index}`;

const numericSteamNewsGid = (value: unknown) => {
  const text = String(value || "");
  const direct = text.match(/^\d{8,}$/);
  if (direct) return direct[0];
  const fromUrl = text.match(/(?:announcements\/detail|news\/app\/\d+\/view)\/(\d{8,})/i);
  if (fromUrl?.[1]) return fromUrl[1];
  const fromOldAnnouncement = text.match(/old_announce_(\d{8,})/i);
  if (fromOldAnnouncement?.[1]) return fromOldAnnouncement[1];
  const anyNumericGid = text.match(/\b(\d{8,})\b/);
  return anyNumericGid?.[1] || "";
};

const cleanSteamNewsDisplayText = (value: unknown) =>
  String(value || "")
    .replace(/\[previewyoutube=[A-Za-z0-9_-]{11}(?:;[^\]]*)?\]\s*\[\/previewyoutube\]/gi, " ")
    .replace(/\[previewyoutube=[^\]]+\]/gi, " ")
    .replace(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/\d+\/[^\s<>\)\]\[]+/gi, " ")
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, " ")
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[\/?(?:p|br|hr|quote|spoiler|table|tr|td|th|img|url|h1|h2|h3|h4|b|i|u|s|strike|list|\*|code|noparse|previewyoutube|video|youtube|size|color|font|center|left|right)[^\]]*\]/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const steamNewsRawBodyForModal = (value: unknown) =>
  String(value || "")
    .replace(/\\\//g, "/")
    .trim();

const steamAppHeaderImage = (steamAppId?: number | null) =>
  steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg` : "";

const steamNewsImageCandidatesForMetadata = (_metadata: MetadataData, news: NonNullable<MetadataData["steam_news"]>[number]) => {
  const rawSources = Array.isArray((news as any).image_sources) ? (news as any).image_sources : [];
  return Array.from(new Set([
    news.image,
    (news as any).image_url,
    (news as any).preview_image_url,
    ...rawSources,
  ].map(cleanSteamImageUrl).filter(Boolean)));
};

const steamNewsImageForMetadata = (metadata: MetadataData, news: NonNullable<MetadataData["steam_news"]>[number]) =>
  steamNewsImageCandidatesForMetadata(metadata, news)[0] || "";

const normaliseActivityNewsKeyText = (value: unknown) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");

const uniqueSteamNewsForActivity = (metadata: MetadataData) => {
  const seen = new Set<string>();
  return (metadata.steam_news || [])
    .filter((item) => item?.url && item?.title)
    .filter((item) => {
      const title = normaliseActivityNewsKeyText(item.title);
      const summary = normaliseActivityNewsKeyText(item.summary || "").slice(0, 160);
      const canonicalUrl = String(item.url || "").replace(/[?#].*$/, "").toLocaleLowerCase("en-US");
      const day = Math.floor((Number(item.date || 0) || 0) / 86400);
      const key = `${title}|${canonicalUrl || day}|${summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
};

const steamActivityNewsItemsFromMetadata = (appId: number, metadata: MetadataData) =>
  uniqueSteamNewsForActivity(metadata)
    .map((news, index) => {
      const date = Number(news.date || 0) || Math.floor(Date.now() / 1000) - index * 60;
      const imageCandidates = steamNewsImageCandidatesForMetadata(metadata, news);
      const imageUrl = imageCandidates[0] || "";
      const fallbackImageUrl = steamAppHeaderImage(metadata.steam_appid);
      const displayImageUrl = imageUrl || fallbackImageUrl;
      const eventType = normalizePlayhubSteamActivityType((news as any).event_type || (news as any).type);
      const eventTags = playhubSteamActivityTypeTags(eventType);
      const eventLabel = playhubSteamActivityTypeLabel(eventType);
      const rawBody = steamNewsRawBodyForModal((news as any).raw_body || (news as any).body || news.summary || "");
      const summary = eventType === 12 ? "" : cleanSteamNewsDisplayText(news.summary || news.title || "");
      const title = cleanSteamNewsDisplayText(news.title || metadata.title || "Steam news");
      const url = news.url || metadata.steam_store_url || "";
      const id = playhubActivityId(appId, index, date);
      const steamGid = numericSteamNewsGid((news as any).gid || (news as any).news_id || (news as any).announcement_gid || (news as any).event_gid || news.id || news.url);
      const eventGid = numericSteamNewsGid((news as any).event_gid || (news as any).gid || (news as any).news_id || (news as any).announcement_gid || news.id || news.url);
      const jsondata = JSON.stringify({
        localized_title_image: displayImageUrl,
        localized_capsule_image: displayImageUrl,
        localized_spotlight_image: displayImageUrl,
        localized_summary: summary,
        localized_body: rawBody,
        store_url: url,
      });
      return {
        appid: appId,
        gid: steamGid || id,
        id,
        news_id: steamGid || id,
        announcement_gid: steamGid || id,
        clan_steamid: "103582791429521412",
        event_name: title,
        event_type: eventType,
        type: eventType,
        title,
        headline: title,
        description: summary,
        summary,
        body: cleanSteamNewsDisplayText((news as any).body || summary),
        raw_body: rawBody,
        contents: summary,
        url,
        external_url: url,
        link: url,
        image: displayImageUrl,
        image_url: displayImageUrl,
        event_image_url: imageUrl,
        image_sources: imageCandidates,
        fallback_image_url: fallbackImageUrl,
        header_image_url: fallbackImageUrl,
        capsule: displayImageUrl,
        capsule_image: displayImageUrl,
        preview_image_url: displayImageUrl,
        full_image_url: displayImageUrl || url,
        rtime32_start_time: date,
        rtime32_end_time: date,
        rtime32_last_modified: date,
        posttime: date,
        published: date,
        time_created: date,
        date,
        feedlabel: news.feedLabel || news.author || eventLabel,
        author: news.author || news.feedLabel || eventLabel,
        comment_count: 0,
        upvotes: 0,
        downvotes: 0,
        jsondata,
        announcement_body: {
          gid: steamGid || id,
          clanid: "0",
          posterid: "0",
          headline: title,
          posttime: date,
          updatetime: date,
          body: rawBody || summary,
          commentcount: 0,
          tags: eventTags,
          language: 0,
          hidden: 0,
          forum_topic_id: "0",
          event_gid: eventGid || steamGid || id,
          voteupcount: 0,
          votedowncount: 0,
        },
      };
    });

const steamActivityPayloadForApp = async (appId: number) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  await ensureMetadataCache();
  let metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  const items = metadata ? steamActivityNewsItemsFromMetadata(appId, metadata) : [];
  if (!items.length) return null;
  // Steam client internals changed names across versions. Return a deliberately
  // redundant shape so the native Activity store can read the same cards through
  // the field name it expects, while keeping the items Steam-like.
  return {
    events: items,
    rgEvents: items,
    rgNews: items,
    rgActivity: items,
    rgFeedItems: items,
    activity: items,
    activities: items,
    news: items,
    items,
    results: items,
    count: items.length,
    bHasMore: false,
    success: 1,
  };
};


const STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE = 1002;
const STEAM_PARTNER_EVENT_TYPE_NEWS = 28;
const PLAYHUB_SUPPORTED_STEAM_ACTIVITY_TYPES = new Set([12, 13, 14, 15, 23, 24, 25, 28, 35]);
const PLAYHUB_STEAM_ACTIVITY_TYPE_LABELS: Record<number, string> = {
  12: "Aggiornamento minore / Note della patch",
  13: "Aggiornamento standard",
  14: "Aggiornamento importante",
  15: "Pubblicazione contenuti scaricabili",
  23: "Evento: bottino",
  24: "Evento: vantaggi",
  25: "Evento: sfida",
  28: "Notizie",
  35: "Evento nel gioco",
};
const PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS: Record<number, string[]> = {
  12: ["patchnotes", "update", "playhub_metadata"],
  13: ["update", "playhub_metadata"],
  14: ["majorupdate", "update", "playhub_metadata"],
  15: ["dlc", "release", "playhub_metadata"],
  23: ["loot", "event", "playhub_metadata"],
  24: ["perks", "event", "playhub_metadata"],
  25: ["challenge", "event", "playhub_metadata"],
  28: ["news", "playhub_metadata"],
  35: ["ingame", "event", "playhub_metadata"],
};
const normalizePlayhubSteamActivityType = (value: unknown) => {
  const type = Number(value || 0) || STEAM_PARTNER_EVENT_TYPE_NEWS;
  return PLAYHUB_SUPPORTED_STEAM_ACTIVITY_TYPES.has(type) ? type : STEAM_PARTNER_EVENT_TYPE_NEWS;
};
const playhubSteamActivityTypeLabel = (type: number) => PLAYHUB_STEAM_ACTIVITY_TYPE_LABELS[type] || "Notizie";
const playhubSteamActivityTypeTags = (type: number) => PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS[type] || PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS[28];
const isPlayhubPatchNoteActivity = (item: any) => normalizePlayhubSteamActivityType(item?.event_type || item?.type) === 12;
const PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY = "__playhubNativeActivityCache";
const PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY = "__playhubNativePartnerEvents";
const PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY = "__playhubNativePartnerEventStore";

type PlayhubNativeActivityDay = {
  isValid: boolean;
  events: any[];
  GetLatestEventTime: () => number;
  GetEarliestEventTime: () => number;
  BHasEvents?: () => boolean;
};

const fakeSteamId = (accountId = 0, steamId64 = "76561197960287930") => ({
  GetAccountID: () => accountId,
  ConvertTo64BitString: () => steamId64,
  toString: () => steamId64,
});

const toSteamClanImageUrl = (value: unknown) => {
  const text = String(value || "").trim().replace(/\\\//g, "/");
  const match = text.match(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/(\d+)\/([^\s<>\)\]\[]+)/i);
  if (!match) return text;
  return `https://clan.cloudflare.steamstatic.com/images/${match[1]}/${match[2].replace(/[\"'.,;:]+$/g, "")}`;
};

const cleanSteamImageUrl = (value: unknown) => {
  let text = String(value || "").trim();
  if (!text) return "";
  try {
    text = decodeURIComponent(text);
  } catch (_error) {
    // Keep the original URL if it is not URI encoded.
  }
  text = text.replace(/\\\//g, "/").replace(/&amp;/gi, "&").trim();
  text = text.replace(/\[\/?img\].*$/i, "").replace(/[\]\)>.,;:'"]+$/g, "").trim();
  text = toSteamClanImageUrl(text);
  if (text.startsWith("//")) text = `https:${text}`;
  if (text.startsWith("http://")) text = text.replace(/^http:\/\//i, "https://");
  return /^https:\/\//i.test(text) ? text : "";
};



const collectSteamNewsImages = (steamAppId: number, item: any) => {
  const values = [
    item.image,
    item.image_url,
    item.preview_image_url,
    item.full_image_url,
    item.capsule_image,
    item.capsule,
    item.localized_title_image,
    item.localized_capsule_image,
    item.localized_spotlight_image,
    item.header_image_url,
    item.fallback_image_url,
  ];
  if (Array.isArray(item.image_sources)) values.push(...item.image_sources);
  // Keep the explicit fallback at the end: cards with no embedded artwork should
  // still show the game header, but embedded/event-specific images stay first.
  return Array.from(new Set(values.map(cleanSteamImageUrl).filter(Boolean)));
};

const playhubNativeActivityCache = () => {
  const host = globalThis as any;
  if (!host[PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY]) host[PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY] = new Map<number, any>();
  return host[PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY] as Map<number, any>;
};

const playhubNativePartnerEventCache = () => {
  const host = globalThis as any;
  if (!host[PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY]) host[PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY] = new Map<string, any>();
  return host[PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY] as Map<string, any>;
};

const uniqueNonEmptyStrings = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const playhubNativePartnerEventKeys = (event: any) => {
  const gid = numericSteamNewsGid(event?.AnnouncementGID || event?.announcement_gid || event?.announcementGID || event?.gid || event?.GID || event?.url);
  const oldAnnouncementGid = gid ? `old_announce_${gid}` : "";
  return uniqueNonEmptyStrings([
    event?.GID,
    event?.gid,
    event?.event_gid,
    event?.AnnouncementGID,
    event?.announcement_gid,
    event?.announcementGID,
    gid,
    oldAnnouncementGid,
  ]);
};

const playhubNativePartnerEventStore = () => (globalThis as any)[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY] || null;

const collectNativePartnerEventStores = () => {
  const host = globalThis as any;
  const stores: any[] = [];
  const add = (candidate: any) => {
    if (!candidate || typeof candidate !== "object") return;
    const looksLikeStore =
      typeof candidate.GetClanEventModel === "function" ||
      typeof candidate.GetClanEventFromAnnouncementGID === "function" ||
      typeof candidate.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
      candidate.m_mapExistingEvents?.set;
    if (looksLikeStore && !stores.includes(candidate)) stores.push(candidate);
  };

  // Steam currently exposes multiple PartnerEvent stores. The Activity cards can
  // render from our custom event object, but the modal uses the native
  // window.partnerEventStore (`r(57016).IB`). Earlier builds sometimes patched the
  // base/summary store instead, which made the modal open but stay blurred/empty.
  add(host.partnerEventStore);
  add(host.g_PartnerEventStore);
  add(host.g_PartnerEventSummaryStore);
  add(host[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY]);

  try {
    const discovered = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      for (const prop in module) {
        const candidate = module[prop];
        if (
          candidate &&
          typeof candidate === "object" &&
          (typeof candidate.GetClanEventFromAnnouncementGID === "function" ||
            typeof candidate.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
            typeof candidate.GetClanEventModel === "function")
        ) {
          return candidate;
        }
      }
      return undefined;
    });
    add(discovered);
  } catch (_error) {
    // Decky may not expose the module yet. The interval installer retries.
  }

  if (stores[0]) host[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY] = stores[0];
  return stores;
};

const registerPlayhubNativePartnerEventInSteamStore = (event: any, partnerStore?: any) => {
  const store = partnerStore || playhubNativePartnerEventStore();
  if (!store || !event) return;
  const keys = playhubNativePartnerEventKeys(event);
  const numericGid = numericSteamNewsGid(event?.AnnouncementGID || event?.announcement_gid || event?.GID || event?.gid);
  const canonicalEventGid = String(event?.GID || (numericGid ? `old_announce_${numericGid}` : "")).trim();
  try {
    if (store.m_mapExistingEvents?.set) {
      keys.forEach((key) => store.m_mapExistingEvents.set(key, event));
    }
    if (numericGid && store.m_mapAnnouncementBodyToEvent?.set) {
      store.m_mapAnnouncementBodyToEvent.set(numericGid, canonicalEventGid || numericGid);
      store.m_mapAnnouncementBodyToEvent.set(String(numericGid), canonicalEventGid || numericGid);
      store.m_mapAnnouncementBodyToEvent.set(`old_announce_${numericGid}`, canonicalEventGid || `old_announce_${numericGid}`);
    }
    const appendToMapList = (map: any, key: unknown, value: string) => {
      if (!map?.get || !map?.set || !key || !value) return;
      const mapKey = typeof key === "number" ? key : Number(key);
      const actualKey = Number.isFinite(mapKey) && mapKey > 0 ? mapKey : key;
      const current = map.get(actualKey) || [];
      if (Array.isArray(current) && !current.includes(value)) {
        map.set(actualKey, [...current, value]);
      }
    };
    appendToMapList(store.m_mapAppIDToGIDs, event.appid, canonicalEventGid);
    appendToMapList(store.m_mapAppIDToGIDs, event.reference_appid || event.steam_appid, canonicalEventGid);
    const clanAccountId = event.clanSteamID?.GetAccountID?.();
    appendToMapList(store.m_mapClanToGIDs, clanAccountId, canonicalEventGid);
    if (canonicalEventGid && typeof store.GetPartnerEventChangeCallback === "function") {
      store.GetPartnerEventChangeCallback(canonicalEventGid)?.Dispatch?.(event);
    }
  } catch (error) {
    log.warn("patch", "unable to register native PartnerEvent", error);
  }
};

const rememberPlayhubNativePartnerEvent = (event: any) => {
  const cache = playhubNativePartnerEventCache();
  playhubNativePartnerEventKeys(event).forEach((key) => cache.set(String(key), event));
  const stores = collectNativePartnerEventStores();
  if (stores.length) stores.forEach((store) => registerPlayhubNativePartnerEventInSteamStore(event, store));
  else registerPlayhubNativePartnerEventInSteamStore(event);
};

const clonePlayhubNativePartnerEventForRoute = (event: any, requestedKey?: unknown) => {
  if (!event) return null;
  const raw = String(requestedKey || "").trim();
  const numericGid = numericSteamNewsGid(raw || event?.AnnouncementGID || event?.announcement_gid || event?.GID || event?.gid);
  // Steam's event overlay validates with a strict `event.GID == initialEventID` check.
  // Activity cards, old announcements and Store News routes may pass either the numeric
  // announcement id or the `old_announce_<gid>` event id, so return a route-local
  // clone whose GID matches the key Steam asked for while keeping AnnouncementGID
  // numeric for the real announcement data.
  const routeGid = raw || String(event?.GID || (numericGid ? `old_announce_${numericGid}` : "0"));
  return {
    ...event,
    GID: routeGid,
    gid: routeGid,
    event_gid: routeGid,
    AnnouncementGID: numericGid || event?.AnnouncementGID || event?.announcement_gid || "0",
    announcement_gid: numericGid || event?.announcement_gid || event?.AnnouncementGID || "0",
    announcementGID: numericGid || event?.announcementGID || event?.AnnouncementGID || "0",
    GetAnnouncementGID: () => numericGid || event?.AnnouncementGID || event?.announcement_gid || "0",
  };
};

const playhubNativePartnerEventForGid = (value: unknown, cloneForRoute = false) => {
  const raw = String(value || "").trim();
  const gid = numericSteamNewsGid(raw);
  const cache = playhubNativePartnerEventCache();
  const event = (raw && cache.get(raw)) || (gid && (cache.get(String(gid)) || cache.get(`old_announce_${gid}`))) || null;
  return cloneForRoute ? clonePlayhubNativePartnerEventForRoute(event, raw || gid) : event;
};

const makePlayhubNativePartnerEvent = (appId: number, steamAppId: number, item: any, index: number) => {
  const date = Number(item.date || item.posttime || item.published || 0) || Math.floor(Date.now() / 1000) - index * 60;
  const announcementGid = numericSteamNewsGid(item.announcement_gid || item.news_id || item.gid || item.id || item.url);
  const eventGid = numericSteamNewsGid(item.event_gid || "");
  const gid = announcementGid || eventGid;
  const nativeEventGid = eventGid && eventGid !== announcementGid ? eventGid : gid ? `old_announce_${gid}` : "0";
  const isOldAnnouncement = nativeEventGid.startsWith("old_announce_");
  const title = cleanSteamNewsDisplayText(item.title || item.event_name || item.headline || "Steam News");
  const summary = cleanSteamNewsDisplayText(item.summary || item.description || item.body || title);
  const body = cleanSteamNewsDisplayText(item.body || item.content || item.description || item.summary || title);
  const images = collectSteamNewsImages(steamAppId, item);
  const primaryImage = images[0] || "";
  const clanSteamID = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
  const type = normalizePlayhubSteamActivityType(item.event_type || item.type);
  const isPatchNote = type === 12;
  const eventLabel = playhubSteamActivityTypeLabel(type);
  const eventTags = playhubSteamActivityTypeTags(type);
  const modalBody = steamNewsRawBodyForModal(item.raw_body || item.rawBody || item.body_html || item.body_raw || item.body || body || summary);
  const activitySummary = isPatchNote ? "" : summary;
  const announcementUrl = item.url || item.external_url || item.link || (steamAppId && announcementGid ? `https://steamcommunity.com/games/${steamAppId}/announcements/detail/${announcementGid}` : steamAppId && eventGid ? `https://store.steampowered.com/news/app/${steamAppId}/view/${eventGid}` : "");
  const jsondata = {
    // Keep the detail viewer from rendering a duplicated non-clickable preview
    // paragraph above Steam's real BBCode/HTML body.
    localized_summary: [""],
    localized_subtitle: [""],
    localized_body: [modalBody],
    localized_title_image: [primaryImage],
    localized_capsule_image: [primaryImage],
    localized_spotlight_image: [primaryImage],
    library_spotlight: true,
    library_spotlight_text: true,
    referenced_appids: steamAppId ? [steamAppId] : [],
  };
  const partnerEvent: any = {
    __playhubNativePartnerEvent: true,
    GID: nativeEventGid,
    gid: nativeEventGid,
    event_gid: nativeEventGid,
    AnnouncementGID: announcementGid || gid || "0",
    announcement_gid: announcementGid || gid || "0",
    announcementGID: announcementGid || gid || "0",
    appid: appId,
    reference_appid: steamAppId || appId,
    steam_appid: steamAppId || appId,
    type,
    event_type: type,
    bOldAnnouncement: isOldAnnouncement,
    bLoaded: true,
    loadedAllLanguages: true,
    visibility_state: 2,
    postTime: date,
    createTime: date,
    startTime: date,
    endTime: date,
    visibilityStartTime: date,
    visibilityEndTime: date + 86400 * 365,
    rtime32_moderator_reviewed: date,
    rtime32_start_time: date,
    rtime32_end_time: date,
    rtime32_last_modified: date,
    nVotesUp: Number(item.upvotes || 0) || 0,
    nVotesDown: Number(item.downvotes || 0) || 0,
    nCommentCount: Number(item.comment_count || 0) || 0,
    forumTopicGID: item.forumTopicGID || item.forum_topic_id || "0",
    clanSteamID,
    announcementClanSteamID: clanSteamID,
    jsondata,
    name: new Map([[0, title]]),
    description: new Map([[0, modalBody || body || summary]]),
    timestamp_loc_updated: new Map([[0, date]]),
    vecTags: eventTags,
    tags: eventTags,
    BHasTag: (tag: string) => eventTags.includes(String(tag || "")),
    BHasTagStartingWith: (prefix: string) => eventTags.some((tag) => tag.startsWith(String(prefix || ""))),
    GetAllTags: () => eventTags,
    BMatchesAllTags: (tags?: string[]) => !Array.isArray(tags) || tags.every((tag) => eventTags.includes(String(tag || ""))),
    BInRealmGlobal: () => true,
    BInRealmChina: () => false,
    BIsLanguageValidForRealms: () => true,
    GetNameWithFallback: () => title,
    GetGameTitle: () => title,
    GetDescriptionWithFallback: () => modalBody || body || summary,
    GetSummaryWithFallback: () => activitySummary,
    GetSummary: () => activitySummary,
    BHasSummary: () => !!activitySummary,
    GetSubTitle: () => "",
    BHasSubTitle: () => false,
    GetSubTitleWithLanguageFallback: () => "",
    GetSubTitleWithSummaryFallback: () => "",
    GetCategoryAsString: () => eventLabel,
    GetEventTypeAsString: () => eventLabel,
    GetImgArray: () => images,
    GetImageHash: () => null,
    GetImageHashAndExt: () => null,
    GetImageFromBeginningOfDescription: () => primaryImage || "",
    GetImageURL: () => primaryImage,
    GetImageURLWithFallback: () => primaryImage || images[0] || "",
    GetImageForSizeAsArrayWithFallback: (_size?: string, _language?: string, _format?: string, skipFallback?: boolean) => {
      const out = images.slice();
      if (!skipFallback && steamAppId) {
        out.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`);
        out.push(`https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`);
      }
      return Array.from(new Set(out.map(cleanSteamImageUrl).filter(Boolean)));
    },
    BImageNeedScreenshotFallback: () => images.length === 0,
    BHasSomeImage: () => images.length > 0,
    BHasImage: () => images.length > 0,
    GetFallbackArtworkScreenshot: () => images[0] || (steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg` : ""),
    GetStartTimeAndDateUnixSeconds: () => date,
    GetEndTimeAndDateUnixSeconds: () => date,
    GetPostTimeAndDateUnixSeconds: () => date,
    GetAnnouncementGID: () => announcementGid || gid || "0",
    BHasAnnouncementGID: () => !!(announcementGid || gid),
    GetAppID: () => appId,
    GetReferenceAppID: () => steamAppId || appId,
    GetStoreAppID: () => steamAppId || appId,
    BIsPartnerEvent: () => false,
    BIsOGGEvent: () => !!steamAppId,
    BIsEventInFuture: () => false,
    BHasEventEnded: () => false,
    BIsEventActionEnabled: () => false,
    BShowLibrarySpotlight: () => false,
    BShowLibrarySpotlightText: () => false,
    BIsImageSafeForAllAges: () => true,
    BHasBroadcastEnabled: () => false,
    BEventCanShowBroadcastWidget: () => false,
    BHasBroadcastForceBanner: () => false,
    BSaleShowBroadcastAtTopOfPage: () => false,
    GetVisibilityStartTimeAndDateUnixSeconds: () => date,
    BHasForumTopicGID: () => false,
    GetForumTopicURL: () => "",
    GetAppIDOrReferenceAppID: () => steamAppId || appId,
    GetEventType: () => type,
    BIsVisibleEvent: () => true,
    BIsStagedEvent: () => false,
    BIsUnlistedEvent: () => false,
    BHasEmailEnabled: () => false,
    BHasSaleEnabled: () => false,
    BHasSaleVanity: () => false,
    GetSaleVanity: () => "",
    BHasSaleUpdateLandingPageVanity: () => false,
    GetSaleUpdateLandingPageVanity: () => "",
    GetSaleURL: () => null,
    GetSaleSections: () => [],
    GenerateDynamicSaleSections: () => [],
    GetSaleSectionIncludingFooterSections: () => null,
    GetSaleSectionByID: () => null,
    GetSaleSectionCount: () => 0,
    GetSaleSectionsByType: () => [],
    GetSaleSectionFirstMatchByType: () => null,
    GetSaleItemOfType: () => null,
    GetSaleItemCountOfType: () => 0,
    GetSaleFeaturedAppsCount: () => 0,
    GetSaleFeaturedAppsAndDemosCount: () => 0,
    GetSaleFeaturedBundlesCount: () => 0,
    GetSaleFeaturedPackagesCount: () => 0,
    GetSaleFeaturedApps: () => [],
    GetSaleFeaturedAppsAndDemos: () => [],
    GetSaleFeaturedBundles: () => [],
    GetSaleFeaturedPackages: () => [],
    GetTaggedItems: () => [],
    BHasScheduleEnabled: () => false,
    BAllowedSteamStoreSpotlight: () => false,
    BHasLibaryHomeSpotlight: () => false,
    BHasLibraryHomeSpotlight: () => false,
    BHasSaleProductBanners: () => false,
    GetSteamAwardCategory: () => 0,
    GetSteamAwardNomineeCategories: () => [],
    BIsLockedToGameOwners: () => false,
    GetRequiredAppIDs: () => [],
    GetRequiredPackageIDs: () => [],
    BUseSubscriptionLayout: () => false,
    BIsLockedToPartnerAppRights: () => false,
    GetRequiredPartnerAppRights: () => undefined,
    GetValveAccessLog: () => [],
    BUsesContentHubForItemSource: () => false,
    GetContentHubType: () => undefined,
    GetContentHubCategory: () => undefined,
    GetContentHubTag: () => undefined,
    GetContentHub: () => undefined,
    BContentHubDiscountedOnly: () => false,
    BIsBackgroundImageGroupingEnabled: () => false,
    GetSalePageGroupDefinition: () => undefined,
    GetSalePageBackgroundImageGroupCount: () => 0,
    GetAllSalePageGroups: () => [],
    GetSalePageBackgroundGroup: () => undefined,
    GetIncludedRealmList: () => [0],
    BIsValidForRealm: () => true,
    BIsNextFest: () => false,
    GetLastUpdateTime: () => date,
    GetLastUpdaterSteamIDStr: () => "",
    GetStoreOrCommunityURL: () => announcementUrl,
    GetCommunityDiscussionURL: () => announcementUrl,
    GetStoreNewsURL: () => steamAppId && (announcementGid || eventGid || gid) ? `https://store.steampowered.com/news/app/${steamAppId}/view/${announcementGid || eventGid || gid}` : announcementUrl,
    url: announcementUrl,
  };
  rememberPlayhubNativePartnerEvent(partnerEvent);
  return partnerEvent;
};

const makePlayhubNativeActivityEvent = (appId: number, metadata: MetadataData, item: any, index: number) => {
  const steamAppId = Number(metadata.steam_appid || item.appid || appId) || appId;
  const partnerEvent = makePlayhubNativePartnerEvent(appId, steamAppId, item, index);
  const date = Number(partnerEvent.postTime || 0) || Math.floor(Date.now() / 1000) - index * 60;
  const gid = numericSteamNewsGid(partnerEvent.GID || item.url) || String(date);
  const actor = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
  return {
    __playhubNativeActivityEvent: true,
    gameid: String(appId),
    unUniqueID: Number(`${String(gid).slice(-8)}${index}`.slice(-9)) || date + index,
    rtEventTime: date,
    steamIDActor: actor,
    steamIDTarget: fakeSteamId(),
    eEventType: STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE,
    eEventSubType: 0,
    eGameActivityType: 0,
    bIsGameActivity: false,
    commentThreads: [],
    activeThread: 0,
    get appid() {
      return appId;
    },
    get referenceAppID() {
      return steamAppId || appId;
    },
    get announcementGID() {
      return gid;
    },
    get clan_announcementid() {
      return gid;
    },
    get eventModel() {
      return partnerEvent;
    },
    get forumTopicGID() {
      return partnerEvent.forumTopicGID;
    },
    get upvotes() {
      return partnerEvent.nVotesUp;
    },
    get downvotes() {
      return partnerEvent.nVotesDown;
    },
    get comment_count() {
      return partnerEvent.nCommentCount;
    },
    BIsValid: () => true,
    IsEventLoaded: () => true,
    GetEvent: async () => partnerEvent,
    ReloadEvent: async () => partnerEvent,
    GetParentalFeature: () => 0,
    BUserCanDelete: () => false,
    BSupportsCommentThreads: () => false,
    GetActiveCommentThread: () => null,
    SetActiveCommentThread: () => undefined,
  };
};

const makePlayhubNativeActivity = (appId: number, metadata: MetadataData) => {
  const items = steamActivityNewsItemsFromMetadata(appId, metadata)
    .filter((item: any) => numericSteamNewsGid(item.gid || item.news_id || item.announcement_gid || item.id || item.url));
  if (!items.length) return null;
  const events = items
    .map((item, index) => makePlayhubNativeActivityEvent(appId, metadata, item, index))
    .sort((a, b) => Number(b.rtEventTime || 0) - Number(a.rtEventTime || 0));
  const grouped = new Map<number, any[]>();
  for (const event of events) {
    const day = Math.floor(Number(event.rtEventTime || 0) / 86400) * 86400;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(event);
  }
  const days: PlayhubNativeActivityDay[] = Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, dayEvents]) => ({
      isValid: dayEvents.length > 0,
      events: dayEvents,
      GetLatestEventTime: () => Math.max(...dayEvents.map((event) => Number(event.rtEventTime || 0))),
      GetEarliestEventTime: () => Math.min(...dayEvents.map((event) => Number(event.rtEventTime || 0))),
      BHasEvents: () => dayEvents.length > 0,
    }));
  const latest = events[0]?.rtEventTime || 0;
  const earliest = events[events.length - 1]?.rtEventTime || latest;
  return {
    __playhubNativeActivity: true,
    appid: appId,
    m_bNoMoreHistoryAvailable: true,
    lastAddedEventType: STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE,
    lastAddedPartnerEvent: null,
    get appActivityByDay() {
      return days;
    },
    get latest_user_news_time() {
      return latest;
    },
    get earliest_user_news_time() {
      return earliest;
    },
    get latest_game_activity_time() {
      return 0;
    },
    get earliest_game_activity_time() {
      return 0;
    },
    BHasEvents: () => events.length > 0,
    SortEvents: () => undefined,
    RequestStoreItems: async () => undefined,
    MergeUserNews: async () => undefined,
    MergeGameActivity: () => undefined,
    GetAchievementMapCache: () => "[]",
    GetUserNewsCache: () => [],
    GetGameActivityCache: () => [],
  };
};

const getPlayhubNativeActivityForApp = (appId: number) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  const cached = playhubNativeActivityCache().get(appId);
  if (cached) return cached;
  const metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  const native = makePlayhubNativeActivity(appId, metadata);
  if (native) playhubNativeActivityCache().set(appId, native);
  return native;
};

const refreshPlayhubNativeActivityForApp = async (appId: number, store?: any) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  await ensureMetadataCache();
  let metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  const native = metadata ? makePlayhubNativeActivity(appId, metadata) : null;
  if (!native) return null;
  playhubNativeActivityCache().set(appId, native);
  const appActivityStore = store || (globalThis as any).appActivityStore;
  try {
    if (appActivityStore?.m_mapAppActivity?.set) appActivityStore.m_mapAppActivity.set(appId, native);
  } catch (_error) {
    // If Steam changes the store shape, GetAppActivity still returns our cache.
  }
  return native;
};

const installNativeActivityStorePatch = (unpatchers: Unpatch[]) => {
  let attempts = 0;
  const tryInstall = (): boolean => {
    if (!hasActivityStore()) {
      if (patchInstallStatus.activity === "pending") {
        patchInstallStatus.activity = "skipped-missing-internal";
        log.warn("patch", "activity UI patch skipped", { status: patchInstallStatus.activity });
      }
      return true;
    }
    const store = (globalThis as any).appActivityStore;
    if (!store || store.__playhubNativeActivityPatched) return !!store?.__playhubNativeActivityPatched;
    try {
      store.__playhubNativeActivityPatched = true;
      unpatchers.push(
        patchMethod(store, "GetAppActivity", (_thisValue, original, args) => {
          const appId = Number(args[0]);
          const native = getPlayhubNativeActivityForApp(appId);
          if (native) return native;
          if (appId && isNonSteamApp(getOverview(appId))) {
            void refreshPlayhubNativeActivityForApp(appId, store);
          }
          return original(...args);
        })
      );
      for (const methodName of ["RequestRestoreActivity", "RestoreActivity", "FetchLatestActivity", "FetchLatestActivityFromServer", "FetchActivityHistory"] as const) {
        if (typeof store[methodName] !== "function") continue;
        unpatchers.push(
          patchMethod(store, methodName, (_thisValue, original, args) => {
            const appId = Number(args[0]);
            const native = getPlayhubNativeActivityForApp(appId);
            if (native) return methodName.includes("History") || methodName.includes("Server") || methodName.includes("Restore") ? Promise.resolve(native) : undefined;
            if (appId && isNonSteamApp(getOverview(appId))) {
              void refreshPlayhubNativeActivityForApp(appId, store);
            }
            return original(...args);
          })
        );
      }
      patchInstallStatus.activity = "installed";
      log.info("patch", "activity store patch installed", { status: patchInstallStatus.activity });
      return true;
    } catch (error) {
      patchInstallStatus.activity = "failed";
      log.warn("patch", "activity store patch failed", { status: patchInstallStatus.activity }, error);
      return true;
    }
  };
  if (tryInstall()) return;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryInstall() || attempts >= 40) window.clearInterval(timer);
  }, 500);
  unpatchers.push(() => window.clearInterval(timer));
};

const installNativePartnerEventStorePatch = (unpatchers: Unpatch[]) => {
  let attempts = 0;
  const patchedStores = new WeakSet<object>();

  const patchOneStore = (partnerStore: any): boolean => {
    if (!partnerStore || typeof partnerStore !== "object") return false;
    (globalThis as any)[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY] = partnerStore;
    for (const event of playhubNativePartnerEventCache().values()) registerPlayhubNativePartnerEventInSteamStore(event, partnerStore);
    if (partnerStore.__playhubNativePartnerEventsPatched || patchedStores.has(partnerStore)) return true;
    partnerStore.__playhubNativePartnerEventsPatched = true;
    patchedStores.add(partnerStore);

    const maybePatch = (methodName: string, handler: (original: (...args: any[]) => any, args: any[]) => any) => {
      if (typeof partnerStore[methodName] !== "function") return;
      unpatchers.push(
        patchMethod(partnerStore, methodName, (_thisValue, original, args) => handler(original, args))
      );
    };

    maybePatch("GetClanEventFromAnnouncementGID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], false);
      return event || original(...args);
    });
    maybePatch("BHasClanAnnouncementGID", (original, args) => {
      if (playhubNativePartnerEventForGid(args[0])) return true;
      return original(...args);
    });
    maybePatch("GetClanEventGIDFromAnnouncementGID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], false);
      return event?.GID || original(...args);
    });
    maybePatch("GetClanEventModel", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], true);
      return event || original(...args);
    });
    maybePatch("BHasClanEventModel", (original, args) => {
      if (playhubNativePartnerEventForGid(args[0])) return true;
      return original(...args);
    });
    maybePatch("GetClanEventGIDs", (original, args) => {
      const originalResult = original(...args) || [];
      const accountId = args[0]?.GetAccountID?.();
      const playhubGids = Array.from(playhubNativePartnerEventCache().values())
        .filter((event: any) => !accountId || event?.clanSteamID?.GetAccountID?.() === accountId)
        .map((event: any) => event?.GID)
        .filter(Boolean);
      return Array.from(new Set([...originalResult, ...playhubGids]));
    });
    maybePatch("GetClanEventGIDsForApp", (original, args) => {
      const appId = Number(args[0]);
      const originalResult = original(...args) || [];
      const playhubGids = Array.from(playhubNativePartnerEventCache().values())
        .filter((event: any) => Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId)
        .map((event: any) => event?.GID)
        .filter(Boolean);
      return Array.from(new Set([...originalResult, ...playhubGids]));
    });
    maybePatch("GetRankedClanEvents", (original, args) => {
      const originalResult = original(...args) || [];
      const clanAccountId = args[0]?.GetAccountID?.();
      const appId = Number(args[1] || 0);
      const playhubEvents = Array.from(playhubNativePartnerEventCache().values()).filter((event: any) => {
        const clanMatches = !clanAccountId || event?.clanSteamID?.GetAccountID?.() === clanAccountId;
        const appMatches = !appId || Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId;
        return clanMatches && appMatches;
      });
      return Array.from(new Map([...originalResult, ...playhubEvents].map((event: any) => [String(event?.GID || event?.AnnouncementGID), event])).values());
    });
    maybePatch("LoadPartnerEventFromAnnoucementGID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], false);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventFromAnnoucementGIDAndClanSteamID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[1] || args[0], false);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventFromClanEventGID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], true);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventFromClanEventGIDAndClanSteamID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[1] || args[0], true);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventGeneric", (original, args) => {
      // Real Steam signature is (clanSteamID, appid, eventGID, announcementGID, ...).
      const requestKey = args.find((arg) => playhubNativePartnerEventForGid(arg));
      const event = playhubNativePartnerEventForGid(requestKey, !!args[2]);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadHiddenPartnerEvent", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], true);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadHiddenPartnerEventByAnnouncementGID", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[0], false);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadAdjacentPartnerEvents", (original, args) => {
      const requestedId = args[0];
      const appId = Number(args[2] || 0);
      const direct = playhubNativePartnerEventForGid(requestedId, true);
      if (direct) return Promise.resolve([direct]);
      const appEvents = Array.from(playhubNativePartnerEventCache().values()).filter((event: any) => {
        return appId && (Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId);
      });
      if (appEvents.length) return Promise.resolve(appEvents);
      return original(...args);
    });
    maybePatch("LoadBatchPartnerEventsByEventGIDsOrAnnouncementGIDs", (original, args) => {
      const eventGids = Array.isArray(args[0]) ? args[0] : [];
      const announcementGids = Array.isArray(args[1]) ? args[1] : [];
      const hits: any[] = [];
      const missingEventGids: any[] = [];
      const missingAnnouncementGids: any[] = [];
      eventGids.forEach((gid: any) => {
        const event = playhubNativePartnerEventForGid(gid, true);
        if (event) hits.push(event);
        else missingEventGids.push(gid);
      });
      announcementGids.forEach((gid: any) => {
        const event = playhubNativePartnerEventForGid(gid, false);
        if (event) hits.push(event);
        else missingAnnouncementGids.push(gid);
      });
      if (!hits.length) return original(...args);
      if (!missingEventGids.length && !missingAnnouncementGids.length) return Promise.resolve(hits);
      return Promise.resolve(original(missingEventGids, missingAnnouncementGids, args[2])).then((rest: any) => [...hits, ...((Array.isArray(rest) && rest) || [])]);
    });
    maybePatch("FlushEventFromCache", (original, args) => {
      const event = playhubNativePartnerEventForGid(args[1] || args[0]);
      if (event) return undefined;
      return original(...args);
    });
    return true;
  };

  const tryInstall = (): boolean => {
    if (!hasSteamInternals()) {
      if (patchInstallStatus.partnerEvents === "pending") {
        patchInstallStatus.partnerEvents = "skipped-missing-internal";
        log.warn("patch", "partner events UI patch skipped", { status: patchInstallStatus.partnerEvents });
      }
      return true;
    }
    try {
      const stores = collectNativePartnerEventStores();
      let patchedAny = false;
      for (const store of stores) patchedAny = patchOneStore(store) || patchedAny;
      if (patchedAny) {
        patchInstallStatus.partnerEvents = "installed";
        log.info("patch", "partner event store patch installed", { status: patchInstallStatus.partnerEvents });
      }
      return patchedAny;
    } catch (error) {
      patchInstallStatus.partnerEvents = "failed";
      log.warn("patch", "partner event store patch failed", { status: patchInstallStatus.partnerEvents }, error);
      return true;
    }
  };

  if (tryInstall()) return;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryInstall() || attempts >= 80) window.clearInterval(timer);
  }, 500);
  unpatchers.push(() => window.clearInterval(timer));
};

const activityAppIdFromUrl = (url: string) => {
  const decoded = decodeURIComponent(String(url || ""));
  const patterns = [
    /library\/(?:appactivityfeed|appactivity|activityfeed|activity|appnews|appupdates)\/(\d+)/i,
    /(?:appactivityfeed|appactivity|activityfeed|activity|appnews|appupdates)[^?]*[?&](?:appid|app_id|appId)=(\d+)/i,
    /(?:appid|app_id|appId)=(\d+).*?(?:appactivity|activity|appnews|appupdates)/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
};


const gameDetailAppIdFromPath = (path: string) => {
  const decoded = decodeURIComponent(String(path || ""));
  const patterns = [
    /\/library\/(?:app|details|[^/]+\/app)\/(\d+)(?:[/?#\s].*)?/i,
    /(?:^|[?#&\s])appid=(\d+)/i,
    /(?:^|[?#&\s])app_id=(\d+)/i,
    /\bapp\/(\d+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) return Number(match[1] || 0);
  }
  return 0;
};

const appIdFromDom = () => {
  const attributes = ["href", "data-appid", "data-app-id", "data-appid64", "data-ds-appid", "aria-label", "title"];
  const candidates = deepQuerySelectorAll("a, button, [role='button'], [role='tab'], [data-appid], [data-app-id], [data-ds-appid]");
  for (const element of candidates) {
    if (!visibleElement(element)) continue;
    for (const attribute of attributes) {
      const value = (element as HTMLElement).getAttribute(attribute) || "";
      const appId = gameDetailAppIdFromPath(value);
      if (appId) return appId;
    }
  }
  return 0;
};


const appIdFromVisibleMetadataTitle = () => {
  try {
    const pageText = normalizedTabText(document.body?.textContent || "");
    if (!pageText || !metadataCache) return 0;
    const candidates = Object.entries(metadataCache)
      .map(([key, metadata]) => {
        const appId = Number(key);
        const title = normalizedTabText(metadata?.title || appName(appId));
        return { appId, title };
      })
      .filter((candidate) => candidate.appId && candidate.title && candidate.title.length >= 3)
      .sort((a, b) => b.title.length - a.title.length);
    for (const candidate of candidates) {
      if (pageText.includes(candidate.title)) return candidate.appId;
    }
  } catch (_error) {
    // Best-effort fallback only.
  }
  return 0;
};

const currentGameDetailAppId = () => {
  const routeAppId = gameDetailAppIdFromPath(currentRoutePath());
  if (routeAppId) return routeAppId;
  if (lastObservedGameDetailAppId) return lastObservedGameDetailAppId;
  const titleAppId = appIdFromVisibleMetadataTitle();
  if (titleAppId) return titleAppId;
  const domAppId = appIdFromDom();
  if (domAppId && (metadataCache[String(domAppId)] || isNonSteamAppWithoutPatchedMethod(getOverview(domAppId)))) return domAppId;
  return domAppId || 0;
};

const isTransparentColor = (value: string) => {
  const color = String(value || "").trim().toLowerCase();
  return !color || color === "transparent" || color === "rgba(0, 0, 0, 0)" || color === "rgba(0,0,0,0)";
};

const visibleElement = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
};

const textOf = (element: Element | null) =>
  String(element?.textContent || "").replace(/\s+/g, " ").trim();

const isPlayhubActivityNewsElement = (element: Element | null) =>
  !!(element instanceof HTMLElement && element.closest("#playhub-activity-news-root, #playhub-activity-news-overlay, [data-playhub-activity-news='1']"));

const deepQuerySelectorAll = (selector: string, root: Document | ShadowRoot | Element = document): Element[] => {
  const results: Element[] = [];
  const seen = new Set<Element>();
  const visit = (scope: Document | ShadowRoot | Element) => {
    let elements: Element[] = [];
    try {
      elements = Array.from((scope as any).querySelectorAll?.(selector) || []);
    } catch (_error) {
      elements = [];
    }
    elements.forEach((element) => {
      if (!seen.has(element)) {
        seen.add(element);
        results.push(element);
      }
      const shadowRoot = (element as HTMLElement).shadowRoot;
      if (shadowRoot) visit(shadowRoot);
    });
  };
  visit(root);
  return results;
};

const deepVisibleElements = (selector: string) =>
  deepQuerySelectorAll(selector).filter((element) => visibleElement(element));

const findVisibleTextElement = (label: string) => {
  const wanted = label.toLocaleLowerCase("it-IT");
  const candidates = deepQuerySelectorAll("button, [role='tab'], [role='button'], a, div, span");
  return candidates.find((element) => {
    if (!visibleElement(element)) return false;
    return textOf(element).toLocaleLowerCase("it-IT") === wanted;
  }) as HTMLElement | undefined;
};

const knownDetailsTabLabels = ["Attività", "Activity", "I tuoi articoli", "Your Stuff", "Comunità", "Community", "Informazioni sul gioco", "Game Info"];

const normalizedTabText = (value: string) =>
  String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("it-IT");

const canonicalDetailsTabLabel = (label: string) => {
  const normalized = normalizedTabText(label);
  if (normalized === normalizedTabText("Activity")) return "Attività";
  if (normalized === normalizedTabText("Your Stuff")) return "I tuoi articoli";
  if (normalized === normalizedTabText("Community")) return "Comunità";
  if (normalized === normalizedTabText("Game Info")) return "Informazioni sul gioco";
  return label;
};

const detailsTabLabelFromText = (value: string) => {
  const text = normalizedTabText(value);
  if (!text) return "";
  for (const label of knownDetailsTabLabels) {
    if (text === normalizedTabText(label)) return canonicalDetailsTabLabel(label);
  }
  // Steam sometimes wraps the label with focus helpers / counters. Accept a
  // short containing text, but avoid the full tab row because it contains every
  // label and would otherwise always resolve to Activity.
  for (const label of knownDetailsTabLabels) {
    const wanted = normalizedTabText(label);
    if (text.includes(wanted) && text.length <= wanted.length + 28) return canonicalDetailsTabLabel(label);
  }
  return "";
};

const detailsTabLabelFromElement = (element: Element | null) => {
  let current = element as HTMLElement | null;
  for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
    const directLabel = detailsTabLabelFromText(textOf(current));
    if (directLabel) return directLabel;
    const ariaLabel = detailsTabLabelFromText(current.getAttribute("aria-label") || current.getAttribute("title") || "");
    if (ariaLabel) return ariaLabel;
    current = current.parentElement;
  }
  return "";
};

const noteDetailsTabSelection = (label: string) => {
  if (!label) return;
  selectedDetailsTabHint = label;
  selectedDetailsTabHintAt = Date.now();
};

const noteDetailsTabIndexSelection = (index: number) => {
  if (!Number.isFinite(index) || index < 0) return;
  selectedDetailsTabIndexHint = index;
  selectedDetailsTabIndexHintAt = Date.now();
  if (index === 0) noteDetailsTabSelection("Attività");
};

const tabCandidateText = (element: Element | null) => {
  const text = textOf(element);
  // Steam sometimes puts helper text/counters inside focus wrappers. We only need
  // short visible labels for geometry grouping, not the localized wording.
  if (text.length > 96) return "";
  return text;
};

const elementDepth = (element: Element | null) => {
  let depth = 0;
  let current = element?.parentElement || null;
  while (current && current !== document.body) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
};

const uniqueVisibleElements = (elements: Element[]) => {
  const out: HTMLElement[] = [];
  for (const element of elements) {
    if (!(element instanceof HTMLElement) || !visibleElement(element)) continue;
    if (out.some((existing) => existing === element)) continue;
    out.push(element);
  }
  return out;
};

const tabLikeElement = (element: HTMLElement) => {
  if (isPlayhubActivityNewsElement(element)) return false;
  const rect = element.getBoundingClientRect();
  const text = tabCandidateText(element);
  if (!text) return false;
  if (rect.width < 34 || rect.width > Math.min(420, window.innerWidth * 0.45)) return false;
  if (rect.height < 18 || rect.height > 82) return false;
  if (rect.top < window.innerHeight * 0.18 || rect.top > window.innerHeight * 0.58) return false;
  if (rect.left < 0 || rect.right > window.innerWidth + 8) return false;
  // Avoid the big Play button / header stats row. The details tab strip is below
  // the hero/header controls and is usually centered around the page content.
  if (rect.top < 220 && window.innerHeight > 850) return false;
  return true;
};

const dedupeNestedTabCandidates = (elements: HTMLElement[]) => {
  const sorted = elements.slice().sort((a, b) => elementDepth(b) - elementDepth(a));
  const kept: HTMLElement[] = [];
  for (const element of sorted) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const duplicate = kept.some((other) => {
      const otherRect = other.getBoundingClientRect();
      const otherCenterX = otherRect.left + otherRect.width / 2;
      const otherCenterY = otherRect.top + otherRect.height / 2;
      return Math.abs(centerX - otherCenterX) < 18 && Math.abs(centerY - otherCenterY) < 14;
    });
    if (!duplicate) kept.push(element);
  }
  return kept;
};

const groupTabCandidatesByRow = (elements: HTMLElement[]) => {
  const rows: HTMLElement[][] = [];
  const sorted = elements.slice().sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return ar.top - br.top || ar.left - br.left;
  });
  for (const element of sorted) {
    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const row = rows.find((candidate) => {
      const firstRect = candidate[0].getBoundingClientRect();
      const firstCenterY = firstRect.top + firstRect.height / 2;
      return Math.abs(centerY - firstCenterY) <= 18;
    });
    if (row) row.push(element);
    else rows.push([element]);
  }
  return rows
    .map((row) => row.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left))
    .filter((row) => row.length >= 3);
};

const scoreTabRow = (row: HTMLElement[]) => {
  const rects = row.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const width = right - left;
  const height = bottom - top;
  const selectedBonus = row.some((element) => elementLooksSelected(element)) ? 500 : 0;
  const countBonus = Math.min(row.length, 6) * 60;
  const contentWidthBonus = width > window.innerWidth * 0.22 && width < window.innerWidth * 0.78 ? 120 : 0;
  const compactBonus = height < 92 ? 120 : 0;
  const verticalPreference = Math.max(0, 160 - Math.abs(top - window.innerHeight * 0.31));
  return selectedBonus + countBonus + contentWidthBonus + compactBonus + verticalPreference;
};

const findDetailsTabCandidates = () => {
  const roleTabs = uniqueVisibleElements(deepQuerySelectorAll("[role='tab']"));
  const roleRows = groupTabCandidatesByRow(dedupeNestedTabCandidates(roleTabs.filter(tabLikeElement)));
  if (roleRows.length) return roleRows.sort((a, b) => scoreTabRow(b) - scoreTabRow(a))[0];

  const raw = uniqueVisibleElements(
    deepQuerySelectorAll("button, [role='button'], [tabindex], a, div, span")
  ).filter(tabLikeElement);
  const rows = groupTabCandidatesByRow(dedupeNestedTabCandidates(raw));
  if (!rows.length) return [];
  return rows.sort((a, b) => scoreTabRow(b) - scoreTabRow(a))[0];
};

const findDetailsTabRow = () => {
  const tabs = findDetailsTabCandidates();
  if (tabs.length >= 3) {
    let current: HTMLElement | null = tabs[0].parentElement;
    for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
      const rect = current.getBoundingClientRect();
      const contains = tabs.filter((tab) => current?.contains(tab)).length;
      if (contains >= Math.min(3, tabs.length) && rect.width > 260 && rect.height < 180) return current;
      current = current.parentElement;
    }
    return tabs[0];
  }

  const activity = findVisibleTextElement("Attività") || findVisibleTextElement("Activity");
  if (!activity) return null;
  let current: HTMLElement | null = activity;
  for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
    const text = textOf(current);
    const hits = knownDetailsTabLabels.filter((label) => text.includes(label)).length;
    const rect = current.getBoundingClientRect();
    if (hits >= 3 && rect.width > 300 && rect.height < 160) return current;
    current = current.parentElement;
  }
  return activity.parentElement;
};

const detailsTabIndexFromPoint = (x: number, y: number) => {
  const tabs = findDetailsTabCandidates();
  return tabs.findIndex((tab) => {
    const rect = tab.getBoundingClientRect();
    return x >= rect.left - 10 && x <= rect.right + 10 && y >= rect.top - 10 && y <= rect.bottom + 10;
  });
};

const detailsTabIndexFromElement = (element: Element | null) => {
  if (!element) return -1;
  const tabs = findDetailsTabCandidates();
  return tabs.findIndex((tab) => tab === element || tab.contains(element) || element.contains(tab));
};

const selectedNativeDetailsTabIndex = () => {
  const tabs = findDetailsTabCandidates();
  if (!tabs.length) return -1;
  const direct = tabs.findIndex((tab) => elementLooksSelected(tab));
  if (direct >= 0) return direct;
  return tabs.findIndex((tab) => {
    let current: HTMLElement | null = tab.parentElement;
    for (let depth = 0; current && current !== document.body && depth < 4; depth += 1) {
      if (elementLooksSelected(current)) return true;
      current = current.parentElement;
    }
    return false;
  });
};

const elementLooksSelected = (element: HTMLElement) => {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
    const ariaSelected = current.getAttribute("aria-selected") || current.getAttribute("aria-current");
    if (ariaSelected === "true" || ariaSelected === "page") return true;
    const className = String(current.className || "").toLowerCase();
    if (/(active|selected|current)/.test(className)) return true;
    const style = window.getComputedStyle(current);
    const rect = current.getBoundingClientRect();
    const radius = Math.max(
      parseFloat(style.borderTopLeftRadius || "0") || 0,
      parseFloat(style.borderTopRightRadius || "0") || 0,
      parseFloat(style.borderBottomLeftRadius || "0") || 0,
      parseFloat(style.borderBottomRightRadius || "0") || 0
    );
    if (rect.width >= 48 && rect.height >= 24 && radius >= 8 && !isTransparentColor(style.backgroundColor)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
};

const selectedNativeDetailsTabLabel = () => {
  const selectedCandidates = Array.from(
    deepQuerySelectorAll("[aria-selected='true'], [aria-current='page'], [role='tab'], button, [role='button']")
  );
  for (const element of selectedCandidates) {
    if (!visibleElement(element)) continue;
    const html = element as HTMLElement;
    const ariaSelected = html.getAttribute("aria-selected") || html.getAttribute("aria-current");
    const className = String(html.className || "").toLowerCase();
    if (ariaSelected !== "true" && ariaSelected !== "page" && !/(active|selected|current)/.test(className)) continue;
    const label = detailsTabLabelFromElement(html);
    if (label) return label;
  }
  return "";
};

const activeDetailsTabLabel = () => {
  const path = currentRoutePath();
  if (/\/activity(?:[/?#].*)?$/i.test(path)) return "Attività";

  const indexHintAge = selectedDetailsTabIndexHintAt ? Date.now() - selectedDetailsTabIndexHintAt : Number.MAX_SAFE_INTEGER;
  // Language-independent fast path: in Steam's game detail page the Activity tab
  // is the first details tab. This avoids depending on localized labels.
  if (selectedDetailsTabIndexHint === 0 && indexHintAge < 2200) return "Attività";

  const nativeIndex = selectedNativeDetailsTabIndex();
  if (nativeIndex === 0) return "Attività";
  if (nativeIndex > 0) return `tab-${nativeIndex}`;

  const hintAge = selectedDetailsTabHintAt ? Date.now() - selectedDetailsTabHintAt : Number.MAX_SAFE_INTEGER;
  // Immediately after a click, Steam's selected class can still point to the old
  // tab for a few frames. Trust the click hint briefly, then prefer native state.
  if (selectedDetailsTabHint && hintAge < 1500) return selectedDetailsTabHint;
  const nativeLabel = selectedNativeDetailsTabLabel();
  if (nativeLabel) return nativeLabel;
  if (selectedDetailsTabHint && hintAge < 2500) return selectedDetailsTabHint;
  const activity = findVisibleTextElement("Attività") || findVisibleTextElement("Activity");
  if (activity && elementLooksSelected(activity)) return "Attività";
  return "";
};

const ACTIVITY_EMPTY_STATE_TEXTS = [
  "nessuna attività recente",
  "attività recente dagli sviluppatori",
  "dai tuoi amici",
  "no recent activity",
  "recent activity from developers",
  "from developers or your friends",
  "from the developers of this title or your friends",
];

const textLooksLikeActivityEmptyState = (value: string) => {
  const text = normalizedTabText(value);
  if (!text) return false;
  return ACTIVITY_EMPTY_STATE_TEXTS.some((needle) => text.includes(normalizedTabText(needle)));
};

const findActivityEmptyStateElement = () => {
  const body = document.body;
  if (!body) return null;
  try {
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = String(node.textContent || "");
          return textLooksLikeActivityEmptyState(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      } as any
    );
    let node: Node | null = walker.nextNode();
    while (node) {
      let element = (node.parentNode instanceof HTMLElement ? node.parentNode : null) as HTMLElement | null;
      while (element && element !== body) {
        if (visibleElement(element)) return element;
        element = (element as HTMLElement).parentElement as HTMLElement | null;
      }
      node = walker.nextNode();
    }
  } catch (_error) {
    // Fall back below.
  }
  const candidates = deepQuerySelectorAll("div, span, p, button, [role='tab'], [role='button']");
  return (candidates.find((element) => visibleElement(element) && textLooksLikeActivityEmptyState(textOf(element))) as HTMLElement | undefined) || null;
};

const findActivityEmptyStateContainer = () => {
  const leaf = findActivityEmptyStateElement();
  if (!leaf) return null;
  let current: HTMLElement | null = leaf;
  let best: HTMLElement | null = leaf;
  for (let depth = 0; current && current !== document.body && depth < 10; depth += 1) {
    const rect = current.getBoundingClientRect();
    const text = textOf(current);
    if (rect.width >= 260 && rect.height >= 28 && textLooksLikeActivityEmptyState(text) && text.length < 700) {
      best = current;
    }
    // Stop before swallowing the whole detail page / tab row.
    if (rect.width > window.innerWidth * 0.75 && rect.height > window.innerHeight * 0.55) break;
    current = current.parentElement;
  }
  return best;
};

const findActivityEmptyDropZone = (includeHidden = true) => {
  const tabRowBottom = findDetailsTabRow()?.getBoundingClientRect()?.bottom || Math.max(210, window.innerHeight * 0.27);
  const hiddenCandidates = includeHidden
    ? (deepQuerySelectorAll("[data-playhub-activity-empty-hidden='1']")
        .filter((element) => element instanceof HTMLElement) as HTMLElement[])
    : [];
  if (hiddenCandidates.length) {
    hiddenCandidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return hiddenCandidates[0];
  }
  const candidates = deepVisibleElements("div, section, article").filter((element) => {
    if (isPlayhubActivityNewsElement(element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < Math.min(520, window.innerWidth * 0.35)) return false;
    if (rect.height < 34 || rect.height > 240) return false;
    if (rect.top < tabRowBottom + 12 || rect.top > window.innerHeight * 0.82) return false;
    if (rect.left > window.innerWidth * 0.2 || rect.right < window.innerWidth * 0.55) return false;
    const style = window.getComputedStyle(element);
    const borderStyles = [
      style.borderTopStyle,
      style.borderRightStyle,
      style.borderBottomStyle,
      style.borderLeftStyle,
      style.outlineStyle,
    ].join(" ").toLowerCase();
    const borderWidths = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
      style.outlineWidth,
    ].map((value) => parseFloat(value || "0") || 0);
    const hasDashedBorder = /(dashed|dotted)/.test(borderStyles) && borderWidths.some((width) => width >= 1);
    if (!hasDashedBorder) return false;
    // Steam's Activity empty composer/state is a wide dashed panel directly under the tab row.
    // This is language-independent and works even when the localized text is not known.
    return true;
  });
  candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return (candidates[0] as HTMLElement | undefined) || null;
};

const steamActivityEmptyStateVisible = () => !!findSteamNativeActivityMountInfo() || !!findActivityEmptyStateElement() || !!findActivityEmptyDropZone(false);

const recentNonActivityTabSelection = () => {
  const now = Date.now();
  const indexAge = selectedDetailsTabIndexHintAt ? now - selectedDetailsTabIndexHintAt : Number.MAX_SAFE_INTEGER;
  if (selectedDetailsTabIndexHint > 0 && indexAge < 2 * 60 * 1000) return true;
  const labelAge = selectedDetailsTabHintAt ? now - selectedDetailsTabHintAt : Number.MAX_SAFE_INTEGER;
  if (selectedDetailsTabHint && selectedDetailsTabHint !== "Attività" && labelAge < 2 * 60 * 1000) return true;
  return false;
};

const isActivityTabActive = () => {
  if (recentNonActivityTabSelection()) return false;
  const label = activeDetailsTabLabel();
  if (label === "Attività") return true;
  if (label) return false;
  const nativeIndex = selectedNativeDetailsTabIndex();
  if (nativeIndex === 0) return true;
  if (nativeIndex > 0) return false;
  return false;
};

const restoreNativeActivityEmptyStates = () => {
  deepQuerySelectorAll("[data-playhub-activity-empty-hidden='1']").forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.style.removeProperty("display");
    element.style.removeProperty("visibility");
    element.style.removeProperty("opacity");
    element.style.removeProperty("color");
    element.style.removeProperty("background");
    element.style.removeProperty("border-color");
    element.style.removeProperty("outline-color");
    element.style.removeProperty("box-shadow");
    element.style.removeProperty("pointer-events");
    element.removeAttribute("data-playhub-activity-empty-hidden");
  });
};

const STEAM_ACTIVITY_NATIVE_CLASSES = {
  // Extracted from Andrea's current SteamUI bundle. These are not the only path,
  // but they let us mount inside Steam's real Activity feed instead of guessing
  // by translated strings or by geometry. If Steam updates them, the fixed-body
  // fallback below still keeps the news visible.
  activityFeedContainer: "_3yTl3RiWfo-Itg-xp967wP",
  innerContainer: "_2EEApFUXB7aWXBtitgV5dk",
  noActivity: "_2-kDc3UDR-GN6V1lBpSupb",
};

type ActivityNewsMountInfo = {
  target: HTMLElement;
  anchor: HTMLElement | null;
  mode: "native" | "fixed";
};

const classSelector = (className: string) => `.${String(className || "")}`;

const closestByClass = (element: HTMLElement | null, className: string): HTMLElement | null => {
  let current = element;
  while (current && current !== document.body) {
    if (current.classList?.contains(className)) return current;
    current = current.parentElement;
  }
  return null;
};

const findSteamNativeActivityMountInfo = (): ActivityNewsMountInfo | null => {
  const noActivity = deepVisibleElements(classSelector(STEAM_ACTIVITY_NATIVE_CLASSES.noActivity))
    .find((element) => element instanceof HTMLElement && element.getBoundingClientRect().width > 260) as HTMLElement | undefined;
  if (!noActivity) return null;
  const inner = closestByClass(noActivity, STEAM_ACTIVITY_NATIVE_CLASSES.innerContainer) || noActivity.parentElement;
  if (!inner) return null;
  return { target: inner, anchor: noActivity, mode: "native" };
};

const hideElementForActivityNews = (element: HTMLElement | null) => {
  if (!element) return null;
  element.setAttribute("data-playhub-activity-empty-hidden", "1");
  // Do not use display:none here. Steam's Activity pane is recycled heavily:
  // keeping the native empty panel measurable lets the Playhub overlay follow
  // the real Activity position while making the useless empty message vanish.
  element.style.setProperty("color", "transparent", "important");
  element.style.setProperty("background", "transparent", "important");
  element.style.setProperty("border-color", "transparent", "important");
  element.style.setProperty("outline-color", "transparent", "important");
  element.style.setProperty("box-shadow", "none", "important");
  element.style.setProperty("pointer-events", "none", "important");
  return element;
};

const hideNativeActivityEmptyState = () => {
  const native = findSteamNativeActivityMountInfo();
  if (native?.anchor) return hideElementForActivityNews(native.anchor);
  const container = findActivityEmptyDropZone() || findActivityEmptyStateContainer();
  return hideElementForActivityNews(container);
};

const findActivityNewsMountInfo = (): ActivityNewsMountInfo => {
  // Best path: use Steam's own empty Activity panel as an anchor. This is
  // language-independent and keeps the cards in the real scrolling Activity
  // layout instead of floating over the hero/header.
  const emptyAnchor = findActivityEmptyDropZone() || findActivityEmptyStateContainer();
  if (emptyAnchor?.parentElement) {
    return { target: emptyAnchor.parentElement, anchor: emptyAnchor, mode: "native" };
  }
  const native = findSteamNativeActivityMountInfo();
  if (native) return native;
  return { target: document.body, anchor: null, mode: "fixed" };
};

const mountActivityNewsRoot = (root: HTMLElement, mount: ActivityNewsMountInfo) => {
  const { target, anchor, mode } = mount;
  if (mode === "native" && anchor?.parentElement === target) {
    hideNativeActivityEmptyState();
    if (root.parentElement !== target) {
      target.insertBefore(root, anchor);
    } else if (root.nextElementSibling !== anchor) {
      target.insertBefore(root, anchor);
    }
    return;
  }

  // Last-resort path: keep the cards visible even when Steam changes the native
  // class names or the Activity pane is recycled by React before we can insert.
  hideNativeActivityEmptyState();
  if (!root.parentElement || root.parentElement !== target) target.appendChild(root);
};

const steamNewsNativeUrl = (url: string, steamAppId?: number | null, gid?: string | number | null) => {
  const rawUrl = String(url || "");
  const eventGid = numericSteamNewsGid(gid) || numericSteamNewsGid(rawUrl);
  const appId = Number(steamAppId || rawUrl.match(/news\/app\/(\d+)/i)?.[1] || rawUrl.match(/games\/(\d+)/i)?.[1] || 0);
  if (appId && eventGid) return `https://store.steampowered.com/news/app/${appId}/view/${eventGid}`;
  return rawUrl;
};

const openExternalActivityUrl = (url: string, steamAppId?: number | null, gid?: string | number | null) => {
  const target = steamNewsNativeUrl(url, steamAppId, gid);
  if (!target) return;
  try {
    const navigation = Navigation as any;
    // Prefer Steam's own in-client web viewer. Opening the system browser makes
    // these feel like ordinary webpages instead of native Steam news cards.
    if (typeof navigation?.NavigateToSteamWeb === "function") {
      navigation.NavigateToSteamWeb(target);
      return;
    }
    if (typeof navigation?.NavigateToExternalWeb === "function") {
      navigation.NavigateToExternalWeb(target);
      return;
    }
  } catch (_error) {
    // Fall through to SteamClient/browser fallbacks.
  }
  try {
    const steamClient = (window as any)?.SteamClient;
    if (steamClient?.Overlay?.OpenExternalBrowserURL) {
      steamClient.Overlay.OpenExternalBrowserURL(target);
      return;
    }
    if (steamClient?.System?.OpenInSystemBrowser) {
      steamClient.System.OpenInSystemBrowser(target);
      return;
    }
  } catch (_error) {
    // Browser fallback below.
  }
  window.open(target, "_blank", "noopener,noreferrer");
};

const steamNewsDateLabel = (date: number) => {
  const value = Number(date || 0) || Math.floor(Date.now() / 1000);
  const dt = new Date(value * 1000);
  const currentYear = new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions = dt.getFullYear() === currentYear
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };
  return dt.toLocaleDateString("it-IT", options);
};

const ensurePlayhubActivityStyle = () => {
  if (document.getElementById("playhub-activity-news-style")) return;
  const style = document.createElement("style");
  style.id = "playhub-activity-news-style";
  style.textContent = `
    .playhub-activity-news-root {
      z-index: 4;
      overflow: visible;
      padding: 0 0 80px;
      box-sizing: border-box;
      pointer-events: auto;
      isolation: isolate;
      color: rgba(255,255,255,0.92);
    }
    .playhub-activity-news-root.is-fixed {
      position: fixed;
      top: var(--playhub-activity-news-top, 150px);
      left: 48px;
      right: 48px;
      bottom: 24px;
      z-index: 2147483647;
      overflow-y: auto;
    }
    .playhub-activity-news-root.is-native {
      position: relative;
      width: 100%;
      max-width: none;
      min-height: 220px;
      margin: 18px 0 80px;
      flex: 0 0 auto;
      align-self: stretch;
    }
    .playhub-activity-news-root.is-fixed {
      background: linear-gradient(180deg, rgba(20,24,29,0.78), rgba(20,24,29,0.18));
      border-radius: 12px;
      padding: 0 0 80px;
    }
    .playhub-activity-news-day {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 16px;
      margin: 20px 0 12px;
      color: rgba(255,255,255,0.68);
      font-size: 17px;
      letter-spacing: 0.03em;
    }
    .playhub-activity-news-day::after {
      content: "";
      height: 1px;
      background: rgba(255,255,255,0.10);
    }
    .playhub-activity-news-card {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 24px;
      min-height: 172px;
      padding: 18px;
      margin: 0 0 24px;
      border-radius: 10px;
      background: rgba(48,55,63,0.58);
      box-sizing: border-box;
      cursor: pointer;
    }
    .playhub-activity-news-card:hover,
    .playhub-activity-news-card-focused {
      background: rgba(64,72,82,0.82) !important;
      box-shadow: 0 0 0 3px rgba(255,255,255,0.42), 0 16px 44px rgba(0,0,0,0.34);
      outline: none;
    }
    .playhub-activity-news-card.is-patch-note {
      grid-template-columns: 74px 1fr;
      gap: 20px;
      min-height: 132px;
      padding: 20px 22px;
      margin: 0 0 22px;
      background: rgba(42,49,57,0.80);
    }
    .playhub-activity-news-update-icon {
      width: 64px;
      height: 64px;
      align-self: center;
      color: rgba(255,255,255,0.52);
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 4px 14px rgba(0,0,0,0.22));
    }
    .playhub-activity-news-update-icon svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .playhub-activity-news-card.is-patch-note .playhub-activity-news-content {
      gap: 8px;
    }
    .playhub-activity-news-card.is-patch-note .playhub-activity-news-kind {
      font-size: 16px;
    }
    .playhub-activity-news-card.is-patch-note .playhub-activity-news-title {
      font-size: 24px;
      -webkit-line-clamp: 1;
    }
    .playhub-activity-news-card.is-patch-note .playhub-activity-news-summary {
      max-width: none;
      font-size: 17px;
      -webkit-line-clamp: 1;
    }
    .playhub-activity-news-image {
      width: 100%;
      height: 136px;
      border-radius: 6px;
      overflow: hidden;
      background: rgba(0,0,0,0.25);
      object-fit: cover;
      object-position: center;
      align-self: center;
    }
    .playhub-activity-news-image-fallback {
      width: 100%;
      height: 136px;
      border-radius: 6px;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 14px;
      box-sizing: border-box;
      color: rgba(255,255,255,0.55);
      background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
      font-size: 15px;
      line-height: 1.25;
    }
    .playhub-activity-news-content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
    }
    .playhub-activity-news-kind {
      color: rgba(255,255,255,0.62);
      font-size: 16px;
    }
    .playhub-activity-news-title {
      color: rgba(255,255,255,0.92);
      font-size: 24px;
      line-height: 1.18;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .playhub-activity-news-summary {
      max-width: 940px;
      color: rgba(255,255,255,0.58);
      font-size: 16px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .playhub-activity-news-debug {
      max-width: 980px;
      margin: 0 0 24px;
      padding: 18px 20px;
      border-radius: 10px;
      background: rgba(18,22,28,0.98);
      border: 2px solid rgba(90, 170, 255, 0.85);
      box-shadow: 0 12px 42px rgba(0,0,0,0.45);
      color: rgba(255,255,255,0.88);
      font-size: 15px;
      line-height: 1.45;
      box-sizing: border-box;
    }
    .playhub-activity-news-debug strong {
      display: block;
      color: rgba(255,255,255,0.94);
      font-size: 18px;
      margin-bottom: 8px;
    }
    .playhub-activity-news-debug code {
      color: rgba(255,255,255,0.92);
      background: rgba(0,0,0,0.22);
      padding: 1px 5px;
      border-radius: 4px;
    }
    .playhub-activity-news-root.is-fixed {
      top: var(--playhub-activity-news-top, 360px);
      left: var(--playhub-activity-news-left, 48px);
      right: var(--playhub-activity-news-right, 48px);
      bottom: 74px;
      z-index: 9000;
      background: transparent;
      border-radius: 0;
      padding: 0 0 90px;
      box-shadow: none;
    }
    .playhub-activity-news-root.is-native {
      background: transparent;
      padding: 0 0 90px;
      margin: 14px 0 90px;
      z-index: auto;
    }
    .playhub-activity-news-root.is-native .playhub-activity-news-card,
    .playhub-activity-news-root.is-fixed .playhub-activity-news-card {
      background: rgba(48,55,63,0.86);
    }
  `;
  document.head.appendChild(style);
};

type ActivityNewsDiagnostics = {
  status: string;
  tab: string;
  steamAppId?: number | null;
  newsCount?: number;
  metadataTitle?: string;
};

const activityNewsOverlayTop = () => {
  const empty = findActivityEmptyDropZone() || findActivityEmptyStateContainer();
  const emptyRect = empty?.getBoundingClientRect();
  if (emptyRect?.top) return Math.max(110, Math.round(emptyRect.top));
  const tabRow = findDetailsTabRow();
  const rect = tabRow?.getBoundingClientRect();
  return Math.max(110, Math.round((rect?.bottom || 132) + 96));
};

const activityNewsOverlayEdges = () => {
  const empty = findActivityEmptyDropZone() || findActivityEmptyStateContainer();
  const rect = empty?.getBoundingClientRect();
  if (rect?.width && rect.width > 320) {
    return {
      left: Math.max(46, Math.round(rect.left)),
      right: Math.max(46, Math.round(window.innerWidth - rect.right)),
    };
  }
  return { left: 48, right: 48 };
};

const activityNewsAnchorIsInViewport = () => {
  const anchor = findActivityEmptyDropZone() || findActivityEmptyStateContainer() || findSteamNativeActivityMountInfo()?.anchor || null;
  if (!anchor) return true;
  const rect = anchor.getBoundingClientRect();
  const tabBottom = findDetailsTabRow()?.getBoundingClientRect()?.bottom || 110;
  // When the native Activity empty panel has scrolled above the tab area, the
  // Playhub fixed overlay must disappear too. Otherwise it floats over other
  // Steam content and looks detached from the Activity feed.
  return rect.bottom > tabBottom + 8 && rect.top < window.innerHeight - 90;
};

const appendActivityDiagnostic = (root: HTMLElement, appId: number, diagnostic: ActivityNewsDiagnostics) => {
  const box = document.createElement("div");
  box.className = "playhub-activity-news-debug";

  const title = document.createElement("strong");
  title.textContent = "Playhub Metadata · Activity diagnostic";
  box.appendChild(title);

  const intro = document.createElement("div");
  intro.textContent = diagnostic.status;
  box.appendChild(intro);

  const fields: Array<[string, string]> = [
    ["Steam shortcut AppID", String(appId || "not detected")],
    ["Detected tab", diagnostic.tab || "not detected"],
    ["Empty Activity panel", findSteamNativeActivityMountInfo() ? "native Steam NoActivity class detected" : (findActivityEmptyDropZone() ? "wide dashed panel detected" : (findActivityEmptyStateElement() ? "localized text detected" : "not detected"))],
    ["Resolved Steam AppID", diagnostic.steamAppId ? String(diagnostic.steamAppId) : "not resolved"],
    ["Steam News found", String(diagnostic.newsCount ?? 0)],
  ];
  if (diagnostic.metadataTitle) fields.push(["Metadata title", diagnostic.metadataTitle]);

  fields.forEach(([label, value]) => {
    const line = document.createElement("div");
    line.append(`${label}: `);
    const code = document.createElement("code");
    code.textContent = value;
    line.appendChild(code);
    box.appendChild(line);
  });

  root.appendChild(box);
};

const activityNewsKindLabel = (item?: any) => {
  const type = normalizePlayhubSteamActivityType(item?.event_type || item?.type);
  if (type) return playhubSteamActivityTypeLabel(type);
  return String(navigator.language || "").toLowerCase().startsWith("it") ? "Notizie" : "News";
};

const patchNoteActivityIconSvg = () => `
  <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M38.8 7.9c4.5-1.6 9.8-.5 13.4 3.1 3.2 3.2 4.5 7.6 3.6 11.8l-8.1-8.1-8.3 8.3 8.2 8.2c-4.2.9-8.7-.4-11.9-3.6-3.7-3.7-4.8-9-3.1-13.5L10.4 36.3c-3.1 3.1-3.1 8.2 0 11.3l5.9 5.9c3.1 3.1 8.2 3.1 11.3 0l22.1-22.1-5.2-5.2-21.9 21.9c-.9.9-2.3.9-3.2 0l-3.6-3.6c-.9-.9-.9-2.3 0-3.2L38.8 7.9Z"/>
    <path fill="currentColor" d="M13.3 10.2 7.6 15.9l12.2 12.2 5.7-5.7-3.1-3.1 4.7-4.7-3.9-3.9-4.7 4.7-5.2-5.2Z" opacity=".82"/>
    <path fill="currentColor" d="M43.2 37.1 37.5 42.8 50.4 55.7c1.6 1.6 4.2 1.6 5.8 0 1.6-1.6 1.6-4.2 0-5.8L43.2 37.1Z" opacity=".82"/>
  </svg>
`;

const patchNoteActivityIconReact = () =>
  React.createElement(
    "svg",
    { viewBox: "0 0 64 64", "aria-hidden": "true", focusable: "false", style: { width: "100%", height: "100%" } },
    React.createElement("path", { fill: "currentColor", d: "M38.8 7.9c4.5-1.6 9.8-.5 13.4 3.1 3.2 3.2 4.5 7.6 3.6 11.8l-8.1-8.1-8.3 8.3 8.2 8.2c-4.2.9-8.7-.4-11.9-3.6-3.7-3.7-4.8-9-3.1-13.5L10.4 36.3c-3.1 3.1-3.1 8.2 0 11.3l5.9 5.9c3.1 3.1 8.2 3.1 11.3 0l22.1-22.1-5.2-5.2-21.9 21.9c-.9.9-2.3.9-3.2 0l-3.6-3.6c-.9-.9-.9-2.3 0-3.2L38.8 7.9Z" }),
    React.createElement("path", { fill: "currentColor", opacity: ".82", d: "M13.3 10.2 7.6 15.9l12.2 12.2 5.7-5.7-3.1-3.1 4.7-4.7-3.9-3.9-4.7 4.7-5.2-5.2Z" }),
    React.createElement("path", { fill: "currentColor", opacity: ".82", d: "M43.2 37.1 37.5 42.8 50.4 55.7c1.6 1.6 4.2 1.6 5.8 0 1.6-1.6 1.6-4.2 0-5.8L43.2 37.1Z" })
  );

const normalizeSteamNewsImageUrl = (value: unknown, _steamAppId?: number | null) => {
  let url = String(value || "").trim().replace(/\\\//g, "/");
  try {
    url = decodeURIComponent(url);
  } catch (_error) {
    // Keep original URL if it is not URI-encoded.
  }
  const clan = url.match(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/(\d+)\/([^\s<>\)\]\[]+)/i);
  if (clan) return `https://clan.cloudflare.steamstatic.com/images/${clan[1]}/${clan[2]}`;
  if (url.startsWith("//")) return `https:${url}`;
  if (/^http:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  if (/^https:\/\//i.test(url)) return url;
  return "";
};

const renderPlayhubActivityNewsDom = (
  appId: number,
  metadata: MetadataData | null,
  diagnostic?: ActivityNewsDiagnostics
) => {
  const reactOverlay = document.getElementById("playhub-activity-news-overlay");
  if (reactOverlay) {
    document.getElementById("playhub-activity-news-root")?.remove();
    return;
  }
  const items = metadata ? steamActivityNewsItemsFromMetadata(appId, metadata) : [];
  const existing = document.getElementById("playhub-activity-news-root");
  if (!items.length && !diagnostic) {
    existing?.remove();
    return;
  }

  ensurePlayhubActivityStyle();
  const mount = findActivityNewsMountInfo();
  const root = existing || document.createElement("div");
  root.id = "playhub-activity-news-root";
  root.className = `playhub-activity-news-root ${mount.mode === "native" ? "is-native" : "is-fixed"}`;
  root.setAttribute("data-playhub-activity-news", "1");
  root.setAttribute("data-playhub-appid", String(appId));
  root.setAttribute("data-playhub-mount", mount.mode === "native" ? "activity-empty-panel-inline" : "fixed-body-fallback");
  const fixedEdges = activityNewsOverlayEdges();
  root.style.setProperty("--playhub-activity-news-top", `${activityNewsOverlayTop()}px`);
  root.style.setProperty("--playhub-activity-news-left", `${fixedEdges.left}px`);
  root.style.setProperty("--playhub-activity-news-right", `${fixedEdges.right}px`);
  root.innerHTML = "";

  if (!items.length && diagnostic) {
    appendActivityDiagnostic(root, appId, diagnostic);
  }

  let lastDate = "";
  items.forEach((item) => {
    const dateLabel = steamNewsDateLabel(Number(item.date || item.time_created || 0));
    if (dateLabel !== lastDate) {
      lastDate = dateLabel;
      const day = document.createElement("div");
      day.className = "playhub-activity-news-day";
      day.textContent = dateLabel;
      root.appendChild(day);
    }

    const isPatchNote = isPlayhubPatchNoteActivity(item);
    const card = document.createElement("div");
    card.className = `playhub-activity-news-card${isPatchNote ? " is-patch-note" : ""}`;
    card.tabIndex = 0;
    card.setAttribute("data-focusable", "true");
    card.setAttribute("role", "button");
    const activateCard = () => openExternalActivityUrl(String(item.url || item.external_url || item.link || ""), metadata?.steam_appid || null, item.gid || item.id || item.news_id);
    card.onclick = activateCard;
    card.onfocus = () => card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    card.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateCard();
      }
    };

    const content = document.createElement("div");
    content.className = "playhub-activity-news-content";
    const kind = document.createElement("div");
    kind.className = "playhub-activity-news-kind";
    kind.textContent = activityNewsKindLabel(item);
    const title = document.createElement("div");
    title.className = "playhub-activity-news-title";
    title.textContent = cleanSteamNewsDisplayText(item.title || item.event_name || "");
    content.append(kind, title);
    const summaryText = isPatchNote ? "" : cleanSteamNewsDisplayText(item.summary || item.description || "");
    if (summaryText) {
      const summary = document.createElement("div");
      summary.className = "playhub-activity-news-summary";
      summary.textContent = summaryText;
      content.appendChild(summary);
    }

    if (isPatchNote) {
      const icon = document.createElement("div");
      icon.className = "playhub-activity-news-update-icon";
      icon.innerHTML = patchNoteActivityIconSvg();
      card.append(icon, content);
    } else {
      const imageWrap = document.createElement("div");
      imageWrap.style.width = "100%";
      imageWrap.style.height = "136px";
      imageWrap.style.overflow = "hidden";
      imageWrap.style.borderRadius = "6px";
      imageWrap.style.alignSelf = "center";
      const primaryImage = normalizeSteamNewsImageUrl(item.event_image_url || item.image_url || item.image || item.preview_image_url, metadata?.steam_appid || null);
      const fallbackHeader = normalizeSteamNewsImageUrl(item.fallback_image_url || item.header_image_url, metadata?.steam_appid || null);
      const displayImage = primaryImage || fallbackHeader;
      const image = document.createElement("img");
      image.className = "playhub-activity-news-image";
      image.referrerPolicy = "no-referrer";
      image.loading = "lazy";
      const imageFallback = document.createElement("div");
      imageFallback.className = "playhub-activity-news-image-fallback";
      imageFallback.textContent = metadata?.title || "Steam News";
      image.onerror = () => {
        if (fallbackHeader && image.src !== fallbackHeader) {
          image.src = fallbackHeader;
          return;
        }
        image.style.display = "none";
        imageFallback.style.display = "flex";
      };
      if (displayImage) {
        image.src = displayImage;
      } else {
        image.style.display = "none";
        imageFallback.style.display = "flex";
      }
      imageWrap.append(image, imageFallback);
      card.append(imageWrap, content);
    }
    root.appendChild(card);
  });

  mountActivityNewsRoot(root, mount);
};

const removePlayhubActivityNewsDom = () => {
  document.getElementById("playhub-activity-news-root")?.remove();
  restoreNativeActivityEmptyStates();
};


const refreshPlayhubActivityNewsDom = async () => {
  const appId = currentGameDetailAppId();
  const detectedTab = activeDetailsTabLabel();
  const activityVisible = isActivityTabActive() && activityNewsAnchorIsInViewport();
  const tab = activityVisible ? "Attività" : detectedTab;
  if (!activityVisible) {
    removePlayhubActivityNewsDom();
    return;
  }
  if (!appId) {
    removePlayhubActivityNewsDom();
    return;
  }
  const overview = getOverview(appId);
  if (!isNonSteamApp(overview)) {
    removePlayhubActivityNewsDom();
    return;
  }

  await ensureMetadataCache();
  let metadata = metadataCache[String(appId)] || null;
  if (!metadata) {
    removePlayhubActivityNewsDom();
    await tryFetchMetadataForApp(appId);
    metadata = metadataCache[String(appId)] || null;
  }
  if (!metadata) {
    removePlayhubActivityNewsDom();
    return;
  }

  const newsCount = metadata.steam_news?.length || 0;
  if (!newsCount) {
    removePlayhubActivityNewsDom();
    return;
  }
  renderPlayhubActivityNewsDom(appId, metadata);
};

const installActivityNewsDomPatch = (unpatchers: Unpatch[]) => {
  let cancelled = false;
  let timer: number | undefined;
  const schedule = (delay = 150) => {
    if (cancelled) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (cancelled) return;
      void refreshPlayhubActivityNewsDom().catch((error) => {
        log.warn("patch", "activity news DOM patch failed", error);
      });
    }, delay);
  };
  const clickTracker = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const label = detailsTabLabelFromElement(target);
    const pointerIndex = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? detailsTabIndexFromPoint(event.clientX, event.clientY)
      : -1;
    const elementIndex = detailsTabIndexFromElement(target);
    const tabIndex = pointerIndex >= 0 ? pointerIndex : elementIndex;
    if (tabIndex >= 0) noteDetailsTabIndexSelection(tabIndex);
    if (label) noteDetailsTabSelection(label);
    if (label === "Attività" || tabIndex === 0) {
      const appId = currentGameDetailAppId();
      const quickMetadata = metadataCache[String(appId || 0)] || null;
      if (quickMetadata?.steam_news?.length) renderPlayhubActivityNewsDom(appId || 0, quickMetadata);
    }
    schedule(label || tabIndex >= 0 ? 35 : 120);
  };
  const observer = new MutationObserver(() => schedule(250));
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", clickTracker, true);
  document.addEventListener("pointerup", clickTracker as any, true);
  document.addEventListener("focusin", clickTracker as any, true);
  document.addEventListener("keyup", clickTracker as any, true);
  const popstateListener = () => schedule(50);
  const hashchangeListener = () => schedule(50);
  window.addEventListener("popstate", popstateListener);
  window.addEventListener("hashchange", hashchangeListener);
  window.addEventListener("playhub-metadata:updated", popstateListener);
  const interval = window.setInterval(() => schedule(0), 500);
  schedule(350);
  unpatchers.push(() => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
    window.clearInterval(interval);
    observer.disconnect();
    document.removeEventListener("click", clickTracker, true);
    document.removeEventListener("pointerup", clickTracker as any, true);
    document.removeEventListener("focusin", clickTracker as any, true);
    document.removeEventListener("keyup", clickTracker as any, true);
    window.removeEventListener("popstate", popstateListener);
    window.removeEventListener("hashchange", hashchangeListener);
    window.removeEventListener("playhub-metadata:updated", popstateListener);
    removePlayhubActivityNewsDom();
  });
};

const PlayhubActivityNewsOverlay = ({ appId, force = false, source = "route" }: { appId: number; force?: boolean; source?: "route" | "empty" }) => {
  const ownerId = React.useMemo(() => `playhub-activity-${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`, []);
  const priority = source === "empty" ? 20 : (force ? 10 : 5);
  const [owned, setOwned] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [metadata, setMetadata] = React.useState<MetadataData | null>(() => metadataCache[String(appId)] || null);
  const [top, setTop] = React.useState(132);

  const claimOverlayOwnership = React.useCallback(() => {
    const host = window as any;
    const now = Date.now();
    const current = host.__playhubActivityOverlayOwner as { id?: string; priority?: number; touched?: number } | undefined;
    const stale = !current?.touched || now - Number(current.touched || 0) > 2500;
    if (!current?.id || current.id === ownerId || stale || Number(current.priority || 0) <= priority) {
      host.__playhubActivityOverlayOwner = { id: ownerId, priority, touched: now };
      setOwned(true);
      return true;
    }
    setOwned(false);
    return false;
  }, [ownerId, priority]);

  React.useEffect(() => {
    claimOverlayOwnership();
    const timer = window.setInterval(() => claimOverlayOwnership(), 900);
    return () => {
      window.clearInterval(timer);
      const host = window as any;
      if (host.__playhubActivityOverlayOwner?.id === ownerId) {
        host.__playhubActivityOverlayOwner = null;
      }
    };
  }, [claimOverlayOwnership, ownerId]);

  React.useEffect(() => {
    if (owned) removePlayhubActivityNewsDom();
  }, [owned]);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      const currentAppId = currentGameDetailAppId();
      const shortcutMatches = !currentAppId || currentAppId === Number(appId);
      const indexHintAge = selectedDetailsTabIndexHintAt ? Date.now() - selectedDetailsTabIndexHintAt : Number.MAX_SAFE_INTEGER;
      const recentlyClickedFirstTab = selectedDetailsTabIndexHint === 0 && indexHintAge < 1800;
      const activityVisible = !recentNonActivityTabSelection() && (isActivityTabActive() || recentlyClickedFirstTab);
      const inViewport = activityNewsAnchorIsInViewport();
      const isActive = (force ? activityVisible : (shortcutMatches && activityVisible)) && inViewport;
      const hasOwnership = claimOverlayOwnership();
      setActive(isActive && hasOwnership);
      if (!isActive) restoreNativeActivityEmptyStates();
      const desiredTop = activityNewsOverlayTop();
      const clampedTop = Math.max(220, Math.min(Math.round(desiredTop), Math.max(260, window.innerHeight - 260)));
      setTop(clampedTop);
      if (!isActive || !hasOwnership) return;
      await ensureMetadataCache();
      let next = metadataCache[String(appId)] || null;
      if (!cancelled) setMetadata(next);
    };
    const updateListener = () => void refresh().catch((error) => log.warn("patch", "activity overlay refresh failed", error));
    const clickListener = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const label = detailsTabLabelFromElement(target);
      const pointerIndex = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? detailsTabIndexFromPoint(event.clientX, event.clientY)
        : -1;
      const elementIndex = detailsTabIndexFromElement(target);
      const tabIndex = pointerIndex >= 0 ? pointerIndex : elementIndex;
      if (tabIndex >= 0) noteDetailsTabIndexSelection(tabIndex);
      if (label) noteDetailsTabSelection(label);
      void refresh().catch((error) => log.warn("patch", "activity overlay click refresh failed", error));
    };
    const timer = window.setInterval(updateListener, 750);
    window.addEventListener("playhub-metadata:updated", updateListener);
    document.addEventListener("click", clickListener, true);
    window.addEventListener("scroll", updateListener, true);
    document.addEventListener("wheel", updateListener, true);
    void refresh().catch((error) => log.warn("patch", "activity overlay initial refresh failed", error));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("playhub-metadata:updated", updateListener);
      document.removeEventListener("click", clickListener, true);
      window.removeEventListener("scroll", updateListener, true);
      document.removeEventListener("wheel", updateListener, true);
      restoreNativeActivityEmptyStates();
    };
  }, [appId]);

  if (!active || !owned) return null;
  const items = metadata ? steamActivityNewsItemsFromMetadata(appId, metadata) : [];
  if (!items.length) {
    restoreNativeActivityEmptyStates();
    return null;
  }
  hideNativeActivityEmptyState();

  let lastDate = "";
  const children: any[] = [];
  items.forEach((item) => {
    const dateLabel = steamNewsDateLabel(Number(item.date || item.time_created || 0));
    if (dateLabel !== lastDate) {
      lastDate = dateLabel;
      children.push(
        React.createElement(
          "div",
          {
            key: `date-${dateLabel}`,
            style: {
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              alignItems: "center",
              gap: 16,
              margin: "18px 0 12px",
              color: "rgba(255,255,255,0.68)",
              fontSize: 17,
              letterSpacing: "0.03em",
            },
          },
          React.createElement("span", null, dateLabel),
          React.createElement("div", { style: { height: 1, background: "rgba(255,255,255,0.10)" } })
        )
      );
    }
    const isPatchNote = isPlayhubPatchNoteActivity(item);
    const imageUrl = normalizeSteamNewsImageUrl(item.event_image_url || item.image_url || item.image || item.preview_image_url, metadata?.steam_appid || null);
    const fallbackImageUrl = normalizeSteamNewsImageUrl(item.fallback_image_url || item.header_image_url, metadata?.steam_appid || null);
    const displayImageUrl = imageUrl || fallbackImageUrl;
    const url = String(item.url || item.external_url || item.link || "");
    const visual = isPatchNote
      ? React.createElement("div", {
          className: "playhub-activity-news-update-icon",
          style: {
            width: 64,
            height: 64,
            alignSelf: "center",
            color: "rgba(255,255,255,0.52)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }, patchNoteActivityIconReact())
      : (displayImageUrl
          ? React.createElement("img", {
              src: displayImageUrl,
              referrerPolicy: "no-referrer",
              loading: "lazy",
              onError: (event: any) => {
                const img = event.currentTarget as HTMLImageElement;
                if (fallbackImageUrl && img.src !== fallbackImageUrl) {
                  img.src = fallbackImageUrl;
                  return;
                }
                img.style.display = "none";
                const fallback = img.parentElement?.querySelector?.(".playhub-activity-react-image-fallback") as HTMLElement | null;
                if (fallback) fallback.style.display = "flex";
              },
              style: {
                width: "100%",
                height: 136,
                borderRadius: 6,
                objectFit: "cover",
                objectPosition: "center",
                alignSelf: "center",
                background: "rgba(0,0,0,0.25)",
              },
            })
          : React.createElement("div", {
              className: "playhub-activity-react-image-fallback",
              style: {
                width: "100%",
                height: 136,
                borderRadius: 6,
                alignSelf: "center",
                background: "rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.42)",
                fontSize: 14,
              },
            }, "News"));
    children.push(
      React.createElement(
        Focusable as any,
        {
          key: String(item.id || item.gid || item.news_id),
          className: `playhub-activity-news-card${isPatchNote ? " is-patch-note" : ""}`,
          focusClassName: "playhub-activity-news-card-focused",
          "data-playhub-activity-news-card": "1",
          onActivate: () => openExternalActivityUrl(url, metadata?.steam_appid || null, item.gid || item.id || item.news_id),
          onClick: () => openExternalActivityUrl(url, metadata?.steam_appid || null, item.gid || item.id || item.news_id),
          onFocus: (event: any) => event.currentTarget?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }),
          onKeyDown: (event: any) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openExternalActivityUrl(url, metadata?.steam_appid || null, item.gid || item.id || item.news_id);
            }
          },
          style: {
            display: "grid",
            gridTemplateColumns: isPatchNote ? "74px 1fr" : "320px 1fr",
            gap: isPatchNote ? 20 : 24,
            minHeight: isPatchNote ? 132 : 172,
            padding: isPatchNote ? "20px 22px" : 18,
            margin: isPatchNote ? "0 0 22px" : "0 0 24px",
            borderRadius: 10,
            background: isPatchNote ? "rgba(42,49,57,0.80)" : "rgba(48,55,63,0.86)",
            boxSizing: "border-box",
            cursor: url ? "pointer" : "default",
          },
        },
        visual,
        React.createElement(
          "div",
          { style: { minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: isPatchNote ? 8 : 10 } },
          React.createElement("div", { style: { color: "rgba(255,255,255,0.62)", fontSize: 16 } }, activityNewsKindLabel(item)),
          React.createElement(
            "div",
            {
              style: {
                color: "rgba(255,255,255,0.92)",
                fontSize: 24,
                lineHeight: 1.18,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: isPatchNote ? 1 : 2,
                WebkitBoxOrient: "vertical",
              },
            },
            cleanSteamNewsDisplayText(item.title || item.event_name || "")
          ),
          ...(!isPatchNote && cleanSteamNewsDisplayText(item.summary || item.description || "")
            ? [React.createElement(
                "div",
                {
                  style: {
                    maxWidth: 940,
                    color: "rgba(255,255,255,0.58)",
                    fontSize: 16,
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  },
                },
                cleanSteamNewsDisplayText(item.summary || item.description || "")
              )]
            : [])
        )
      )
    );
  });

  const integrated = source === "empty";
  const overlayStyle = integrated
    ? {
        position: "relative",
        zIndex: 2,
        width: "100%",
        maxWidth: "none",
        margin: "18px 0 80px",
        padding: "0 0 24px",
        overflow: "visible",
        pointerEvents: "auto",
      }
    : {
        position: "fixed",
        top,
        left: 48,
        right: 48,
        bottom: 24,
        zIndex: 9000,
        overflowY: "auto",
        overscrollBehavior: "contain",
        scrollPaddingTop: 18,
        paddingTop: 2,
        paddingBottom: 80,
        pointerEvents: "auto",
      };

  return React.createElement(
    "div",
    {
      id: "playhub-activity-news-overlay",
      "data-playhub-activity-news": "1",
      "data-playhub-source": source,
      "data-playhub-integrated": integrated ? "1" : "0",
      tabIndex: -1,
      style: overlayStyle,
    },
    children
  );
};

const reactChildrenText = (value: any): string => {
  if (value === null || value === undefined || value === false) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(reactChildrenText).join(" ");
  if (typeof value === "object") return reactChildrenText(value.props?.children);
  return "";
};

const installActivityEmptyStateReactPatch = (unpatchers: Unpatch[]) => {
  const reactAny = React as any;
  const originalCreateElement = reactAny.createElement;
  if (typeof originalCreateElement !== "function" || originalCreateElement.__playhubActivityPatched) return;
  let guard = false;
  const patched = function patchedPlayhubActivityCreateElement(this: any, type: any, props: any, ...children: any[]) {
    const element = originalCreateElement.apply(this, [type, props, ...children]);
    if (guard) return element;
    try {
      const appId = currentGameDetailAppId() || lastObservedGameDetailAppId;
      if (!appId || !isNonSteamApp(getOverview(appId))) return element;
      const text = reactChildrenText(children.length ? children : props?.children);
      // This is not the primary localization path; it is an extra trap for the
      // native Activity empty-state React node when Steam exposes only React
      // children and not a stable route/DOM state.
      if (!textLooksLikeActivityEmptyState(text)) return element;
      if (recentNonActivityTabSelection()) return element;
      guard = true;
      noteDetailsTabSelection("Attività");
      noteDetailsTabIndexSelection(0);
      return originalCreateElement(
        React.Fragment,
        null,
        element,
        originalCreateElement(PlayhubActivityNewsOverlay, { appId, force: true, source: "empty" })
      );
    } catch (_error) {
      return element;
    } finally {
      guard = false;
    }
  };
  patched.__playhubActivityPatched = true;
  patched.__playhubActivityOriginal = originalCreateElement;
  reactAny.createElement = patched;
  unpatchers.push(() => {
    if (reactAny.createElement === patched) reactAny.createElement = originalCreateElement;
  });
};

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
  if (!metadata?.community_enriched_at || (!metadata?.steam_news_enriched_at && !(metadata?.steam_news || []).length)) {
    await tryEnrichCommunityMediaForApp(appId);
    metadata = metadataCache[String(appId)];
  }
  const hub = metadata ? steamCommunityItemsFromMetadata(appId, metadata) : [];
  return hub.length ? { hub } : null;
};


const achievementSortTimestamp = (item: SteamAchievement | any) => Number(item?.rtUnlocked || 0);

const achievementDisplayName = (item: SteamAchievement | any) => String(item?.strName || item?.name || "");

const sortAchievementsForMyAchievements = (items: SteamAchievement[]) =>
  items.slice().sort((a, b) => {
    const achievedDiff = Number(Boolean(b?.bAchieved)) - Number(Boolean(a?.bAchieved));
    if (achievedDiff) return achievedDiff;
    const dateDiff = achievementSortTimestamp(b) - achievementSortTimestamp(a);
    if (dateDiff) return dateDiff;
    return achievementDisplayName(a).localeCompare(achievementDisplayName(b));
  });

const orderedAchievementRecord = (record: Record<string, SteamAchievement> | undefined) => {
  const out: Record<string, SteamAchievement> = {};
  sortAchievementsForMyAchievements(Object.values(record || {})).forEach((item) => {
    const key = String(item?.strID || item?.strName || "");
    if (key) out[key] = item;
  });
  return out;
};

const sortedAchievementPayloadForNative = (payload: AchievementsResponse): AchievementsResponse => {
  const userData = payload.user?.data;
  const sortedAchieved = orderedAchievementRecord(userData?.achieved as any);
  const sortedHidden = orderedAchievementRecord(userData?.hidden as any);
  const sortedUnachieved = orderedAchievementRecord(userData?.unachieved as any);
  const achievedList = Object.values(sortedAchieved);
  const hiddenList = Object.values(sortedHidden);
  const unachievedList = Object.values(sortedUnachieved);
  return {
    ...payload,
    user: payload.user
      ? {
          ...payload.user,
          data: {
            achieved: sortedAchieved,
            hidden: sortedHidden,
            unachieved: sortedUnachieved,
          },
        }
      : payload.user,
    steam: payload.steam
      ? {
          ...payload.steam,
          vecHighlight: sortAchievementsForMyAchievements([
            ...(payload.steam.vecHighlight || []),
            ...achievedList,
          ]).filter((item, index, list) =>
            list.findIndex((candidate) => candidate.strID === item.strID) === index
          ).slice(0, Math.max(3, Math.min(12, achievedList.length || 3))),
          vecAchievedHidden: sortAchievementsForMyAchievements(hiddenList),
          vecUnachieved: sortAchievementsForMyAchievements(unachievedList),
        }
      : payload.steam,
  };
};

const backgroundPolicyIntervalMs = (policy?: string) => {
  switch (policy) {
    case "hourly":
      return 60 * 60 * 1000;
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
};

const backgroundSyncLastKey = (policy: string) => `${BACKGROUND_SYNC_LOCAL_PREFIX}:${policy}`;

const backgroundAchievementSyncIsDue = (policy: string) => {
  if (policy === "manual") return false;
  if (policy === "pc_session") {
    try {
      return sessionStorage.getItem(BACKGROUND_SYNC_SESSION_KEY) !== "done";
    } catch (_error) {
      return true;
    }
  }
  const interval = backgroundPolicyIntervalMs(policy);
  if (!interval) return false;
  try {
    const last = Number(localStorage.getItem(backgroundSyncLastKey(policy)) || 0);
    return !last || Date.now() - last >= interval;
  } catch (_error) {
    return true;
  }
};

const markBackgroundAchievementSyncDone = (policy: string) => {
  try {
    if (policy === "pc_session") sessionStorage.setItem(BACKGROUND_SYNC_SESSION_KEY, "done");
    else localStorage.setItem(backgroundSyncLastKey(policy), String(Date.now()));
  } catch (_error) {
    // Storage can be unavailable in some embedded Steam contexts.
  }
};

const scheduledAchievementTargets = async (settings: AchievementSettings) => {
  const games = await allNonSteamGames();
  const targets: { appid: number; name: string; provider: "xbox" | "retroachievements" }[] = [];
  const sources = settings.achievement_sources || {};
  const raIds = settings.retroachievements?.game_ids || {};
  const xboxIds = settings.xbox?.title_ids || {};
  for (const game of games) {
    const key = String(game.appid);
    const source = sources[key] || "auto";
    if (source === "disabled") continue;
    const hasXbox = Boolean(xboxIds[key]);
    const hasRa = Boolean(raIds[key]);
    if ((source === "xbox" || (source === "auto" && hasXbox)) && hasXbox && isUwphookGameOption(game)) {
      targets.push({ appid: game.appid, name: game.name, provider: "xbox" });
      continue;
    }
    if ((source === "retroachievements" || (source === "auto" && !hasXbox && hasRa)) && hasRa) {
      targets.push({ appid: game.appid, name: game.name, provider: "retroachievements" });
    }
  }
  return targets;
};

const runBackgroundAchievementSync = async (reason = "scheduled") => {
  if (backgroundAchievementSyncRunning) return;
  backgroundAchievementSyncRunning = true;
  let policy = "daily";
  let updated = 0;
  let skipped = 0;
  try {
    const settings = await refreshRaSettings();
    policy = settings?.achievement_cache?.policy || "daily";
    if (!backgroundAchievementSyncIsDue(policy)) return;
    const targets = await scheduledAchievementTargets(settings);
    toaster.toast({
      title: t("pluginName"),
      body: `${t("backgroundSyncStarted")}: ${targets.length}`,
    });
    for (const target of targets) {
      try {
        const payload = target.provider === "xbox"
          ? ((await syncTrueAchievementsProgress(target.appid)) || (await fetchAchievements(target.appid)))
          : await fetchAchievements(target.appid);
        if (payload?.steam?.nTotal) {
          applyAchievementPayload(target.appid, payload);
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        skipped += 1;
        log.warn("achievements", "background achievement sync failed", target.name, error);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    markBackgroundAchievementSyncDone(policy);
    toaster.toast({
      title: t("pluginName"),
      body: `${t("backgroundSyncFinished")}: ${updated} ${t("backgroundSyncUpdated")}, ${skipped} ${t("backgroundSyncSkipped")}`,
    });
  } catch (error) {
    toaster.toast({ title: t("pluginName"), body: `${t("backgroundSyncFailed")}: ${String(error)}` });
  } finally {
    backgroundAchievementSyncRunning = false;
  }
};

export const startBackgroundAchievementSync = (): Unpatch => {
  if (backgroundAchievementSyncTimer) window.clearInterval(backgroundAchievementSyncTimer);
  const run = () => void runBackgroundAchievementSync("timer");
  const initial = window.setTimeout(run, BACKGROUND_SYNC_INITIAL_DELAY_MS);
  backgroundAchievementSyncTimer = window.setInterval(run, BACKGROUND_SYNC_CHECK_MS);
  return () => {
    window.clearTimeout(initial);
    if (backgroundAchievementSyncTimer) window.clearInterval(backgroundAchievementSyncTimer);
    backgroundAchievementSyncTimer = undefined;
  };
};

export const applyAchievementPayload = (
  appId: number,
  payload: AchievementsResponse | null
) => {
  if (!payload?.steam?.nTotal) return;
  const sortedPayload = sortedAchievementPayloadForNative(payload);
  clearAchievementStoreMapsForApp(appId);
  achievementsCache[String(appId)] = sortedPayload;
  if (steamAchievementStoreRef) primeAchievementStore(steamAchievementStoreRef, appId, sortedPayload);
  const appData = appDetailsStore?.GetAppData?.(appId);
  if (appData?.details) {
    appData.details.achievements = sortedPayload.steam;
    appData.bLoadingAchievments = false;
  }
  try {
    appDetailsCache?.SetCachedDataForApp?.(
      appId,
      "achievements",
      2,
      sortedPayload.steam
    );
  } catch (_error) {
    // Best effort, same cache route used by Steam.
  }
  try {
    if (appAchievementProgressCache?.m_achievementProgress) {
      appAchievementProgressCache.m_achievementProgress.mapCache.set(appId, {
        all_unlocked: sortedPayload.progress.achieved === sortedPayload.progress.total,
        appid: appId,
        cache_time: Date.now(),
        percentage: sortedPayload.progress.percentage,
        total: sortedPayload.progress.total,
        unlocked: sortedPayload.progress.achieved,
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
    log.warn("achievements", "failed to clear achievement store maps", error);
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
    log.warn("achievements", "failed to flush stale achievement cache", error);
  }
};

const primeAchievementStore = (store: any, appId: number, payload: AchievementsResponse | null) => {
  if (!payload) return;
  const sortedPayload = sortedAchievementPayloadForNative(payload);
  try {
    const keys = [appId, String(appId)];
    for (const key of keys) {
      if (sortedPayload.global) {
        store?.m_mapGlobalAchievements?.set?.(key, sortedPayload.global);
        store?.m_mapGlobalAchievementPercentages?.set?.(key, sortedPayload.global);
        store?.m_mapAchievementPercentages?.set?.(key, sortedPayload.global);
      }
      if (sortedPayload.user) {
        store?.m_mapMyAchievements?.set?.(key, sortedPayload.user);
        store?.m_mapAchievements?.set?.(key, sortedPayload.user);
      }
    }
  } catch (error) {
    log.warn("achievements", "failed to prime achievement store", error);
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
    log.warn("bridge", "screenshot enrichment failed", error);
  } finally {
    loadingScreenshots.delete(appId);
  }
};

export const tryEnrichCommunityMediaForApp = async (appId: number) => {
  await ensureMetadataCache();
  const metadata = metadataCache[String(appId)];
  const enrichedRecently =
    metadata?.community_enriched_at &&
    metadata?.steam_news_enriched_at &&
    Date.now() / 1000 - Number(metadata.community_enriched_at) < 7 * 24 * 60 * 60 &&
    Date.now() / 1000 - Number(metadata.steam_news_enriched_at) < 6 * 60 * 60;
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
      void refreshPlayhubNativeActivityForApp(appId);
      window.dispatchEvent(new Event("playhub-metadata:updated"));
    }
  } catch (error) {
    log.warn("bridge", "community media enrichment failed", error);
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

  const capabilities = await getPlatformCapabilities();
  const isXboxAutoDetect = !hasXboxMatch && (source === "xbox" || source === "auto");
  if (isXboxAutoDetect && !capabilities?.supports_xbox_uwphook_auto && !settings?.retroachievements?.enabled) {
    return null;
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
        const resolvedPayload = await resolveRetroAchievementsFromPath(
          appId,
          launchPath,
          appName(appId)
        );
        if (resolvedPayload?.steam) {
          payload = resolvedPayload as AchievementsResponse;
        }
      }
    }
    if (payload) applyAchievementPayload(appId, payload);
    return payload || achievementsCache[String(appId)] || null;
  } catch (error) {
    log.error("achievements", "achievements fetch failed", error);
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

const firstUrlishArgIndex = (args: any[], firstOnly = false): number => {
  const limit = firstOnly ? Math.min(args.length, 1) : args.length;
  for (let index = 0; index < limit; index += 1) {
    const value = args[index];
    if (typeof value === "string") return index;
    if (typeof URL !== "undefined" && value instanceof URL) return index;
  }
  return -1;
};

const logSteamLinkNavigation = (kind: string, original: string, rewritten: string) => {
  void frontendLog("nav", "steam link", { kind, original, rewritten }).catch(() => undefined);
};

const PLAYHUB_HIDE_APP_LINKS_CLASS = "playhub-hide-applinks";
const PLAYHUB_HIDE_APP_LINKS_STYLE_ID = "playhub-hide-applinks-style";

const isAppDetailsQuickLinksModule = (candidate: any) =>
  !!candidate &&
  typeof candidate === "object" &&
  typeof candidate.GameInfoQuickLinks === "string" &&
  typeof candidate.GameInfoContainer === "string";

const appDetailsQuickLinksModuleFromExports = (module: any) => {
  if (isAppDetailsQuickLinksModule(module)) return module;
  if (!module || typeof module !== "object") return undefined;
  for (const candidate of Object.values(module)) {
    if (isAppDetailsQuickLinksModule(candidate)) return candidate;
  }
  return undefined;
};

const resolveAppDetailsQuickLinksClasses = (): string[] => {
  try {
    let discovered = findModuleChild(appDetailsQuickLinksModuleFromExports);
    if (!discovered) {
      discovered = findModuleChild((module: any) => {
        if (!module || typeof module !== "object") return undefined;
        for (const candidate of Object.values(module)) {
          const nested = appDetailsQuickLinksModuleFromExports(candidate);
          if (nested) return nested;
        }
        return undefined;
      });
    }
    const quickLinks = discovered?.GameInfoQuickLinks;
    return typeof quickLinks === "string" && quickLinks.trim() ? [quickLinks.trim()] : [];
  } catch (_error) {
    return [];
  }
};

const onGameDetailRoute = (path: string) => {
  const decoded = safeDecodeURIComponent(String(path || ""));
  if (/\/achievements(\b|\/)/i.test(decoded)) return false;
  return gameDetailAppIdFromPath(decoded) > 0 || /\/library\/(app|details)\//i.test(decoded);
};

const appLinksHiderClassSelector = (className: string) => {
  const trimmed = className.trim();
  return /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(trimmed) ? `.${trimmed}` : "";
};

const buildUnmatchedAppLinksHiderStyle = (linkRowClasses: string[]) => {
  const selectors = Array.from(new Set(linkRowClasses))
    .map(appLinksHiderClassSelector)
    .filter(Boolean)
    .map((selector) => `body.${PLAYHUB_HIDE_APP_LINKS_CLASS} ${selector}`);
  if (!selectors.length) {
    return "/* playhub: AppDetails GameInfoQuickLinks class unresolved; no fallback rule. */";
  }
  const targetSelector = selectors.join(",\n");
  return `
${targetSelector} {
  display: none !important;
}
`;
};

const appLinksHiderTargetDocument = (): Document | null => {
  try {
    const doc = (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_BrowserWindow
      ?.document;
    if (doc && typeof doc.createElement === "function" && doc.head && doc.body) {
      return doc as Document;
    }
  } catch (_error) {
    // fall through
  }
  return null;
};

const appLinksDomClassPresent = (className: string, doc: Document) => {
  const trimmed = className.trim();
  if (!trimmed) return false;
  try {
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(trimmed)
        : trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return !!doc.querySelector(`.${escaped}`);
  } catch (_error) {
    return false;
  }
};

const unmatchedAppLinksDecisionDetails = () => {
  const appId = currentGameDetailAppId();
  const overview = appId ? getOverview(appId) : null;
  const isNonSteam = !!(appId && isNonSteamApp(overview));
  const steamAppId = appId ? steamAppIdForApp(appId) : 0;
  return { appId, isNonSteam, steamAppId };
};

const logUnmatchedAppLinksDecision = (
  decision: boolean,
  resolvedLinkRowClasses: string[],
  lastSignature: string,
  doc: Document | null
) => {
  const details = unmatchedAppLinksDecisionDetails();
  const signature = `${decision}|${resolvedLinkRowClasses.join(",")}|${details.appId}`;
  if (signature === lastSignature) return lastSignature;
  try {
    void frontendLog("applinks", "hider decision", {
      decision,
      appId: details.appId,
      isNonSteam: details.isNonSteam,
      steamAppId: details.steamAppId,
      resolvedClasses: resolvedLinkRowClasses,
      classPresentInDom: resolvedLinkRowClasses[0]
        ? !!doc && appLinksDomClassPresent(resolvedLinkRowClasses[0], doc)
        : false,
    }).catch(() => undefined);
  } catch (_error) {
    // Diagnostic logging must never affect the passive hider.
  }
  return signature;
};

const shouldHideUnmatchedAppLinks = () => {
  const path = currentRoutePath();
  if (!onGameDetailRoute(path)) return false;
  const appId = currentGameDetailAppId();
  if (!appId) return false;
  return isNonSteamApp(getOverview(appId)) && steamAppIdForApp(appId) === 0;
};

const installUnmatchedAppLinksHider = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__playhubAppLinksHider) {
    unpatchers.push(() => undefined);
    return;
  }
  if (typeof document === "undefined" || !document.body || !document.head) {
    unpatchers.push(() => undefined);
    return;
  }

  globalState.__playhubAppLinksHider = { installed: true };

  let resolvedQuickLinksClasses: string[] = [];
  let appliedQuickLinksClasses = "";
  let lastDecisionLogSignature = "";
  let injectedDoc: Document | null = null;

  const update = () => {
    try {
      const doc = appLinksHiderTargetDocument();
      if (!doc) return;

      if (resolvedQuickLinksClasses.length === 0) {
        resolvedQuickLinksClasses = resolveAppDetailsQuickLinksClasses();
      }

      let style = doc.getElementById(PLAYHUB_HIDE_APP_LINKS_STYLE_ID);
      let forceStyleRefresh = injectedDoc !== doc;
      if (!style) {
        style = doc.createElement("style");
        style.id = PLAYHUB_HIDE_APP_LINKS_STYLE_ID;
        doc.head.appendChild(style);
        forceStyleRefresh = true;
      }
      injectedDoc = doc;

      const nextAppliedQuickLinksClasses = resolvedQuickLinksClasses.join(" ");
      if (
        forceStyleRefresh ||
        !style.textContent ||
        nextAppliedQuickLinksClasses !== appliedQuickLinksClasses
      ) {
        style.textContent = buildUnmatchedAppLinksHiderStyle(resolvedQuickLinksClasses);
        appliedQuickLinksClasses = nextAppliedQuickLinksClasses;
      }

      const decision = shouldHideUnmatchedAppLinks();
      lastDecisionLogSignature = logUnmatchedAppLinksDecision(
        decision,
        resolvedQuickLinksClasses,
        lastDecisionLogSignature,
        doc
      );
      doc.body.classList.toggle(PLAYHUB_HIDE_APP_LINKS_CLASS, decision);
    } catch (_error) {
      // Passive UI polish must never affect Steam navigation or rendering.
    }
  };

  update();
  const timer = window.setInterval(update, 400);
  unpatchers.push(() => {
    try {
      window.clearInterval(timer);
      if (injectedDoc) {
        injectedDoc.body.classList.remove(PLAYHUB_HIDE_APP_LINKS_CLASS);
        injectedDoc.getElementById(PLAYHUB_HIDE_APP_LINKS_STYLE_ID)?.remove();
      }
    } catch (_error) {
      // Best effort teardown.
    }
    delete globalState.__playhubAppLinksHider;
  });
};

const installSteamNavigationRedirect = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__playhubNavRedirect) {
    unpatchers.push(() => undefined);
    return;
  }

  const redirectUnpatchers: Unpatch[] = [];
  globalState.__playhubNavRedirect = { installed: true };

  const patchUrlOpener = (target: any, methodName: string, firstOnly = false) => {
    if (typeof target?.[methodName] !== "function") return;
    const original = target[methodName];
    const patched = function playhubSteamNavigationRedirect(this: any, ...args: any[]) {
      try {
        const index = firstUrlishArgIndex(args, firstOnly);
        if (index < 0) return original.apply(this, args);
        const originalUrl = String(args[index] || "");
        const targetInfo = steamLinkTarget(originalUrl);
        if (!targetInfo) return original.apply(this, args);
        const rewritten = rewriteSteamLinkToMatchedApp(originalUrl);
        logSteamLinkNavigation(targetInfo.kind, originalUrl, rewritten.url);
        if (!rewritten.rewrote) return original.apply(this, args);
        const nextArgs = [...args];
        nextArgs[index] = rewritten.url;
        return original.apply(this, nextArgs);
      } catch (_error) {
        return original.apply(this, args);
      }
    };
    target[methodName] = patched;
    redirectUnpatchers.push(() => {
      if (target?.[methodName] === patched) {
        target[methodName] = original;
      }
    });
  };

  const patchAppIdOpener = (target: any, methodName: string, argIndex = 0) => {
    if (typeof target?.[methodName] !== "function") return;
    const original = target[methodName];
    const patched = function playhubSteamAppIdNavigationRedirect(this: any, ...args: any[]) {
      try {
        const originalAppId = Number(args[argIndex]);
        const mapped = steamAppIdForApp(originalAppId);
        if (mapped > 0 && mapped !== originalAppId) {
          const nextArgs = [...args];
          nextArgs[argIndex] = mapped;
          logSteamLinkNavigation("store", String(args[argIndex]), String(mapped));
          return original.apply(this, nextArgs);
        }
        return original.apply(this, args);
      } catch (_error) {
        return original.apply(this, args);
      }
    };
    target[methodName] = patched;
    redirectUnpatchers.push(() => {
      if (target?.[methodName] === patched) {
        target[methodName] = original;
      }
    });
  };

  patchUrlOpener(Navigation as any, "NavigateToSteamWeb");
  patchUrlOpener(Navigation as any, "NavigateToExternalWeb");
  patchUrlOpener((window as any)?.SteamClient?.System, "OpenInSystemBrowser");
  patchUrlOpener((window as any)?.SteamClient?.Overlay, "OpenExternalBrowserURL");
  patchUrlOpener(window, "open", true);
  patchAppIdOpener((window as any)?.SteamClient?.Apps, "ShowStore", 0);

  unpatchers.push(() => {
    redirectUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__playhubNavRedirect;
  });
};

const installMainWindowHistoryRedirect = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__playhubMainWindowHistoryRedirect) {
    unpatchers.push(() => undefined);
    return;
  }

  const redirectUnpatchers: Unpatch[] = [];
  let cancelled = false;
  let retryId: number | undefined;
  let attempts = 0;
  globalState.__playhubMainWindowHistoryRedirect = { installed: true };

  const clearRetry = () => {
    if (retryId !== undefined) {
      window.clearTimeout(retryId);
      retryId = undefined;
    }
  };

  const mainWindowHistory = () =>
    (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ??
    (globalThis as any)?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;

  const patchHistoryMethod = (history: any, methodName: "push" | "replace") => {
    const unpatch = patchMethod(history, methodName, (_thisValue, original, args) => {
      try {
        const path = historyPathFromArgs(args);
        const state = historyStateFromArgs(args);
        if (
          String(path || "").toLowerCase().includes("steamweb") &&
          state &&
          typeof state === "object" &&
          typeof state.url === "string"
        ) {
          const rewritten = rewriteSteamLinkToMatchedApp(state.url);
          if (rewritten.rewrote) {
            state.url = rewritten.url;
            void frontendLog("nav", "mainwindow steamweb rewrite", {
              method: methodName,
              from: rewritten.fromAppId,
              to: rewritten.toAppId,
            }).catch(() => undefined);
          }
        }
      } catch (_error) {
        // Steam navigation must continue even if the redirect probe fails.
      }
      return original(...args);
    });
    const patched = history?.[methodName];
    redirectUnpatchers.push(() => {
      try {
        if (history?.[methodName] === patched) {
          unpatch();
        }
      } catch (_error) {
        // Best effort teardown.
      }
    });
  };

  const tryInstall = () => {
    if (cancelled) return;
    const history = mainWindowHistory();
    if (history && typeof history.push === "function" && typeof history.replace === "function") {
      clearRetry();
      patchHistoryMethod(history, "push");
      patchHistoryMethod(history, "replace");
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
    redirectUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__playhubMainWindowHistoryRedirect;
  });
};

const NAVIGATION_TRACE_NOISE_PATTERN = /cached|registerfor|getlaunch|getgameaction|appdetails|appdata|appoverview|appachievement/i;
const NAVIGATION_TRACE_METHOD_PATTERN = /store|community|hub|forum|discuss|guide|workshop|market|navigate|openurl|executesteamurl|browser|web|overlay|showstore|link/i;
const NAVIGATION_TRACE_CLICK_PATTERN = /store|community|hub|discuss|guide|market|support/i;

const truncateTraceValue = (value: string, limit = 80): string => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 3))}...` : normalized;
};

const safeStringifyTrace = (value: any, max = 500): string => {
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (_key, item) => {
      if (typeof item === "function") return "[fn]";
      if (typeof item === "bigint") return String(item);
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
    return truncateTraceValue(serialized === undefined ? String(value) : serialized, max);
  } catch (_error) {
    try {
      return truncateTraceValue(String(value), max);
    } catch (_innerError) {
      return "[unserializable]";
    }
  }
};

const navigationTraceArg = (value: any): number | string => {
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return truncateTraceValue(value);
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "function") return "Function";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return "Symbol";
  return value?.constructor?.name || "Object";
};

const shouldTraceNavigationCall = (methodName: string, args: any[]): boolean => {
  if (NAVIGATION_TRACE_NOISE_PATTERN.test(methodName)) return false;
  if (NAVIGATION_TRACE_METHOD_PATTERN.test(methodName)) return true;
  return args.some((arg) => typeof arg === "number" && steamAppIdForApp(arg) > 0);
};

const installClickTrace = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__playhubClickTrace) {
    unpatchers.push(() => undefined);
    return;
  }
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
    unpatchers.push(() => undefined);
    return;
  }

  globalState.__playhubClickTrace = { installed: true };

  const isActionableTraceElement = (element: Element): boolean => {
    const tag = element.tagName.toLowerCase();
    return (
      tag === "button" ||
      tag === "a" ||
      element.getAttribute("role") === "button" ||
      element.hasAttribute("onclick") ||
      element.hasAttribute("href")
    );
  };

  const actionableElement = (target: EventTarget | null): Element | null => {
    let current = target instanceof Element ? target : null;
    for (let depth = 0; current && depth < 6; depth += 1) {
      if (isActionableTraceElement(current)) return current;
      current = current.parentElement;
    }
    return null;
  };

  const dataAttributes = (element: Element): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(element.attributes || [])) {
      if (attr.name.startsWith("data-")) {
        attrs[attr.name] = truncateTraceValue(attr.value, 60);
      }
    }
    return attrs;
  };

  const handler = (event: MouseEvent) => {
    try {
      const element = actionableElement(event.target);
      if (!element) return;

      const text = truncateTraceValue(element.textContent || "", 60);
      const ariaLabel = truncateTraceValue(element.getAttribute("aria-label") || "", 60);
      if (!NAVIGATION_TRACE_CLICK_PATTERN.test(`${text} ${ariaLabel}`)) return;

      const href =
        element instanceof HTMLAnchorElement
          ? element.href
          : element.getAttribute("href") || undefined;
      const descriptor = {
        tag: element.tagName.toLowerCase(),
        text,
        href: href ? truncateTraceValue(href, 120) : undefined,
        role: element.getAttribute("role") || undefined,
        "aria-label": ariaLabel || undefined,
        data: dataAttributes(element),
      };
      void frontendLog("trace", "click", descriptor).catch(() => undefined);
    } catch (_error) {
      // Passive diagnostics must never affect click behavior.
    }
  };

  try {
    document.addEventListener("click", handler, true);
  } catch (_error) {
    delete globalState.__playhubClickTrace;
    unpatchers.push(() => undefined);
    return;
  }
  unpatchers.push(() => {
    try {
      document.removeEventListener("click", handler, true);
    } catch (_error) {
      // Best effort teardown.
    }
    delete globalState.__playhubClickTrace;
  });
};

const installNavigationTrace = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__playhubNavTrace) {
    unpatchers.push(() => undefined);
    return;
  }

  const traceUnpatchers: Unpatch[] = [];
  const seenTargets = new Set<any>();
  globalState.__playhubNavTrace = { installed: true };

  const collectMethodNames = (obj: any): string[] => {
    const names = new Set<string>();
    let cur = obj;
    let depth = 0;

    while (cur && cur !== Object.prototype && depth < 6) {
      for (const name of Object.getOwnPropertyNames(cur)) {
        if (name === "constructor") continue;
        try {
          if (typeof obj[name] === "function") {
            names.add(name);
          }
        } catch (_error) {
          // Some Steam getters throw outside their expected runtime path.
        }
      }
      cur = Object.getPrototypeOf(cur);
      depth += 1;
    }

    return [...names];
  };

  const patchTraceTarget = (target: any, objLabel: string): number => {
    try {
      if (!target || seenTargets.has(target)) return 0;
      seenTargets.add(target);

      let wrapped = 0;
      for (const name of collectMethodNames(target)) {
        const original = target[name];
        if (typeof original !== "function") continue;

        const patched = function playhubNavigationTrace(this: any, ...args: any[]) {
          try {
            if (shouldTraceNavigationCall(name, args)) {
              void frontendLog("trace", `${objLabel}.${name}`, { args: args.map(navigationTraceArg) }).catch(() => undefined);
            }
          } catch (_error) {
            // Diagnostic tracing must never affect Steam navigation.
          }
          return original.apply(this, args);
        };

        try {
          target[name] = patched;
        } catch (_error) {
          continue;
        }
        wrapped += 1;

        traceUnpatchers.push(() => {
          try {
            if (target?.[name] === patched) {
              target[name] = original;
            }
          } catch (_error) {
            // Best effort teardown.
          }
        });
      }
      return wrapped;
    } catch (_error) {
      return 0;
    }
  };

  const counts: Record<string, number> = {
    "SteamClient.Apps": patchTraceTarget((window as any)?.SteamClient?.Apps, "SteamClient.Apps"),
    Navigation: patchTraceTarget(Navigation as any, "Navigation"),
    Router: 0,
    "SteamClient.URL": patchTraceTarget((window as any)?.SteamClient?.URL, "SteamClient.URL"),
    "SteamClient.System": patchTraceTarget((window as any)?.SteamClient?.System, "SteamClient.System"),
    "SteamClient.Overlay": patchTraceTarget((window as any)?.SteamClient?.Overlay, "SteamClient.Overlay"),
    MainWindowBrowserManager: patchTraceTarget((window as any)?.MainWindowBrowserManager, "MainWindowBrowserManager"),
  };
  counts.Router += patchTraceTarget((window as any)?.SteamClient?.Router, "SteamClient.Router");
  counts.Router += patchTraceTarget(globalState.Router, "Router");

  try {
    const history = window?.history;
    for (const methodName of ["pushState", "replaceState"] as const) {
      const original = history?.[methodName];
      if (typeof original !== "function") continue;
      const patched = function playhubHistoryTrace(this: History, ...args: Parameters<History[typeof methodName]>) {
        try {
          const url = String(args[2] ?? "");
          void frontendLog("trace", "history", {
            method: methodName,
            url: truncateTraceValue(url, 120),
          }).catch(() => undefined);
          if (url.toLowerCase().includes("steamweb")) {
            void frontendLog("trace", "history-state", {
              method: methodName,
              url: truncateTraceValue(url, 120),
              state: safeStringifyTrace(args[0]),
            }).catch(() => undefined);
            const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);
            if (rewrote) {
              void frontendLog("nav", "steamweb rewrite", { method: methodName }).catch(() => undefined);
              return original.apply(this, [newState, args[1], args[2]] as any);
            }
          }
        } catch (_error) {
          // Diagnostic tracing must never affect Steam navigation.
        }
        return original.apply(this, args);
      };
      history[methodName] = patched as History[typeof methodName];
      traceUnpatchers.push(() => {
        try {
          if (history?.[methodName] === patched) {
            history[methodName] = original;
          }
        } catch (_error) {
          // Best effort teardown.
        }
      });
    }
  } catch (_error) {
    // History tracing is diagnostic-only.
  }

  try {
    void frontendLog("trace", "nav trace installed", { counts }).catch(() => undefined);
  } catch (_error) {
    // Diagnostic tracing must never affect Steam navigation.
  }

  unpatchers.push(() => {
    traceUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__playhubNavTrace;
  });
};

type HistoryInstanceTraceTarget = {
  label: string;
  history: any;
};

const HISTORY_INSTANCE_TRACE_KEY_PATTERN = /window|instance|store|history|nav|main|browser|gamepad|overlay/i;

const safeTraceProperty = (obj: any, key: string): any => {
  try {
    return obj?.[key];
  } catch (_error) {
    return undefined;
  }
};

const safeTraceOwnPropertyNames = (obj: any): string[] => {
  try {
    return Object.getOwnPropertyNames(obj);
  } catch (_error) {
    return [];
  }
};

const isHistoryInstanceTraceTarget = (value: any): boolean => {
  try {
    if (!value || typeof value !== "object") return false;
    if (typeof value.push !== "function" || typeof value.replace !== "function") return false;
    const location = safeTraceProperty(value, "location");
    const entries = safeTraceProperty(value, "entries");
    const length = safeTraceProperty(value, "length");
    return (
      (!!location && typeof location === "object") ||
      Array.isArray(entries) ||
      typeof length === "number"
    );
  } catch (_error) {
    return false;
  }
};

const hasTraceableHistoryMethods = (value: any): boolean => {
  try {
    return !!value && typeof value.push === "function" && typeof value.replace === "function";
  } catch (_error) {
    return false;
  }
};

const collectHistoryInstanceTraceTargets = (): HistoryInstanceTraceTarget[] => {
  const globalState = globalThis as any;
  const windowState = typeof window !== "undefined" ? (window as any) : undefined;
  const roots: HistoryInstanceTraceTarget[] = [
    { label: "Router", history: safeTraceProperty(globalState, "Router") },
    { label: "Router.WindowStore", history: safeTraceProperty(safeTraceProperty(globalState, "Router"), "WindowStore") },
    { label: "SteamUIStore", history: safeTraceProperty(windowState, "SteamUIStore") },
    { label: "App", history: safeTraceProperty(windowState, "App") },
  ];
  const instances: HistoryInstanceTraceTarget[] = [];
  const seenNodes = new WeakSet<object>();
  let scannedNodes = 0;
  const maxDepth = 4;
  const maxNodes = 400;

  const recordInstance = (label: string, history: any, requireShape = true) => {
    if (!history || typeof history !== "object") return;
    if (requireShape ? !isHistoryInstanceTraceTarget(history) : !hasTraceableHistoryMethods(history)) return;
    instances.push({ label, history });
  };

  const queue = roots
    .filter(({ history }) => !!history && typeof history === "object")
    .map(({ label, history }) => ({ label, value: history, depth: 0 }));

  for (let index = 0; index < queue.length && scannedNodes < maxNodes; index += 1) {
    const { label, value, depth } = queue[index];
    if (!value || typeof value !== "object") continue;
    if (seenNodes.has(value)) continue;
    seenNodes.add(value);
    scannedNodes += 1;

    recordInstance(label, value);
    recordInstance(`${label}.m_history`, safeTraceProperty(value, "m_history"), false);

    if (depth >= maxDepth) continue;

    for (const key of safeTraceOwnPropertyNames(value)) {
      if (scannedNodes + queue.length >= maxNodes * 2) break;
      if (!HISTORY_INSTANCE_TRACE_KEY_PATTERN.test(key)) continue;
      const next = safeTraceProperty(value, key);
      if (!next || typeof next !== "object") continue;
      queue.push({ label: `${label}.${key}`, value: next, depth: depth + 1 });
    }
  }

  return instances;
};

const installHistoryInstanceTrace = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__playhubHistoryInstanceTrace) {
    unpatchers.push(() => undefined);
    return;
  }

  const traceUnpatchers: Unpatch[] = [];
  const wrappedHistories = new WeakSet<object>();
  globalState.__playhubHistoryInstanceTrace = { installed: true };

  const instances = collectHistoryInstanceTraceTargets();
  try {
    void frontendLog("trace", "history instances", {
      labels: instances.map(({ label }) => label),
      count: instances.length,
    }).catch(() => undefined);
  } catch (_error) {
    // Passive diagnostics must never affect Steam navigation.
  }

  const shouldTraceHistoryInstanceCall = (path: string, state: any): boolean => {
    if (String(path || "").toLowerCase().includes("steamweb")) return true;
    const url = typeof state?.url === "string" ? state.url : "";
    return !!url && !!steamLinkTarget(url);
  };

  for (const { label, history } of instances) {
    try {
      if (!history || typeof history !== "object" || wrappedHistories.has(history)) continue;
      wrappedHistories.add(history);

      for (const methodName of ["push", "replace"] as const) {
        const original = history[methodName];
        if (typeof original !== "function") continue;

        const patched = function playhubHistoryInstanceTrace(this: any, ...args: any[]) {
          try {
            const path = historyPathFromArgs(args);
            const state = historyStateFromArgs(args);
            if (shouldTraceHistoryInstanceCall(path, state)) {
              void frontendLog("trace", "history call", {
                instance: label,
                method: methodName,
                path: truncateTraceValue(path, 120),
                url: typeof state?.url === "string" ? truncateTraceValue(state.url, 160) : "",
              }).catch(() => undefined);
            }
          } catch (_error) {
            // Diagnostic tracing must never affect Steam navigation.
          }
          return original.apply(this, args);
        };

        try {
          history[methodName] = patched;
        } catch (_error) {
          continue;
        }

        traceUnpatchers.push(() => {
          try {
            if (history?.[methodName] === patched) {
              history[methodName] = original;
            }
          } catch (_error) {
            // Best effort teardown.
          }
        });
      }
    } catch (_error) {
      // Keep scanning and patching other history instances.
    }
  }

  unpatchers.push(() => {
    traceUnpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (_error) {
        // Best effort teardown.
      }
    });
    delete globalState.__playhubHistoryInstanceTrace;
  });
};

let achievementStorePatchInstalled = false;

const tryInstallAchievementStorePatch = (unpatchers: Unpatch[]): boolean => {
  if (achievementStorePatchInstalled) return true;
  if (!hasAchievementProgressCache()) {
    if (patchInstallStatus.achievements === "pending") {
      patchInstallStatus.achievements = "skipped-missing-internal";
      log.warn("patch", "achievement UI patch skipped", { status: patchInstallStatus.achievements });
    }
    return true;
  }
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
                log.error("achievements", "LoadMyAchievements failed", error);
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
    patchInstallStatus.achievements = "installed";
    log.info("patch", "achievement store patch installed", { status: patchInstallStatus.achievements });
    return true;
  } catch (error) {
    patchInstallStatus.achievements = "failed";
    log.warn("patch", "achievement store patch failed", { status: patchInstallStatus.achievements }, error);
    return true;
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

const overviewFromReactTree = (tree: any): any | null => {
  try {
    const holder = findInReactTree(tree, (node: any) => {
      const overview = node?.props?.overview || node?.overview;
      return overview?.appid ? true : undefined;
    });
    return holder?.props?.overview || holder?.overview || null;
  } catch (_error) {
    return null;
  }
};

const appIdFromReactTree = (tree: any) => {
  const overview = overviewFromReactTree(tree);
  const appId = Number(overview?.appid || 0);
  return Number.isFinite(appId) ? appId : 0;
};

const appendActivityOverlay = (ret: any, appId: number, force = false) => {
  // The route-level React append is the mount path that survives Steam Big
  // Picture most consistently. A singleton owner inside PlayhubActivityNewsOverlay
  // prevents duplicate cards when the empty-state trap also fires.
  if (!appId) return ret;
  lastObservedGameDetailAppId = Number(appId);
  if (force) {
    noteDetailsTabSelection("Attività");
    noteDetailsTabIndexSelection(0);
  }
  return React.createElement(
    React.Fragment,
    null,
    ret,
    React.createElement(PlayhubActivityNewsOverlay, { appId, force, source: "route" })
  );
};

export 
const historyPathFromArgs = (args: any[]) => {
  const first = args?.[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    return String(first.pathname || first.path || first.href || first.url || "");
  }
  return "";
};

const historyStateFromArgs = (args: any[]) => {
  const first = args?.[0];
  const second = args?.[1];
  // React Router / Steam history may call push(path, { state }), push(path, state),
  // push({ pathname, state }), replace(location, state), or the raw browser
  // history API with the state as first argument. The previous build only handled
  // the direct state shapes, so Steam's Navigator.App(appid, { gidPartnerEvent })
  // slipped through as args[1].state and kept polluting the back stack.
  if (first && typeof first === "object") {
    if (first.state?.event_to_show) return first.state;
    if (first.event_to_show) return first;
    if ("state" in first && first.state) return first.state;
  }
  if (second && typeof second === "object") {
    if (second.state?.event_to_show) return second.state;
    if (second.event_to_show) return second;
    if ("state" in second && second.state) return second.state;
  }
  return second;
};

const isPlayhubNativeNewsRouteState = (state: any) => {
  const eventToShow = state?.event_to_show;
  if (!eventToShow) return false;
  const eventId = eventToShow.eventid || eventToShow.gidPartnerEvent || eventToShow.gid || eventToShow.GID;
  return !!eventId && !!playhubNativePartnerEventForGid(eventId);
};

const playhubNativeNewsRouteAppId = (state: any, fallbackPath = "") => {
  const eventToShow = state?.event_to_show || {};
  const appId = Number(eventToShow.appid || gameDetailAppIdFromPath(fallbackPath));
  return Number.isFinite(appId) && appId > 0 ? appId : 0;
};

const shouldReplacePlayhubNativeNewsPush = (targetPath: string, state: any) => {
  if (!isPlayhubNativeNewsRouteState(state)) return false;
  const targetAppId = playhubNativeNewsRouteAppId(state, targetPath);
  const currentAppId = gameDetailAppIdFromPath(currentRoutePath());
  // Steam's native Activity click normally pushes the same game-detail route with
  // only `event_to_show` added. Its close handler then replaces the current route
  // to remove `event_to_show`, leaving a duplicate game-detail entry behind. That
  // is why Andrea had to press B/Esc once for every news he had opened. For
  // Playhub native news, make that event navigation replace the current game route
  // instead of pushing a new history entry. The modal still opens natively, but
  // closing it returns to the original route without polluting the back stack.
  return !!targetAppId && (!currentAppId || currentAppId === targetAppId);
};

const currentSteamHistoryState = (steamHistory?: any) => {
  const location = steamHistory?.location || (globalThis as any).Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
  return location?.state || null;
};

const shouldBackOutOfPlayhubNativeNewsClose = (steamHistory: any, targetPath: string, nextState: any) => {
  const currentState = currentSteamHistoryState(steamHistory);
  if (!isPlayhubNativeNewsRouteState(currentState)) return false;
  if (isPlayhubNativeNewsRouteState(nextState)) return false;
  const currentAppId = playhubNativeNewsRouteAppId(currentState, currentRoutePath());
  const targetAppId = Number(gameDetailAppIdFromPath(targetPath) || currentAppId);
  return !!currentAppId && (!targetAppId || currentAppId === targetAppId);
};

const backSteamHistory = (steamHistory: any) => {
  if (typeof steamHistory?.goBack === "function") return steamHistory.goBack();
  if (typeof steamHistory?.back === "function") return steamHistory.back();
  if (typeof steamHistory?.go === "function") return steamHistory.go(-1);
  return undefined;
};

export const installSteamPatches = (): Unpatch => {
  const unpatchers: Unpatch[] = [];
  installAchievementImageCoverPatch(unpatchers);
  installUnmatchedAppLinksHider(unpatchers);
  // Activity news now use Steam's own AppActivityStore and native Activity
  // renderer. Do not mount Playhub overlay/DOM UI here: those paths are kept in
  // source only as old fallbacks, but the integration attempt for this build is
  // intentionally native-only.
  installNativeActivityStorePatch(unpatchers);
  installNativePartnerEventStorePatch(unpatchers);
  const activityRefreshedListener = () => {
    playhubNativeActivityCache().clear();
    playhubNativePartnerEventCache().clear();
    const appId = currentGameDetailAppId();
    void ensureMetadataCache().then(() => {
      if (appId) void refreshPlayhubNativeActivityForApp(appId);
    });
  };
  window.addEventListener("playhub-metadata:activity-refreshed", activityRefreshedListener);
  unpatchers.push(() => window.removeEventListener("playhub-metadata:activity-refreshed", activityRefreshedListener));
  void flushTrueAchievementsNativeCache();
  window.setTimeout(() => void flushTrueAchievementsNativeCache(), 2500);
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

  installSteamNavigationRedirect(unpatchers);
  installMainWindowHistoryRedirect(unpatchers);
  installNavigationTrace(unpatchers);
  installHistoryInstanceTrace(unpatchers);
  installClickTrace(unpatchers);

  const redirectAchievementTarget = (target: any): string => {
    const raw = String(target || "");
    if (raw.includes("/playhub-metadata/achievements/")) return "";
    const appId = achievementAppIdFromPath(raw);
    if (appId && isNonSteamApp(getOverview(appId)) && shouldShowAchievements(appId)) {
      return playhubAchievementsPath(appId);
    }
    return "";
  };

  try {
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
            const target = historyPathFromArgs(args);
            const redirected = redirectAchievementTarget(target);
            if (redirected) return original(redirected);
            const state = historyStateFromArgs(args);
            if (methodName === "push" && shouldReplacePlayhubNativeNewsPush(target, state) && typeof steamHistory.replace === "function") {
              (globalThis as any).__playhubNativeNewsOpenedWithReplaceAt = Date.now();
              return steamHistory.replace(...args);
            }
            if (methodName === "replace" && shouldBackOutOfPlayhubNativeNewsClose(steamHistory, target || currentRoutePath(), state)) {
              const replacedAt = Number((globalThis as any).__playhubNativeNewsOpenedWithReplaceAt || 0);
              // If our push->replace interception ran, closing the modal should keep using
              // Steam's replace. If Steam opened via a path we did not intercept, use Back
              // for the close action so the event entry is removed instead of replaced by a
              // duplicate app-detail entry.
              if (!replacedAt || Date.now() - replacedAt > 15000) {
                return backSteamHistory(steamHistory) ?? original(...args);
              }
            }
            try {
              const path = String(target || "").toLowerCase();
              if (path.includes("steamweb") && state && typeof state === "object" && typeof state.url === "string") {
                const rewritten = rewriteSteamLinkToMatchedApp(state.url);
                if (rewritten.rewrote) {
                  state.url = rewritten.url;
                  void frontendLog("nav", "steamweb router rewrite", {
                    from: rewritten.fromAppId,
                    to: rewritten.toAppId,
                  }).catch(() => undefined);
                }
              }
            } catch (_error) {
              // Steam navigation must continue even if the redirect probe fails.
            }
            return original(...args);
          })
        );
      }
    }
  } catch (error) {
    log.warn("patch", "history achievement redirect patch skipped", error);
  }

  try {
    for (const methodName of ["pushState", "replaceState"] as const) {
      const original = window.history?.[methodName];
      if (typeof original !== "function") continue;
      const patched = function (this: History, ...args: any[]) {
        const target = String(args[2] || "");
        const redirected = redirectAchievementTarget(target || args[0]);
        if (redirected) {
          args[2] = redirected;
        }
        const state = historyStateFromArgs(args);
        if (methodName === "pushState" && shouldReplacePlayhubNativeNewsPush(target, state)) {
          (globalThis as any).__playhubNativeNewsOpenedWithReplaceAt = Date.now();
          return window.history.replaceState(args[0], args[1], args[2]);
        }
        if (methodName === "replaceState") {
          const currentState = (window.history as any)?.state;
          if (isPlayhubNativeNewsRouteState(currentState) && !isPlayhubNativeNewsRouteState(state)) {
            const replacedAt = Number((globalThis as any).__playhubNativeNewsOpenedWithReplaceAt || 0);
            if (!replacedAt || Date.now() - replacedAt > 15000) {
              window.history.back();
              return undefined;
            }
          }
        }
        return original.apply(this, args as any);
      };
      (window.history as any)[methodName] = patched;
      unpatchers.push(() => {
        (window.history as any)[methodName] = original;
      });
    }
  } catch (error) {
    log.warn("patch", "window history redirect patch skipped", error);
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

  const clickDetailsTabTracker = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const label = detailsTabLabelFromElement(target);
    const pointerIndex = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? detailsTabIndexFromPoint(event.clientX, event.clientY)
      : -1;
    const elementIndex = detailsTabIndexFromElement(target);
    const tabIndex = pointerIndex >= 0 ? pointerIndex : elementIndex;
    if (tabIndex >= 0) noteDetailsTabIndexSelection(tabIndex);
    if (label) noteDetailsTabSelection(label);
  };
  document.addEventListener("click", clickDetailsTabTracker, true);
  unpatchers.push(() => document.removeEventListener("click", clickDetailsTabTracker, true));

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
  patchInstallStatus.router = "installed";
  log.info("patch", "router patch installed", { status: patchInstallStatus.router });
  } catch (error) {
    patchInstallStatus.router = "failed";
    log.warn("patch", "router patch failed", { status: patchInstallStatus.router }, error);
  }

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
          // Keep Steam's first-run detail bootstrap intact. Returning Playhub data
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
            if (appId && isNonSteamApp(overview)) ensureDetailsOverviewSafeFields(appId);
            if (appId && isNonSteamApp(overview) && shouldShowAchievements(appId)) {
              ret.add("achievements");
              void loadAchievementsForApp(appId);
            }
            if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
              lastObservedGameDetailAppId = appId;
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

  try {
    const httpClient = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      if (typeof module.g?.get === "function" && typeof module.g?.post === "function") {
        return module.g;
      }
      return undefined;
    });
    const patchFeedMethod = (methodName: "get" | "post") => {
      if (!httpClient?.[methodName]) return;
      unpatchers.push(
        patchMethod(
          httpClient,
          methodName,
          (_thisValue, original, args) => {
            const url = String(args[0] || "");
            const activityAppId = activityAppIdFromUrl(url);
            if (activityAppId) {
              return steamActivityPayloadForApp(activityAppId).then((payload) => {
                if (payload) return payload;
                return original(...args);
              });
            }
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
    };
    patchFeedMethod("get");
    patchFeedMethod("post");
  } catch (error) {
    log.warn("patch", "community feed patch skipped", error);
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
    log.warn("patch", "community vote patch skipped", error);
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
          const overview = ret?.props?.children?.props?.overview || overviewFromReactTree(ret);
          const appId = Number(overview?.appid || appIdFromReactTree(ret) || currentGameDetailAppId());
          const appOverview = overview || getOverview(appId);
          if (appId && isNonSteamApp(appOverview)) {
            lastObservedGameDetailAppId = appId;
            bypassBypass = 11;
            void ensureMetadataCache().then(() => {
              applyMetadata(appId);
              void tryEnrichScreenshotsForApp(appId);
              void tryFetchMetadataForApp(appId);
            });
            void loadAchievementsForApp(appId);
            void refreshPlayhubNativeActivityForApp(appId);
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
        const renderPatch = afterPatch(routeProps, "renderFunc", (_args: any[], ret: any) => {
          const treeAppId = appIdFromReactTree(ret);
          const appId = currentGameDetailAppId() || treeAppId;
          const overview = overviewFromReactTree(ret) || getOverview(appId);
          if (appId && isNonSteamApp(overview)) {
            lastObservedGameDetailAppId = appId;
            noteDetailsTabSelection("Attività");
            noteDetailsTabIndexSelection(0);
            void ensureMetadataCache().then(() => {
              applyMetadata(appId);
            });
            void refreshPlayhubNativeActivityForApp(appId);
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

  return () => {
    unpatchers.splice(0).reverse().forEach((unpatch) => {
      try {
        unpatch();
      } catch (error) {
        log.error("patch", "unpatch failed", error);
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
