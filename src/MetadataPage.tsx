import {
  Field,
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ScrollPanel,
  TextField,
  ToggleField,
  useParams,
} from "@decky/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyFetchedMetadata,
  getMetadata,
  removeMetadata,
  saveMetadata,
  searchMetadata,
  enrichSteamApp,
} from "./backend";
import {
  appName,
  applyMetadata,
  cleanTitle,
  getOverview,
  isNonSteamApp,
  metadataCache,
} from "./steam";
import {
  CATEGORY_LABELS,
  MetadataData,
  MetadataSearchResult,
} from "./types";
import { toastError, toastSuccess, toastWarn } from "./toast";
import {
  dateToEpoch,
  epochToDate,
  metadataTemplate,
  parseRating,
  parseSteamAppId,
  personsToText,
  textToPersons,
} from "./metadataForm";
import {
  buttonRowStyle,
  compactTextStyle,
  fieldStyle,
  flexFieldStyle,
  FocusableButton,
  pageStyle,
  pageTitleStyle,
  rowStackStyle,
  toggleGridStyle,
} from "./styles";

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
    if (busy) return;
    setBusy(true);
    try {
      const saved = await saveMetadata(appId, normalizedMetadata);
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      toastSuccess("Saved", "Metadata saved");
    } catch (error) {
      toastError("Save failed", String(error));
    } finally {
      setBusy(false);
    }
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
      const saved = await applyFetchedMetadata(appId, result.slug || result.url);
      if (!saved) return;
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      setFormMetadata(saved);
      setSteamAppIdText(saved.steam_appid ? String(saved.steam_appid) : "");
      toastSuccess("Saved", "Metadata saved");
    } catch (error) {
      toastError("Fetch failed", String(error));
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await removeMetadata(appId);
      delete metadataCache[String(appId)];
      setFormMetadata(metadataTemplate(appName(appId)));
      toastSuccess("Removed", "Metadata removed");
    } catch (error) {
      toastError("Remove failed", String(error));
    } finally {
      setBusy(false);
    }
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
