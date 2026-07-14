export type Person = {
  name: string;
  url: string;
};

export type MetadataData = {
  title: string;
  id: string | number;
  source?: string;
  source_url?: string;
  description: string;
  short_description?: string;
  developers?: Person[];
  publishers?: Person[];
  release_date?: number | null;
  rating?: number | null;
  store_categories: number[];
  genres?: string[];
  features?: string[];
  screenshots?: MetadataScreenshot[];
  steam_appid?: number | null;
  steam_dlc_appids: number[];
  has_points_shop: boolean;
  steam_store_state?: "available" | "delisted" | "unknown";
  deck_compat_category?: number | null;
  steam_store_url?: string;
  steam_news?: MetadataNews[];
  steam_news_enriched_at?: number;
  updated_at?: number;
};

export type MetadataScreenshot = {
  id?: string;
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  author?: string;
  link?: string;
};

export type CommunityFallbackSource = "steam-scrape" | "metadata" | "none";

export type CommunityFallbackItem = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  link: string;
  width: number;
  height: number;
  author: string;
};

export type CommunityFallbackPage = {
  source: CommunityFallbackSource;
  page: number;
  items: CommunityFallbackItem[];
};

export type MetadataSearchResult = {
  id?: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  rating?: number | null;
};

export type MetadataNews = {
  id: string;
  title: string;
  url: string;
  summary?: string;
  image?: string;
  /** Full-resolution image URL returned by the Steam news API. */
  image_url?: string;
  /** Preview/thumbnail image URL returned by the Steam news API. */
  preview_image_url?: string;
  /** Array of additional image URLs associated with this news item. */
  image_sources?: string[];
  author?: string;
  feedLabel?: string;
  event_type?: number;
  type?: number;
  gid?: string;
  news_id?: string;
  announcement_gid?: string;
  event_gid?: string;
  body?: string;
  raw_body?: string;
  date?: number;
};

/**
 * Minimal contract for the Steam internals object exposed on `globalThis`.
 * Only the subset needed by this plugin is declared; new fields may be added
 * as the plugin discovers them at the type boundary.
 */
export type SteamInternals = {
  SteamClient: {
    Input?: SteamInputBoundary;
    [key: string]: unknown;
  };
  appStore: {
    GetAppOverviewByAppID?: (appId: number) => SteamOverview | null | undefined;
  };
  appDetailsStore: object;
  appActivityStore?: object;
  Router?: {
    WindowStore?: {
      GamepadUIMainWindowInstance?: {
        m_history?: {
          location?: { pathname?: string; search?: string; hash?: string };
        };
      };
    };
  };
  partnerEventStore?: NativePartnerEventStore;
  g_PartnerEventStore?: NativePartnerEventStore;
  g_PartnerEventSummaryStore?: NativePartnerEventStore;
  controllerConfiguratorStore?: ControllerConfiguratorStoreBoundary;
  [key: string]: unknown;
};

/** Minimal Steam Input bridge used to request controller configuration data. */
export type SteamInputBoundary = {
  QueryControllerConfigsForApp?: (...args: unknown[]) => unknown;
};

/** Minimal controller-configurator store surface used for supplemental reads. */
export type ControllerConfiguratorStoreBoundary = {
  QueryConfigsForApp?: (...args: unknown[]) => unknown;
  GetOfficialConfigsForApp?: (...args: unknown[]) => unknown;
  GetTemplateConfigsForApp?: (...args: unknown[]) => unknown;
  GetWorkshopConfigsForApp?: (...args: unknown[]) => unknown;
  GetAllConfigs?: (...args: unknown[]) => unknown;
  m_mapAppConfigs?: {
    has?: (appid: number) => boolean;
    set?: (appid: number, value: unknown) => unknown;
  };
};

/**
 * Minimal contract for a Steam app overview object returned by
 * `appStore.GetAppOverviewByAppID`.
 */
