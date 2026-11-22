import {
  ButtonItem,
  ConfirmModal,
  DialogControlsSection,
  Field,
  Focusable,
  DropdownItem,
  Navigation,
  TextField,
  ToggleField,
  useParams,
  showModal,
} from "@decky/ui";
import type { ComponentProps, ComponentType, CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaClock, FaCog, FaInfoCircle, FaPencilAlt, FaSteam } from "react-icons/fa";
import { SiSteamdeck } from "react-icons/si";
import {
  clearShortcutNameState,
  getShortcutNameManagement,
  getMetadata,
  removeMetadata,
  previewFetchedMetadata,
  previewSteamMetadata,
  saveMetadata,
  savePreviewedMetadata,
  checkHltbGameId,
  saveShortcutNameState,
  searchMetadata,
  enrichSteamApp,
} from "./backend";
import {
  appName,
  applyMetadata,
  compatibilityDefaultSnapshot,
  compatibilityDefaultScopeSnapshot,
  cleanTitle,
  classifyShortcutNameState,
  currentRoutePath,
  getOverview,
  hasShortcutNameApi,
  isNonSteamApp,
  metadataCache,
  removeMetadataCacheEntry,
  ensureCompatibilityDefault,
  isCompatibilityDefaultEligible,
  nativeShortcutName,
  refreshCompatibilitySurfaces,
  setShortcutNameAndWait,
  setMetadataCacheEntry,
  subscribeCompatibilityRevision,
} from "./steam";
import { getGamepadTextArea } from "./steam/gamepadTextArea";
import {
  CATEGORY_LABELS,
  categoryLabel,
  CompatibilityDefaultScope,
  DeckCompatibilityCategory,
  DeckCompatibilityOverride,
  MetadataData,
  MetadataSearchResult,
  ShortcutNameManagement,
} from "./types";
import { currentLocale, currentSteamLanguage, refreshLanguage, translateBackendError, useT } from "./i18n";
import { toastError, toastSuccess, toastWarn } from "./toast";
import { SteamMatchPicker } from "./SteamMatchPicker";
import { parseHltbGameId } from "./hltb/gameId";
import { HltbGameSearch } from "./hltb/HltbGameSearch";
import { useHltbMatch, useHltbSnapshot } from "./hltb/gameView";
import { hltbStore } from "./hltb/store";
import {
  normalizeReleaseDate,
  metadataTemplate,
  parseRating,
  parseSteamAppId,
  personsToText,
  textToPersons,
} from "./metadataForm";
import {
  editorFieldEditedLabelStyle,
  editorFieldMarkerTagStyle,
  editorFieldPreviewLabelStyle,
  editorFocusTargetClassName,
  editorInlineInputStyle,
  editorIgnResultImageStyle,
  editorNativeInputFirstStyle,
  editorNativeInputGapStyle,
  editorNativeInputRowStyle,
  editorNativeInputSectionStyle,
  editorNativeInputTitleStyle,
  editorRootClassName,
  editorSearchButtonStyle,
  editorSearchInputStyle,
  editorSearchRowStyle,
} from "./metadataEditorStyles";
import { changedDraftFields, changedFormFields } from "./metadataDraft";
import { EditorScopedStyle } from "./editorScopedStyle";
import type { DraftFieldKey, DraftFormState } from "./metadataDraft";
import { EditorLayout } from "./editorLayout";
import { dirtyPages, EDITOR_PAGE_ORDER, PAGE_OF_FIELD, type EditorPageId } from "./editorPages";
import {
  draftFieldLabel,
  saveButtonLabel,
  showRemoveMetadataModal,
  showUnsavedChangesModal,
} from "./editorDialogs";
import { colors } from "./tokens";
import {
  compactTextStyle,
  fieldStyle,
  FocusableButton,
  rowStackStyle,
} from "./styles";
const EditorButtonItem = ButtonItem as ComponentType<
  ComponentProps<typeof ButtonItem> & { className?: string }
>;

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

type Translate = (key: string, options?: Record<string, unknown>) => string;
type BusyOperation = "steam" | "ign" | "other";

const PAGE_LABEL_KEYS: Record<EditorPageId, string> = {
  details: "editor.page.details",
  "steam-match": "editor.page.steamMatch",
  hltb: "editor.page.hltb",
  compatibility: "editor.page.compatibility",
  "shortcut-name": "editor.page.shortcutName",
  advanced: "editor.page.advanced",
};
const PAGE_ICONS: Record<EditorPageId, ReactNode> = {
  details: <FaInfoCircle size={20} />,
  "steam-match": <FaSteam size={20} />,
  hltb: <FaClock size={20} />,
  compatibility: <SiSteamdeck size={20} />,
  "shortcut-name": <FaPencilAlt size={20} />,
  advanced: <FaCog size={20} />,
};


/** Steam's raw language values to BCP-47 tags, for `Intl.DisplayNames`. */
const STEAM_LANGUAGE_TAGS: Record<string, string> = {
  english: "en",
  german: "de",
  french: "fr",
  italian: "it",
  koreana: "ko",
  spanish: "es",
  schinese: "zh-CN",
  tchinese: "zh-TW",
  russian: "ru",
  thai: "th",
  japanese: "ja",
  portuguese: "pt",
  polish: "pl",
  danish: "da",
  dutch: "nl",
  finnish: "fi",
  norwegian: "no",
  swedish: "sv",
  hungarian: "hu",
  czech: "cs",
  romanian: "ro",
  turkish: "tr",
  brazilian: "pt-BR",
  bulgarian: "bg",
  greek: "el",
  ukrainian: "uk",
  latam: "es-419",
  vietnamese: "vi",
  indonesian: "id",
  malay: "ms",
};

// Intl.DisplayNames exists at runtime but not in this project's ES2020 Intl typings.
type DisplayNamesConstructor = new (
  locales: string[],
  options: { type: "language" },
) => { of: (code: string) => string | undefined };
const intlWithDisplayNames = Intl as unknown as { DisplayNames?: DisplayNamesConstructor };

const steamLanguageName = (language: string): string => {
  const tag = STEAM_LANGUAGE_TAGS[language] ?? language;
  try {
    const DisplayNames = intlWithDisplayNames.DisplayNames;
    const name = DisplayNames && new DisplayNames([currentLocale()], { type: "language" }).of(tag);
    return name || language;
  } catch {
    return language;
  }
};

const compatibilityStatusOptions: DeckCompatibilityOverride[] = [null, "valve", 3, 2, 1, 0];

const isCompatibilityCategory = (
  value: unknown
): value is DeckCompatibilityCategory =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 3;

const compatibilityStatusLabel = (category: DeckCompatibilityCategory, t: Translate): string => {
  switch (category) {
    case 0:
      return t("editor.compat.unknown");
    case 1:
      return t("editor.compat.unsupported");
    case 2:
      return t("editor.compat.playable");
    default:
      return t("editor.compat.verified");
  }
};

const compatibilityStatusOptionLabel = (
  value: DeckCompatibilityOverride,
  t: Translate,
): string => {
  if (value === null) return t("editor.compat.useGlobalDefault");
  if (value === "valve") return t("editor.compat.followValve");
  return compatibilityStatusLabel(value, t);
};

const compatibilityStatusValue = (value: unknown): DeckCompatibilityOverride =>
  value === "valve" || isCompatibilityCategory(value) ? value : null;

const compatibilityCategoryValue = (value: unknown): DeckCompatibilityCategory | null =>
  isCompatibilityCategory(value) ? value : null;

