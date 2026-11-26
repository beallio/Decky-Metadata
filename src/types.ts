export type Person = {
  name: string;
  url: string;
};

export type UpdateChannel = "stable" | "development";

export type PluginUpdateCandidate = {
  version: string;
  tag: string;
  channel: UpdateChannel;
  artifact_url: string;
  sha256: string;
  release_url: string;
  published_at: string;
  action: "update" | "move_to_stable" | "downgrade_to_stable";
};

export type UpdateInstallRequest = PluginUpdateCandidate & {
  updateTraceId: string;
};

export type UpdateCheckResult =
  | {
      status: "available";
      checked_at: string;
      channel: UpdateChannel;
      candidate: PluginUpdateCandidate;
    }
  | { status: "current"; checked_at: string; channel: UpdateChannel }
  | {
      status: "failed";
      checked_at: string;
      message?: string;
      retry_after?: string;
    };

export type PendingUpdateInstall = {
  version: string;
  tag: string;
  channel: UpdateChannel;
  published_at: string;
  requested_at: string;
  handoff_confirmed_at?: string;
  update_trace_id?: string | null;
};

export type UpdateCheckContext = {
  update_channel: UpdateChannel;
  automatic_update_checks: boolean;
  testing_tab_enabled?: boolean;
  installed_version: string;
  last_checked_at: string | null;
  last_checked_channel: UpdateChannel | null;
  last_available_tag: string | null;
  last_notified_tag: string | null;
  installed_release_tag: string | null;
  installed_release_published_at: string | null;
  pending_update_install: PendingUpdateInstall | null;
  rate_limited_until: string | null;
};

export type RevalidateResult = PluginUpdateCandidate;

export type UpdateSettings = {
  update_channel: UpdateChannel;
  automatic_update_checks: boolean;
  testing_tab_enabled: boolean;
};

export type TestingPullRequest = {
  id: number;
  name: string;
  link: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
  author: string;
  is_fork: boolean;
  draft: boolean;
};

export type TestingVersionsResult =
  | {
      status: "ok";
      checked_at: string;
      items: TestingPullRequest[];
    }
  | {
      status: "failed";
      checked_at?: string;
      message?: string;
      retry_after?: string;
    };

export type PreparedTestingVersion =
  | {
      status: "ready";
      pr_id: number;
      version: string;
      tag: string;
      channel: UpdateChannel;
      artifact_url: string;
      sha256: string;
      published_at: string;
    }
  | {
      status: "failed";
      checked_at?: string;
      message?: string;
      retry_after?: string;
    };

export type TrailerQuality = "auto" | 720 | 1080 | 1440 | 2160;
export type IgnTrailerResult = {
  name: string;
  candidates: Array<{ format: "mp4"; url: string; height: number }>;
};


/** Metadata-owned trailer preferences for Detail and Home views. */
export type TrailerSettings = {
  enabled: boolean;
  detailEnabled: boolean;
  homeEnabled: boolean;
  audioEnabled: boolean;
  hideLogoDuringTrailer: boolean;
  quality: TrailerQuality;
  detailFadeInDelaySeconds: number;
  homeFadeInDelaySeconds: number;
};

export type TrailerStatus = {
  settings: TrailerSettings;
  appId?: number;
  sourceAppId?: number | null;
  status: string;
  trailerName?: string;
  gameTitle?: string;
  displayWidth: number | null;
  displayHeight: number | null;
  targetHeight: number;
};

export type ProtonDbTier = "platinum" | "gold" | "silver" | "bronze" | "borked";

export type ProtonDbBadgeSettings = {
  enabled: boolean;
  home: boolean;
  library: boolean;
  gameView: boolean;
  store: boolean;
  focusOnly: boolean;
  coverPosition: "bottom-left" | "top-left" | "top-right";
};

/** QAM "Context menu" options for the Edit Metadata page header. */
export type EditorHeaderSettings = {
  gameIcon: boolean;
  steamIconFallback: boolean;
};

export type UpdateRpcStatus = {
  status: "failed" | "skipped";
  message?: string;
};

export type UpdateRpcResult<T> = T | UpdateRpcStatus;

/** Steam's packed Deck compatibility category values. */
export type DeckCompatibilityCategory = 0 | 1 | 2 | 3;

/** Steam's SteamOS compatibility categories. Valve maps Verified to Compatible. */
export type SteamOsCompatibilityCategory = 0 | 1 | 2;

/** Which native non-Steam shortcuts inherit a numeric global default. */
export type CompatibilityDefaultScope = "steam" | "no-steam" | "metadata" | "all";

/** A per-shortcut policy: inherit, follow current Valve data, or use a fixed category. */
export type DeckCompatibilityOverride = DeckCompatibilityCategory | "valve" | null;