export type SteamOverview = {
  appid?: number;
  app_type?: number;
  display_name?: string;
  localized_name?: string;
  name?: string;
  BIsShortcut?: () => boolean;
  BIsModOrShortcut?: () => boolean;
  /** Metacritic / user rating applied by the plugin. */
  metacritic_score?: number;
  /**
   * Packed Deck compatibility bits written by the plugin.
   * bits 0-1 = deck compat category; bits 2-3 = verified-filter copy.
   */
  steam_hw_compat_category_packed?: number;
  /** Set of numeric store category IDs. */
  m_setStoreCategories?: Set<number>;
  /** Unix timestamp of the original release date. */
  rt_original_release_date?: number;
  /** Unix timestamp of the Steam release date. */
  rt_steam_release_date?: number;
};

/** Minimal contract for a native Steam PartnerEvent store. */
export type NativePartnerEventStore = {
  GetClanEventModel?: (...args: unknown[]) => unknown;
  GetClanEventFromAnnouncementGID?: (...args: unknown[]) => unknown;
  LoadPartnerEventFromAnnoucementGIDAndClanSteamID?: (...args: unknown[]) => unknown;
  GetPartnerEventChangeCallback?: (gid: string) => { Dispatch?: (event: unknown) => void } | null | undefined;
  m_mapExistingEvents?: Map<string, unknown>;
  m_mapAnnouncementBodyToEvent?: Map<string, string>;
  m_mapAppIDToGIDs?: Map<number, string[]>;
  m_mapClanToGIDs?: Map<number, string[]>;
};

/**
 * Minimal contract for the synthetic PartnerEvent objects that this plugin
 * injects into the native Steam Activity store.
 */
