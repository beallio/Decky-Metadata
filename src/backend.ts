import { callable } from "@decky/api";
import {
  GameOption,
  CommunityFallbackPage,
  CompatibilityDefaultScope,
  DeckCompatibilityCategory,
  MetadataData,
  MetadataSearchResult,
  SteamMatchSearchResponse,
  SteamOverride,
  PluginUpdateCandidate,
  PreparedTestingVersion,
  RevalidateResult,
  ScanProgress,
  ShortcutNameManagement,
  ShortcutNameState,
  TestingVersionsResult,
  UpdateChannel,
  UpdateCheckContext,
  UpdateCheckResult,
  UpdateInstallRequest,
  UpdateRpcResult,
  UpdateSettings,
  TrailerSettings,
  ProtonDbBadgeSettings,
  EditorHeaderSettings,
  ArtworkSettings,
  ArtworkSlot,
  ArtworkSummary,
  GameArtworkState,
  FetchedArtworkAsset,
  SgdbAssetPage,
  SgdbGame,
  SgdbGameOverride,
  SgdbKeyStatus,
  SgdbResolveGameResult,
  SgdbSlotFilter,
  IgnTrailerResult,
  ProtonDbTier,
} from "./types";
import type { HltbSettings } from "./hltb/settings";

/** Every record, without non-empty `steam_news`; `getMetadata` returns the full record. */
export const getAllMetadata = callable<[], Record<string, MetadataData>>(
  "get_all_metadata"
);
export const getNativeCssClasses = callable<[], Record<string, string>>(
  "get_native_css_classes"
);
export const getMetadata = callable<[appId: number], MetadataData | null>(
  "get_metadata"
);
export const saveMetadata = callable<
  [appId: number, metadata: MetadataData],
  MetadataData
>("save_metadata");
export const savePreviewedMetadata = callable<
  [appId: number, metadata: MetadataData, steamAppId: number],
  MetadataData
>("save_previewed_metadata");
/** Saves only while the stored record still equals `expected` (null = absent); null if it changed. */
export const saveMetadataIfUnchanged = callable<
  [appId: number, metadata: MetadataData, expected: MetadataData | null],
  MetadataData | null
>("save_metadata");
export const removeMetadata = callable<
  [appId: number],
  Record<string, MetadataData>
>("remove_metadata");
export const clearMetadataCache = callable<[], { ok: boolean; cleared?: number }>(
  "clear_metadata_cache"
);
export const getShortcutNameManagement = callable<
  [appId: number],
  ShortcutNameManagement
>("get_shortcut_name_management");
export const saveShortcutNameState = callable<
  [appId: number, originalName: string, appliedName: string, steamAppId: number],
  ShortcutNameState
