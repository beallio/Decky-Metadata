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
  syncTrueAchievementsProgress,
} from "./backend";
import { t } from "./i18n";
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
      return "retroDetectNoCandidate";
    case "candidate_missing":
      return "retroDetectCandidateMissing";
    case "unsupported_extension":
      return "retroDetectUnsupportedExtension";
    case "hash_not_found":
      return "retroDetectHashNotFound";
    case "api_credentials_missing":
      return "retroDetectCredentialsMissing";
    case "api_error":
      return "retroDetectApiError";
    case "manual_mapping_exists":
      return "retroDetectManualMapping";
    default:
      return "retroDetectFailed";
  }
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
  community_images: [],
  community_videos: [],
  community_enriched_at: 0,
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
          toaster.toast({ title: t("pluginName"), body: t("scanComplete") });
        }
      }, 800);
    } catch (error) {
      setBusy(false);
      toaster.toast({ title: t("pluginName"), body: String(error) });
    }
  };

  const refreshActivities = async () => {
    if (activityBusy) return;
    setActivityBusy(true);
    setActivityMessage(t("refreshingActivities"));
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
          toaster.toast({ title: t("pluginName"), body: t("activityRefreshComplete") });
        }
      }, 800);
    } catch (error) {
      setActivityBusy(false);
      toaster.toast({ title: t("pluginName"), body: String(error) });
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
      title: t("pluginName"),
      body: result.ok ? t("retroLoginOk") : result.message || t("retroLoginFailed"),
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
      setMetadataCount(Object.keys(metadataCache).length);
      toaster.toast({ title: t("pluginName"), body: t("clearCacheDone") });
    } catch (error) {
      toaster.toast({ title: t("pluginName"), body: String(error) });
    } finally {
      setCacheBusy(false);
    }
  };

  const testXboxLogin = async () => {
    if (!xbox.api_key.trim()) {
      const saved = await setXboxSettings(true, xbox.api_key || "");
      setXbox(saved);
      await refreshRaSettings();
      toaster.toast({ title: t("pluginName"), body: t("xboxLoginNeedsProfile") });
      return;
    }
    const result = await testOpenXblCredentials(xbox.api_key || "");
    const refreshed = await getAchievementSettings();
    setXbox(refreshed.xbox);
    await refreshRaSettings();
    toaster.toast({ title: t("pluginName"), body: result.ok ? t("xboxLoginOk") : result.message || t("xboxLoginFailed") });
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
      setXboxBulkMessage(t("xboxClearAllDone"));
      toaster.toast({ title: t("pluginName"), body: t("xboxClearAllDone") });
    } finally {
      setXboxBulkBusy(false);
    }
  };

  const bulkApplyXboxAchievements = async () => {
    if (xboxBulkBusy || busy) return;
    if (!xbox.enabled) {
      toaster.toast({ title: t("pluginName"), body: t("xboxLoginFailed") });
      return;
    }
    const targets = games.filter((game) => isUwphookGameOption(game) && !xbox.title_ids[String(game.appid)]);
    if (!targets.length) {
      toaster.toast({ title: t("pluginName"), body: t("xboxBulkNothing") });
      return;
    }
    setXboxBulkBusy(true);
    setXboxBulkMessage(`${t("xboxBulkScanning")}: 0/${targets.length}`);
    let assigned = 0;
    let skipped = 0;
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const game = targets[index];
        const prefix = `${index + 1}/${targets.length} - ${game.name}`;
        setXboxBulkMessage(`${prefix}: ${t("xboxBulkSearching")}`);
        try {
          const results = await searchXboxTitles(game.name, 5, game.appid, false);
          const best = results.find((item) => item.total == null || item.total > 0) || results[0];
          if (!best || best.score < 0.82) {
            skipped += 1;
            setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
            continue;
          }
          setXboxBulkMessage(`${prefix}: ${t("xboxBulkApplying")}`);
          await setXboxTitleId(game.appid, best.id);
          await setAchievementSource(game.appid, "xbox");
          clearAchievementsForApp(game.appid);
          const payload = await fetchAchievements(game.appid);
          if (payload?.steam?.nTotal) {
            applyAchievementPayload(game.appid, payload);
            assigned += 1;
            setXboxBulkMessage(`${prefix}: ${t("xboxBulkAppliedOne")}`);
          } else {
            skipped += 1;
            setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
          }
        } catch (_error) {
          skipped += 1;
          setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
        }
      }
      const refreshed = await getAchievementSettings();
      setXbox(refreshed.xbox);
      await refreshRaSettings();
      setXboxBulkMessage(`${t("xboxBulkDone")}: ${assigned} ${t("xboxBulkApplied")}, ${skipped} ${t("xboxBulkSkipped")}`);
      toaster.toast({
        title: t("pluginName"),
        body: `${t("xboxBulkDone")}: ${assigned} ${t("xboxBulkApplied")}, ${skipped} ${t("xboxBulkSkipped")}`,
      });
    } finally {
      setXboxBulkBusy(false);
    }
  };

  const syncMatchedTrueAchievementsProgress = async () => {
    if (xboxBulkBusy || busy) return;
    if (!xbox.enabled || !xbox.api_key.trim()) {
      toaster.toast({ title: t("pluginName"), body: t("xboxSyncProgressFailed") });
      return;
    }
    const targets = games.filter((game) => isUwphookGameOption(game) && !!xbox.title_ids[String(game.appid)]);
    if (!targets.length) {
      toaster.toast({ title: t("pluginName"), body: t("xboxBulkNothing") });
      return;
    }
    setXboxBulkBusy(true);
    let synced = 0;
    let skipped = 0;
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const game = targets[index];
        const prefix = `${index + 1}/${targets.length} - ${game.name}`;
        setXboxBulkMessage(`${prefix}: ${t("xboxSyncingProgress")}`);
        try {
          const payload = await syncTrueAchievementsProgress(game.appid);
          if (payload?.steam?.nTotal) {
            applyAchievementPayload(game.appid, payload);
            synced += 1;
            setXboxBulkMessage(`${prefix}: ${t("xboxBulkAppliedOne")}`);
          } else {
            skipped += 1;
            setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
          }
        } catch (_error) {
          skipped += 1;
          setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
        }
      }
      await refreshRaSettings();
      setXboxBulkMessage(`${t("xboxSyncProgressOk")}: ${synced}, ${t("xboxBulkSkipped")}: ${skipped}`);
      toaster.toast({ title: t("pluginName"), body: `${t("xboxSyncProgressOk")}: ${synced}` });
    } finally {
      setXboxBulkBusy(false);
    }
  };

  return (
    <PanelSection>
      <PanelSectionRow>
        <div style={rowStackStyle}>
          <div>
            <b>{t("detected")}:</b> {games.length}
          </div>
          <div>
            <b>{t("saved")}:</b> {metadataCount}
          </div>
          <div>
            <b>{t("missing")}:</b> {missing}
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
              {busy ? t("scanning") : t("scanMissing")}
            </FocusableButton>
            {busy || scanMessage ? (
              <div style={inlineStatusStyle}>{scanMessage || t("scanning")}</div>
            ) : null}
          </div>
          <div style={actionButtonStackStyle}>
            <FocusableButton
              className="DialogButton"
              disabled={activityBusy || busy || !games.length}
              onClick={refreshActivities}
            >
              {activityBusy ? t("refreshingActivities") : t("refreshActivities")}
            </FocusableButton>
            {activityBusy || activityMessage ? (
              <div style={inlineStatusStyle}>{activityMessage || t("refreshingActivities")}</div>
            ) : null}
          </div>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("retroTitle")}</div>
      </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t("retroEnabled")}
            checked={ra.enabled}
            onChange={(checked) => void saveRaSettings({ enabled: checked })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={compactTextStyle}>{t("retroLoginHint")}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <label>{t("retroUser")}</label>
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
            <label>{t("retroKey")}</label>
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
              {t("retroLogin")}
            </FocusableButton>
            <FocusableButton className="DialogButton" onClick={openRetroAchievements}>
              {t("retroCreateAccount")}
            </FocusableButton>
          </div>
        </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("xboxTitle")}</div>
      </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t("xboxEnabled")}
            checked={xbox.enabled}
            onChange={(checked) => void saveXboxSettings({ enabled: checked })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <label>{t("xboxProfile")}</label>
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
                {xbox.gamertag ? `${t("xboxLoggedIn")}: ${xbox.gamertag}` : t("xboxLoggedIn")}
              </div>
            ) : null}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <FocusableButton className="DialogButton" onClick={testXboxLogin}>
              {t("xboxLogin")}
            </FocusableButton>
            <FocusableButton className="DialogButton" onClick={openOpenXbl}>
              {t("xboxOpenOpenXbl")}
            </FocusableButton>
            {platformCapabilities?.supports_xbox_uwphook_auto ? (
              <FocusableButton
                className="DialogButton"
                disabled={busy || xboxBulkBusy || !games.length}
                onClick={bulkApplyXboxAchievements}
              >
                {xboxBulkBusy ? t("xboxBulkScanning") : t("xboxBulkScan")}
              </FocusableButton>
            ) : (
              <div style={compactTextStyle}>
                {t("xboxAutoScanUnsupported")}
              </div>
            )}
            <FocusableButton
              className="DialogButton"
              disabled={busy || xboxBulkBusy || !games.length || !xbox.api_key.trim()}
              onClick={syncMatchedTrueAchievementsProgress}
            >
              {t("xboxSyncAllProgress")}
            </FocusableButton>
            <FocusableButton
              className="DialogButton"
              disabled={busy || xboxBulkBusy || !games.length}
              onClick={clearAllXboxMatches}
            >
              {t("xboxClearAll")}
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
        <div style={sectionHeadingStyle}>{t("achievementCacheTitle")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={rowStackStyle}>
          <div style={compactTextStyle}>{t("achievementCacheHint")}</div>
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
                {t(`achievementCache_${policy}` as any)}
              </FocusableButton>
            ))}
          </div>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={sectionHeadingStyle}>{t("cacheTitle")}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={rowStackStyle}>
          <div style={compactTextStyle}>{t("cacheHint")}</div>
          <FocusableButton
            className="DialogButton"
            disabled={cacheBusy || busy}
            onClick={clearCache}
          >
            {t("clearCache")}
          </FocusableButton>
        </div>
      </PanelSectionRow>
      {platformCapabilities ? (
        <>
          <PanelSectionRow>
            <div style={sectionHeadingStyle}>{t("diagnosticsTitle")}</div>
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
                  ? t("diagnosticsHidePlatform")
                  : t("diagnosticsShowPlatform")}
              </FocusableButton>
              {showPlatformDiagnostics ? (
                <div style={diagnosticsGridStyle}>
                  <div style={diagnosticsRowStyle}>
                    <span>{t("platformLabel")}</span>
                    <span style={diagnosticsValueStyle}>{platformCapabilities.platform}</span>
                  </div>
                  <div style={diagnosticsRowStyle}>
                    <span>{t("platformSteamOS")}</span>
                    <span style={diagnosticsValueStyle}>
                      {platformCapabilities.is_steamos
                        ? t("diagnosticsYes")
                        : t("diagnosticsNo")}
                    </span>
                  </div>
                  <div style={diagnosticsRowStyle}>
                    <span>{t("platformSteamRoot")}</span>
                    <span style={diagnosticsValueStyle}>
                      {platformCapabilities.steam_root || t("none")}
                    </span>
                  </div>
                  <div style={diagnosticsRowStyle}>
                    <span>{t("platformSupports")}</span>
                    <span />
                  </div>
                  {platformSupportKeys.map((key) => (
                    <div key={key} style={diagnosticsRowStyle}>
                      <span>{key}</span>
                      <span style={diagnosticsValueStyle}>
                        {platformCapabilities[key]
                          ? t("diagnosticsYes")
                          : t("diagnosticsNo")}
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
      toaster.toast({ title: t("pluginName"), body: t("notNonSteam") });
      return;
    }
    const saved = await saveMetadata(appId, normalizedMetadata);
    metadataCache[String(appId)] = saved;
    applyMetadata(appId);
    toaster.toast({ title: t("pluginName"), body: t("saved") });
  };

  const search = async () => {
    setBusy(true);
    try {
      setResults(await searchMetadata(query, 8));
    } catch (error) {
      toaster.toast({ title: t("pluginName"), body: String(error) });
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
      toaster.toast({ title: t("pluginName"), body: t("saved") });
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    await removeMetadata(appId);
    delete metadataCache[String(appId)];
    setFormMetadata(metadataTemplate(appName(appId)));
    toaster.toast({ title: t("pluginName"), body: t("removeToast") });
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
    toaster.toast({ title: t("pluginName"), body: t("saved") });
  };

  const testAchievements = async () => {
    const parsed = Number.parseInt(raGameId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toaster.toast({ title: t("pluginName"), body: t("retroGameFailed") });
      return;
    }
    await setRetroAchievementsGameId(appId, parsed);
    await saveAchievementSource("retroachievements");
    await refreshRaSettings();
    const payload = await fetchAchievements(appId);
    applyAchievementPayload(appId, payload);
    toaster.toast({
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t("retroGameFailed"),
    });
  };

  const autoDetectAchievements = async () => {
    const details = await getAppDetails(appId);
    const launchPath = `${details?.strShortcutExe || ""} ${
      details?.strShortcutLaunchOptions || ""
    }`;
    if (!launchPath.trim()) {
      toaster.toast({ title: t("pluginName"), body: t("retroDetectFailed") });
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
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t(retroResolutionMessageKey(payload?.reason) as any),
    });
  };

  const searchAchievements = async () => {
    setRaSearching(true);
    try {
      setRaResults(
        await searchRetroAchievementsGames(raQuery || appName(appId), 8, appId)
      );
    } catch (error) {
      toaster.toast({ title: t("pluginName"), body: String(error) });
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
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t("saved"),
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
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("xboxGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t("xboxGameFailed"),
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
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("xboxGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t("xboxDetectFailed"),
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
    toaster.toast({ title: t("pluginName"), body: t("saved") });
  };

  const searchXbox = async () => {
    setXboxSearching(true);
    try {
      const results = await searchXboxTitles(xboxQuery || appName(appId), 12, appId, true);
      setXboxResults(results);
    } catch (error) {
      toaster.toast({ title: t("pluginName"), body: String(error) });
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
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("xboxGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t("xboxGameFailed"),
    });
  };

  const syncXboxProgress = async () => {
    const payload = await syncTrueAchievementsProgress(appId);
    applyAchievementPayload(appId, payload);
    toaster.toast({
      title: t("pluginName"),
      body: payload?.steam?.nTotal
        ? `${t("xboxSyncProgressOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
        : t("xboxSyncProgressFailed"),
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
        <PanelSection title={`${t("pluginName")} - ${appName(appId)}`}>
          {!nonSteam ? (
            <PanelSectionRow>
              <div style={compactTextStyle}>{t("notNonSteam")}</div>
            </PanelSectionRow>
          ) : null}
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <FocusableButton className="DialogButton" onClick={saveCurrent}>
                {t("save")}
              </FocusableButton>
              <FocusableButton className="DialogButton" onClick={removeCurrent}>
                {t("remove")}
              </FocusableButton>
              <FocusableButton
                className="DialogButton"
                onClick={() => Navigation.NavigateBack()}
              >
                {t("done")}
              </FocusableButton>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={t("searchTitle")}>
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
                {busy ? t("searching") : t("search")}
              </FocusableButton>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              {busy ? (
                <div style={compactTextStyle}>{t("searching")}</div>
              ) : null}
              {!busy && !results.length ? (
                <div style={compactTextStyle}>{t("noResults")}</div>
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

        <PanelSection title={t("source")}>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <label>{t("title")}</label>
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
              <label>{t("description")}</label>
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
              <label>{t("developers")}</label>
              <TextField
                value={developerText}
                onChange={(e) => setDeveloperText(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <label>{t("publishers")}</label>
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
                <label>{t("releaseDate")}</label>
                <TextField
                  value={releaseText}
                  onChange={(e) => setReleaseText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div style={{ ...flexFieldStyle, minWidth: "7rem" }}>
                <label>{t("rating")}</label>
                <TextField
                  value={ratingText}
                  onChange={(e) => setRatingText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={t("categories")}>
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

        <PanelSection title={t("achievementSourceTitle")}>
          <PanelSectionRow>
            <div style={compactTextStyle}>{t("achievementSourceHint")}</div>
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
                  {t(`achievementSource_${source}` as any)}
                </FocusableButton>
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={t("retroTitle")}>
          <PanelSectionRow>
            <div style={compactTextStyle}>{t("retroHint")}</div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <TextField
                value={raGameId}
                onChange={(e) => setRaGameId(e.target.value)}
                style={{ ...flexFieldStyle, minWidth: "8rem" }}
              />
              <FocusableButton className="DialogButton" onClick={saveRaGameId}>
                {t("save")}
              </FocusableButton>
              <FocusableButton
                className="DialogButton"
                onClick={autoDetectAchievements}
              >
                {t("retroGameDetect")}
              </FocusableButton>
              <FocusableButton className="DialogButton" onClick={testAchievements}>
                {t("retroGameTest")}
              </FocusableButton>
            </div>
          </PanelSectionRow>
          {raSettings && !raSettings.enabled ? (
            <PanelSectionRow>
              <div style={compactTextStyle}>{t("retroEnabled")}: Off</div>
            </PanelSectionRow>
          ) : null}
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{t("retroGameSearchHint")}</div>
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
                  {raSearching ? t("searching") : t("retroGameSearch")}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              {raSearching ? <Spinner /> : null}
              {!raSearching && !raResults.length ? (
                <div style={compactTextStyle}>{t("retroGameNoMatches")}</div>
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

        <PanelSection title={t("xboxPerGameTitle")}>
          <PanelSectionRow>
            <div style={compactTextStyle}>{t("xboxHint")}</div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{t("xboxCurrentMatch")}</div>
              <div style={buttonRowStyle}>
                <TextField
                  value={xboxTitleId}
                  onChange={(e) => setXboxTitleIdState(e.target.value)}
                  style={{ ...flexFieldStyle, minWidth: "18rem" }}
                />
                <FocusableButton className="DialogButton" onClick={saveXboxMatchManual}>
                  {t("save")}
                </FocusableButton>
              </div>
              <div style={buttonRowStyle}>
                <FocusableButton
                  className="DialogButton"
                  onClick={autoDetectXboxAchievements}
                >
                  {t("xboxGameDetect")}
                </FocusableButton>
                <FocusableButton
                  className="DialogButton"
                  disabled={!xboxTitleId}
                  onClick={syncXboxProgress}
                >
                  {t("xboxSyncProgress")}
                </FocusableButton>
                <FocusableButton className="DialogButton" onClick={clearXboxMatch}>
                  {t("xboxClearMatch")}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{t("xboxGameSearchHint")}</div>
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
                  {xboxSearching ? t("searching") : t("xboxGameSearch")}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={resultsStackStyle}>
              {xboxSearching ? <Spinner /> : null}
              {!xboxSearching && !xboxResults.length ? (
                <div style={compactTextStyle}>{t("xboxGameNoMatches")}</div>
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