export type NativePartnerEvent = {
  __deckyNativePartnerEvent: true;
  GID: string;
  gid: string;
  event_gid: string;
  AnnouncementGID: string;
  announcement_gid: string;
  announcementGID: string;
  appid: number;
  reference_appid: number;
  steam_appid: number;
  type: number;
  event_type: number;
  bOldAnnouncement: boolean;
  bLoaded: boolean;
  loadedAllLanguages: boolean;
  visibility_state: number;
  postTime: number;
  createTime: number;
  startTime: number;
  endTime: number;
  visibilityStartTime: number;
  visibilityEndTime: number;
  rtime32_moderator_reviewed: number;
  rtime32_start_time: number;
  rtime32_end_time: number;
  rtime32_last_modified: number;
  nVotesUp: number;
  nVotesDown: number;
  nCommentCount: number;
  forumTopicGID: string;
  clanSteamID: { GetAccountID: () => number; ConvertTo64BitString: () => string; toString: () => string };
  announcementClanSteamID: { GetAccountID: () => number; ConvertTo64BitString: () => string; toString: () => string };
  jsondata: {
    localized_summary: string[];
    localized_subtitle: string[];
    localized_body: string[];
    localized_title_image: string[];
    localized_capsule_image: string[];
    localized_spotlight_image: string[];
    library_spotlight: boolean;
    library_spotlight_text: boolean;
    referenced_appids: number[];
  };
  name: Map<number, string>;
  description: Map<number, string>;
  timestamp_loc_updated: Map<number, number>;
  vecTags: string[];
  tags: string[];
  BHasTag: (tag: string) => boolean;
  BHasTagStartingWith: (prefix: string) => boolean;
  GetAllTags: () => string[];
  BMatchesAllTags: (tags?: string[]) => boolean;
  BInRealmGlobal: () => boolean;
  BInRealmChina: () => boolean;
  BIsLanguageValidForRealms: () => boolean;
  GetNameWithFallback: () => string;
  GetGameTitle: () => string;
  GetDescriptionWithFallback: () => string;
  GetSummaryWithFallback: () => string;
  GetSummary: () => string;
  BHasSummary: () => boolean;
  GetSubTitle: () => string;
  BHasSubTitle: () => boolean;
  GetSubTitleWithLanguageFallback: () => string;
  GetSubTitleWithSummaryFallback: () => string;
  GetCategoryAsString: () => string;
  GetEventTypeAsString: () => string;
  GetImgArray: () => string[];
  GetImageHash: () => null;
  GetImageHashAndExt: () => null;
  GetImageFromBeginningOfDescription: () => string;
  GetImageURL: () => string;
  GetImageURLWithFallback: () => string;
  GetImageForSizeAsArrayWithFallback: (_size?: string, _language?: string, _format?: string, skipFallback?: boolean) => string[];
  BImageNeedScreenshotFallback: () => boolean;
  BHasSomeImage: () => boolean;
  BHasImage: () => boolean;
  GetFallbackArtworkScreenshot: () => string;
  GetStartTimeAndDateUnixSeconds: () => number;
  GetEndTimeAndDateUnixSeconds: () => number;
  GetPostTimeAndDateUnixSeconds: () => number;
  GetAnnouncementGID: () => string;
  BHasAnnouncementGID: () => boolean;
  GetAppID: () => number;
  GetReferenceAppID: () => number;
  GetStoreAppID: () => number;
  BIsPartnerEvent: () => boolean;
  BIsOGGEvent: () => boolean;
  BIsEventInFuture: () => boolean;
  BHasEventEnded: () => boolean;
  BIsEventActionEnabled: () => boolean;
  BShowLibrarySpotlight: () => boolean;
  BShowLibrarySpotlightText: () => boolean;
  BIsImageSafeForAllAges: () => boolean;
  BHasBroadcastEnabled: () => boolean;
  BEventCanShowBroadcastWidget: () => boolean;
  BHasBroadcastForceBanner: () => boolean;
  BSaleShowBroadcastAtTopOfPage: () => boolean;
  GetVisibilityStartTimeAndDateUnixSeconds: () => number;
  BHasForumTopicGID: () => boolean;
  GetForumTopicURL: () => string;
  GetAppIDOrReferenceAppID: () => number;
  GetEventType: () => number;
  BIsVisibleEvent: () => boolean;
  BIsStagedEvent: () => boolean;
  BIsUnlistedEvent: () => boolean;
  BHasEmailEnabled: () => boolean;
  BHasSaleEnabled: () => boolean;
  BHasSaleVanity: () => boolean;
  [key: string]: unknown;
};

export type GameOption = {
  appid: number;
  name: string;
  exe?: string;
  start_dir?: string;
  launch_options?: string;
  shortcut_path?: string;
  icon?: string;
  isNonSteam?: boolean;
};

export type ScanProgress = {
  running: boolean;
  status: string;
  total: number;
  completed: number;
  assigned: number;
  failed: number;
  current: string;
  message: string;
  error?: string;
};

export enum StoreCategory {
  MultiPlayer = 1,
  SinglePlayer = 2,
  CoOp = 9,
  MMO = 20,
  Achievements = 22,
  SplitScreen = 24,
  FullController = 28,
  OnlineMultiPlayer = 36,
  LocalMultiPlayer = 37,
  OnlineCoOp = 38,
  LocalCoOp = 392,
}

export const CATEGORY_LABELS: Record<number, string> = {
  [StoreCategory.SinglePlayer]: "Single-player",
  [StoreCategory.MultiPlayer]: "Multiplayer",
  [StoreCategory.CoOp]: "Co-op",
  [StoreCategory.OnlineMultiPlayer]: "Online multiplayer",
  [StoreCategory.OnlineCoOp]: "Online co-op",
  [StoreCategory.LocalMultiPlayer]: "Local multiplayer",
  [StoreCategory.LocalCoOp]: "Local co-op",
  [StoreCategory.SplitScreen]: "Split screen",
  [StoreCategory.FullController]: "Full controller support",
  [StoreCategory.MMO]: "MMO",
  [StoreCategory.Achievements]: "Achievements",
};
