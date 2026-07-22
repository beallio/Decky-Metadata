import {
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ScrollPanel,
  TextField,
  ToggleField,
  useParams,
} from "@decky/ui";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getGamepadTextArea } from "./steam/gamepadTextArea";
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
  editorActionBarStyle,
  editorActionButtonStyle,
  editorAppIdButtonStyle,
  editorAppIdRowStyle,
  editorCategoryGridStyle,
  editorDescriptionFieldStyle,
  editorFocusTargetClassName,
  editorLabelStyle,
  editorReleaseRatingRowStyle,
  editorRemoveButtonStyle,
  editorRootClassName,
  editorSaveButtonStyle,
  editorScopedCss,
  editorScrollViewportStyle,
  editorSearchButtonStyle,
  editorSearchInputRowSpacingStyle,
  editorSearchResultsSpacingStyle,
  editorSearchRowStyle,
  editorSourceFieldStyle,
  editorSourceGroupStyle,
  editorSourceStackStyle,
} from "./metadataEditorStyles";
import {
  compactTextStyle,
  fieldStyle,
  FocusableButton,
  pageStyle,
  pageTitleStyle,
  rowStackStyle,
} from "./styles";

// Shared look for the multiline Description field, applied to both the
// gamepad-aware textarea and the plain fallback.
const descriptionTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 144,
  boxSizing: "border-box",
  resize: "vertical",
  borderRadius: 4,
  padding: 10,
  color: "white",
  background: "rgba(0,0,0,0.28)",
  border: "1px solid rgba(255,255,255,0.18)",
};

