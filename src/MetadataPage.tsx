import {
  ConfirmModal,
  Focusable,
  DropdownItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ScrollPanel,
  TextField,
  ToggleField,
  useParams,
  showModal,
} from "@decky/ui";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyFetchedMetadata,
  clearShortcutNameState,
  getShortcutNameManagement,
  getMetadata,
  removeMetadata,
  saveMetadata,
  saveShortcutNameState,
  searchMetadata,
  enrichSteamApp,
} from "./backend";
import {
  appName,
  applyMetadata,
  cleanTitle,
  classifyShortcutNameState,
  getOverview,
  hasShortcutNameApi,
  isNonSteamApp,
  metadataCache,
  nativeShortcutName,
  refreshCompatibilitySurfaces,
  setShortcutNameAndWait,
} from "./steam";
import { getGamepadTextArea } from "./steam/gamepadTextArea";
import {
  CATEGORY_LABELS,
  DeckCompatibilityCategory,
  MetadataData,
  MetadataSearchResult,
  ShortcutNameManagement,
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

type CompatibilityOverride = DeckCompatibilityCategory | null;

const compatibilityStatusOptions: Array<{
  data: CompatibilityOverride;
  label: string;
}> = [
  { data: null, label: "Automatic" },
  { data: 3, label: "Verified" },
  { data: 2, label: "Playable" },
  { data: 1, label: "Unsupported" },
  { data: 0, label: "Unknown" },
];

const isCompatibilityCategory = (
  value: unknown
): value is DeckCompatibilityCategory =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 3;

const compatibilityStatusLabel = (category: DeckCompatibilityCategory): string =>
  ({ 0: "Unknown", 1: "Unsupported", 2: "Playable", 3: "Verified" })[
    category
  ];

const compatibilityStatusValue = (value: unknown): CompatibilityOverride =>
  isCompatibilityCategory(value) ? value : null;

const compatibilityStatusDisplay = (
  override: CompatibilityOverride,
  resolved: CompatibilityOverride
): string => {
  if (override !== null) return compatibilityStatusLabel(override);
  return resolved === null
    ? "Automatic"
    : `Automatic (Valve: ${compatibilityStatusLabel(resolved)})`;
};

const metadataValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * A metadata load can complete after the user has begun editing. Keep each
 * field changed since that request started, while still hydrating every field
 * the user has not touched.
 */
const mergeHydratedMetadata = (
  saved: MetadataData,
  baseline: MetadataData,
  current: MetadataData,
): MetadataData => {
  const merged: Record<string, unknown> = { ...saved };
  const keys = new Set([...Object.keys(saved), ...Object.keys(baseline), ...Object.keys(current)]);
  for (const key of keys) {
    if (!metadataValuesEqual(current[key as keyof MetadataData], baseline[key as keyof MetadataData])) {
      merged[key] = current[key as keyof MetadataData];
    }
  }
  return merged as MetadataData;
};

const normalizedSteamAppId = (value: unknown): number | null => {
  const appId = Number(value);
  return Number.isInteger(appId) && appId > 0 ? appId : null;
};

type FormTextSnapshot = {
  developerText: string;
  publisherText: string;
  releaseText: string;
  ratingText: string;
  steamAppIdText: string;
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
  const [shortcutManagement, setShortcutManagement] = useState<ShortcutNameManagement | null>(null);
  const [shortcutManagementError, setShortcutManagementError] = useState(false);
  const [currentShortcutName, setCurrentShortcutName] = useState<string | null>(null);
  const [steamNameLoading, setSteamNameLoading] = useState(false);
  const [steamNameUnavailable, setSteamNameUnavailable] = useState(false);
  const [metadataHydratedEntry, setMetadataHydratedEntry] = useState<number | null>(null);
  const steamNameBackfillEntryRef = useRef<number | null>(null);
  const editorEntryRef = useRef({ appId, token: 0 });
  // The editor can visit A, B, then A again while an async operation from the
  // first A is pending. App ID equality alone cannot distinguish those views.
  if (editorEntryRef.current.appId !== appId) {
    editorEntryRef.current = {
      appId,
      token: editorEntryRef.current.token + 1,
    };
  }
  const editorEntryToken = editorEntryRef.current.token;
  const metadataRef = useRef(metadata);
  const developerTextRef = useRef(developerText);
  const publisherTextRef = useRef(publisherText);
  const releaseTextRef = useRef(releaseText);
  const ratingTextRef = useRef(ratingText);
  const formRevisionRef = useRef(0);
  const busyRef = useRef(false);
  const busyEntryRef = useRef<number | null>(null);
  const steamAppIdTextRef = useRef(steamAppIdText);
  // A null owner only exists during initial state hydration/tests and remains
  // conservative. A known owner from another editor entry must not block this
  // view or be cleared by its completion callback.
  const entryBusy = busy && (
    busyEntryRef.current === null || busyEntryRef.current === editorEntryToken
  );

  const isCurrentEditorEntry = useCallback(
    (token: number) => editorEntryRef.current.token === token,
    [],
  );

  const setFormMetadata = useCallback((next: MetadataData) => {
    formRevisionRef.current += 1;
    metadataRef.current = next;
    setMetadata(next);
    const nextDeveloperText = personsToText(next.developers);
    const nextPublisherText = personsToText(next.publishers);
    const nextReleaseText = epochToDate(next.release_date);
    const nextRatingText = next.rating == null ? "" : String(next.rating);
    developerTextRef.current = nextDeveloperText;
    publisherTextRef.current = nextPublisherText;
    releaseTextRef.current = nextReleaseText;
    ratingTextRef.current = nextRatingText;
    setDeveloperText(nextDeveloperText);
    setPublisherText(nextPublisherText);
    setReleaseText(nextReleaseText);
    setRatingText(nextRatingText);
  }, []);

  const updateMetadata = useCallback((updater: (current: MetadataData) => MetadataData) => {
    formRevisionRef.current += 1;
    setMetadata((current) => {
      const next = updater(current);
      metadataRef.current = next;
      return next;
    });
  }, []);

  const markFormEdited = useCallback(() => {
    formRevisionRef.current += 1;
  }, []);

  const setSteamAppIdInput = useCallback((value: string) => {
    steamAppIdTextRef.current = value;
    setSteamAppIdText(value);
  }, []);

  /**
   * A backend response owns every field that the user did not change while it
   * was pending. Later local edits win, so the form and cache stay aligned
   * with the full enriched record without overwriting active input.
   */
  const reconcileMetadataResponse = useCallback((
    response: MetadataData,
    baselineMetadata: MetadataData,
    baselineText: FormTextSnapshot,
  ): MetadataData => {
    const reconciled = mergeHydratedMetadata(response, baselineMetadata, metadataRef.current);
    metadataRef.current = reconciled;
    setMetadata(reconciled);
    if (developerTextRef.current === baselineText.developerText) {
      const value = personsToText(reconciled.developers);
      developerTextRef.current = value;
      setDeveloperText(value);
    }
    if (publisherTextRef.current === baselineText.publisherText) {
      const value = personsToText(reconciled.publishers);
      publisherTextRef.current = value;
      setPublisherText(value);
    }
    if (releaseTextRef.current === baselineText.releaseText) {
      const value = epochToDate(reconciled.release_date);
      releaseTextRef.current = value;
      setReleaseText(value);
    }
    if (ratingTextRef.current === baselineText.ratingText) {
      const value = reconciled.rating == null ? "" : String(reconciled.rating);
      ratingTextRef.current = value;
      setRatingText(value);
    }
    return reconciled;
  }, []);

  const beginBusy = useCallback((entryToken: number) => {
    if (!isCurrentEditorEntry(entryToken)) return false;
    if (busyRef.current && busyEntryRef.current === entryToken) return false;
    busyRef.current = true;
    busyEntryRef.current = entryToken;
    setBusy(true);
    return true;
  }, [isCurrentEditorEntry]);

  const endBusy = useCallback((entryToken: number) => {
    if (busyEntryRef.current !== entryToken) return;
    busyRef.current = false;
    busyEntryRef.current = null;
    setBusy(false);
  }, []);

  const loadShortcutManagement = useCallback(async () => {
    const requestedEntry = editorEntryToken;
    try {
      const management = await getShortcutNameManagement(appId);
      if (!isCurrentEditorEntry(requestedEntry)) return null;
      setShortcutManagement(management);
      setShortcutManagementError(false);
      setCurrentShortcutName(nativeShortcutName(appId));
      return management;
    } catch (_error) {
      if (!isCurrentEditorEntry(requestedEntry)) return null;
      setShortcutManagement(null);
      setShortcutManagementError(true);
      setCurrentShortcutName(nativeShortcutName(appId));
      return null;
    }
  }, [appId, editorEntryToken, isCurrentEditorEntry]);

  const load = useCallback(async () => {
    const requestedEntry = editorEntryToken;
    const requestedRevision = formRevisionRef.current;
    const baselineMetadata = metadataRef.current;
    const baselineDeveloperText = developerTextRef.current;
    const baselinePublisherText = publisherTextRef.current;
    const baselineReleaseText = releaseTextRef.current;
    const baselineRatingText = ratingTextRef.current;
    const baselineSteamAppIdText = steamAppIdTextRef.current;
    const [metadataResult, managementResult] = await Promise.allSettled([
      getMetadata(appId),
      getShortcutNameManagement(appId),
    ]);
    if (!isCurrentEditorEntry(requestedEntry)) return;
    if (metadataResult.status === "fulfilled") {
      const saved = metadataResult.value || metadataTemplate(appName(appId));
      if (formRevisionRef.current === requestedRevision) {
        setFormMetadata(saved);
        setSteamAppIdInput(saved.steam_appid ? String(saved.steam_appid) : "");
      } else {
        const hydrated = mergeHydratedMetadata(saved, baselineMetadata, metadataRef.current);
        metadataRef.current = hydrated;
        setMetadata(hydrated);
        if (developerTextRef.current === baselineDeveloperText) {
          const nextDeveloperText = personsToText(saved.developers);
          developerTextRef.current = nextDeveloperText;
          setDeveloperText(nextDeveloperText);
        }
        if (publisherTextRef.current === baselinePublisherText) {
          const nextPublisherText = personsToText(saved.publishers);
          publisherTextRef.current = nextPublisherText;
          setPublisherText(nextPublisherText);
        }
        if (releaseTextRef.current === baselineReleaseText) {
          const nextReleaseText = epochToDate(saved.release_date);
          releaseTextRef.current = nextReleaseText;
          setReleaseText(nextReleaseText);
        }
        if (ratingTextRef.current === baselineRatingText) {
          const nextRatingText = saved.rating == null ? "" : String(saved.rating);
          ratingTextRef.current = nextRatingText;
          setRatingText(nextRatingText);
        }
        if (steamAppIdTextRef.current === baselineSteamAppIdText) {
          setSteamAppIdInput(saved.steam_appid ? String(saved.steam_appid) : "");
        }
      }
      // Backfill can only use the record that this entry's metadata RPC just
      // returned. A route change otherwise leaves the prior form visible for
      // one render while the new request is still pending.
      setMetadataHydratedEntry(requestedEntry);
    } else {
      setMetadataHydratedEntry(null);
    }
    if (managementResult.status === "fulfilled") {
      setShortcutManagement(managementResult.value);
      setShortcutManagementError(false);
    } else {
      setShortcutManagement(null);
      setShortcutManagementError(true);
    }
    setCurrentShortcutName(nativeShortcutName(appId));
  }, [
    appId,
    editorEntryToken,
    isCurrentEditorEntry,
    setFormMetadata,
    setSteamAppIdInput,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSteamNameLoading(false);
    setSteamNameUnavailable(false);
    setMetadataHydratedEntry(null);
  }, [appId]);

  useEffect(() => {
    const steamAppId = Number(metadata.steam_appid);
    if (
      metadataHydratedEntry !== editorEntryToken ||
      steamNameBackfillEntryRef.current === editorEntryToken ||
      !Number.isInteger(steamAppId) ||
      steamAppId <= 0 ||
      Boolean(metadata.steam_store_name)
    ) {
      return;
    }
    steamNameBackfillEntryRef.current = editorEntryToken;
    const requestedEntry = editorEntryToken;
    const requestedSteamAppId = steamAppId;
    const requestedMetadata = metadataRef.current;
    const requestedText: FormTextSnapshot = {
      developerText: developerTextRef.current,
      publisherText: publisherTextRef.current,
      releaseText: releaseTextRef.current,
      ratingText: ratingTextRef.current,
      steamAppIdText: steamAppIdTextRef.current,
    };
    setSteamNameLoading(true);
    setSteamNameUnavailable(false);
    void enrichSteamApp(appId)
      .then((enriched) => {
        const current = metadataRef.current;
        if (
          !isCurrentEditorEntry(requestedEntry) ||
          normalizedSteamAppId(current.steam_appid) !== requestedSteamAppId
        ) {
          return;
        }
        if (!enriched) {
          setSteamNameUnavailable(true);
          return;
        }
        const reconciled = reconcileMetadataResponse(enriched, requestedMetadata, requestedText);
        metadataCache[String(appId)] = reconciled;
        if (steamAppIdTextRef.current === requestedText.steamAppIdText) {
          setSteamAppIdInput(reconciled.steam_appid ? String(reconciled.steam_appid) : "");
        }
        if (!reconciled.steam_store_name) setSteamNameUnavailable(true);
      })
      .catch(() => {
        if (
          isCurrentEditorEntry(requestedEntry) &&
          normalizedSteamAppId(metadataRef.current.steam_appid) === requestedSteamAppId
        ) {
          setSteamNameUnavailable(true);
        }
      })
      .finally(() => {
        if (isCurrentEditorEntry(requestedEntry)) setSteamNameLoading(false);
      });
  }, [
    appId,
    editorEntryToken,
    isCurrentEditorEntry,
    metadataHydratedEntry,
    metadata.steam_appid,
    metadata.steam_store_name,
    reconcileMetadataResponse,
  ]);

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
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry)) return;
    const requestedRevision = formRevisionRef.current;
    try {
      const saved = await saveMetadata(appId, normalizedMetadata);
      if (
        !isCurrentEditorEntry(requestedEntry) ||
        formRevisionRef.current !== requestedRevision
      ) {
        return;
      }
      metadataCache[String(appId)] = saved;
      setFormMetadata(saved);
      applyMetadata(appId);
      refreshCompatibilitySurfaces();
      toastSuccess("Saved", "Metadata saved");
    } catch (error) {
      toastError("Save failed", String(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const applySteamAppId = async () => {
    if (!nonSteam) {
      toastWarn("Not applicable", "This plugin only changes non-Steam games.");
      return;
    }
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry)) return;
    const saveBaselineMetadata = metadataRef.current;
    const saveBaselineText: FormTextSnapshot = {
      developerText: developerTextRef.current,
      publisherText: publisherTextRef.current,
      releaseText: releaseTextRef.current,
      ratingText: ratingTextRef.current,
      steamAppIdText: steamAppIdTextRef.current,
    };
    try {
      const parsed = normalizedSteamAppId(parseSteamAppId(steamAppIdText));
      const savedSteamAppId = normalizedSteamAppId(normalizedMetadata.steam_appid);
      const steamAppIdChanged = parsed !== savedSteamAppId;
      const next = {
        ...normalizedMetadata,
        steam_appid: parsed || null,
        // A proposal is valid only for the Steam match that supplied it.
        // Clear it before enrichment so a failed request cannot reuse stale data.
        steam_store_name: steamAppIdChanged ? "" : normalizedMetadata.steam_store_name,
        steam_store_url: parsed
          ? `https://store.steampowered.com/app/${parsed}/`
          : "",
      };
      const saved = await saveMetadata(appId, next);
      if (!isCurrentEditorEntry(requestedEntry)) {
        return;
      }
      // Keep the local values as they existed just before this acknowledgement.
      // They are the only edits that can predate the enrichment request below.
      const metadataAtSaveAcknowledgement = metadataRef.current;
      // A save acknowledgement owns the Steam match. Reconcile all untouched
      // fields from it while preserving edits made during the request.
      const reconciled = reconcileMetadataResponse({
        ...saved,
        steam_appid: normalizedSteamAppId(saved.steam_appid),
        steam_store_name: typeof saved.steam_store_name === "string" ? saved.steam_store_name : "",
        steam_store_url: typeof saved.steam_store_url === "string" ? saved.steam_store_url : "",
      }, saveBaselineMetadata, saveBaselineText);
      metadataCache[String(appId)] = reconciled;
      if (steamAppIdTextRef.current === steamAppIdText) {
        setSteamAppIdInput(reconciled.steam_appid ? String(reconciled.steam_appid) : "");
      }
      steamNameBackfillEntryRef.current = requestedEntry;
      setSteamNameUnavailable(false);
      if (parsed === null) {
        applyMetadata(appId);
        refreshCompatibilitySurfaces();
        toastSuccess("Saved", "Metadata saved");
        return;
      }
      const enrichmentBaselineMetadata = metadataRef.current;
      const enrichmentBaselineText: FormTextSnapshot = {
        // Text fields can be locally edited without changing metadataRef.
        // Keep edits that happened before this enrichment started too.
        ...saveBaselineText,
      };
      const enriched = await enrichSteamApp(appId);
      if (
        !isCurrentEditorEntry(requestedEntry) ||
        normalizedSteamAppId(metadataRef.current.steam_appid) !== parsed
      ) {
        return;
      }
      if (enriched) {
        const normalizedEnriched: MetadataData = {
          ...enriched,
          steam_appid: normalizedSteamAppId(enriched.steam_appid),
          steam_store_name: typeof enriched.steam_store_name === "string" ? enriched.steam_store_name : "",
          steam_store_url: typeof enriched.steam_store_url === "string" ? enriched.steam_store_url : "",
        };
        // Edits made while saving predate the enrichment baseline, so restore
        // them before merging any newer edits from the enrichment interval.
        const enrichedWithEarlierEdits = mergeHydratedMetadata(
          normalizedEnriched,
          saveBaselineMetadata,
          metadataAtSaveAcknowledgement,
        );
        const enrichedMetadata = reconcileMetadataResponse(
          enrichedWithEarlierEdits,
          enrichmentBaselineMetadata,
          enrichmentBaselineText,
        );
        metadataCache[String(appId)] = enrichedMetadata;
        if (steamAppIdTextRef.current === steamAppIdText) {
          setSteamAppIdInput(enrichedMetadata.steam_appid ? String(enrichedMetadata.steam_appid) : "");
        }
      } else {
        if (steamAppIdTextRef.current === steamAppIdText) {
          setSteamAppIdInput(reconciled.steam_appid ? String(reconciled.steam_appid) : "");
        }
      }
      applyMetadata(appId);
      refreshCompatibilitySurfaces();
      toastSuccess("Saved", "Metadata saved");
    } catch (error) {
      toastError("Save failed", String(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const search = async () => {
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry)) return;
    try {
      setResults(await searchMetadata(query, 8));
    } catch (error) {
      toastError("Save failed", String(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const applyResult = async (result: MetadataSearchResult) => {
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry)) return;
    const requestedRevision = formRevisionRef.current;
    try {
      const saved = await applyFetchedMetadata(appId, result.slug || result.url);
      if (!saved) return;
      if (
        !isCurrentEditorEntry(requestedEntry) ||
        formRevisionRef.current !== requestedRevision
      ) {
        return;
      }
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      refreshCompatibilitySurfaces();
      setFormMetadata(saved);
      setSteamAppIdInput(saved.steam_appid ? String(saved.steam_appid) : "");
      toastSuccess("Saved", "Metadata saved");
    } catch (error) {
      toastError("Fetch failed", String(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const removeCurrent = async () => {
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry)) return;
    try {
      await removeMetadata(appId);
      delete metadataCache[String(appId)];
      applyMetadata(appId);
      refreshCompatibilitySurfaces();
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setFormMetadata(metadataTemplate(appName(appId)));
      toastSuccess("Removed", "Metadata removed");
    } catch (error) {
      toastError("Remove failed", String(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const steamAppId = Number(metadata.steam_appid);
  const hasSteamMatch = Number.isInteger(steamAppId) && steamAppId > 0;
  const steamStoreName = typeof metadata.steam_store_name === "string"
    ? metadata.steam_store_name
    : "";
  const hasSteamStoreName = Boolean(steamStoreName.trim());
  const shortcutStatus = classifyShortcutNameState(
    currentShortcutName,
    shortcutManagement?.state,
  );
  const canUseSteamName = Boolean(
    !entryBusy &&
    !shortcutManagementError &&
    shortcutManagement?.eligible &&
    (shortcutStatus === "unmanaged" || shortcutStatus === "restored") &&
    currentShortcutName &&
    hasSteamMatch &&
    hasSteamStoreName &&
    currentShortcutName !== steamStoreName &&
    hasShortcutNameApi(),
  );

  const useSteamName = async () => {
    const requestedEntry = editorEntryToken;
    if (!isCurrentEditorEntry(requestedEntry)) return;
    if (!canUseSteamName || !shortcutManagement || !currentShortcutName || !hasShortcutNameApi()) return;
    const current = nativeShortcutName(appId);
    if (current !== currentShortcutName) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError("Shortcut name changed", "Steam changed this shortcut before it could be renamed.");
        await loadShortcutManagement();
      }
      return;
    }
    if (!beginBusy(requestedEntry)) return;
    try {
      // State is durable before the native request so the original spelling
      // survives an app crash, timeout, or Steam-side error.
      const state = await saveShortcutNameState(
        appId,
        current,
        steamStoreName,
        steamAppId,
      );
      const observed = await setShortcutNameAndWait(appId, current, steamStoreName);
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setCurrentShortcutName(observed);
      setShortcutManagement({ ...shortcutManagement, state });
      toastSuccess("Shortcut name updated", "Steam confirmed the new shortcut name.");
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError("Shortcut name was not updated", String(error));
        await loadShortcutManagement();
      }
    } finally {
      endBusy(requestedEntry);
    }
  };

  const restoreOriginalShortcutName = async () => {
    const requestedEntry = editorEntryToken;
    if (!isCurrentEditorEntry(requestedEntry)) return;
    const state = shortcutManagement?.state;
    if (!state || entryBusy || !hasShortcutNameApi()) return;
    const current = nativeShortcutName(appId);
    if (current !== state.applied_name) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError("Shortcut name changed", "Steam changed this shortcut before it could be restored.");
        await loadShortcutManagement();
      }
      return;
    }
    if (!beginBusy(requestedEntry)) return;
    try {
      const observed = await setShortcutNameAndWait(appId, state.applied_name, state.original_name);
      if (isCurrentEditorEntry(requestedEntry)) setCurrentShortcutName(observed);
      try {
        // The native restore is already complete. Clear the history for this
        // captured shortcut even if the user navigated to another editor while
        // Steam was confirming it; entry guards below protect only that UI.
        await clearShortcutNameState(appId);
      } catch (error) {
        if (!isCurrentEditorEntry(requestedEntry)) return;
        await loadShortcutManagement();
        toastError("Shortcut name restored", `Steam restored the name, but saved history could not be cleared: ${String(error)}`);
        return;
      }
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setShortcutManagement({ ...shortcutManagement, state: null });
      toastSuccess("Shortcut name restored", "Steam confirmed the original shortcut name.");
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError("Shortcut name was not restored", String(error));
        await loadShortcutManagement();
      }
    } finally {
      endBusy(requestedEntry);
    }
  };

  const forgetShortcutNameHistory = async () => {
    const requestedEntry = editorEntryToken;
    if (!isCurrentEditorEntry(requestedEntry) || !beginBusy(requestedEntry)) return;
    try {
      await clearShortcutNameState(appId);
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setShortcutManagement((current) => current ? { ...current, state: null } : current);
      toastSuccess("Saved name history forgotten", "Steam did not change the shortcut name.");
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError("Saved name history was not cleared", String(error));
      }
    } finally {
      endBusy(requestedEntry);
    }
  };

  const showUseSteamNameModal = () => {
    if (!canUseSteamName || !currentShortcutName) return;
    showModal(
      <ConfirmModal strTitle="Use Steam name?" strOKButtonText="Use Steam name" onOK={() => void useSteamName()}>
        <div style={compactTextStyle}>{`Change “${currentShortcutName}” to “${steamStoreName}”?`}</div>
      </ConfirmModal>,
    );
  };

  const showRestoreShortcutNameModal = () => {
    const state = shortcutManagement?.state;
    if (!state || entryBusy || !hasShortcutNameApi()) return;
    showModal(
      <ConfirmModal strTitle="Restore original shortcut name?" strOKButtonText="Restore original name" onOK={() => void restoreOriginalShortcutName()}>
        <div style={compactTextStyle}>{`Restore “${state.original_name}”?`}</div>
      </ConfirmModal>,
    );
  };

  const showForgetShortcutNameHistoryModal = () => {
    if (entryBusy || (busyRef.current && busyEntryRef.current === editorEntryToken)) return;
    showModal(
      <ConfirmModal strTitle="Forget saved name history?" strOKButtonText="Forget history" onOK={() => void forgetShortcutNameHistory()}>
        <div style={compactTextStyle}>{"This only removes Decky Metadata's saved restore history. Steam will not change the shortcut name."}</div>
      </ConfirmModal>,
    );
  };


  const toggleCategory = (category: number, checked: boolean) => {
    updateMetadata((prev) => {
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
                disabled={entryBusy}
                onClick={search}
                style={editorSearchButtonStyle}
              >
                {entryBusy ? "Searching..." : "Search"}
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
              {entryBusy ? (
                <div style={compactTextStyle}>{"Searching..."}</div>
              ) : null}
              {!entryBusy && !results.length ? (
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
                    updateMetadata((prev) => ({ ...prev, title: e.target.value }))
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
                      updateMetadata((prev) => ({
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
                        updateMetadata((prev) => ({
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
                  onChange={(e) => {
                    markFormEdited();
                    developerTextRef.current = e.target.value;
                    setDeveloperText(e.target.value);
                  }}
                  style={fieldStyle}
                />
              </div>
              <div style={editorSourceGroupStyle}>
                <label style={editorLabelStyle}>{"Publishers"}</label>
                <TextField
                  className={editorFocusTargetClassName}
                  value={publisherText}
                  onChange={(e) => {
                    markFormEdited();
                    publisherTextRef.current = e.target.value;
                    setPublisherText(e.target.value);
                  }}
                  style={fieldStyle}
                />
              </div>
              <div style={editorReleaseRatingRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <label style={editorLabelStyle}>{"Release date"}</label>
                  <TextField
                    className={editorFocusTargetClassName}
                    value={releaseText}
                  onChange={(e) => {
                    markFormEdited();
                    releaseTextRef.current = e.target.value;
                    setReleaseText(e.target.value);
                  }}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={editorLabelStyle}>{"Rating"}</label>
                  <TextField
                    className={editorFocusTargetClassName}
                    value={ratingText}
                  onChange={(e) => {
                    markFormEdited();
                    ratingTextRef.current = e.target.value;
                    setRatingText(e.target.value);
                  }}
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          </PanelSectionRow>
        </PanelSection>

        {nonSteam ? (
          <PanelSection title={"Compatibility status"}>
            <PanelSectionRow>
              <DropdownItem
                label={"Compatibility status"}
                rgOptions={compatibilityStatusOptions}
                selectedOption={compatibilityStatusValue(
                  metadata.deck_compat_override
                )}
                onChange={(option) =>
                  updateMetadata((prev) => ({
                    ...prev,
                    deck_compat_override: compatibilityStatusValue(option.data),
                  }))
                }
                renderButtonValue={() =>
                  compatibilityStatusDisplay(
                    compatibilityStatusValue(metadata.deck_compat_override),
                    compatibilityStatusValue(metadata.deck_compat_category)
                  )
                }
              />
            </PanelSectionRow>
          </PanelSection>
        ) : null}

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
                  onChange={(e) => {
                    markFormEdited();
                    setSteamAppIdInput(e.target.value);
                  }}
                  style={fieldStyle}
                />
                <FocusableButton
                  className={`DialogButton ${editorFocusTargetClassName}`}
                  disabled={entryBusy}
                  onClick={applySteamAppId}
                  style={editorAppIdButtonStyle}
                >
                  {"Apply Steam App ID"}
                </FocusableButton>
              </div>
            </div>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title="Shortcut name">
          <PanelSectionRow>
            <div style={rowStackStyle}>
              <div style={compactTextStyle}>{`Current: ${currentShortcutName ?? "Steam did not expose a native shortcut name"}`}</div>
              {steamStoreName ? <div style={compactTextStyle}>{`Steam: ${steamStoreName}`}</div> : null}
              {steamNameLoading ? <div style={compactTextStyle}>{"Loading Steam name..."}</div> : null}
              {steamNameUnavailable ? <div style={compactTextStyle}>{"Steam did not return an official name"}</div> : null}
              {shortcutManagementError ? <div style={compactTextStyle}>{"Shortcut-name management is unavailable"}</div> : null}
              {!shortcutManagementError && shortcutManagement?.eligible && !hasShortcutNameApi() ? <div style={compactTextStyle}>{"Steam's native shortcut-name API is unavailable"}</div> : null}
              {!shortcutManagementError && shortcutManagement?.reason === "shortcut_not_found" ? <div style={compactTextStyle}>{"Steam shortcut was not found"}</div> : null}
              {!shortcutManagementError && shortcutManagement?.reason === "derived_shortcut_id" ? <div style={compactTextStyle}>{"This shortcut has a derived ID and cannot be renamed safely"}</div> : null}
              {!shortcutManagementError && shortcutManagement?.eligible && currentShortcutName === steamStoreName && steamStoreName ? <div style={compactTextStyle}>{"Shortcut name already matches Steam"}</div> : null}
              {shortcutStatus === "diverged" ? <div style={compactTextStyle}>{"This shortcut name changed outside Decky Metadata. Rename and restore are disabled until saved history is forgotten."}</div> : null}
              {canUseSteamName ? (
                <FocusableButton className={`DialogButton ${editorFocusTargetClassName}`} disabled={entryBusy} onClick={showUseSteamNameModal} style={editorAppIdButtonStyle}>
                  {"Use Steam name"}
                </FocusableButton>
              ) : null}
              {shortcutManagement?.eligible && shortcutStatus === "managed" && shortcutManagement.state ? (
                <FocusableButton className={`DialogButton ${editorFocusTargetClassName}`} disabled={entryBusy || !hasShortcutNameApi()} onClick={showRestoreShortcutNameModal} style={editorAppIdButtonStyle}>
                  {"Restore original name"}
                </FocusableButton>
              ) : null}
              {shortcutManagement?.eligible && shortcutStatus === "diverged" ? (
                <FocusableButton className={`DialogButton ${editorFocusTargetClassName}`} disabled={entryBusy} onClick={showForgetShortcutNameHistoryModal} style={editorAppIdButtonStyle}>
                  {"Forget saved name history"}
                </FocusableButton>
              ) : null}
              {!steamNameLoading && !steamStoreName && hasSteamMatch && !steamNameUnavailable ? <div style={compactTextStyle}>{"Steam did not return an official name"}</div> : null}
            </div>
          </PanelSectionRow>
        </PanelSection>

      </div>
    </ScrollPanel>
  );
};