>("save_shortcut_name_state");
export const clearShortcutNameState = callable<[appId: number], { ok: boolean }>(
  "clear_shortcut_name_state"
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
  [
    area: string,
    message: string,
    fields?: Record<string, unknown> | null,
    level?: "debug" | "info" | "warning" | "error",
  ],
  boolean
>("frontend_log");
export const searchMetadata = callable<
  [query: string, limit?: number],
  MetadataSearchResult[]
>("search_metadata");
export const searchSteamMatches = callable<
  [query: string, limit?: number],
  SteamMatchSearchResponse
>("search_steam_matches");
export const fetchMetadata = callable<[slugOrUrl: string], MetadataData | null>(
  "fetch_metadata"
);
export const applyFetchedMetadata = callable<
  [appId: number, slugOrUrl: string],
  MetadataData | null
>("apply_fetched_metadata");
export const previewFetchedMetadata = callable<
  [metadata: MetadataData, slugOrUrl: string],
  MetadataData | null
>("preview_fetched_metadata");
export const getCommunityFallbackPage = callable<
  [appId: number, page: number],
  CommunityFallbackPage
>("get_community_fallback_page");
export const autoFetchMetadata = callable<
  [appId: number, title: string],
  MetadataData | null
>("auto_fetch_metadata");
export const enrichSteamApp = callable<
  [appId: number, mode: "metadata" | "steam-name", language?: string],
  MetadataData | null
>("enrich_steam_app");
export const previewSteamMetadata = callable<
  [metadata: MetadataData, language?: string],
  MetadataData | null
>("preview_steam_metadata");
export const startScanMissing = callable<
  [games: GameOption[], language?: string],
  ScanProgress
>("start_scan_missing");
export const getMissingMetadataCount = callable<
  [games: GameOption[]],
  number
>("get_missing_metadata_count");
export const getScanProgress = callable<[], ScanProgress>(
  "get_scan_progress"
);
export const startRefreshSteamActivities = callable<
  [games: GameOption[], language?: string],
  ScanProgress
>("start_refresh_steam_activities");
export const refreshSteamActivityForApp = callable<
  [appId: number, language?: string],
  MetadataData | null
>("refresh_steam_activity_for_app");
export const getActivityRefreshProgress = callable<[], ScanProgress>(
  "get_activity_refresh_progress"
);
export const getLocalShortcuts = callable<[], GameOption[]>(
  "get_local_shortcuts"
);
export const getPluginVersion = callable<[], string>("get_plugin_version");
export const getSystemVersions = callable<[], { decky: string; steamos: string }>(
  "get_system_versions"
);
export const getPluginLogs = callable<[], string>("get_plugin_logs");
export const getDebugLogging = callable<[], boolean>("get_debug_logging");
export const setDebugLogging = callable<[enabled: boolean], boolean>(
  "set_debug_logging"
);
export const getCompatibilityDefault = callable<[], DeckCompatibilityCategory | null>(
  "get_compatibility_default"
);
export const setCompatibilityDefault = callable<
  [category: DeckCompatibilityCategory | null],
  DeckCompatibilityCategory | null
>("set_compatibility_default");
export const getCompatibilityDefaultScope = callable<[], CompatibilityDefaultScope>(
  "get_compatibility_default_scope"
);
export const setCompatibilityDefaultScope = callable<
  [scope: CompatibilityDefaultScope],
  CompatibilityDefaultScope
>(
  "set_compatibility_default_scope"
);
export const checkForPluginUpdate = callable<
  [currentVersion: string, force: boolean],
  UpdateCheckResult
>("check_for_plugin_update");
export const revalidatePluginUpdate = callable<
  [candidate: PluginUpdateCandidate],
  UpdateRpcResult<RevalidateResult>
>("revalidate_plugin_update");
export const recordUpdateInstallRequested = callable<
  [candidate: UpdateInstallRequest],
  UpdateRpcResult<UpdateCheckContext>
>("record_update_install_requested");
export const confirmUpdateInstallHandoff = callable<
  [version: string],
  UpdateRpcResult<UpdateCheckContext>
>("confirm_update_install_handoff");
export const clearPendingUpdateInstall = callable<
  [version: string | null],
  UpdateRpcResult<UpdateCheckContext>
>("clear_pending_update_install");
export const getUpdateCheckContext = callable<
  [],
  UpdateRpcResult<UpdateCheckContext>
>("get_update_check_context");
export const getUpdateSettings = callable<[], UpdateRpcResult<UpdateSettings>>(
  "get_update_settings"
);
export const setUpdateChannel = callable<
  [channel: UpdateChannel],
  UpdateRpcResult<UpdateSettings>
>("set_update_channel");
export const setAutomaticUpdateChecks = callable<
  [enabled: boolean],
  UpdateRpcResult<UpdateSettings>
>("set_automatic_update_checks");
export const setTestingTabEnabled = callable<
  [enabled: boolean],
  UpdateRpcResult<UpdateSettings>
>("set_testing_tab_enabled");
export const getTestingVersions = callable<[], TestingVersionsResult>(
  "get_testing_versions"
);
export const prepareTestingVersion = callable<
  [prId: number, headSha: string],
  PreparedTestingVersion
>("prepare_testing_version");
export const getTrailerSettings = callable<[], TrailerSettings>("get_trailer_settings");
export const setTrailerSettings = callable<
  [settings: TrailerSettings],
  TrailerSettings
>("set_trailer_settings");
export const getMiniAchievementsEnabled = callable<[], boolean>("get_mini_achievements_enabled");
export const setMiniAchievementsEnabled = callable<[enabled: boolean], boolean>(
  "set_mini_achievements_enabled"
);
export const getProtonDbBadgeSettings = callable<[], ProtonDbBadgeSettings>(
  "get_protondb_badge_settings"
);
export const setProtonDbBadgeSettings = callable<
  [settings: ProtonDbBadgeSettings],
  ProtonDbBadgeSettings
>("set_protondb_badge_settings");
export const getEditorHeaderSettings = callable<[], EditorHeaderSettings>(
  "get_editor_header_settings"
);
export const setEditorHeaderSettings = callable<
  [settings: EditorHeaderSettings],
  EditorHeaderSettings
>("set_editor_header_settings");
export const getArtworkSettings = callable<[], ArtworkSettings>("get_artwork_settings");
export const setArtworkSettings = callable<[settings: ArtworkSettings], ArtworkSettings>(
  "set_artwork_settings"
);
export const getArtworkLocked = callable<[appId: number], boolean>("get_artwork_locked");
export const setArtworkLocked = callable<[appId: number, locked: boolean], boolean>(
  "set_artwork_locked"
);
export const getAllArtworkLocks = callable<[], Record<string, boolean>>("get_all_artwork_locks");
export const getArtworkSummary = callable<[games: GameOption[]], ArtworkSummary>(
  "get_artwork_summary"
);
export const getGameArtworkState = callable<
  [appId: number, steamAppId: number | null],
  GameArtworkState
>("get_game_artwork_state");
export const fetchSteamArtworkAsset = callable<
  [appId: number, steamAppId: number, slot: ArtworkSlot],
  FetchedArtworkAsset
>("fetch_steam_artwork_asset");
export const clearLocalArtworkFile = callable<
  [appId: number, slot: ArtworkSlot],
  { ok: boolean; removed: boolean }
>("clear_local_artwork_file");
export const getSgdbKeyStatus = callable<[], SgdbKeyStatus>("get_sgdb_key_status");
export const sgdbSearchGames = callable<[query: string], SgdbGame[]>("sgdb_search_games");
export const sgdbResolveGame = callable<
  [appId: number, steamAppId: number | null, gameName: string],
  SgdbResolveGameResult
>("sgdb_resolve_game");
export const sgdbListAssets = callable<
  [sgdbGameId: number, slot: ArtworkSlot, filters: SgdbSlotFilter, page: number],
  SgdbAssetPage
>("sgdb_list_assets");
export const sgdbFetchAsset = callable<
  [appId: number, slot: ArtworkSlot, url: string],
  FetchedArtworkAsset
>("sgdb_fetch_asset");
export const readLocalArtworkFile = callable<
  [appId: number, slot: ArtworkSlot, filePath: string],
  FetchedArtworkAsset
>("read_local_artwork_file");
export const getTransparentArtworkAsset = callable<
  [appId: number, slot: ArtworkSlot],
  FetchedArtworkAsset
>("get_transparent_artwork_asset");
export const setSgdbGameOverride = callable<
  [appId: number, sgdbGameId: number, name: string],
  SgdbGameOverride
>("set_sgdb_game_override");
export const clearSgdbGameOverride = callable<
  [appId: number],
  { ok: boolean }
>("clear_sgdb_game_override");
export type ProtonDbRatingRecord = { tier: ProtonDbTier | null; updated_at: number };
export type ProtonDbNameRecord = { name: string; steam_appid: number; resolved_at: number };
export type HltbTimes = { main: number; plus: number; complete: number; all: number };
/** A saved HowLongToBeat result; times are seconds. */
export type HltbEntry = {
  status: "matched" | "no_match";
  hltb_id: number | null;
  game_name: string | null;
  stats: HltbTimes | null;
  steam_appid_used: number | null;
  title_used: string;
  pinned_id_used: number | null;
  fetched_at: number;
};
export type HltbStatsResult =
  | HltbEntry
  | { status: "error"; retry_after_ms: number }
  | { status: "disabled" }
  | { status: "blocked" };
export type ProviderCacheSnapshot = {
  version: 1;
  protondb: {
    ratings: Record<string, ProtonDbRatingRecord>;
    name_ids: Record<string, ProtonDbNameRecord>;
  };
  hltb: { entries: Record<string, HltbEntry> };
};
export const getProviderCache = callable<[], ProviderCacheSnapshot>("get_provider_cache");
export const putProtonDbCache = callable<
  [ratings: Record<string, ProtonDbRatingRecord>, nameIds: Record<string, ProtonDbNameRecord>],
  { ok: boolean }
>("put_protondb_cache");
export const getAllSteamOverrides = callable<[], Record<string, SteamOverride>>(
  "get_all_steam_overrides"
);
export const getSteamOverride = callable<[appId: number], SteamOverride | null>(
  "get_steam_override"
);
export const saveSteamOverride = callable<
  [appId: number, override: SteamOverride],
  SteamOverride | null
>("save_steam_override");
export const getHltbSettings = callable<[], HltbSettings>("get_hltb_settings");
export const setHltbSettings = callable<[settings: HltbSettings], HltbSettings>("set_hltb_settings");
export const getHltbStats = callable<
  [appId: number, isShortcut: boolean, title: string, usePinned?: boolean],
  HltbStatsResult
>("get_hltb_stats");
export const checkHltbGameId = callable<
  [gameId: number],
  { found: true; game_id: number; game_name: string } | { found: false }
>("check_hltb_game_id");
export type HltbSearchResult = { game_id: number; game_name: string; main_seconds: number; count: number };
export const searchHltbGames = callable<[query: string], HltbSearchResult[]>("search_hltb_games");
export const clearHltbCache = callable<[], { ok: boolean }>("clear_hltb_cache");
export const findIgnTrailer = callable<
  [title: string, gameUrl?: string | null],
  IgnTrailerResult | null
>("find_ign_trailer");
export const evalInBigPicture = callable<
  [code: string],
  Record<string, unknown>
>("eval_in_big_picture");