const compatibilityStatusDisplay = (
  metadata: Pick<MetadataData, "deck_compat_override" | "deck_compat_category" | "steam_appid">,
  globalDefault: DeckCompatibilityCategory | null,
  scope: CompatibilityDefaultScope,
  t: Translate,
): string => {
  const override = compatibilityStatusValue(metadata.deck_compat_override);
  const valveCategory = compatibilityCategoryValue(metadata.deck_compat_category);
  if (isCompatibilityCategory(override)) return compatibilityStatusLabel(override, t);
  if (override === "valve") {
    return valveCategory === null
      ? t("editor.compat.followValveUnavailable")
      : t("editor.compat.followValveWith", {
        category: compatibilityStatusLabel(valveCategory, t),
      });
  }
  if (globalDefault !== null && isCompatibilityDefaultEligible(metadata, scope)) {
    return t("editor.compat.useGlobalDefaultWith", {
      category: compatibilityStatusLabel(globalDefault, t),
    });
  }
  if (globalDefault !== null) {
    return valveCategory === null
      ? t("editor.compat.useGlobalDefaultOutsideScopeOriginal")
      : t("editor.compat.useGlobalDefaultOutsideScopeFromValve", {
        category: compatibilityStatusLabel(valveCategory, t),
      });
  }
  return valveCategory === null
    ? t("editor.compat.useGlobalDefaultAutomatic")
    : t("editor.compat.useGlobalDefaultFromValve", {
      category: compatibilityStatusLabel(valveCategory, t),
    });
};

const metadataValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * A metadata load can complete after the user has begun editing. Keep each
 * field changed since that request started, while still hydrating every field
 * the user has not touched. Description and summary form one editable value.
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
  if (
    !metadataValuesEqual(current.description, baseline.description) ||
    !metadataValuesEqual(current.short_description, baseline.short_description)
  ) {
    merged.description = current.description;
    merged.short_description = current.short_description;
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
  const t = useT();
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
  const [results, setResults] = useState<MetadataSearchResult[] | null>(null);
  // The operation that owns the shared busy guard; only its control shows busy text.
  const [busy, setBusy] = useState<BusyOperation | false>(false);
  const [steamAppIdText, setSteamAppIdText] = useState("");
  const [shortcutManagement, setShortcutManagement] = useState<ShortcutNameManagement | null>(null);
  const [shortcutManagementError, setShortcutManagementError] = useState(false);
  const [currentShortcutName, setCurrentShortcutName] = useState<string | null>(null);
  const [steamNameLoading, setSteamNameLoading] = useState(false);
  const [steamNameUnavailable, setSteamNameUnavailable] = useState(false);
  const [metadataHydratedEntry, setMetadataHydratedEntry] = useState<number | null>(null);
  const [compatibilityDefault, setCompatibilityDefault] = useState<DeckCompatibilityCategory | null>(
    compatibilityDefaultSnapshot(),
  );
  const [compatibilityDefaultScope, setCompatibilityDefaultScope] = useState<CompatibilityDefaultScope>(
    compatibilityDefaultScopeSnapshot(),
  );
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
  const releaseBaselineRef = useRef({ text: metadata.release_date ?? "", value: metadata.release_date });
  const formRevisionRef = useRef(0);
  const busyRef = useRef(false);
  const busyEntryRef = useRef<number | null>(null);
  const steamAppIdTextRef = useRef(steamAppIdText);
  // The stored record this form is a draft of; only backend confirmations set it.
  const savedRecordRef = useRef<MetadataData | null>(null);
  // The Steam match currently previewed into the form but not stored yet.
  const previewedSteamAppIdRef = useRef<number | null>(null);
  // Fields the last Steam preview filled; a later user edit clears one.
  const steamPreviewedFieldsRef = useRef<Set<DraftFieldKey>>(new Set());
  // A null owner only exists during initial state hydration/tests and remains
  // conservative. A known owner from another editor entry must not block this
  // view or be cleared by its completion callback.
  const entryBusy = busy !== false && (
    busyEntryRef.current === null || busyEntryRef.current === editorEntryToken
  );
  const steamBusy = entryBusy && busy === "steam";
  const ignBusy = entryBusy && busy === "ign";

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
    const nextReleaseText = next.release_date ?? "";
    releaseBaselineRef.current = { text: nextReleaseText, value: next.release_date };
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

  /** A user edit is no longer "from Steam" even if a preview put the value there. */
  const clearPreviewMarker = useCallback((key: DraftFieldKey) => {
    steamPreviewedFieldsRef.current.delete(key);
  }, []);

  const setSteamAppIdInput = useCallback((value: string) => {
    steamAppIdTextRef.current = value;
    setSteamAppIdText(value);
  }, []);

  const formTextSnapshot = (): FormTextSnapshot => ({
    developerText: developerTextRef.current,
    publisherText: publisherTextRef.current,
    releaseText: releaseTextRef.current,
    ratingText: ratingTextRef.current,
    steamAppIdText: steamAppIdTextRef.current,
  });

  /** The draft as the preview markers compare it, one snapshot at a time. */
  const draftFormState = (): DraftFormState => ({
    metadata: metadataRef.current,
    developerText: developerTextRef.current,
    publisherText: publisherTextRef.current,
    releaseText: releaseTextRef.current,
    ratingText: ratingTextRef.current,
    steamAppIdText: steamAppIdTextRef.current,
    hltbIdDraft,
  });

  /**
   * A backend response owns every field that the user did not change while it
   * was pending. Later local edits win, so the form and cache stay aligned
   * with the full enriched record without overwriting active input.
   * A preview is not stored, so it leaves the release baseline alone.
   */
  const reconcileMetadataResponse = useCallback((
    response: MetadataData,
    baselineMetadata: MetadataData,
    baselineText: FormTextSnapshot,
    rebaselineRelease = true,
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
    if (rebaselineRelease) {
      releaseBaselineRef.current = { text: reconciled.release_date ?? "", value: reconciled.release_date };
    }
    if (releaseTextRef.current === baselineText.releaseText) {
      const value = reconciled.release_date ?? "";
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

  const beginBusy = useCallback((entryToken: number, operation: BusyOperation = "other") => {
    if (!isCurrentEditorEntry(entryToken)) return false;
    if (busyRef.current && busyEntryRef.current === entryToken) return false;
    busyRef.current = true;
    busyEntryRef.current = entryToken;
    setBusy(operation);
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
      savedRecordRef.current = saved;
      previewedSteamAppIdRef.current = null;
      steamPreviewedFieldsRef.current.clear();
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
        releaseBaselineRef.current = { text: hydrated.release_date ?? "", value: hydrated.release_date };
        if (releaseTextRef.current === baselineReleaseText) {
          const nextReleaseText = hydrated.release_date ?? "";
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
    // A stored snapshot and an unsaved preview belong to one game's editor.
    savedRecordRef.current = null;
    previewedSteamAppIdRef.current = null;
    steamPreviewedFieldsRef.current.clear();
    // The editor stays mounted across games, so its search belongs to one entry (#43).
    setQuery(appName(appId));
    setResults(null);
    // An unsaved HLTB draft belongs to the game it was typed on.
    setHltbIdDraft(null);
    setPage("details");
  }, [appId]);

  useEffect(() => {
    const steamAppId = normalizedSteamAppId(metadata.steam_appid);
    const storedRecord = savedRecordRef.current;
    // This backfill writes to the store, so it may only run for the stored
    // match: never while the form holds an unsaved preview of another one.
    if (
      metadataHydratedEntry !== editorEntryToken ||
      steamNameBackfillEntryRef.current === editorEntryToken ||
      steamAppId === null ||
      Boolean(metadata.steam_store_name) ||
      storedRecord === null ||
      normalizedSteamAppId(storedRecord.steam_appid) !== steamAppId ||
      previewedSteamAppIdRef.current !== null
    ) {
      return;
    }
    steamNameBackfillEntryRef.current = editorEntryToken;
    const requestedEntry = editorEntryToken;
    const requestedSteamAppId = steamAppId;
    // The stored record is the baseline, not the form: an edit made while the
    // request is pending must not be reverted to its stored value.
    const requestedMetadata = storedRecord;
    const requestedText: FormTextSnapshot = {
      developerText: personsToText(storedRecord.developers),
      publisherText: personsToText(storedRecord.publishers),
      releaseText: storedRecord.release_date ?? "",
      ratingText: storedRecord.rating == null ? "" : String(storedRecord.rating),
      steamAppIdText: storedRecord.steam_appid ? String(storedRecord.steam_appid) : "",
    };
    setSteamNameLoading(true);
    setSteamNameUnavailable(false);
    void currentSteamLanguage()
      .then((language) => enrichSteamApp(appId, "steam-name", language))
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
        // Steam persisted the name for the stored match, so the snapshot moves too.
        savedRecordRef.current = {
          ...(savedRecordRef.current ?? requestedMetadata),
          steam_store_name: reconciled.steam_store_name ?? "",
        };
        // The cache is what the Game Info page renders; it holds stored data only.
        setMetadataCacheEntry(appId, enriched);
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
    const root = editorRootRef.current;
    if (!root) return;
    // Wait for Details to mount again when a new entry resets the selected page.
    const frame = requestAnimationFrame(() => {
      root.querySelector<HTMLInputElement>("[data-editor-title] input")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editorEntryToken]);

  useEffect(() => {
    let cancelled = false;
    void ensureCompatibilityDefault()
      .then((value) => {
        if (!cancelled) {
          setCompatibilityDefault(value);
          setCompatibilityDefaultScope(compatibilityDefaultScopeSnapshot());
        }
      })
      .catch(() => undefined);
    return subscribeCompatibilityRevision(() => {
      if (!cancelled) {
        setCompatibilityDefault(compatibilityDefaultSnapshot());
        setCompatibilityDefaultScope(compatibilityDefaultScopeSnapshot());
      }
    });
  }, []);

  // Steam only exposes its language when the editor opens, so sync the UI locale and text language on mount.
  useEffect(() => {
    void refreshLanguage();
    void currentSteamLanguage().then(setSteamLanguage);
  }, []);

  const normalizedMetadata = useMemo<MetadataData>(
    () => ({
      ...metadata,
      title: cleanTitle(metadata.title),
      developers: textToPersons(developerText),
      publishers: textToPersons(publisherText),
      release_date: releaseText === releaseBaselineRef.current.text ? releaseBaselineRef.current.value : normalizeReleaseDate(releaseText),
      rating: parseRating(ratingText),
      store_categories: metadata.store_categories || [],
    }),
    [developerText, metadata, publisherText, ratingText, releaseText]
  );
  // Unsaved HLTB field text; null shows the saved choice. Declared after the
  // other hooks so their order is unchanged.
  const [hltbIdDraft, setHltbIdDraft] = useState<string | null>(null);
  // The Steam client language for Steam-sourced text; null until the mount probe resolves.
  const [steamLanguage, setSteamLanguage] = useState<string | null>(null);
  // The HLTB game the game page shows, chosen or found automatically.
  const hltbMatch = useHltbMatch(appId, useHltbSnapshot().effectiveEnabled).entry;
  // Declared after the other hooks so their slots stay unchanged.
  const mountedRef = useRef(true);
  // The form revision this entry began with: an edit typed before the record
  // finished loading is still a draft, even though it cannot be diffed yet.
  const entryStartRef = useRef({ entry: editorEntryToken, revision: formRevisionRef.current });
  if (entryStartRef.current.entry !== editorEntryToken) {
    entryStartRef.current = { entry: editorEntryToken, revision: formRevisionRef.current };
  }
  // The leave prompt outlives its render; it must save the form as it is when Save is chosen.
  const saveCurrentRef = useRef<() => Promise<boolean>>(async () => false);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const [page, setPage] = useState<EditorPageId>("details");
  const hltbIdText = hltbIdDraft ?? String(metadata.hltb_game_id || hltbMatch?.hltb_id || "");
  // The visible fields whose value differs from the stored record.
  const changed = changedDraftFields(savedRecordRef.current, {
    metadata,
    developerText,
    publisherText,
    releaseText,
    ratingText,
    steamAppIdText,
    hltbIdDraft,
  });
  const dirty = dirtyPages(changed);
  const saveLabel = saveButtonLabel(t, changed.length);
  const saveDisabled = !nonSteam || changed.length === 0 || steamNameLoading;
  const fieldMarker = (key: DraftFieldKey) => {
    const edited = changed.includes(key);
    const fromSteam = edited && steamPreviewedFieldsRef.current.has(key);
    return {
      label: !edited
        ? undefined
        : fromSteam
          ? editorFieldPreviewLabelStyle
          : editorFieldEditedLabelStyle,
      tag: !edited
        ? null
        : fromSteam
          ? t("editor.fieldFromSteam")
          : t("editor.fieldEdited"),
    };
  };
  const renderMarkedLabel = (marker: ReturnType<typeof fieldMarker>, label: string) => (
    <span
      style={{
        ...marker.label,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      {marker.tag ? <span style={editorFieldMarkerTagStyle}>{marker.tag}</span> : null}
    </span>
  );
  const markedLabel = (key: DraftFieldKey, labelKey: string) =>
    renderMarkedLabel(fieldMarker(key), t(labelKey));
  // Steam's Properties > Shortcut > Launch Options layout: heading above a full-width text box.
  const stackedTextField = (
    blockStyle: CSSProperties,
    key: DraftFieldKey,
    labelKey: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div style={blockStyle}>
      <div style={editorNativeInputTitleStyle}>{markedLabel(key, labelKey)}</div>
      <div style={editorNativeInputRowStyle}>
        <TextField
          className={editorFocusTargetClassName}
          aria-label={t(labelKey)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!nonSteam}
          style={fieldStyle}
        />
      </div>
    </div>
  );
  // Undefined means the field is not a usable HLTB game; the user has been told why.
  const checkHltbIdText = async (): Promise<{ id: number | null; name: string } | undefined> => {
    const text = hltbIdText.trim();
    const id = text ? parseHltbGameId(text) : null;
    if (id === 0) {
      toastWarn(
        t("editor.toast.hltbInvalidTitle"),
        t("editor.toast.hltbInvalidBody"),
      );
      return undefined;
    }
    if (id === null) return { id, name: "" };
    const found = await checkHltbGameId(id);
    if (!found.found) {
      toastWarn(
        t("editor.toast.hltbNotFoundTitle"),
        t("editor.toast.hltbNotFoundBody"),
      );
      return undefined;
    }
    return { id, name: found.game_name };
  };
  // Undefined means the text is not a usable Steam identity; the user has been told why.
  const checkSteamAppIdText = (text: string): number | null | undefined => {
    if (!text.trim()) return null;
    const id = parseSteamAppId(text);
    if (!id) {
      toastWarn(
        t("editor.toast.steamAppIdInvalidTitle"),
        t("editor.toast.steamAppIdInvalidBody"),
      );
      return undefined;
    }
    return id;
  };

  /** Preview a Steam match into the form; nothing is stored until Save. */
  const previewSteamDraft = async (
    requestedEntry: number,
    draft: MetadataData,
    previewedSteamAppId: number,
    language?: string,
  ): Promise<boolean> => {
    const baselineMetadata = metadataRef.current;
    const baselineText = formTextSnapshot();
    try {
      const previewed = await previewSteamMetadata(draft, language ?? await currentSteamLanguage());
      if (!isCurrentEditorEntry(requestedEntry)) return false;
      if (!previewed) {
        toastWarn(t("editor.toast.fetchFailedTitle"), t("editor.steamTextUnavailable"));
        return false;
      }
      const beforeMerge = draftFormState();
      reconcileMetadataResponse(previewed, baselineMetadata, baselineText);
      previewedSteamAppIdRef.current = previewedSteamAppId;
      // Mark every visible field this merge changed; a value the user typed
      // while the request was pending stays a normal edit.
      for (const key of changedFormFields(beforeMerge, draftFormState())) {
        steamPreviewedFieldsRef.current.add(key);
      }
      setSteamNameUnavailable(false);
      toastSuccess(t("editor.toast.detailsLoadedTitle"), t("editor.toast.steamPreviewBody"));
      return true;
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError(t("editor.toast.fetchFailedTitle"), translateBackendError(error));
      }
      return false;
    }
  };

  /**
   * Reload the Steam details of the match the form currently holds, in the
   * given language or the Steam client's. Works for an unsaved preview too.
   */
  const refreshFromSteam = async (language?: string): Promise<boolean> => {
    if (!nonSteam) {
      toastWarn(t("editor.toast.notApplicableTitle"), t("editor.nonSteamOnly"));
      return false;
    }
    const requestedEntry = editorEntryToken;
    if (metadataHydratedEntry !== requestedEntry) {
      toastWarn(t("editor.toast.notLoadedTitle"), t("editor.toast.notLoadedBody"));
      return false;
    }
    const steamAppId = normalizedSteamAppId(normalizedMetadata.steam_appid);
    if (steamAppId === null) {
      toastWarn(t("editor.toast.steamAppIdInvalidTitle"), t("editor.toast.steamAppIdInvalidBody"));
      return false;
    }
    if (!beginBusy(requestedEntry, "steam")) return false;
    try {
      return await previewSteamDraft(requestedEntry, normalizedMetadata, steamAppId, language);
    } finally {
      endBusy(requestedEntry);
    }
  };

  const saveCurrent = async (): Promise<boolean> => {
    if (!nonSteam) {
      toastWarn(t("editor.toast.notApplicableTitle"), t("editor.nonSteamOnly"));
      return false;
    }
    const requestedEntry = editorEntryToken;
    // Until this entry's record loads, the form holds defaults that would overwrite it.
    // The Steam-name backfill is still writing the stored record, so a save now would race it.
    if (metadataHydratedEntry !== requestedEntry || steamNameLoading) {
      toastWarn(t("editor.toast.notLoadedTitle"), t("editor.toast.notLoadedBody"));
      return false;
    }
    // The text field is the requested match; only Apply loads it into the form.
    const textSteamAppId = checkSteamAppIdText(steamAppIdText);
    if (textSteamAppId === undefined) return false;
    if (textSteamAppId !== normalizedSteamAppId(normalizedMetadata.steam_appid)) {
      toastWarn(
        t("editor.toast.steamAppIdNotAppliedTitle"),
        t("editor.toast.steamAppIdNotAppliedBody"),
      );
      return false;
    }
    if (!beginBusy(requestedEntry)) return false;
    const requestedRevision = formRevisionRef.current;
    try {
      // Save also keeps an HLTB game typed without pressing Apply HLTB game.
      const hltb = hltbIdDraft === null ? null : await checkHltbIdText();
      if (hltb === undefined) return false;
      // A field edited while the check was pending makes this record stale.
      if (formRevisionRef.current !== requestedRevision) return false;
      const record = hltb ? { ...normalizedMetadata, hltb_game_id: hltb.id } : normalizedMetadata;
      const steamAppId = normalizedSteamAppId(record.steam_appid);
      // Only a trusted save may store the provider fields a preview fetched.
      const saved = steamAppId !== null && previewedSteamAppIdRef.current === steamAppId
        ? await savePreviewedMetadata(appId, record, steamAppId)
        : await saveMetadata(appId, record);
      if (!isCurrentEditorEntry(requestedEntry)) return false;
      savedRecordRef.current = saved;
      previewedSteamAppIdRef.current = null;
      // An edit made while the save was pending stays in the form, unsaved.
      if (formRevisionRef.current !== requestedRevision) return false;
      steamPreviewedFieldsRef.current.clear();
      setMetadataCacheEntry(appId, saved);
      setFormMetadata(saved);
      if (hltb) setHltbIdDraft(null);
      applyMetadata(appId, { publishCompatibility: false });
      refreshCompatibilitySurfaces();
      toastSuccess(t("editor.toast.metadataSaved"), appName(appId));
      return true;
    } catch (error) {
      toastError(t("editor.toast.saveFailedTitle"), translateBackendError(error));
      return false;
    } finally {
      endBusy(requestedEntry);
    }
  };
  saveCurrentRef.current = saveCurrent;

  /**
   * A delayed save may only navigate back while this entry is still the
   * editor the user sees; Steam or Home may have moved on meanwhile.
   */
  const stillOnEditor = (requestedEntry: number): boolean => {
    if (!mountedRef.current || !isCurrentEditorEntry(requestedEntry)) return false;
    // currentRoutePath joins every location source it can read.
    const editorPaths = [`/decky-metadata/${appId}`, `/routes/decky-metadata/${appId}`];
    return currentRoutePath().split(" ").some((path) => editorPaths.includes(path));
  };

  /** B leaves the editor; a draft asks before it is dropped. */
  const requestLeave = (): void => {
    const requestedEntry = editorEntryToken;
    const editedBeforeLoad =
      metadataHydratedEntry !== requestedEntry &&
      formRevisionRef.current !== entryStartRef.current.revision;
    if (changed.length === 0 && !editedBeforeLoad) {
      Navigation.NavigateBack();
      return;
    }
    showUnsavedChangesModal({
      groups: EDITOR_PAGE_ORDER.filter((id) => dirty.has(id)).map((id) => ({
        page: t(PAGE_LABEL_KEYS[id]),
        fields: changed
          .filter((key) => PAGE_OF_FIELD[key] === id)
          .map((key) => draftFieldLabel(t, key)),
      })),
      onSave: () => {
        // A prompt opened for another game or a closed editor must not save this form.
        if (!stillOnEditor(requestedEntry)) return;
        void saveCurrentRef.current().then((ok) => {
          if (ok && stillOnEditor(requestedEntry)) Navigation.NavigateBack();
        });
      },
      onDiscard: () => {
        if (stillOnEditor(requestedEntry)) Navigation.NavigateBack();
      },
    });
  };

  const applySteamAppId = async (explicitSteamAppId?: number) => {
    if (!nonSteam) {
      toastWarn(t("editor.toast.notApplicableTitle"), t("editor.nonSteamOnly"));
      return;
    }
    const requestedEntry = editorEntryToken;
    if (metadataHydratedEntry !== requestedEntry) {
      toastWarn(t("editor.toast.notLoadedTitle"), t("editor.toast.notLoadedBody"));
      return;
    }
    const steamAppId = explicitSteamAppId === undefined
      ? checkSteamAppIdText(steamAppIdText)
      : explicitSteamAppId;
    if (steamAppId === undefined) return;
    const parsed = normalizedSteamAppId(steamAppId);
    if (!beginBusy(requestedEntry, "steam")) return;
    try {
      if (parsed === null) {
        // Clearing the match is a form edit; Save removes the stored match.
        previewedSteamAppIdRef.current = null;
        clearPreviewMarker("steamAppId");
        setSteamAppIdInput("");
        // Clear everything fetched for the old match, as a changed match does.
        const cleared: MetadataData = {
          ...normalizedMetadata,
          steam_appid: null,
          steam_store_name: "",
          steam_store_url: "",
          deck_compat_category: null,
          steamos_compat_category: null,
          steam_machine_compat_category: null,
          steam_frame_compat_category: null,
          steam_news: [],
          steam_news_enriched_at: 0,
          steam_dlc_appids: [],
          has_points_shop: false,
        };
        delete cleared.steam_store_state;
        reconcileMetadataResponse(cleared, metadataRef.current, formTextSnapshot());
        return;
      }
      const currentSteamAppId = normalizedSteamAppId(normalizedMetadata.steam_appid);
      const changed = currentSteamAppId !== parsed;
      const draft: MetadataData = {
        ...normalizedMetadata,
        steam_appid: parsed,
        steam_store_url: `https://store.steampowered.com/app/${parsed}/`,
        // Steam data fetched for one match must never describe another.
        deck_compat_category: changed ? null : normalizedMetadata.deck_compat_category,
        steamos_compat_category: changed ? null : normalizedMetadata.steamos_compat_category,
        steam_machine_compat_category: changed ? null : normalizedMetadata.steam_machine_compat_category,
        steam_frame_compat_category: changed ? null : normalizedMetadata.steam_frame_compat_category,
        steam_news: changed ? [] : normalizedMetadata.steam_news,
        steam_news_enriched_at: changed ? 0 : normalizedMetadata.steam_news_enriched_at,
        steam_store_name: changed ? "" : normalizedMetadata.steam_store_name,
        steam_dlc_appids: changed ? [] : normalizedMetadata.steam_dlc_appids,
        has_points_shop: changed ? false : normalizedMetadata.has_points_shop,
      };
      if (changed) delete draft.steam_store_state;
      const requestedText = steamAppIdTextRef.current;
      if (await previewSteamDraft(requestedEntry, draft, parsed)) {
        if (steamAppIdTextRef.current === requestedText) setSteamAppIdInput(String(parsed));
      }
    } finally {
      endBusy(requestedEntry);
    }
  };

  /** Check the HLTB field, or a game picked from HLTB search, and keep it as the draft. */
  const applyHltbGameId = async (picked?: { id: number; name: string }) => {
    if (!nonSteam) {
      toastWarn(t("editor.toast.notApplicableTitle"), t("editor.nonSteamOnly"));
      return;
    }
    const requestedEntry = editorEntryToken;
    if (metadataHydratedEntry !== requestedEntry) {
      toastWarn(t("editor.toast.notLoadedTitle"), t("editor.toast.notLoadedBody"));
      return;
    }
    if (!beginBusy(requestedEntry)) return;
    const requestedRevision = formRevisionRef.current;
    try {
      const hltb = picked ?? await checkHltbIdText();
      if (!hltb) return;
      // A slow check must not replace newer typing or another game's draft.
      if (!isCurrentEditorEntry(requestedEntry) || formRevisionRef.current !== requestedRevision) return;
      const { id, name } = hltb;
      markFormEdited();
      clearPreviewMarker("hltb");
      setHltbIdDraft(id === null ? "" : String(id));
      toastSuccess(
        id === null ? t("editor.toast.hltbCleared") : t("editor.toast.hltbGame", { name }),
        t("editor.toast.hltbDraftBody"),
      );
    } catch (error) {
      toastError(t("editor.toast.fetchFailedTitle"), translateBackendError(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const search = async () => {
    const requestedEntry = editorEntryToken;
    if (!query.trim() || !beginBusy(requestedEntry, "ign")) return;
    try {
      const found = await searchMetadata(query, 8);
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setResults(found);
    } catch (error) {
      toastError(t("editor.toast.fetchFailedTitle"), translateBackendError(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const applyResult = async (result: MetadataSearchResult) => {
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry, "other")) return;
    const baselineMetadata = metadataRef.current;
    const baselineText = formTextSnapshot();
    try {
      const fetched = await previewFetchedMetadata(normalizedMetadata, result.slug || result.url);
      if (!fetched || !isCurrentEditorEntry(requestedEntry)) return;
      // An IGN result fills the draft; its release date keeps the stored baseline.
      const beforeMerge = draftFormState();
      reconcileMetadataResponse(fetched, baselineMetadata, baselineText, false);
      // IGN is a normal edit source, so nothing it fills stays marked "From Steam".
      for (const key of changedFormFields(beforeMerge, draftFormState())) {
        steamPreviewedFieldsRef.current.delete(key);
      }
      // An explicit pick takes the game off the removed list; ask HLTB again.
      hltbStore.forget(appId);
      toastSuccess(t("editor.toast.detailsLoadedTitle"), t("editor.toast.ignPreviewBody"));
    } catch (error) {
      toastError(t("editor.toast.fetchFailedTitle"), translateBackendError(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const removeCurrent = async () => {
    const requestedEntry = editorEntryToken;
    if (!beginBusy(requestedEntry)) return;
    try {
      await removeMetadata(appId);
      removeMetadataCacheEntry(appId);
      hltbStore.forget(appId);
      applyMetadata(appId, { publishCompatibility: false });
      refreshCompatibilitySurfaces();
      if (!isCurrentEditorEntry(requestedEntry)) return;
      const template = metadataTemplate(appName(appId));
      savedRecordRef.current = template;
      previewedSteamAppIdRef.current = null;
      steamPreviewedFieldsRef.current.clear();
      setFormMetadata(template);
      toastSuccess(t("editor.toast.removedBody"), appName(appId));
      // Leave the editor: its reset form would otherwise let Save write an empty Manual record (#40).
      Navigation.NavigateBack();
    } catch (error) {
      toastError(t("editor.toast.removeFailedTitle"), translateBackendError(error));
    } finally {
      endBusy(requestedEntry);
    }
  };

  const formSteamAppId = normalizedSteamAppId(metadata.steam_appid);
  const hasSteamMatch = formSteamAppId !== null;
  const storedSteamLanguage = metadata.metadata_language ?? "english";
  const steamLanguageMismatch = Boolean(
    hasSteamMatch &&
    steamLanguage &&
    storedSteamLanguage !== steamLanguage,
  );
  const storedSteamLanguageLabel = steamLanguageMismatch
    ? steamLanguageName(storedSteamLanguage)
    : "";
  const currentSteamLanguageLabel = steamLanguageMismatch
    ? steamLanguageName(steamLanguage ?? "english")
    : "";
  const steamStoreName = typeof metadata.steam_store_name === "string"
    ? metadata.steam_store_name
    : "";
  const savedSteamStoreName = typeof savedRecordRef.current?.steam_store_name === "string"
    ? savedRecordRef.current.steam_store_name
    : "";
  const savedSteamAppId = normalizedSteamAppId(savedRecordRef.current?.steam_appid);
  // Renaming writes Steam state, so it may only use the stored match.
  const steamMatchIsSaved = Boolean(
    savedRecordRef.current &&
    savedSteamAppId !== null &&
    savedSteamAppId === formSteamAppId &&
    previewedSteamAppIdRef.current === null
  );
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
    steamMatchIsSaved &&
    savedSteamStoreName.trim() &&
    currentShortcutName !== savedSteamStoreName &&
    hasShortcutNameApi(),
  );

  const useSteamName = async () => {
    const requestedEntry = editorEntryToken;
    if (!isCurrentEditorEntry(requestedEntry)) return;
    if (
      !canUseSteamName ||
      !shortcutManagement ||
      !currentShortcutName ||
      !hasShortcutNameApi() ||
      savedSteamAppId === null
    ) return;
    const current = nativeShortcutName(appId);
    if (current !== currentShortcutName) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError(
          t("editor.toast.shortcutNameChangedTitle"),
          t("editor.toast.changedBeforeRename"),
        );
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
        savedSteamStoreName,
        savedSteamAppId,
      );
      const observed = await setShortcutNameAndWait(appId, current, savedSteamStoreName);
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setCurrentShortcutName(observed);
      setShortcutManagement({ ...shortcutManagement, state });
      toastSuccess(
        t("editor.toast.shortcutNameUpdatedTitle"),
        t("editor.toast.shortcutNameUpdatedBody"),
      );
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError(
          t("editor.toast.shortcutNameNotUpdatedTitle"),
          translateBackendError(error),
        );
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
        toastError(
          t("editor.toast.shortcutNameChangedTitle"),
          t("editor.toast.changedBeforeRestore"),
        );
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
        toastError(
          t("editor.toast.shortcutNameRestoredTitle"),
          t("editor.toast.shortcutHistoryNotCleared", {
            error: translateBackendError(error),
          }),
        );
        return;
      }
      if (!isCurrentEditorEntry(requestedEntry)) return;
      setShortcutManagement({ ...shortcutManagement, state: null });
      toastSuccess(
        t("editor.toast.shortcutNameRestoredTitle"),
        t("editor.toast.shortcutNameRestoredBody"),
      );
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError(
          t("editor.toast.shortcutNameNotRestoredTitle"),
          translateBackendError(error),
        );
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
      toastSuccess(
        t("editor.toast.nameHistoryForgottenTitle"),
        t("editor.toast.nameHistoryForgottenBody"),
      );
    } catch (error) {
      if (isCurrentEditorEntry(requestedEntry)) {
        toastError(
          t("editor.toast.nameHistoryNotClearedTitle"),
          translateBackendError(error),
        );
      }
    } finally {
      endBusy(requestedEntry);
    }
  };

  const showUseSteamNameModal = () => {
    if (!canUseSteamName || !currentShortcutName) return;
    showModal(
      <ConfirmModal
        strTitle={t("editor.shortcut.useSteamNameTitle")}
        strOKButtonText={t("editor.shortcut.useSteamName")}
        onOK={() => void useSteamName()}
        strDescription={t("editor.shortcut.useSteamNameBody", {
          current: currentShortcutName,
          target: savedSteamStoreName,
        })}
      />
    );
  };

  const showRestoreShortcutNameModal = () => {
    const state = shortcutManagement?.state;
    if (!state || entryBusy || !hasShortcutNameApi()) return;
    showModal(
      <ConfirmModal
        strTitle={t("editor.shortcut.restoreTitle")}
        strOKButtonText={t("editor.shortcut.restore")}
        onOK={() => void restoreOriginalShortcutName()}
        strDescription={t("editor.shortcut.restoreBody", { name: state.original_name })}
      />
    );
  };

  const showForgetShortcutNameHistoryModal = () => {
    if (entryBusy || (busyRef.current && busyEntryRef.current === editorEntryToken)) return;
    showModal(
      <ConfirmModal
        strTitle={t("editor.shortcut.forgetTitle")}
        strOKButtonText={t("editor.shortcut.forgetAction")}
        onOK={() => void forgetShortcutNameHistory()}
        strDescription={t("editor.shortcut.forgetBody")}
      />
    );
  };


  const toggleCategory = (category: number, checked: boolean) => {
    clearPreviewMarker("categories");
    updateMetadata((prev) => {
      const next = new Set(prev.store_categories || []);
      if (checked) next.add(category);
      else next.delete(category);
      return { ...prev, store_categories: Array.from(next) };
    });
  };

  function renderDetailsPage() {
    return (
      <>
        <DialogControlsSection>
          {!nonSteam ? (
            <Field
              focusable={false}
              description={t("editor.nonSteamOnly")}
              bottomSeparator="none"
            />
          ) : null}
          {stackedTextField(editorNativeInputFirstStyle, "title", "editor.field.title", metadata.title, (value) => {
            clearPreviewMarker("title");
            updateMetadata((prev) => ({ ...prev, title: value }));
          })}
          <Field
            label={markedLabel("description", "editor.field.description")}
            childrenLayout="below"
            bottomSeparator="standard"
          >
            {GamepadTextArea ? (
              <GamepadTextArea
                className={editorFocusTargetClassName}
                value={metadata.short_description?.trim() ? metadata.short_description : metadata.description || ""}
                onChange={(e) => {
                  clearPreviewMarker("description");
                  updateMetadata((prev) => ({
                    ...prev,
                    description: e.target.value,
                    short_description: e.target.value,
                  }));
                }}
                style={descriptionTextareaStyle}
                disabled={!nonSteam}
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
                  value={metadata.short_description?.trim() ? metadata.short_description : metadata.description || ""}
                  disabled={!nonSteam}
                  onChange={(e) => {
                    clearPreviewMarker("description");
                    updateMetadata((prev) => ({
                      ...prev,
                      description: e.target.value,
                      short_description: e.target.value,
                    }));
                  }}
                  style={descriptionTextareaStyle}
                />
              </Focusable>
            )}
          </Field>
          {stackedTextField(editorNativeInputSectionStyle, "developers", "editor.field.developers", developerText, (value) => {
            markFormEdited();
            clearPreviewMarker("developers");
            developerTextRef.current = value;
            setDeveloperText(value);
          })}
          {stackedTextField(editorNativeInputGapStyle, "publishers", "editor.field.publishers", publisherText, (value) => {
            markFormEdited();
            clearPreviewMarker("publishers");
            publisherTextRef.current = value;
            setPublisherText(value);
          })}
          <Field label={markedLabel("releaseDate", "editor.field.releaseDate")} bottomSeparator="standard">
            <TextField
              className={editorFocusTargetClassName}
              aria-label={t("editor.field.releaseDate")}
              value={releaseText}
              disabled={!nonSteam}
              onChange={(e) => {
                markFormEdited();
                clearPreviewMarker("releaseDate");
                releaseTextRef.current = e.target.value;
                setReleaseText(e.target.value);
              }}
              style={editorInlineInputStyle}
            />
          </Field>
          <Field label={markedLabel("rating", "editor.field.rating")} bottomSeparator="none">
            <TextField
              className={editorFocusTargetClassName}
              aria-label={t("editor.field.rating")}
              value={ratingText}
              disabled={!nonSteam}
              onChange={(e) => {
                markFormEdited();
                clearPreviewMarker("rating");
                ratingTextRef.current = e.target.value;
                setRatingText(e.target.value);
              }}
              style={editorInlineInputStyle}
            />
          </Field>
        </DialogControlsSection>
        {renderCategoriesSection()}
      </>
    );
  }

  function renderSteamMatchPage() {
    const loadDisabledReasonKey = !nonSteam
      ? "editor.loadFromSteamSteamGame"
      : !hasSteamMatch
        ? "editor.loadFromSteamNoMatch"
        : null;
    const loadLabelKey = steamBusy && !loadDisabledReasonKey
      ? "editor.loadFromSteamBusy"
      : "editor.loadFromSteam";
    return (
      <>
        <SteamMatchPicker
          key={editorEntryToken}
          initialQuery={appName(appId)}
          matchedSteamAppId={savedSteamAppId}
          disabled={entryBusy || !nonSteam}
          onApply={async (steamAppId) => {
            if (!isCurrentEditorEntry(editorEntryToken)) return;
            await applySteamAppId(steamAppId);
          }}
        />
        <div className="DialogControlsSection DialogLabelledControlsSection DialogSettingsSection">
          <div className="SettingsDialogSubHeader">{t("editor.currentMatch")}</div>
          <EditorButtonItem
            className={editorFocusTargetClassName}
            label={t("editor.currentMatch")}
            description={
              <>
                {formSteamAppId !== null
                  ? t("matchPicker.appId", { appId: formSteamAppId })
                  : loadDisabledReasonKey
                    ? null
                    : t("editor.toast.steamPreviewBody")}
                {loadDisabledReasonKey ? (
                  <>
                    <br />
                    {t(loadDisabledReasonKey)}
                  </>
                ) : null}
              </>
            }
            layout="inline"
            disabled={entryBusy || !!loadDisabledReasonKey || steamBusy}
            onClick={() => {
              if (!loadDisabledReasonKey && !steamBusy) void refreshFromSteam();
            }}
          >
            {t(loadLabelKey)}
          </EditorButtonItem>
          <Field
            label={markedLabel("steamAppId", "editor.steamAppId")}
            description={
              <>
                {t("editor.steamAppIdHelp")}
                {changed.includes("steamData") ? (
                  <>
                    <br />
                    <span style={{ color: colors.warning }}>
                      {t("editor.steamDataChanged")}
                    </span>
                  </>
                ) : null}
              </>
            }
            childrenLayout="below"
            childrenContainerWidth="max"
            bottomSeparator={steamLanguageMismatch ? "standard" : "none"}
          >
            <div style={editorSearchRowStyle}>
              <div style={editorSearchInputStyle}>
                <TextField
                  className={editorFocusTargetClassName}
                  aria-label={t("editor.steamAppId")}
                  value={steamAppIdText}
                  disabled={!nonSteam}
                  onChange={(e) => {
                    markFormEdited();
                    clearPreviewMarker("steamAppId");
                    setSteamAppIdInput(e.target.value);
                  }}
                  style={{ ...fieldStyle, width: "100%" }}
                />
              </div>
              <FocusableButton
                className={editorFocusTargetClassName}
                disabled={entryBusy || !nonSteam}
                onClick={() => applySteamAppId()}
                style={editorSearchButtonStyle}
              >
                {t("editor.steamAppIdApply")}
              </FocusableButton>
            </div>
          </Field>
          {steamLanguageMismatch ? (
            <EditorButtonItem
              className={editorFocusTargetClassName}
              label={t("editor.steamTextLanguage", { language: storedSteamLanguageLabel })}
              description={t("editor.toast.steamPreviewBody")}
              layout="inline"
              disabled={entryBusy}
              onClick={() => void refreshFromSteam(steamLanguage ?? undefined)}
              bottomSeparator="none"
            >
              {t("editor.fetchSteamText", { language: currentSteamLanguageLabel })}
            </EditorButtonItem>
          ) : null}
        </div>
        <div className="DialogControlsSection DialogLabelledControlsSection DialogSettingsSection">
          <div className="SettingsDialogSubHeader">{t("editor.searchIgn")}</div>
          <Field label={t("editor.ign.gameName")} childrenLayout="below" childrenContainerWidth="max" bottomSeparator="standard">
            <div style={editorSearchRowStyle}>
              <div style={editorSearchInputStyle}>
                <TextField
                  className={editorFocusTargetClassName}
                  aria-label={t("editor.ign.gameName")}
                  value={query}
                  disabled={!nonSteam}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setResults(null);
                  }}
                  style={{ ...fieldStyle, width: "100%" }}
                />
              </div>
              <FocusableButton
                className={editorFocusTargetClassName}
                disabled={entryBusy || !nonSteam || !query.trim()}
                onClick={search}
                style={editorSearchButtonStyle}
              >
                {ignBusy ? t("editor.searching") : t("editor.search")}
              </FocusableButton>
            </div>
          </Field>
          <div>
            {ignBusy ? (
              <Field
                focusable={false}
                description={<span aria-live="polite">{t("editor.searching")}</span>}
                bottomSeparator="none"
              />
            ) : null}
            {!ignBusy && !results?.length ? (
              <Field
                focusable={false}
                description={
                  <span aria-live="polite">
                    {results === null ? t("editor.noResults") : t("editor.ign.noResults")}
                  </span>
                }
                bottomSeparator="none"
              />
            ) : null}
            {(results ?? []).map((result) => (
              <Field
                key={result.slug || result.url}
                className={`decky-metadata-editor__result ${editorFocusTargetClassName}`}
                label={result.title}
                description={result.description}
                icon={result.cover_url ? <img src={result.cover_url} alt="" style={editorIgnResultImageStyle} /> : undefined}
                focusable={true}
                highlightOnFocus={true}
                bottomSeparator="standard"
                onActivate={() => void applyResult(result)}
                onClick={() => void applyResult(result)}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  function renderHltbPage() {
    return (
      <>
        <div className="DialogControlsSection DialogLabelledControlsSection DialogSettingsSection">
          <div className="SettingsDialogSubHeader">{t("editor.hltbSearchTitle")}</div>
          {hltbMatch?.game_name ? (
            <Field
              focusable={false}
              description={
                hltbMatch.pinned_id_used
                  ? t("editor.hltbCurrentChosen", { name: hltbMatch.game_name })
                  : t("editor.hltbCurrentAutomatic", { name: hltbMatch.game_name })
              }
              bottomSeparator="none"
            />
          ) : null}
          <HltbGameSearch
            key={editorEntryToken}
            initialQuery={appName(appId)}
            disabled={entryBusy || !nonSteam}
            onApply={(picked) => applyHltbGameId(picked)}
          />
        </div>
        <DialogControlsSection>
          <Field
            label={markedLabel("hltb", "editor.hltbGame")}
            description={t("editor.hltbHelp")}
            childrenLayout="below"
            childrenContainerWidth="max"
            bottomSeparator="standard"
          >
            <div style={editorSearchRowStyle}>
              <div style={editorSearchInputStyle}>
                <TextField
                  className={editorFocusTargetClassName}
                  aria-label={t("editor.hltbGame")}
                  value={hltbIdText}
                  disabled={!nonSteam}
                  onChange={(e) => {
                    markFormEdited();
                    clearPreviewMarker("hltb");
                    setHltbIdDraft(e.target.value);
                  }}
                  style={{ ...fieldStyle, width: "100%" }}
                />
              </div>
              <FocusableButton
                className={editorFocusTargetClassName}
                disabled={entryBusy || !nonSteam}
                onClick={() => applyHltbGameId()}
                style={editorSearchButtonStyle}
              >
                {t("editor.hltbApply")}
              </FocusableButton>
            </div>
          </Field>
        </DialogControlsSection>
      </>
    );
  }

  function renderCompatibilityPage() {
    return (
      <DialogControlsSection>
        <DropdownItem
          label={markedLabel("compatibility", "editor.compat.statusLabel")}
          description={
            <>
              {t("editor.compatibilityHelp")}
              <br />
              {t("editor.compatibilityChoices")}
            </>
          }
          bottomSeparator="standard"
          rgOptions={compatibilityStatusOptions.map((data) => ({
            data,
            label: compatibilityStatusOptionLabel(data, t),
          }))}
          selectedOption={compatibilityStatusValue(metadata.deck_compat_override)}
          onChange={(option) =>
            updateMetadata((prev) => ({
              ...prev,
              deck_compat_override: compatibilityStatusValue(option.data),
            }))
          }
          renderButtonValue={() =>
            compatibilityStatusDisplay(
              metadata,
              compatibilityDefault,
              compatibilityDefaultScope,
              t,
            )
          }
        />
      </DialogControlsSection>
    );
  }

  function renderCategoriesSection() {
    const saved = savedRecordRef.current;
    const savedCategories = new Set(saved?.store_categories ?? []);
    const formCategories = new Set(metadata.store_categories ?? []);
    const changedMarker = fieldMarker("categories");
    const unchangedMarker = { label: undefined, tag: null };
    return (
      <div className="DialogControlsSection DialogLabelledControlsSection DialogSettingsSection">
        <div className="SettingsDialogSubHeader">{t("editor.page.storeCategories")}</div>
        {Object.keys(CATEGORY_LABELS).map((key) => {
          const category = Number(key);
          // Mark each toggle whose state differs from the stored record.
          const categoryChanged = saved !== null && savedCategories.has(category) !== formCategories.has(category);
          return (
            <ToggleField
              key={key}
              bottomSeparator="standard"
              label={renderMarkedLabel(categoryChanged ? changedMarker : unchangedMarker, categoryLabel(category, t))}
              checked={formCategories.has(category)}
              onChange={(checked) => toggleCategory(category, checked)}
              disabled={!nonSteam}
            />
          );
        })}
      </div>
    );
  }

  function renderShortcutNamePage() {
    return (
      <DialogControlsSection>
        <Field
          focusable={false}
          description={t("editor.shortcut.immediateNotice")}
          bottomSeparator="standard"
        />
        <Field label={t("editor.shortcut.currentLabel")} focusable={false} bottomSeparator="standard">
          {currentShortcutName ?? t("editor.shortcut.missingName")}
        </Field>
        {steamStoreName ? (
          <Field label={t("editor.shortcut.steamNameLabel")} focusable={false} bottomSeparator="standard">
            {steamStoreName}
          </Field>
        ) : null}
        {steamNameLoading ? <Field focusable={false} description={t("editor.shortcut.loadingSteamName")} bottomSeparator="none" /> : null}
        {steamNameUnavailable ? <Field focusable={false} description={t("editor.shortcut.noOfficialName")} bottomSeparator="none" /> : null}
        {shortcutManagementError ? (
          <Field
            focusable={false}
            description={<span style={{ color: colors.warning }}>{t("editor.shortcut.managementUnavailable")}</span>}
            bottomSeparator="none"
          />
        ) : null}
        {!shortcutManagementError && shortcutManagement?.eligible && !hasShortcutNameApi() ? (
          <Field
            focusable={false}
            description={<span style={{ color: colors.warning }}>{t("editor.shortcut.apiUnavailable")}</span>}
            bottomSeparator="none"
          />
        ) : null}
        {!shortcutManagementError && shortcutManagement?.reason === "shortcut_not_found" ? (
          <Field
            focusable={false}
            description={<span style={{ color: colors.warning }}>{t("editor.shortcut.notFound")}</span>}
            bottomSeparator="none"
          />
        ) : null}
        {!shortcutManagementError && shortcutManagement?.reason === "derived_shortcut_id" ? (
          <Field
            focusable={false}
            description={<span style={{ color: colors.warning }}>{t("editor.shortcut.derivedId")}</span>}
            bottomSeparator="none"
          />
        ) : null}
        {!shortcutManagementError && shortcutManagement?.eligible && currentShortcutName === steamStoreName && steamStoreName ? (
          <Field focusable={false} description={t("editor.shortcut.alreadyMatches")} bottomSeparator="none" />
        ) : null}
        {shortcutStatus === "diverged" ? (
          <Field
            focusable={false}
            description={<span style={{ color: colors.warning }}>{t("editor.shortcut.diverged")}</span>}
            bottomSeparator="none"
          />
        ) : null}
        {!steamNameLoading && !steamStoreName && hasSteamMatch && !steamNameUnavailable ? (
          <Field focusable={false} description={t("editor.shortcut.noOfficialName")} bottomSeparator="none" />
        ) : null}
        {canUseSteamName ? (
          <EditorButtonItem
            className={editorFocusTargetClassName}
            label={t("editor.page.shortcutName")}
            description={t("editor.shortcut.useSteamNameBody", {
              current: currentShortcutName,
              target: savedSteamStoreName,
            })}
            layout="inline"
            disabled={entryBusy}
            onClick={showUseSteamNameModal}
            bottomSeparator="standard"
          >
            {t("editor.shortcut.useSteamName")}
          </EditorButtonItem>
        ) : null}
        {shortcutManagement?.eligible && shortcutStatus === "managed" && shortcutManagement.state ? (
          <EditorButtonItem
            className={editorFocusTargetClassName}
            label={t("editor.page.shortcutName")}
            description={t("editor.shortcut.restoreBody", {
              name: shortcutManagement.state.original_name,
            })}
            layout="inline"
            disabled={entryBusy || !hasShortcutNameApi()}
            onClick={showRestoreShortcutNameModal}
            bottomSeparator="standard"
          >
            {t("editor.shortcut.restore")}
          </EditorButtonItem>
        ) : null}
        {shortcutManagement?.eligible && shortcutStatus === "diverged" ? (
          <EditorButtonItem
            className={editorFocusTargetClassName}
            label={t("editor.page.shortcutName")}
            description={t("editor.shortcut.forgetBody")}
            layout="inline"
            disabled={entryBusy}
            onClick={showForgetShortcutNameHistoryModal}
            bottomSeparator="none"
          >
            {t("editor.shortcut.forget")}
          </EditorButtonItem>
        ) : null}
      </DialogControlsSection>
    );
  }

  function renderAdvancedPage() {
    return (
      <DialogControlsSection>
        <EditorButtonItem
          className={editorFocusTargetClassName}
          label={t("editor.removeMetadata")}
          description={t("editor.removeConfirm.body", { name: appName(appId) })}
          layout="inline"
          onClick={() => showRemoveMetadataModal({
            gameName: appName(appId),
            onConfirm: () => void removeCurrent(),
          })}
          bottomSeparator="none"
        >
          {t("editor.removeMetadata")}
        </EditorButtonItem>
      </DialogControlsSection>
    );
  }

  const renderPageContent = {
    details: renderDetailsPage,
    "steam-match": renderSteamMatchPage,
    hltb: renderHltbPage,
    compatibility: renderCompatibilityPage,
    "shortcut-name": renderShortcutNamePage,
    advanced: renderAdvancedPage,
  };
  const pages = EDITOR_PAGE_ORDER.map((id) => {
    const visible = nonSteam || (id !== "hltb" && id !== "compatibility" && id !== "shortcut-name");
    return {
      id,
      label: t(PAGE_LABEL_KEYS[id]),
      icon: PAGE_ICONS[id],
      dirty: dirty.has(id),
      visible,
      separatorBefore: id === "advanced",
      content: visible ? renderPageContent[id]() : null,
    };
  });

  return (
    <Focusable
      ref={editorRootRef}
      className={editorRootClassName}
      onSecondaryButton={() => {
        if (!saveDisabled) void saveCurrent();
      }}
      onSecondaryActionDescription={saveLabel}
      onCancelButton={requestLeave}
    >
      <EditorScopedStyle />
      <EditorLayout
        title={appName(appId)}
        appId={appId}
        steamAppId={normalizedSteamAppId(metadata.steam_appid)}
        pages={pages}
        page={page}
        onPageRequested={setPage}
        saveLabel={saveLabel}
        saveDisabled={saveDisabled}
        onSave={() => void saveCurrent()}
      />
    </Focusable>
  );
};
