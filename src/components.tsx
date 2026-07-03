import {
  DialogButton,
  Field,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMetadata,
  getDebugLogging,
  getMetadata,
  getActivityRefreshProgress,
  removeMetadata,
  saveMetadata,
  searchMetadata,
  setDebugLogging,
  startRefreshSteamActivities,
  startScanMissing,
  getMissingMetadataCount,
  getScanProgress,
  clearMetadataCache,
  getDelistedIndexStatus,
  getPluginVersion,
  enrichSteamApp,
  refreshDelistedIndex,
} from "./backend";
import * as log from "./log";
import {
  allNonSteamGames,
  appName,
  applyMetadata,
  cleanTitle,
  getOverview,
  isNonSteamApp,
  metadataCache,
  refreshMetadataCache,
} from "./steam";
import {
  CATEGORY_LABELS,
  GameOption,
  MetadataData,
  MetadataSearchResult,
  StoreCategory,
} from "./types";
import { toastError, toastSuccess, toastWarn } from "./toast";
import {
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  space,
  statusColor,
  type StatusKind,
} from "./tokens";

// Keep in sync with package.json and plugin.json.
export const PLUGIN_VERSION = "0.1.0";

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

export const splitVersion = (version: string): { base: string; commit: string | null } => {
  const fallback = PLUGIN_VERSION;
  const trimmed = String(version || "").trim();
  const value = trimmed || fallback;
  const separator = value.indexOf("+");
  if (separator < 0) {
    return { base: value, commit: null };
  }
  const base = value.slice(0, separator).trim() || fallback;
  const commit = value.slice(separator + 1).trim();
  return { base, commit: commit || null };
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
  fontFamily,
} as const;

const pageTitleStyle = {
  width: "100%",
  fontSize: fontSize.xl,
  fontWeight: fontWeight.bold,
  paddingBottom: space.md,
  outline: "none",
  // Keep the title clear of the SteamOS top bar when the controller scrolls to it.
  scrollMarginTop: 90,
} as const;

const toggleGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  columnGap: space.md,
  width: "100%",
  minWidth: 0,
} as const;

const qamPanelStyle = {
  width: "100%",
  fontFamily,
} as const;

const rowStackStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  gap: space.md,
} as const;

const buttonRowStyle = {
  display: "flex",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  gap: space.sm,
  alignItems: "center",
  flexWrap: "wrap",
} as const;

const spacedButtonRowStyle = {
  ...buttonRowStyle,
  marginTop: space.sm,
} as const;

const actionButtonStackStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: space.sm,
  flex: "1 1 208px",
  minWidth: 0,
} as const;

const resultsStackStyle = {
  ...rowStackStyle,
  marginTop: 20,
} as const;

const fieldStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
} as const;

const flexFieldStyle = {
  ...fieldStyle,
  flex: "1 1 224px",
} as const;

const compactTextStyle = {
  color: colors.textSecondary,
  fontSize: fontSize.sm,
  lineHeight: 1.35,
} as const;

const inlineStatusBaseStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  ...compactTextStyle,
} as const;

const inlineStatusStyle = (kind: StatusKind) => ({
  ...inlineStatusBaseStyle,
  color: statusColor(kind),
});

const busySpinnerStyle = {
  width: "18px",
  height: "18px",
  color: colors.accent,
} as const;

const buttonLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  minWidth: 136,
} as const;

const sectionHeadingStyle = {
  width: "100%",
  paddingTop: space.md,
  fontWeight: fontWeight.bold,
  fontSize: fontSize.lg,
} as const;

const diagnosticsGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space.md,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
} as const;

const diagnosticsRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space.xs,
  alignItems: "start",
  padding: `${space.xxs}px 0`,
  ...compactTextStyle,
} as const;

const diagnosticsValueStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  color: colors.textSecondary,
} as const;

const focusableBlockStyle = {
  display: "block",
  width: "100%",
  minWidth: 0,
} as const;

