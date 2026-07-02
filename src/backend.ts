import { callable } from "@decky/api";
import {
  AchievementSettings,
  AchievementSource,
  AchievementsResponse,
  GameOption,
  MetadataData,
  MetadataSearchResult,
  PlatformCapabilities,
  RetroAchievementsLoginResult,
  RetroAchievementsGameResult,
  RetroAchievementsResolutionResult,
  RetroAchievementsSettings,
  ScanProgress,
  XboxSettings,
  XboxTitleResult,
} from "./types";

export const getAllMetadata = callable<[], Record<string, MetadataData>>(
  "get_all_metadata"
);
export const getMetadata = callable<[appId: number], MetadataData | null>(
  "get_metadata"
);
export const saveMetadata = callable<
  [appId: number, metadata: MetadataData],
  MetadataData
>("save_metadata");
export const removeMetadata = callable<
  [appId: number],
  Record<string, MetadataData>
>("remove_metadata");
export const clearMetadataCache = callable<[], { ok: boolean; cleared?: number }>(
  "clear_metadata_cache"
);
export const refreshDelistedIndex = callable<
  [],
  { ok: boolean; count: number; fetched_at: number }
>("refresh_delisted_index");
export const getDelistedIndexStatus = callable<
  [],
  { count: number; fetched_at: number }
>("get_delisted_index_status");
export const frontendLog = callable<
  [area: string, message: string, fields?: Record<string, unknown> | null],
  boolean
>("frontend_log");
export const searchMetadata = callable<
  [query: string, limit?: number],
  MetadataSearchResult[]
>("search_metadata");
export const fetchMetadata = callable<[slugOrUrl: string], MetadataData | null>(
  "fetch_metadata"
);
export const autoFetchMetadata = callable<
  [appId: number, title: string],
  MetadataData | null
>("auto_fetch_metadata");
export const enrichSteamApp = callable<[appId: number], MetadataData | null>(
  "enrich_steam_app"
);
export const enrichCommunityMedia = callable<
  [appId: number, title?: string, sourceUrl?: string],
  MetadataData | null
>("enrich_community_media");
export const getSteamCommunityPage = callable<
  [appId: number, page: number],
  { items: any[]; page?: number }
>("get_steam_community_page");
export const startScanMissing = callable<
  [games: GameOption[]],
  ScanProgress
>("start_scan_missing");
export const getScanProgress = callable<[], ScanProgress>(
  "get_scan_progress"
);
export const startRefreshSteamActivities = callable<
  [games: GameOption[]],
  ScanProgress
>("start_refresh_steam_activities");
export const getActivityRefreshProgress = callable<[], ScanProgress>(
  "get_activity_refresh_progress"
);
export const getLocalShortcuts = callable<[], GameOption[]>(
  "get_local_shortcuts"
);
export const getPlatformCapabilities = callable<[], PlatformCapabilities>(
  "get_platform_capabilities"
);
export const getDebugLogging = callable<[], boolean>("get_debug_logging");
export const setDebugLogging = callable<[enabled: boolean], boolean>(
  "set_debug_logging"
);
export const getAchievementSettings = callable<[], AchievementSettings>(
  "get_achievement_settings"
);
export const getXboxSettings = callable<[], XboxSettings>("get_xbox_settings");
export const setXboxSettings = callable<
  [enabled: boolean, apiKey: string],
  XboxSettings
>("set_xbox_settings");
export const loginTrueAchievements = callable<
  [gamertag: string, password: string],
  { ok: boolean; message: string; gamertag?: string }
>("login_trueachievements");
export const testOpenXblCredentials = callable<
  [apiKey: string],
  { ok: boolean; message: string; gamertag?: string; xuid?: string }
>("test_openxbl_credentials");
export const clearXboxAssociations = callable<[], XboxSettings>(
  "clear_xbox_associations"
);
export const setXboxTitleId = callable<
  [appId: number, titleId: string | number | null],
  Record<string, string>
>("set_xbox_title_id");
export const setAchievementSource = callable<
  [appId: number, source: AchievementSource],
  Record<string, AchievementSource>
>("set_achievement_source");
export const setAchievementCachePolicy = callable<
  [policy: string],
  { policy: string }
>("set_achievement_cache_policy");
export const resolveXboxFromShortcut = callable<
  [appId: number, title?: string, path?: string],
  AchievementsResponse | null
>("resolve_xbox_from_shortcut");
export const searchXboxTitles = callable<
  [query: string, limit?: number, appId?: number, includeCatalog?: boolean],
  XboxTitleResult[]
>("search_xbox_titles");
export const getRetroAchievementsSettings = callable<
  [],
  RetroAchievementsSettings
>("get_retroachievements_settings");
export const setRetroAchievementsSettings = callable<
  [enabled: boolean, username: string, apiKey: string],
  RetroAchievementsSettings
>("set_retroachievements_settings");
export const testRetroAchievementsCredentials = callable<
  [username?: string, apiKey?: string],
  RetroAchievementsLoginResult
>("test_retroachievements_credentials");
export const setRetroAchievementsGameId = callable<
  [appId: number, gameId: number | null],
  Record<string, number>
>("set_retroachievements_game_id");
export const fetchAchievements = callable<
  [appId: number],
  AchievementsResponse | null
>("fetch_achievements");
export const syncTrueAchievementsProgress = callable<
  [appId: number],
  AchievementsResponse | null
>("sync_trueachievements_progress");
export const resolveRetroAchievementsFromPath = callable<
  [appId: number, path: string, title?: string],
  AchievementsResponse | RetroAchievementsResolutionResult | null
>("resolve_retroachievements_from_path");
export const searchRetroAchievementsGames = callable<
  [query: string, limit?: number, appId?: number],
  RetroAchievementsGameResult[]
>("search_retroachievements_games");
