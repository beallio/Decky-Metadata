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
  getScanProgress,
  clearMetadataCache,
  getDelistedIndexStatus,
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
  const [debugLogging, setDebugLoggingState] = useState(false);

  const missing = Math.max(games.length - metadataCount, 0);

  const refresh = useCallback(async () => {
    await refreshMetadataCache();
    await loadGames();
    setMetadataCount(Object.keys(metadataCache).length);
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
          toaster.toast({ title: "Decky Metadata", body: "Scan complete" });
        }
      }, 800);
    } catch (error) {
      setBusy(false);
      toaster.toast({ title: "Decky Metadata", body: String(error) });
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
          toaster.toast({ title: "Decky Metadata", body: "Activity refresh complete" });
        }
      }, 800);
    } catch (error) {
      setActivityBusy(false);
      toaster.toast({ title: "Decky Metadata", body: String(error) });
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
      toaster.toast({ title: "Decky Metadata", body: "Metadata cache cleared" });
    } catch (error) {
      toaster.toast({ title: "Decky Metadata", body: String(error) });
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
      toaster.toast({ title: "Decky Metadata", body: "Delisted index updated" });
      await loadDelistedStatus();
    } catch (error) {
      log.warn("bridge", "delisted index refresh failed", error);
      toaster.toast({ title: "Decky Metadata", body: "Delisted index refresh failed" });
    } finally {
      setDelistedBusy(false);
    }
  };

  const delistedStatusText =
    delistedStatus?.count && delistedStatus.fetched_at
      ? `${delistedStatus.count} delisted apps · updated ${epochToDate(delistedStatus.fetched_at)}`
      : "Delisted index not downloaded yet";


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
              {busy ? (
                <span style={scanSpinnerStyle}>
                  <span style={scanSpinnerInnerStyle}>
                    <Spinner />
                  </span>
                  {"Scanning..."}
                </span>
              ) : (
                "Scan metadata"
              )}
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
            {delistedBusy ? (
              <span style={scanSpinnerStyle}>
                <span style={scanSpinnerInnerStyle}>
                  <Spinner />
                </span>
                {"Refreshing..."}
              </span>
            ) : (
              "Refresh delisted index"
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
        <div style={rowStackStyle}>
          <ToggleField
            label="Debug Logging"
            checked={debugLogging}
            onChange={(checked) => void saveDebugLogging(checked)}
          />
          <div style={diagnosticsGridStyle}>
            <div style={diagnosticsRowStyle}>
              <span>{"Plugin"}</span>
              <span style={diagnosticsValueStyle}>{PLUGIN_VERSION}</span>
            </div>
            <div style={diagnosticsRowStyle}>
              <span>{"Delisted index"}</span>
              <span style={diagnosticsValueStyle}>{delistedStatusText}</span>
            </div>
            <div style={diagnosticsRowStyle}>
              <span>{"Metadata"}</span>
              <span style={diagnosticsValueStyle}>{`Metadata saved: ${metadataCount}`}</span>
            </div>
          </div>
        </div>
      </PanelSectionRow>
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
      toaster.toast({ title: "Decky Metadata", body: "This plugin only changes non-Steam games." });
      return;
    }
    const saved = await saveMetadata(appId, normalizedMetadata);
    metadataCache[String(appId)] = saved;
    applyMetadata(appId);
    toaster.toast({ title: "Decky Metadata", body: "Metadata saved" });
  };

  const applySteamAppId = async () => {
    if (!nonSteam) {
      toaster.toast({ title: "Decky Metadata", body: "This plugin only changes non-Steam games." });
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
      toaster.toast({ title: "Decky Metadata", body: "Metadata saved" });
    } catch (error) {
      toaster.toast({ title: "Decky Metadata", body: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    setBusy(true);
    try {
      setResults(await searchMetadata(query, 8));
    } catch (error) {
      toaster.toast({ title: "Decky Metadata", body: String(error) });
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
      toaster.toast({ title: "Decky Metadata", body: "Metadata saved" });
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    await removeMetadata(appId);
    delete metadataCache[String(appId)];
    setFormMetadata(metadataTemplate(appName(appId)));
    toaster.toast({ title: "Decky Metadata", body: "Metadata removed" });
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
        <PanelSection title={`${"Decky Metadata"} - ${appName(appId)}`}>
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

      </div>
    </ScrollPanel>
  );
};
