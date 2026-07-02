import {
  DialogButton,
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ScrollPanel,
  Spinner,
  TextField,
  ToggleField,
  useParams,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAchievements,
  fetchMetadata,
  getAchievementSettings,
  getDebugLogging,
  getMetadata,
  getPlatformCapabilities,
  getRetroAchievementsSettings,
  getActivityRefreshProgress,
  removeMetadata,
  resolveRetroAchievementsFromPath,
  resolveXboxFromShortcut,
  saveMetadata,
  searchRetroAchievementsGames,
  searchXboxTitles,
  searchMetadata,
  setAchievementCachePolicy,
  setAchievementSource,
  setDebugLogging,
  setRetroAchievementsGameId,
  setRetroAchievementsSettings,
  setXboxSettings,
  setXboxTitleId,
  startRefreshSteamActivities,
  startScanMissing,
  testRetroAchievementsCredentials,
  getScanProgress,
  testOpenXblCredentials,
  clearXboxAssociations,
  clearMetadataCache,
  getDelistedIndexStatus,
  enrichSteamApp,
  refreshDelistedIndex,
  syncTrueAchievementsProgress,
} from "./backend";
import * as log from "./log";
import { openExternalUrl } from "./openExternalUrl";
import {
  allNonSteamGames,
  appName,
  applyAchievementPayload,
  applyMetadata,
  clearAchievementsForApp,
  clearAchievementsForApps,
  cleanTitle,
  getAppDetails,
  getOverview,
  isNonSteamApp,
  metadataCache,
  refreshMetadataCache,
  refreshRaSettings,
  isUwphookGameOption,
  patchInstallStatus,
} from "./steam";
import {
  AchievementSource,
  AchievementCachePolicy,
  AchievementsResponse,
  CATEGORY_LABELS,
  GameOption,
  MetadataData,
  MetadataSearchResult,
  PlatformCapabilities,
  RetroAchievementsGameResult,
  RetroAchievementsSettings,
  StoreCategory,
  XboxSettings,
  XboxTitleResult,
} from "./types";

const retroResolutionMessageKey = (reason?: string) => {
  switch (reason) {
    case "no_candidate_path":
      return "No ROM path was detected from this Steam shortcut. Use manual RetroAchievements search or check the launch options.";
    case "candidate_missing":
      return "The detected ROM path does not exist. Check the shortcut launch options or pick the game manually.";
    case "unsupported_extension":
      return "The detected path is not a supported ROM file. Use manual RetroAchievements search or check the shortcut target.";
    case "hash_not_found":
      return "No RetroAchievements game matched the detected ROM. Search manually and pick the closest entry.";
    case "api_credentials_missing":
      return "Add your RetroAchievements username and API key before auto-detecting achievements.";
    case "api_error":
      return "RetroAchievements lookup failed. Try again later or search manually.";
    case "manual_mapping_exists":
      return "This game already has a RetroAchievements game ID. Manual selection was kept.";
    default:
      return "No RetroAchievements match found from this game's shortcut path.";
  }
};

const ACHIEVEMENT_CACHE_LABELS: Record<string, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  pc_session: "PC session",
  manual: "Manually",
};

const ACHIEVEMENT_SOURCE_LABELS: Record<string, string> = {
  auto: "Auto",
  retroachievements: "RetroAchievements",
  xbox: "Xbox",
  disabled: "Disabled",
};

export const parseSteamAppId = (input: string): number => {
  const s = String(input || "").trim();
  if (!s) return 0;
  const match =
    (/^\d+$/.test(s) ? [s, s] : null) ||
    s.match(/(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i) ||
    s.match(/[?&]appid=(\d+)/i) ||
    s.match(/\bapp\/(\d+)\b/i);
  const parsed = Number(match?.[1] || 0);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : 0;
};

const FocusableButton = (props: any) => (
  <DialogButton focusable={true} {...props} />
);

const pageStyle = {
  padding: 24,
  paddingTop: 48,
  paddingBottom: 120,
  minHeight: "100vh",
  boxSizing: "border-box",
} as const;

const rowStackStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  gap: "0.65rem",
} as const;

const buttonRowStyle = {
  display: "flex",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  gap: "0.5rem",
  alignItems: "center",
  flexWrap: "wrap",
} as const;

const spacedButtonRowStyle = {
  ...buttonRowStyle,
  marginTop: "0.35rem",
} as const;

const actionButtonStackStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "0.35rem",
  flex: "1 1 13rem",
  minWidth: 0,
} as const;

const resultsStackStyle = {
  ...rowStackStyle,
  marginTop: "1.25rem",
} as const;

const fieldStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
} as const;

const flexFieldStyle = {
  ...fieldStyle,
  flex: "1 1 14rem",
} as const;

const compactTextStyle = {
  opacity: 0.72,
  fontSize: "0.82rem",
  lineHeight: 1.35,
} as const;

const inlineStatusStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  ...compactTextStyle,
} as const;

const scanSpinnerStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1rem",
  height: "1rem",
  flex: "0 0 1rem",
  overflow: "hidden",
} as const;

const scanSpinnerInnerStyle = {
  display: "inline-flex",
  transform: "scale(0.5)",
  transformOrigin: "center",
} as const;

const activityStatusStyle = {
  ...inlineStatusStyle,
  minHeight: "3.35rem",
} as const;

const activitySpinnerStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "3.35rem",
  height: "3.35rem",
  flex: "0 0 3.35rem",
  overflow: "hidden",
} as const;

const activitySpinnerInnerStyle = {
  display: "inline-flex",
  transform: "scale(0.72)",
  transformOrigin: "center",
} as const;

const sectionHeadingStyle = {
  width: "100%",
  paddingTop: "0.75rem",
  fontWeight: 700,
  fontSize: "0.95rem",
} as const;

const diagnosticsGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "0.35rem",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
} as const;

const diagnosticsRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "0.75rem",
  alignItems: "start",
  ...compactTextStyle,
} as const;

const diagnosticsValueStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  textAlign: "right",
} as const;

const platformSupportKeys = [
  "supports_metadata",
  "supports_steam_activity",
  "supports_retroachievements",
  "supports_retroachievements_auto",
  "supports_xbox_manual",
  "supports_xbox_uwphook_auto",
  "supports_xbox_app_scan",
  "supports_loopback_icons",
  "supports_localhost_icon_proxy",
] as const;

