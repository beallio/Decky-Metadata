import { callable } from "@decky/api";
import {
  GameOption,
  CommunityFallbackPage,
  MetadataData,
  MetadataSearchResult,
  PluginUpdateCandidate,
  RevalidateResult,
  ScanProgress,
  UpdateChannel,
  UpdateCheckContext,
  UpdateCheckResult,
  UpdateInstallRequest,
  UpdateRpcResult,
  UpdateSettings,
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
export const fetchMetadata = callable<[slugOrUrl: string], MetadataData | null>(
  "fetch_metadata"
);
export const applyFetchedMetadata = callable<
  [appId: number, slugOrUrl: string],
  MetadataData | null
>("apply_fetched_metadata");
export const getCommunityFallbackPage = callable<
  [appId: number, page: number],
  CommunityFallbackPage
>("get_community_fallback_page");
export const autoFetchMetadata = callable<
  [appId: number, title: string],
  MetadataData | null
>("auto_fetch_metadata");
export const enrichSteamApp = callable<[appId: number], MetadataData | null>(
  "enrich_steam_app"
);
export const startScanMissing = callable<
  [games: GameOption[]],
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
  [games: GameOption[]],
  ScanProgress
>("start_refresh_steam_activities");
export const refreshSteamActivityForApp = callable<
  [appId: number],
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