const BusySpinner = () => (
  <Spinner style={busySpinnerStyle} />
);

const ButtonLabel = ({ children, busy = false }: { children: string; busy?: boolean }) => (
  <span style={buttonLabelStyle}>
    {busy ? <BusySpinner /> : null}
    {children}
  </span>
);

const scanCompleteMessage = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}) => {
  const total = Number(progress.total || 0);
  if (!total) return "Scan complete";
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed
    ? `Scan complete: ${assigned}/${total} saved, ${failed} not matched`
    : `Scan complete: ${assigned}/${total} saved`;
};

const scanCompleteStatusKind = (progress: {
  total?: number;
  assigned?: number;
  failed?: number;
}): StatusKind => {
  const total = Number(progress.total || 0);
  const assigned = Number(progress.assigned || 0);
  const failed = Number(progress.failed || 0);
  return failed > 0 || (total > 0 && assigned < total) ? "warning" : "success";
};

const activityCompleteMessage = (progress: {
  total?: number;
  assigned?: number;
}) => {
  const total = Number(progress.total || 0);
  if (!total) return "Activity refresh complete";
  return `Activity refresh complete: ${Number(progress.assigned || 0)}/${total} updated`;
};

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

const useNonSteamGames = () => {
  const [games, setGames] = useState<GameOption[]>([]);
  const loadGames = useCallback(async () => {
    const loadedGames = await allNonSteamGames();
    setGames(loadedGames);
    return loadedGames;
  }, []);
  useEffect(() => {
    void loadGames();
  }, [loadGames]);
  return { games, loadGames };
};