const metadataTemplate = (title: string): MetadataData => ({
  title,
  id: title,
  source: "Manual",
  source_url: "",
  description: "",
  short_description: "",
  developers: [],
  publishers: [],
  release_date: null,
  rating: null,
  store_categories: [StoreCategory.SinglePlayer],
  genres: [],
  features: [],
  screenshots: [],
});

const personsToText = (people?: { name: string }[]) =>
  (people || []).map((person) => person.name).join(", ");

const textToPersons = (value: string) =>
  value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, url: "" }));

const epochToDate = (value?: number | null) => {
  if (!value) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const dateToEpoch = (value: string) => {
  if (!value.trim()) return null;
  const timestamp = Date.parse(`${value.trim()}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return null;
  return Math.floor(timestamp / 1000);
};

const parseRating = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
};

const achievementCachePolicies: AchievementCachePolicy[] = [
  "hourly",
  "daily",
  "weekly",
  "pc_session",
  "manual",
];

const useNonSteamGames = () => {
  const [games, setGames] = useState<GameOption[]>([]);
  const loadGames = useCallback(async () => {
    setGames(await allNonSteamGames());
  }, []);
  useEffect(() => {
    void loadGames();
  }, [loadGames]);
  return { games, loadGames };
};

export const Content = () => {
  const { games, loadGames } = useNonSteamGames();
  const [metadataCount, setMetadataCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [cacheBusy, setCacheBusy] = useState(false);
  const [delistedStatus, setDelistedStatus] = useState<{
    count: number;
    fetched_at: number;
  } | null>(null);
  const [delistedBusy, setDelistedBusy] = useState(false);
  const [xboxBulkBusy, setXboxBulkBusy] = useState(false);
  const [xboxBulkMessage, setXboxBulkMessage] = useState("");
  const [ra, setRa] = useState<RetroAchievementsSettings>({
    enabled: false,
    username: "",
    api_key: "",
    game_ids: {},
  });
  const [xbox, setXbox] = useState<XboxSettings>({
    enabled: false,
    api_key: "",
    xuid: "",
    gamertag: "",
    ta_logged_in: false,
    title_ids: {},
  });
  const [achievementCachePolicy, setAchievementCachePolicyState] =
    useState<AchievementCachePolicy>("daily");
  const [platformCapabilities, setPlatformCapabilities] =
    useState<PlatformCapabilities | undefined>();
  const [showPlatformDiagnostics, setShowPlatformDiagnostics] = useState(false);
  const [debugLogging, setDebugLoggingState] = useState(false);

  const missing = Math.max(games.length - metadataCount, 0);

  const refresh = useCallback(async () => {
    await refreshMetadataCache();
    await loadGames();
    setMetadataCount(Object.keys(metadataCache).length);
    const achievementSettings = await getAchievementSettings();
    setRa(achievementSettings.retroachievements);
    setXbox(achievementSettings.xbox);
    setAchievementCachePolicyState(achievementSettings.achievement_cache?.policy || "daily");
  }, [loadGames]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDelistedStatus = useCallback(async () => {
    try {
      setDelistedStatus(await getDelistedIndexStatus());
    } catch (error) {
      log.warn("bridge", "delisted index status load failed", error);
    }
  }, []);

  useEffect(() => {
    void loadDelistedStatus();
  }, [loadDelistedStatus]);

  useEffect(() => {
    let cancelled = false;
    void getDebugLogging()
      .then((enabled) => {
        if (!cancelled) {
          setDebugLoggingState(enabled);
          log.setVerboseLogging(enabled);
        }
      })
      .catch((error) => log.warn("bridge", "debug logging setting load failed", error));
    void getPlatformCapabilities()
      .then((capabilities) => {
        if (!cancelled) {
          setPlatformCapabilities(capabilities);
          log.info("bridge", "platform capabilities loaded", capabilities);
        }
      })
      .catch((error) => log.warn("bridge", "platform capabilities load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDebugLogging = async (enabled: boolean) => {
    setDebugLoggingState(enabled);
    log.setVerboseLogging(enabled);
    try {
      const saved = await setDebugLogging(enabled);
      setDebugLoggingState(saved);
      log.setVerboseLogging(saved);
      log.info("bridge", "debug logging setting updated", saved);
    } catch (error) {
      log.warn("bridge", "debug logging setting update failed", error);
    }
  };

  const scanMissing = async () => {
    if (busy) return;
    setBusy(true);
    setScanMessage("");
    try {
      await startScanMissing(games);
      const interval = window.setInterval(async () => {
        const progress = await getScanProgress();
        setScanMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (!progress.running) {
          window.clearInterval(interval);
          await refresh();
          setBusy(false);
          toaster.toast({ title: "Playhub Metadata", body: "Scan complete" });
        }
      }, 800);
    } catch (error) {
      setBusy(false);
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    }
  };

  const refreshActivities = async () => {
    if (activityBusy) return;
    setActivityBusy(true);
    setActivityMessage("Refreshing Activity...");
    try {
      await startRefreshSteamActivities(games);
      const interval = window.setInterval(async () => {
        const progress = await getActivityRefreshProgress();
        setActivityMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (!progress.running) {
          window.clearInterval(interval);
          await refreshMetadataCache();
          setMetadataCount(Object.keys(metadataCache).length);
          setActivityBusy(false);
          window.dispatchEvent(new Event("playhub-metadata:activity-refreshed"));
          window.dispatchEvent(new Event("playhub-metadata:updated"));
          toaster.toast({ title: "Playhub Metadata", body: "Activity refresh complete" });
        }
      }, 800);
    } catch (error) {
      setActivityBusy(false);
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    }
  };

  const saveRaSettings = async (next: Partial<RetroAchievementsSettings>) => {
    const merged = { ...ra, ...next };
    setRa(merged);
    const saved = await setRetroAchievementsSettings(
      merged.enabled,
      merged.username,
      merged.api_key
    );
    setRa(saved);
    await refreshRaSettings();
  };

  const testRaLogin = async () => {
    const saved = await setRetroAchievementsSettings(
      true,
      ra.username,
      ra.api_key
    );
    setRa(saved);
    await refreshRaSettings();
    const result = await testRetroAchievementsCredentials(
      saved.username,
      saved.api_key
    );
    toaster.toast({
      title: "Playhub Metadata",
      body: result.ok ? "RetroAchievements login OK" : result.message || "RetroAchievements login failed",
    });
  };

  const saveXboxSettings = async (next: Partial<XboxSettings>) => {
    const merged = { ...xbox, ...next };
    setXbox(merged);
    const saved = await setXboxSettings(merged.enabled, merged.api_key || "");
    setXbox(saved);
    await refreshRaSettings();
  };

  const saveAchievementCachePolicy = async (policy: AchievementCachePolicy) => {
    setAchievementCachePolicyState(policy);
    const saved = await setAchievementCachePolicy(policy);
    setAchievementCachePolicyState((saved.policy as AchievementCachePolicy) || policy);
    clearAchievementsForApps(games.map((game) => game.appid));
    await refreshRaSettings();
  };

  const clearCache = async () => {
    if (cacheBusy || busy) return;
    setCacheBusy(true);
    try {
      await clearMetadataCache();
      await refreshMetadataCache();
      if (games.length) {
        void startScanMissing(games).catch((error) => {
          log.warn("bridge", "metadata scan start after clear cache failed", error);
        });
      }
      setMetadataCount(Object.keys(metadataCache).length);
      toaster.toast({ title: "Playhub Metadata", body: "Metadata cache cleared" });
    } catch (error) {
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    } finally {
      setCacheBusy(false);
    }
  };

  const refreshDelisted = async () => {
    if (delistedBusy) return;
    setDelistedBusy(true);
    try {
      const result = await refreshDelistedIndex();
      if (!result.ok) {
        throw new Error("Delisted index refresh failed");
      }
      toaster.toast({ title: "Playhub Metadata", body: "Delisted index updated" });
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toaster.toast({ title: "Playhub Metadata", body: "Delisted index refresh failed" });
    } finally {
      setDelistedBusy(false);
    }
  };

  const delistedStatusText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `${delistedStatus.count} delisted apps · updated ${epochToDate(delistedStatus.fetched_at)}`
      : "Delisted index not downloaded yet";

  const testXboxLogin = async () => {
    if (!xbox.api_key.trim()) {
      const saved = await setXboxSettings(true, xbox.api_key || "");
      setXbox(saved);
      await refreshRaSettings();
      toaster.toast({ title: "Playhub Metadata", body: "Enter your OpenXBL API key, then press Login." });
      return;
    }
    const result = await testOpenXblCredentials(xbox.api_key || "");
    const refreshed = await getAchievementSettings();
    setXbox(refreshed.xbox);
    await refreshRaSettings();
    toaster.toast({ title: "Playhub Metadata", body: result.ok ? "OpenXBL verified" : result.message || "OpenXBL not verified" });
  };

  const openRetroAchievements = () => openExternalUrl("https://retroachievements.org/");
  const openOpenXbl = () => openExternalUrl("https://xbl.io/");

  const clearAllXboxMatches = async () => {
    if (xboxBulkBusy || busy) return;
    setXboxBulkBusy(true);
    try {
      const saved = await clearXboxAssociations();
      setXbox(saved);
      clearAchievementsForApps(games.map((game) => game.appid));
      await refreshRaSettings();
      setXboxBulkMessage("Xbox associations cleared");
      toaster.toast({ title: "Playhub Metadata", body: "Xbox associations cleared" });
    } finally {
      setXboxBulkBusy(false);
    }
  };

  const bulkApplyXboxAchievements = async () => {
    if (xboxBulkBusy || busy) return;
    if (!xbox.enabled) {
      toaster.toast({ title: "Playhub Metadata", body: "OpenXBL not verified" });
      return;
    }
    const targets = games.filter((game) => isUwphookGameOption(game) && !xbox.title_ids[String(game.appid)]);
    if (!targets.length) {
      toaster.toast({ title: "Playhub Metadata", body: "No games without Xbox achievements to scan." });
      return;
    }
    setXboxBulkBusy(true);
    setXboxBulkMessage(`${"Scanning Xbox achievements"}: 0/${targets.length}`);
    let assigned = 0;
    let skipped = 0;
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const game = targets[index];
        const prefix = `${index + 1}/${targets.length} - ${game.name}`;
        setXboxBulkMessage(`${prefix}: ${"searching OpenXBL match"}`);
        try {
          const results = await searchXboxTitles(game.name, 5, game.appid, false);
          const best = results.find((item) => item.total == null || item.total > 0) || results[0];
          if (!best || best.score < 0.82) {
            skipped += 1;
            setXboxBulkMessage(`${prefix}: ${"skipped"}`);
            continue;
          }
          setXboxBulkMessage(`${prefix}: ${"loading achievement list"}`);
          await setXboxTitleId(game.appid, best.id);
          await setAchievementSource(game.appid, "xbox");
          clearAchievementsForApp(game.appid);
          const payload = await fetchAchievements(game.appid);
          if (payload?.steam?.nTotal) {
            applyAchievementPayload(game.appid, payload);
            assigned += 1;
            setXboxBulkMessage(`${prefix}: ${"achievements applied"}`);
          } else {
            skipped += 1;
            setXboxBulkMessage(`${prefix}: ${"skipped"}`);
          }
        } catch (_error) {
          skipped += 1;
          setXboxBulkMessage(`${prefix}: ${"skipped"}`);
        }
      }
      const refreshed = await getAchievementSettings();
      setXbox(refreshed.xbox);
      await refreshRaSettings();
      setXboxBulkMessage(`${"Xbox scan complete"}: ${assigned} ${"applied"}, ${skipped} ${"skipped"}`);
      toaster.toast({
        title: "Playhub Metadata",
        body: `${"Xbox scan complete"}: ${assigned} ${"applied"}, ${skipped} ${"skipped"}`,
      });
    } finally {
      setXboxBulkBusy(false);
    }
  };

  const syncMatchedTrueAchievementsProgress = async () => {
    if (xboxBulkBusy || busy) return;
    if (!xbox.enabled || !xbox.api_key.trim()) {
      toaster.toast({ title: "Playhub Metadata", body: "No progress found. Check the selected Xbox match." });
      return;
    }
    const targets = games.filter((game) => isUwphookGameOption(game) && !!xbox.title_ids[String(game.appid)]);
    if (!targets.length) {
      toaster.toast({ title: "Playhub Metadata", body: "No games without Xbox achievements to scan." });
      return;
    }
    setXboxBulkBusy(true);
    let synced = 0;
    let skipped = 0;
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const game = targets[index];
        const prefix = `${index + 1}/${targets.length} - ${game.name}`;
        setXboxBulkMessage(`${prefix}: ${"syncing progress"}`);
        try {
          const payload = await syncTrueAchievementsProgress(game.appid);
          if (payload?.steam?.nTotal) {
            applyAchievementPayload(game.appid, payload);
            synced += 1;
            setXboxBulkMessage(`${prefix}: ${"achievements applied"}`);
          } else {
            skipped += 1;
            setXboxBulkMessage(`${prefix}: ${"skipped"}`);
          }
        } catch (_error) {
          skipped += 1;
          setXboxBulkMessage(`${prefix}: ${"skipped"}`);
        }
      }
      await refreshRaSettings();
      setXboxBulkMessage(`${"Progress synced"}: ${synced}, ${"skipped"}: ${skipped}`);
      toaster.toast({ title: "Playhub Metadata", body: `${"Progress synced"}: ${synced}` });
    } finally {
      setXboxBulkBusy(false);
    }
  };

  return (
    <PanelSection>
      <PanelSectionRow>
        <div style={rowStackStyle}>
          <div>
            <b>{"Detected non-Steam games"}:</b> {games.length}
          </div>
          <div>
            <b>{"Metadata saved"}:</b> {metadataCount}
          </div>
          <div>
            <b>{"Missing metadata"}:</b> {missing}
          </div>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={spacedButtonRowStyle}>
          <div style={actionButtonStackStyle}>
            <FocusableButton
              className="DialogButton"
              disabled={busy || !games.length}
              onClick={scanMissing}
            >
              {busy ? "Scanning..." : "Scan metadata"}
            </FocusableButton>
            {busy || scanMessage ? (
              <div style={inlineStatusStyle}>{scanMessage || "Scanning..."}</div>
            ) : null}
          </div>
          <div style={actionButtonStackStyle}>
            <FocusableButton
              className="DialogButton"
              disabled={activityBusy || busy || !games.length}
              onClick={refreshActivities}
            >
              {activityBusy ? "Refreshing Activity..." : "Refresh Activity"}
            </FocusableButton>
            {activityBusy || activityMessage ? (
              <div style={inlineStatusStyle}>{activityMessage || "Refreshing Activity..."}</div>
            ) : null}
          </div>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{"Achievements"}</div>
      </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={"Enable achievements"}
            checked={ra.enabled}
            onChange={(checked) => void saveRaSettings({ enabled: checked })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={compactTextStyle}>{"Use your RetroAchievements web API key. You can find it in your RetroAchievements control panel."}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <label>{"RetroAchievements username"}</label>
            <TextField
              value={ra.username}
              onChange={(e) =>
                setRa((prev) => ({ ...prev, username: e.target.value }))
              }
              onBlur={() => void saveRaSettings({ username: ra.username })}
              style={fieldStyle}
            />
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <label>{"RetroAchievements API key"}</label>
            <TextField
              value={ra.api_key}
              onChange={(e) =>
                setRa((prev) => ({ ...prev, api_key: e.target.value }))
              }
              onBlur={() => void saveRaSettings({ api_key: ra.api_key })}
              style={fieldStyle}
            />
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={spacedButtonRowStyle}>
            <FocusableButton className="DialogButton" onClick={testRaLogin}>
              {"Login"}
            </FocusableButton>
            <FocusableButton className="DialogButton" onClick={openRetroAchievements}>
              {"Open RetroAchievements"}
            </FocusableButton>
          </div>
        </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{"Xbox achievements / OpenXBL"}</div>
      </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={"Enable Xbox achievements"}
            checked={xbox.enabled}
            onChange={(checked) => void saveXboxSettings({ enabled: checked })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <label>{"OpenXBL API key"}</label>
            <TextField
              value={xbox.api_key}
              onChange={(e) =>
                setXbox((prev) => ({ ...prev, api_key: e.target.value }))
              }
              onBlur={() => void saveXboxSettings({ api_key: xbox.api_key })}
              style={fieldStyle}
            />
            {xbox.ta_logged_in ? (
              <div style={compactTextStyle}>
                {xbox.gamertag ? `${"OpenXBL account connected"}: ${xbox.gamertag}` : "OpenXBL account connected"}
              </div>
            ) : null}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <FocusableButton className="DialogButton" onClick={testXboxLogin}>
              {"Login"}
            </FocusableButton>
            <FocusableButton className="DialogButton" onClick={openOpenXbl}>
              {"Open OpenXBL"}
            </FocusableButton>
            {platformCapabilities?.supports_xbox_uwphook_auto ? (
              <FocusableButton
                className="DialogButton"
                disabled={busy || xboxBulkBusy || !games.length}
                onClick={bulkApplyXboxAchievements}
              >
                {xboxBulkBusy ? "Scanning Xbox achievements" : "Scan Xbox achievements"}
              </FocusableButton>
            ) : (
              <div style={compactTextStyle}>
                {"Xbox automatic scanning is Windows-only because it depends on UWPHook/Xbox App shortcuts. Manual OpenXBL title mapping is still available."}
              </div>
            )}
            <FocusableButton
              className="DialogButton"
              disabled={busy || xboxBulkBusy || !games.length || !xbox.api_key.trim()}
              onClick={syncMatchedTrueAchievementsProgress}
            >
              {"Sync progress"}
            </FocusableButton>
            <FocusableButton
              className="DialogButton"
              disabled={busy || xboxBulkBusy || !games.length}
              onClick={clearAllXboxMatches}
            >
              {"Clear Xbox associations"}
            </FocusableButton>
            {xboxBulkBusy || xboxBulkMessage ? (
              <div style={inlineStatusStyle}>
                {xboxBulkBusy ? <Spinner /> : null}
                <span>{xboxBulkMessage}</span>
              </div>
            ) : null}
          </div>
        </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{"Achievement cache"}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={rowStackStyle}>
          <div style={compactTextStyle}>{"Choose when Playhub refreshes Xbox and RetroAchievements data."}</div>
          <div style={buttonRowStyle}>
            {achievementCachePolicies.map((policy) => (
              <FocusableButton
                key={policy}
                className="DialogButton"
                onClick={() => void saveAchievementCachePolicy(policy)}
                style={{
                  opacity: achievementCachePolicy === policy ? 1 : 0.72,
                  fontWeight: achievementCachePolicy === policy ? 700 : 400,
                }}
              >
                {ACHIEVEMENT_CACHE_LABELS[policy] ?? policy}
              </FocusableButton>
            ))}
          </div>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{"Metadata cache"}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={rowStackStyle}>
          <div style={compactTextStyle}>{"Clear cached Steam matches and metadata so games re-fetch and re-match."}</div>
          <div style={inlineStatusStyle}>
            {delistedBusy ? (
              <span style={scanSpinnerStyle}>
                <span style={scanSpinnerInnerStyle}>
                  <Spinner />
                </span>
              </span>
            ) : null}
            <span>{delistedStatusText}</span>
          </div>
          <FocusableButton
            className="DialogButton"
            disabled={delistedBusy}
            onClick={refreshDelisted}
          >
            {delistedBusy ? "Refreshing delisted index..." : "Refresh delisted index"}
          </FocusableButton>
          <FocusableButton
            className="DialogButton"
            disabled={cacheBusy || busy}
            onClick={clearCache}
          >
            {"Clear cache"}
          </FocusableButton>
        </div>
      </PanelSectionRow>
      {platformCapabilities ? (
        <>
          <PanelSectionRow>
            <div style={sectionHeadingStyle}>{"Diagnostics"}</div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <ToggleField
                label="Debug Logging"
                checked={debugLogging}
                onChange={(checked) => void saveDebugLogging(checked)}
              />
              <FocusableButton
                className="DialogButton"
                onClick={() => setShowPlatformDiagnostics((visible) => !visible)}
              >
                {showPlatformDiagnostics
                  ? "Hide platform"
                  : "Platform"}
              </FocusableButton>
              {showPlatformDiagnostics ? (
                <div style={diagnosticsGridStyle}>
                  <div style={diagnosticsRowStyle}>
                    <span>{"Platform"}</span>
                    <span style={diagnosticsValueStyle}>{platformCapabilities.platform}</span>
                  </div>
                  <div style={diagnosticsRowStyle}>
                    <span>{"SteamOS"}</span>
                    <span style={diagnosticsValueStyle}>
                      {platformCapabilities.is_steamos
                        ? "Yes"
                        : "No"}
                    </span>
                  </div>
                  <div style={diagnosticsRowStyle}>
                    <span>{"Steam root"}</span>
                    <span style={diagnosticsValueStyle}>
                      {platformCapabilities.steam_root || "None"}
                    </span>
                  </div>
                  <div style={diagnosticsRowStyle}>
                    <span>{"Capabilities"}</span>
                    <span />
                  </div>
                  {platformSupportKeys.map((key) => (
                    <div key={key} style={diagnosticsRowStyle}>
                      <span>{key}</span>
                      <span style={diagnosticsValueStyle}>
                        {platformCapabilities[key]
                          ? "Yes"
                          : "No"}
                      </span>
                    </div>
                  ))}
                  <div style={diagnosticsRowStyle}>
                    <span>Patch Status</span>
                    <span />
                  </div>
                  {Object.entries(patchInstallStatus).map(([patchName, status]) => (
                    <div key={patchName} style={diagnosticsRowStyle}>
                      <span>{patchName}</span>
                      <span style={diagnosticsValueStyle}>{status}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </PanelSectionRow>
        </>
      ) : null}
    </PanelSection>
  );
};

export const MetadataPage = () => {
  const { appid } = useParams<{ appid: string }>();
  const appId = Number(appid);
  const overview = getOverview(appId);
  const nonSteam = isNonSteamApp(overview);
  const [metadata, setMetadata] = useState<MetadataData>(
    metadataTemplate(appName(appId))
  );
  const [developerText, setDeveloperText] = useState("");
  const [publisherText, setPublisherText] = useState("");
  const [releaseText, setReleaseText] = useState("");
  const [ratingText, setRatingText] = useState("");
  const [query, setQuery] = useState(appName(appId));
  const [results, setResults] = useState<MetadataSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [raSettings, setRaSettings] = useState<RetroAchievementsSettings | null>(
    null
  );
  const [raGameId, setRaGameId] = useState("");
  const [steamAppIdText, setSteamAppIdText] = useState("");
  const [raQuery, setRaQuery] = useState(appName(appId));
  const [raResults, setRaResults] = useState<RetroAchievementsGameResult[]>([]);
  const [raSearching, setRaSearching] = useState(false);
  const [achievementSource, setAchievementSourceState] =
    useState<AchievementSource>("auto");
  const [xboxTitleId, setXboxTitleIdState] = useState("");
  const [xboxQuery, setXboxQuery] = useState(appName(appId));
  const [xboxResults, setXboxResults] = useState<XboxTitleResult[]>([]);
  const [xboxSearching, setXboxSearching] = useState(false);

  const setFormMetadata = useCallback((next: MetadataData) => {
    setMetadata(next);
    setDeveloperText(personsToText(next.developers));
    setPublisherText(personsToText(next.publishers));
    setReleaseText(epochToDate(next.release_date));
    setRatingText(next.rating == null ? "" : String(next.rating));
  }, []);

  const load = useCallback(async () => {
    const saved = await getMetadata(appId);
    setFormMetadata(saved || metadataTemplate(appName(appId)));
    setSteamAppIdText(saved?.steam_appid ? String(saved.steam_appid) : "");
    const settings = await getAchievementSettings();
    setRaSettings(settings.retroachievements);
    setRaGameId(settings.retroachievements.game_ids[String(appId)]?.toString() || "");
    setAchievementSourceState(
      settings.achievement_sources[String(appId)] || "auto"
    );
    setXboxTitleIdState(settings.xbox.title_ids[String(appId)] || "");
  }, [appId, setFormMetadata]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedMetadata = useMemo<MetadataData>(
    () => ({
      ...metadata,
      title: cleanTitle(metadata.title),
      developers: textToPersons(developerText),
      publishers: textToPersons(publisherText),
      release_date: dateToEpoch(releaseText),
      rating: parseRating(ratingText),
      store_categories: metadata.store_categories || [],
    }),
    [developerText, metadata, publisherText, ratingText, releaseText]
  );
  const saveCurrent = async () => {
    if (!nonSteam) {
      toaster.toast({ title: "Playhub Metadata", body: "This plugin only changes non-Steam games." });
      return;
    }
    const saved = await saveMetadata(appId, normalizedMetadata);
    metadataCache[String(appId)] = saved;
    applyMetadata(appId);
    toaster.toast({ title: "Playhub Metadata", body: "Metadata saved" });
  };

  const applySteamAppId = async () => {
    if (!nonSteam) {
      toaster.toast({ title: "Playhub Metadata", body: "This plugin only changes non-Steam games." });
      return;
    }
    setBusy(true);
    try {
      const parsed = parseSteamAppId(steamAppIdText);
      const next = {
        ...normalizedMetadata,
        steam_appid: parsed || null,
        steam_store_url: parsed
          ? `https://store.steampowered.com/app/${parsed}/`
          : "",
      };
      const saved = await saveMetadata(appId, next);
      metadataCache[String(appId)] = saved;
      setFormMetadata(saved);
      const enriched = await enrichSteamApp(appId);
      if (enriched) {
        metadataCache[String(appId)] = enriched;
        setFormMetadata(enriched);
        setSteamAppIdText(
          enriched.steam_appid ? String(enriched.steam_appid) : ""
        );
      } else {
        setSteamAppIdText(saved.steam_appid ? String(saved.steam_appid) : "");
      }
      applyMetadata(appId);
      toaster.toast({ title: "Playhub Metadata", body: "Metadata saved" });
    } catch (error) {
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    setBusy(true);
    try {
      setResults(await searchMetadata(query, 8));
    } catch (error) {
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const applyResult = async (result: MetadataSearchResult) => {
    setBusy(true);
    try {
      const fetched = await fetchMetadata(result.slug || result.url);
      if (!fetched) return;
      const saved = await saveMetadata(appId, fetched);
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      setFormMetadata(saved);
      toaster.toast({ title: "Playhub Metadata", body: "Metadata saved" });
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    await removeMetadata(appId);
    delete metadataCache[String(appId)];
    setFormMetadata(metadataTemplate(appName(appId)));
    toaster.toast({ title: "Playhub Metadata", body: "Metadata removed" });
  };

  const saveAchievementSource = async (source: AchievementSource) => {
    await setAchievementSource(appId, source);
    setAchievementSourceState(source);
    await refreshRaSettings();
  };

  const saveRaGameId = async () => {
    const parsed = Number.parseInt(raGameId, 10);
    const ids = await setRetroAchievementsGameId(
      appId,
      Number.isFinite(parsed) && parsed > 0 ? parsed : null
    );
    if (Number.isFinite(parsed) && parsed > 0) {
      await saveAchievementSource("retroachievements");
    }
    setRaSettings((prev) => (prev ? { ...prev, game_ids: ids } : prev));
    toaster.toast({ title: "Playhub Metadata", body: "Metadata saved" });
  };

  const testAchievements = async () => {
    const parsed = Number.parseInt(raGameId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toaster.toast({ title: "Playhub Metadata", body: "No achievements loaded. Check the RetroAchievements game ID." });
      return;
    }
    await setRetroAchievementsGameId(appId, parsed);
    await saveAchievementSource("retroachievements");
    await refreshRaSettings();
    const payload = await fetchAchievements(appId);
    applyAchievementPayload(appId, payload);
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Achievements loaded"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : "No achievements loaded. Check the RetroAchievements game ID.",
    });
  };

  const autoDetectAchievements = async () => {
    const details = await getAppDetails(appId);
    const launchPath = `${details?.strShortcutExe || ""} ${
      details?.strShortcutLaunchOptions || ""
    }`;
    if (!launchPath.trim()) {
      toaster.toast({ title: "Playhub Metadata", body: "No RetroAchievements match found from this game's shortcut path." });
      return;
    }
    const payload = await resolveRetroAchievementsFromPath(
      appId,
      launchPath,
      appName(appId)
    );
    const achievementPayload = payload?.steam ? (payload as AchievementsResponse) : null;
    applyAchievementPayload(appId, achievementPayload);
    if (payload?.steam?.nTotal) {
      setRaGameId(String(payload.game_id));
      await saveAchievementSource("retroachievements");
      await refreshRaSettings();
    }
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Achievements loaded"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : retroResolutionMessageKey(payload?.reason),
    });
  };

  const searchAchievements = async () => {
    setRaSearching(true);
    try {
      setRaResults(
        await searchRetroAchievementsGames(raQuery || appName(appId), 8, appId)
      );
    } catch (error) {
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    } finally {
      setRaSearching(false);
    }
  };

  const useAchievementResult = async (result: RetroAchievementsGameResult) => {
    setRaGameId(String(result.id));
    const ids = await setRetroAchievementsGameId(appId, result.id);
    await saveAchievementSource("retroachievements");
    setRaSettings((prev) => (prev ? { ...prev, game_ids: ids } : prev));
    await refreshRaSettings();
    const payload = await fetchAchievements(appId);
    applyAchievementPayload(appId, payload);
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Achievements loaded"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : "Metadata saved",
    });
  };

  const saveXboxMatchManual = async () => {
    const manual = xboxTitleId.trim();
    if (!manual) {
      await clearXboxMatch();
      return;
    }
    const currentSettings = await getAchievementSettings();
    await setXboxSettings(true, currentSettings.xbox.api_key || "");
    const ids = await setXboxTitleId(appId, manual);
    const nextId = ids[String(appId)] || manual;
    setXboxTitleIdState(nextId);
    await saveAchievementSource("xbox");
    await refreshRaSettings();
    const payload = await fetchAchievements(appId);
    applyAchievementPayload(appId, payload);
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Xbox achievements loaded"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : "No Xbox achievements loaded. Try scanning again or paste the Xbox title ID manually.",
    });
  };

  const autoDetectXboxAchievements = async () => {
    const caps = await getPlatformCapabilities();
    if (!caps?.supports_xbox_uwphook_auto) return;
    const currentSettings = await getAchievementSettings();
    await setXboxSettings(true, currentSettings.xbox.api_key || "");
    const details = await getAppDetails(appId);
    const launchPath = `${details?.strShortcutExe || ""} ${
      details?.strShortcutLaunchOptions || ""
    }`;
    const payload = await resolveXboxFromShortcut(
      appId,
      appName(appId),
      launchPath
    );
    applyAchievementPayload(appId, payload);
    if (payload?.steam?.nTotal) {
      await saveAchievementSource("xbox");
      const settings = await getAchievementSettings();
      setXboxTitleIdState(settings.xbox.title_ids[String(appId)] || "");
      await refreshRaSettings();
    }
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Xbox achievements loaded"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : "No Xbox match found from this UWPHook shortcut.",
    });
  };

  const clearXboxMatch = async () => {
    const ids = await setXboxTitleId(appId, null);
    setXboxTitleIdState(ids[String(appId)] || "");
    clearAchievementsForApp(appId);
    if (achievementSource === "xbox") {
      await saveAchievementSource("auto");
    }
    await refreshRaSettings();
    toaster.toast({ title: "Playhub Metadata", body: "Metadata saved" });
  };

  const searchXbox = async () => {
    setXboxSearching(true);
    try {
      const results = await searchXboxTitles(xboxQuery || appName(appId), 12, appId, true);
      setXboxResults(results);
    } catch (error) {
      toaster.toast({ title: "Playhub Metadata", body: String(error) });
    } finally {
      setXboxSearching(false);
    }
  };

  const useXboxResult = async (result: XboxTitleResult) => {
    const currentSettings = await getAchievementSettings();
    await setXboxSettings(true, currentSettings.xbox.api_key || "");
    const ids = await setXboxTitleId(appId, result.id);
    setXboxTitleIdState(ids[String(appId)] || result.id);
    await saveAchievementSource("xbox");
    await refreshRaSettings();
    const payload = await fetchAchievements(appId);
    applyAchievementPayload(appId, payload);
    if (!payload?.steam?.nTotal) {
      const cleared = await setXboxTitleId(appId, null);
      setXboxTitleIdState(cleared[String(appId)] || "");
      await saveAchievementSource("auto");
    }
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Xbox achievements loaded"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : "No Xbox achievements loaded. Try scanning again or paste the Xbox title ID manually.",
    });
  };

  const syncXboxProgress = async () => {
    const payload = await syncTrueAchievementsProgress(appId);
    applyAchievementPayload(appId, payload);
    toaster.toast({
      title: "Playhub Metadata",
      body: payload?.steam?.nTotal
        ? `${"Progress synced"}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : "No progress found. Check the selected Xbox match.",
    });
  };

  const toggleCategory = (category: number, checked: boolean) => {
    setMetadata((prev) => {
      const next = new Set(prev.store_categories || []);
      if (checked) next.add(category);
      else next.delete(category);
      return { ...prev, store_categories: Array.from(next) };
    });
  };

  return (
    <ScrollPanel>
      <div style={pageStyle}>
        <PanelSection title={`${"Playhub Metadata"} - ${appName(appId)}`}>
          {!nonSteam ? (
            <PanelSectionRow>
              <div style={compactTextStyle}>{"This plugin only changes non-Steam games."}</div>
            </PanelSectionRow>
          ) : null}
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <FocusableButton className="DialogButton" onClick={saveCurrent}>
                {"Save"}
              </FocusableButton>
              <FocusableButton className="DialogButton" onClick={removeCurrent}>
                {"Remove metadata"}
              </FocusableButton>
              <FocusableButton
                className="DialogButton"
                onClick={() => Navigation.NavigateBack()}
              >
                {"Done"}
              </FocusableButton>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Search IGN metadata"}>
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <TextField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...flexFieldStyle, minWidth: "10rem" }}
              />
              <FocusableButton
                className="DialogButton"
                disabled={busy}
                onClick={search}
              >
                {busy ? "Searching..." : "Search"}
              </FocusableButton>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              {busy ? (
                <div style={compactTextStyle}>{"Searching..."}</div>
              ) : null}
              {!busy && !results.length ? (
                <div style={compactTextStyle}>{"No results yet."}</div>
              ) : null}
              {results.map((result) => (
                <FocusableButton
                  key={result.slug || result.url}
                  className="DialogButton"
                  onClick={() => void applyResult(result)}
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  <div style={rowStackStyle}>
                    <b>{result.title}</b>
                    <span style={compactTextStyle}>{result.description}</span>
                  </div>
                </FocusableButton>
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Source"}>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <label>{"Title"}</label>
              <TextField
                value={metadata.title}
                onChange={(e) =>
                  setMetadata((prev) => ({ ...prev, title: e.target.value }))
                }
                style={fieldStyle}
              />
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <label>{"Description"}</label>
              <Focusable style={{ width: "100%" }}>
                <textarea
                  value={metadata.description}
                  onChange={(e) =>
                    setMetadata((prev) => ({
                      ...prev,
                      description: e.target.value,
                      short_description: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    minHeight: "9rem",
                    boxSizing: "border-box",
                    resize: "vertical",
                    borderRadius: 4,
                    padding: 10,
                    color: "white",
                    background: "rgba(0,0,0,0.28)",
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                />
              </Focusable>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <label>{"Developers"}</label>
              <TextField
                value={developerText}
                onChange={(e) => setDeveloperText(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <label>{"Publishers"}</label>
              <TextField
                value={publisherText}
                onChange={(e) => setPublisherText(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <div style={{ ...flexFieldStyle, minWidth: "8rem" }}>
                <label>{"Release date"}</label>
                <TextField
                  value={releaseText}
                  onChange={(e) => setReleaseText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div style={{ ...flexFieldStyle, minWidth: "7rem" }}>
                <label>{"Rating"}</label>
                <TextField
                  value={ratingText}
                  onChange={(e) => setRatingText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Steam info fields"}>
          {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
            <PanelSectionRow key={category}>
              <ToggleField
                label={label}
                checked={(metadata.store_categories || []).includes(Number(category))}
                onChange={(checked) => toggleCategory(Number(category), checked)}
              />
            </PanelSectionRow>
          ))}
        </PanelSection>

        <PanelSection title={"Achievement source"}>
          <PanelSectionRow>
            <div style={compactTextStyle}>{"Auto keeps RetroAchievements for ROM/emulator shortcuts and uses OpenXBL only for likely Xbox/UWPHook shortcuts."}</div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              {(["auto", "retroachievements", "xbox", "disabled"] as AchievementSource[]).map((source) => (
                <FocusableButton
                  key={source}
                  className="DialogButton"
                  onClick={() => void saveAchievementSource(source)}
                  style={{
                    opacity: achievementSource === source ? 1 : 0.72,
                    fontWeight: achievementSource === source ? 700 : 400,
                  }}
                >
                  {ACHIEVEMENT_SOURCE_LABELS[source] ?? source}
                </FocusableButton>
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Steam App ID"}>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{"Paste a Steam app ID, Store URL, Community URL, or SteamDB URL. Leave empty to clear the pinned Steam match."}</div>
              <div style={buttonRowStyle}>
                <TextField
                  value={steamAppIdText}
                  onChange={(e) => setSteamAppIdText(e.target.value)}
                  style={{ ...flexFieldStyle, minWidth: "18rem" }}
                />
                <FocusableButton
                  className="DialogButton"
                  disabled={busy}
                  onClick={applySteamAppId}
                >
                  {"Apply Steam App ID"}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Achievements"}>
          <PanelSectionRow>
            <div style={compactTextStyle}>{"Paste the numeric RetroAchievements game ID from the game page URL. Leave empty to hide achievements for this game."}</div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <TextField
                value={raGameId}
                onChange={(e) => setRaGameId(e.target.value)}
                style={{ ...flexFieldStyle, minWidth: "8rem" }}
              />
              <FocusableButton className="DialogButton" onClick={saveRaGameId}>
                {"Save"}
              </FocusableButton>
              <FocusableButton
                className="DialogButton"
                onClick={autoDetectAchievements}
              >
                {"Auto-detect achievements"}
              </FocusableButton>
              <FocusableButton className="DialogButton" onClick={testAchievements}>
                {"Test achievements"}
              </FocusableButton>
            </div>
          </PanelSectionRow>
          {raSettings && !raSettings.enabled ? (
            <PanelSectionRow>
              <div style={compactTextStyle}>{"Enable achievements"}: Off</div>
            </PanelSectionRow>
          ) : null}
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{"If auto-detect misses the game, search by title and pick the closest RetroAchievements entry."}</div>
              <div style={buttonRowStyle}>
                <TextField
                  value={raQuery}
                  onChange={(e) => setRaQuery(e.target.value)}
                  style={{ ...flexFieldStyle, minWidth: "10rem" }}
                />
                <FocusableButton
                  className="DialogButton"
                  disabled={raSearching}
                  onClick={searchAchievements}
                >
                  {raSearching ? "Searching..." : "Search RetroAchievements"}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              {raSearching ? <Spinner /> : null}
              {!raSearching && !raResults.length ? (
                <div style={compactTextStyle}>{"No RetroAchievements results yet."}</div>
              ) : null}
              {raResults.map((result) => (
                <FocusableButton
                  key={result.id}
                  className="DialogButton"
                  onClick={() => void useAchievementResult(result)}
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  <div style={rowStackStyle}>
                    <b>{result.title}</b>
                    <span style={compactTextStyle}>
                      {result.console ? `${result.console} - ` : ""}
                      {Math.round(result.score * 100)}% match
                    </span>
                  </div>
                </FocusableButton>
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Xbox achievements"}>
          <PanelSectionRow>
            <div style={compactTextStyle}>{"Playhub matches Xbox title IDs through OpenXBL. Use the selector if the automatic match is wrong."}</div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{"Current Xbox title ID"}</div>
              <div style={buttonRowStyle}>
                <TextField
                  value={xboxTitleId}
                  onChange={(e) => setXboxTitleIdState(e.target.value)}
                  style={{ ...flexFieldStyle, minWidth: "18rem" }}
                />
                <FocusableButton className="DialogButton" onClick={saveXboxMatchManual}>
                  {"Save"}
                </FocusableButton>
              </div>
              <div style={buttonRowStyle}>
                <FocusableButton
                  className="DialogButton"
                  onClick={autoDetectXboxAchievements}
                >
                  {"Auto-detect with OpenXBL"}
                </FocusableButton>
                <FocusableButton
                  className="DialogButton"
                  disabled={!xboxTitleId}
                  onClick={syncXboxProgress}
                >
                  {"Sync progress"}
                </FocusableButton>
                <FocusableButton className="DialogButton" onClick={clearXboxMatch}>
                  {"Clear Xbox match"}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{"Search OpenXBL account history and Microsoft Store for the correct Xbox title."}</div>
              <div style={buttonRowStyle}>
                <TextField
                  value={xboxQuery}
                  onChange={(e) => setXboxQuery(e.target.value)}
                  style={{ ...flexFieldStyle, minWidth: "10rem" }}
                />
                <FocusableButton
                  className="DialogButton"
                  disabled={xboxSearching}
                  onClick={searchXbox}
                >
                  {xboxSearching ? "Searching..." : "Search Xbox titles"}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={resultsStackStyle}>
              {xboxSearching ? <Spinner /> : null}
              {!xboxSearching && !xboxResults.length ? (
                <div style={compactTextStyle}>{"No Xbox results yet."}</div>
              ) : null}
              {xboxResults.map((result) => (
                <FocusableButton
                  key={result.id}
                  className="DialogButton"
                  onClick={() => void useXboxResult(result)}
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  <div style={rowStackStyle}>
                    <b>{result.title}</b>
                    <span style={compactTextStyle}>
                      {Math.round(result.score * 100)}% match
                      {result.unlocked != null && result.total != null
                        ? ` - ${result.unlocked}/${result.total}`
                        : ""}
                      {result.gamerscore != null ? ` - ${result.gamerscore}G` : ""}
                      {` - ${result.source || "TrueAchievements"} - ${result.id}`}
                    </span>
                  </div>
                </FocusableButton>
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>
      </div>
    </ScrollPanel>
  );
};