/** Per-game overrides for native Steam games, stored separately from non-Steam metadata. */
export type SteamOverride = {
  /** A HowLongToBeat game the user chose for this Steam game's Library page. */
  hltb_game_id?: number | null;
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
  release_date?: string | null;
  rating?: number | null;
  store_categories: number[];
  genres?: string[];
  features?: string[];
  screenshots?: MetadataScreenshot[];
  steam_appid?: number | string | null;
  /** A HowLongToBeat game the user chose for this shortcut. */
  hltb_game_id?: number | null;
  /** Steam's own cleaned display name, kept separate from editable title data. */
  steam_store_name?: string;
  /** Steam language of the stored Steam-sourced description/genres; absent means English. */
  metadata_language?: string;
  steam_dlc_appids: number[];
  has_points_shop: boolean;
  steam_store_state?: "available" | "delisted" | "unknown";
  deck_compat_category?: DeckCompatibilityCategory | null;
  steamos_compat_category?: SteamOsCompatibilityCategory | null;
  steam_machine_compat_category?: DeckCompatibilityCategory | null;
  steam_frame_compat_category?: DeckCompatibilityCategory | null;
  /** A user-selected status. Null inherits the global default; "valve" bypasses it. */
  deck_compat_override?: DeckCompatibilityOverride;
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
  cover_url?: string | null;
};

export type SteamMatchCandidate = {
  steam_appid: number;
  title: string;
  cover_url: string | null;
};

export type SteamMatchSearchResponse = {
  items: SteamMatchCandidate[];
  error: string | null;
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
    Apps?: SteamAppsBoundary;
    [key: string]: unknown;
  };
  appStore: {
    GetAppOverviewByAppID?: (appId: number) => SteamOverview | null | undefined;
    GetIconURLForApp?: (overview: SteamOverview) => string | null;
    allApps?: SteamOverview[] | Record<string, SteamOverview>;
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
  ControllerStore?: SteamControllerStoreBoundary;
  controllerStore?: SteamControllerStoreBoundary;
  [key: string]: unknown;
};

/** Minimal Steam Input bridge used to request controller configuration data. */
export type SteamInputBoundary = {
  QueryControllerConfigsForApp?: (...args: unknown[]) => unknown;
};

/** Minimal native shortcut-name write surface exposed by Steam Client. */
export type SteamAppsBoundary = {
  SetShortcutName?: (appId: number, name: string) => void;
};

export type ShortcutNameState = {
  original_name: string;
  applied_name: string;
  steam_appid: number;
  updated_at: number;
};

export type ShortcutNameManagement = {
  eligible: boolean;
  reason: "ready" | "shortcut_not_found" | "derived_shortcut_id";
  state: ShortcutNameState | null;
};

export type SteamControllerStoreBoundary = {
  GetControllers?: (() => unknown) | undefined;
  [key: string]: unknown;
};

export type SteamControllerRecord = {
  nControllerIndex: unknown;
  eControllerType: unknown;
  eControllerStyle?: unknown;
};

/** Minimal controller-configurator store surface used for supplemental reads. */
export type ControllerConfiguratorStoreBoundary = {
  QueryConfigsForApp?: (...args: unknown[]) => unknown;
  GetOfficialConfigsForApp?: (...args: unknown[]) => unknown;
  GetTemplateConfigsForApp?: (...args: unknown[]) => unknown;
  GetWorkshopConfigsForApp?: (...args: unknown[]) => unknown;
  GetAllConfigs?: (...args: unknown[]) => unknown;
  m_appId?: unknown;
  m_lastValidAppId?: unknown;
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
  /** Native release-year label cache, invalidated when owned date fields change. */
  __cachedReleaseYearString?: string;
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
  GetDiscussionURL: (vanityUrl?: string) => string;
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
  message_code?: string | null;
  message_args?: Record<string, unknown> | null;
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

/** Steam information toggles in display order, mapped to their label keys. */
export const CATEGORY_LABELS: Record<number, string> = {
  [StoreCategory.SinglePlayer]: "categories.singlePlayer",
  [StoreCategory.MultiPlayer]: "categories.multiPlayer",
  [StoreCategory.CoOp]: "categories.coOp",
  [StoreCategory.OnlineMultiPlayer]: "categories.onlineMultiPlayer",
  [StoreCategory.OnlineCoOp]: "categories.onlineCoOp",
  [StoreCategory.LocalMultiPlayer]: "categories.localMultiPlayer",
  [StoreCategory.LocalCoOp]: "categories.localCoOp",
  [StoreCategory.SplitScreen]: "categories.splitScreen",
  [StoreCategory.FullController]: "categories.fullController",
  [StoreCategory.MMO]: "categories.mmo",
  [StoreCategory.Achievements]: "categories.achievements",
};

export const categoryLabel = (category: number, t: (key: string) => string): string => {
  switch (category) {
    case StoreCategory.SinglePlayer:
      return t("categories.singlePlayer");
    case StoreCategory.MultiPlayer:
      return t("categories.multiPlayer");
    case StoreCategory.CoOp:
      return t("categories.coOp");
    case StoreCategory.OnlineMultiPlayer:
      return t("categories.onlineMultiPlayer");
    case StoreCategory.OnlineCoOp:
      return t("categories.onlineCoOp");
    case StoreCategory.LocalMultiPlayer:
      return t("categories.localMultiPlayer");
    case StoreCategory.LocalCoOp:
      return t("categories.localCoOp");
    case StoreCategory.SplitScreen:
      return t("categories.splitScreen");
    case StoreCategory.FullController:
      return t("categories.fullController");
    case StoreCategory.MMO:
      return t("categories.mmo");
    case StoreCategory.Achievements:
      return t("categories.achievements");
    default:
      return "";
  }
};