export const Content = () => {
  const { games, loadGames } = useNonSteamGames();
  const [metadataCount, setMetadataCount] = useState(0);
  const [missing, setMissing] = useState(0);
  const [busy, setBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanStatusKind, setScanStatusKind] = useState<StatusKind>("idle");
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [activityStatusKind, setActivityStatusKind] = useState<StatusKind>("idle");
  const [cacheBusy, setCacheBusy] = useState(false);
  const [delistedStatus, setDelistedStatus] = useState<{
    count: number;
    fetched_at: number;
  } | null>(null);
  const [delistedBusy, setDelistedBusy] = useState(false);
  const [debugLogging, setDebugLoggingState] = useState(false);
  const [pluginVersion, setPluginVersion] = useState(PLUGIN_VERSION);

  const parsedPluginVersion = splitVersion(pluginVersion);

  const updateMissingCount = useCallback((currentGames: GameOption[]) => {
    void getMissingMetadataCount(currentGames)
      .then(setMissing)
      .catch((error) => log.warn("bridge", "missing metadata count load failed", error));
  }, []);

  const refresh = useCallback(async () => {
    await refreshMetadataCache();
    const loadedGames = await loadGames();
    setMetadataCount(Object.keys(metadataCache).length);
    updateMissingCount(loadedGames);
  }, [loadGames, updateMissingCount]);

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
    void getPluginVersion()
      .then((version) => {
        if (!cancelled && version) {
          setPluginVersion(version);
        }
      })
      .catch((error) => log.warn("bridge", "plugin version load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

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
    setScanStatusKind("active");
    try {
      await startScanMissing(games);
      const interval = window.setInterval(async () => {
        const progress = await getScanProgress();
        setScanStatusKind("active");
        setScanMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (!progress.running) {
          window.clearInterval(interval);
          await refresh();
          setBusy(false);
          setScanStatusKind(scanCompleteStatusKind(progress));
          setScanMessage(scanCompleteMessage(progress));
          toastSuccess("Scan", "Scan complete");
        }
      }, 800);
    } catch (error) {
      setBusy(false);
      setScanStatusKind("error");
      setScanMessage(String(error));
      toastError("Scan failed", String(error));
    }
  };

  const refreshActivities = async () => {
    if (activityBusy) return;
    setActivityBusy(true);
    setActivityStatusKind("active");
    setActivityMessage("Refreshing Activity...");
    try {
      await startRefreshSteamActivities(games);
      const interval = window.setInterval(async () => {
        const progress = await getActivityRefreshProgress();
        setActivityStatusKind("active");
        setActivityMessage(
          progress.current ||
            progress.message ||
            `${progress.completed}/${progress.total}`
        );
        if (!progress.running) {
          window.clearInterval(interval);
          await refreshMetadataCache();
          setMetadataCount(Object.keys(metadataCache).length);
          updateMissingCount(games);
          setActivityBusy(false);
          setActivityStatusKind("success");
          setActivityMessage(activityCompleteMessage(progress));
          window.dispatchEvent(new Event("decky-metadata:activity-refreshed"));
          window.dispatchEvent(new Event("decky-metadata:updated"));
          toastSuccess("Activity", activityCompleteMessage(progress));
        }
      }, 800);
    } catch (error) {
      setActivityBusy(false);
      setActivityStatusKind("error");
      setActivityMessage(String(error));
      toastError("Activity failed", String(error));
    }
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
      updateMissingCount(games);
      toastSuccess("Cache", "Metadata cache cleared");
    } catch (error) {
      toastError("Cache clear failed", String(error));
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
      toastSuccess("Delisted index", "Delisted index updated");
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toastError("Delisted index", "Delisted index refresh failed");
    } finally {
      setDelistedBusy(false);
    }
  };

  const delistedStatusText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `${delistedStatus.count} delisted apps · updated ${epochToDate(delistedStatus.fetched_at)}`
      : "Delisted index not downloaded yet";


  return (
    <div style={qamPanelStyle}>
      <PanelSection>
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
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
          </Field>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection>
        <PanelSectionRow>
          <div style={spacedButtonRowStyle}>
            <div style={actionButtonStackStyle}>
              <FocusableButton
                className="DialogButton"
                disabled={busy || !games.length}
                onClick={scanMissing}
              >
                {busy ? (
                  <ButtonLabel busy={true}>{"Scanning..."}</ButtonLabel>
                ) : (
                  <ButtonLabel>{"Scan metadata"}</ButtonLabel>
                )}
              </FocusableButton>
              {busy || scanMessage ? (
                <div style={inlineStatusStyle(scanStatusKind)}>{scanMessage || "Scanning..."}</div>
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
                <div style={inlineStatusStyle(activityStatusKind)}>{activityMessage || "Refreshing Activity..."}</div>
              ) : null}
            </div>
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={sectionHeadingStyle}>{"Metadata cache"}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={rowStackStyle}>
            <div style={compactTextStyle}>{"Clear cached Steam matches and metadata so games re-fetch and re-match."}</div>
            <div style={inlineStatusStyle(delistedBusy ? "active" : "idle")}>
              {delistedBusy ? (
                <BusySpinner />
              ) : null}
              <span>{delistedStatusText}</span>
            </div>
            <FocusableButton
              className="DialogButton"
              disabled={delistedBusy}
              onClick={refreshDelisted}
            >
              {delistedBusy ? (
                <ButtonLabel busy={true}>{"Refreshing..."}</ButtonLabel>
              ) : (
                <ButtonLabel>{"Refresh delisted index"}</ButtonLabel>
              )}
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
        <PanelSectionRow>
          <div style={sectionHeadingStyle}>{"Diagnostics"}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            highlightOnFocus={false}
            label="Debug Logging"
            checked={debugLogging}
            onChange={(checked) => void saveDebugLogging(checked)}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Versions">
        <PanelSectionRow>
          <Field focusable={true} highlightOnFocus={true} childrenLayout="below" padding="standard" bottomSeparator="none">
            <div style={diagnosticsGridStyle}>
              <div style={diagnosticsRowStyle}>
                <span>{"Plugin"}</span>
                <span style={diagnosticsValueStyle}>{parsedPluginVersion.base}</span>
              </div>
              <div style={diagnosticsRowStyle}>
                <span>{"Commit"}</span>
                <span style={diagnosticsValueStyle}>{parsedPluginVersion.commit || "local"}</span>
              </div>
              <div style={diagnosticsRowStyle}>
                <span>{"Delisted index"}</span>
                <span style={diagnosticsValueStyle}>{delistedStatusText}</span>
              </div>
              <div style={diagnosticsRowStyle}>
                <span>{"Metadata"}</span>
                <span style={diagnosticsValueStyle}>{metadataCount}</span>
              </div>
            </div>
          </Field>
        </PanelSectionRow>
      </PanelSection>
    </div>
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
  const [steamAppIdText, setSteamAppIdText] = useState("");

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
      toastWarn("Not applicable", "This plugin only changes non-Steam games.");
      return;
    }
    const saved = await saveMetadata(appId, normalizedMetadata);
    metadataCache[String(appId)] = saved;
    applyMetadata(appId);
    toastSuccess("Saved", "Metadata saved");
  };

  const applySteamAppId = async () => {
    if (!nonSteam) {
      toastWarn("Not applicable", "This plugin only changes non-Steam games.");
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
      toastSuccess("Saved", "Metadata saved");
    } catch (error) {
      toastError("Save failed", String(error));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    setBusy(true);
    try {
      setResults(await searchMetadata(query, 8));
    } catch (error) {
      toastError("Save failed", String(error));
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
      toastSuccess("Saved", "Metadata saved");
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    await removeMetadata(appId);
    delete metadataCache[String(appId)];
    setFormMetadata(metadataTemplate(appName(appId)));
    toastSuccess("Removed", "Metadata removed");
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
        <Focusable onActivate={() => {}} style={pageTitleStyle}>
          {`${"Decky Metadata"} - ${appName(appId)}`}
        </Focusable>
        <PanelSection>
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
                style={{ ...fieldStyle, flex: "1 1 auto", minWidth: 220 }}
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
            <Field label={"Title"} childrenLayout="below">
              <TextField
                value={metadata.title}
                onChange={(e) =>
                  setMetadata((prev) => ({ ...prev, title: e.target.value }))
                }
                style={fieldStyle}
              />
            </Field>
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
                    minHeight: 144,
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
            <Field label={"Developers"} childrenLayout="below">
              <TextField
                value={developerText}
                onChange={(e) => setDeveloperText(e.target.value)}
                style={fieldStyle}
              />
            </Field>
          </PanelSectionRow>
          <PanelSectionRow>
            <Field label={"Publishers"} childrenLayout="below">
              <TextField
                value={publisherText}
                onChange={(e) => setPublisherText(e.target.value)}
                style={fieldStyle}
              />
            </Field>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={buttonRowStyle}>
              <div style={{ ...flexFieldStyle, minWidth: 128 }}>
                <label>{"Release date"}</label>
                <TextField
                  value={releaseText}
                  onChange={(e) => setReleaseText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div style={{ ...flexFieldStyle, minWidth: 112 }}>
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
          <PanelSectionRow>
            <div style={toggleGridStyle}>
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                <ToggleField
                  key={category}
                  highlightOnFocus={false}
                  bottomSeparator="none"
                  label={label}
                  checked={(metadata.store_categories || []).includes(Number(category))}
                  onChange={(checked) => toggleCategory(Number(category), checked)}
                />
              ))}
            </div>
          </PanelSectionRow>
        </PanelSection>


        <PanelSection title={"Steam App ID"}>
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{"Paste a Steam app ID, Store URL, Community URL, or SteamDB URL. Leave empty to clear the pinned Steam match."}</div>
              <div style={{ ...buttonRowStyle, flexWrap: "nowrap" }}>
                <TextField
                  value={steamAppIdText}
                  onChange={(e) => setSteamAppIdText(e.target.value)}
                  style={{ ...fieldStyle, flex: "1 1 auto", minWidth: 120 }}
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

      </div>
    </ScrollPanel>
  );
};