export const MetadataPage = () => {
  const editorRootRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Steam's own gamepad-aware textarea is what receives on-screen-keyboard
  // input; a plain <textarea> cannot. Resolve it once. Null means Steam's
  // internals shifted, and we fall back to a Focusable-wrapped textarea below.
  const GamepadTextArea = useMemo(() => getGamepadTextArea(), []);

  // Fallback path only: move real DOM focus onto the plain textarea so it is
  // reachable and (with a physical keyboard / Steam+X) editable. Steam's own
  // gamepad text area needs none of this.
  const focusDescription = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    // Focusable installs onActivate as the wrapper's onClick, so a pointer
    // click inside the textarea bubbles here after the browser has already
    // focused it and placed the caret at the click position. Leave that alone;
    // only take over when focus arrives from elsewhere (gamepad A press),
    // putting the caret at the end so typing appends rather than overwrites.
    if (document.activeElement === el) return;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch (_e) {
      /* setSelectionRange is unsupported on some field types; ignore. */
    }
  }, []);
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

  useEffect(() => {
    const scrollViewport = editorRootRef.current?.parentElement;
    if (!scrollViewport) return;

    const previousScrollPaddingTop = scrollViewport.style.scrollPaddingTop;
    const previousScrollPaddingBottom = scrollViewport.style.scrollPaddingBottom;
    scrollViewport.style.scrollPaddingTop = `${editorScrollViewportStyle.scrollPaddingTop}px`;
    scrollViewport.style.scrollPaddingBottom = `${editorScrollViewportStyle.scrollPaddingBottom}px`;

    return () => {
      scrollViewport.style.scrollPaddingTop = previousScrollPaddingTop;
      scrollViewport.style.scrollPaddingBottom = previousScrollPaddingBottom;
    };
  }, []);

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
      <div ref={editorRootRef} className={editorRootClassName} style={pageStyle}>
        <style>{editorScopedCss}</style>
        <Focusable
          className={editorFocusTargetClassName}
          onActivate={() => {}}
          style={pageTitleStyle}
        >
          {`${"Decky Metadata"} - ${appName(appId)}`}
        </Focusable>
        <div style={editorActionBarStyle}>
          <FocusableButton
            className={`DialogButton ${editorFocusTargetClassName} decky-metadata-editor__action--save`}
            onClick={saveCurrent}
            style={editorSaveButtonStyle}
          >
            {"Save"}
          </FocusableButton>
          <FocusableButton
            className={`DialogButton ${editorFocusTargetClassName} decky-metadata-editor__action--remove`}
            onClick={removeCurrent}
            style={editorRemoveButtonStyle}
          >
            {"Remove metadata"}
          </FocusableButton>
          <FocusableButton
            className={`DialogButton ${editorFocusTargetClassName}`}
            onClick={() => Navigation.NavigateBack()}
            style={editorActionButtonStyle}
          >
            {"Done"}
          </FocusableButton>
        </div>
        {!nonSteam ? (
          <PanelSection>
            <PanelSectionRow>
              <div style={compactTextStyle}>
                {"This plugin only changes non-Steam games."}
              </div>
            </PanelSectionRow>
          </PanelSection>
        ) : null}

        <PanelSection title={"Search IGN metadata"}>
          <PanelSectionRow>
            <div
              style={{
                ...editorSearchRowStyle,
                ...editorSearchInputRowSpacingStyle,
              }}
            >
              <TextField
                className={editorFocusTargetClassName}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={fieldStyle}
              />
              <FocusableButton
                className={`DialogButton ${editorFocusTargetClassName}`}
                disabled={busy}
                onClick={search}
                style={editorSearchButtonStyle}
              >
                {busy ? "Searching..." : "Search"}
              </FocusableButton>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div
              style={{
                ...rowStackStyle,
                ...editorSearchResultsSpacingStyle,
              }}
            >
              {busy ? (
                <div style={compactTextStyle}>{"Searching..."}</div>
              ) : null}
              {!busy && !results.length ? (
                <div style={compactTextStyle}>{"No results yet."}</div>
              ) : null}
              {results.map((result) => (
                <FocusableButton
                  key={result.slug || result.url}
                  className={`DialogButton ${editorFocusTargetClassName} decky-metadata-editor__result`}
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
            <div style={editorSourceStackStyle}>
              <div style={editorSourceFieldStyle}>
                <label style={editorLabelStyle}>{"Title"}</label>
                <TextField
                  className={editorFocusTargetClassName}
                  value={metadata.title}
                  onChange={(e) =>
                    setMetadata((prev) => ({ ...prev, title: e.target.value }))
                  }
                  style={fieldStyle}
                />
              </div>
              <div style={editorDescriptionFieldStyle}>
                <label style={editorLabelStyle}>{"Description"}</label>
                {GamepadTextArea ? (
                  <GamepadTextArea
                    className={editorFocusTargetClassName}
                    value={metadata.description}
                    onChange={(e) =>
                      setMetadata((prev) => ({
                        ...prev,
                        description: e.target.value,
                        short_description: e.target.value,
                      }))
                    }
                    style={descriptionTextareaStyle}
                  />
                ) : (
                  <Focusable
                    className={editorFocusTargetClassName}
                    style={{ width: "100%" }}
                    onActivate={focusDescription}
                  >
                    <textarea
                      ref={descriptionRef}
                      className={editorFocusTargetClassName}
                      tabIndex={0}
                      value={metadata.description}
                      onChange={(e) =>
                        setMetadata((prev) => ({
                          ...prev,
                          description: e.target.value,
                          short_description: e.target.value,
                        }))
                      }
                      style={descriptionTextareaStyle}
                    />
                  </Focusable>
                )}
              </div>
              <div style={editorSourceGroupStyle}>
                <label style={editorLabelStyle}>{"Developers"}</label>
                <TextField
                  className={editorFocusTargetClassName}
                  value={developerText}
                  onChange={(e) => setDeveloperText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div style={editorSourceGroupStyle}>
                <label style={editorLabelStyle}>{"Publishers"}</label>
                <TextField
                  className={editorFocusTargetClassName}
                  value={publisherText}
                  onChange={(e) => setPublisherText(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div style={editorReleaseRatingRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <label style={editorLabelStyle}>{"Release date"}</label>
                  <TextField
                    className={editorFocusTargetClassName}
                    value={releaseText}
                    onChange={(e) => setReleaseText(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={editorLabelStyle}>{"Rating"}</label>
                  <TextField
                    className={editorFocusTargetClassName}
                    value={ratingText}
                    onChange={(e) => setRatingText(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title={"Steam info fields"}>
          <PanelSectionRow>
            <div
              className="decky-metadata-editor__category-grid"
              style={editorCategoryGridStyle}
            >
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
              <div style={editorAppIdRowStyle}>
                <TextField
                  className={editorFocusTargetClassName}
                  value={steamAppIdText}
                  onChange={(e) => setSteamAppIdText(e.target.value)}
                  style={fieldStyle}
                />
                <FocusableButton
                  className={`DialogButton ${editorFocusTargetClassName}`}
                  disabled={busy}
                  onClick={applySteamAppId}
                  style={editorAppIdButtonStyle}
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
