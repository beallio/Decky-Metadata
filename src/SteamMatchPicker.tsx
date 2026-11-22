import { Field, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { searchSteamMatches } from "./backend";
import {
  editorFocusTargetClassName,
  editorSearchButtonStyle,
  editorSearchInputStyle,
  editorSearchRowStyle,
  editorSteamMatchImageStyle,
} from "./metadataEditorStyles";
import { compactTextStyle, fieldStyle, FocusableButton } from "./styles";
import { translateBackendError, useT } from "./i18n";
import type { SteamMatchCandidate } from "./types";

/** What the picker last searched, kept by the editor while the page is hidden. */
export type SteamSearchSnapshot = {
  query: string;
  items: SteamMatchCandidate[];
  status: "idle" | "results" | "empty" | "error";
  error: string | null;
};

type SteamMatchPickerProps = {
  initialQuery: string;
  matchedSteamAppId: number | null;
  disabled: boolean;
  savedSearch: SteamSearchSnapshot | null;
  onSearchChange: (search: SteamSearchSnapshot) => void;
  onApply: (steamAppId: number, coverUrl: string | null) => Promise<void>;
};

type SearchStatus = SteamSearchSnapshot["status"] | "loading";
const EMPTY_MATCHES: SteamMatchCandidate[] = [];

export const SteamMatchPicker = ({
  initialQuery,
  matchedSteamAppId,
  disabled,
  savedSearch,
  onSearchChange,
  onApply,
}: SteamMatchPickerProps) => {
  const t = useT();
  const [query, setQuery] = useState(savedSearch?.query ?? initialQuery);
  const [items, setItems] = useState<SteamMatchCandidate[]>(savedSearch?.items ?? EMPTY_MATCHES);
  const [status, setStatus] = useState<SearchStatus>(savedSearch?.status ?? "idle");
  const [searchError, setSearchError] = useState<string | null>(savedSearch?.error ?? null);
  const queryRef = useRef(savedSearch?.query ?? initialQuery);
  const searchRequestRef = useRef(0);
  const lifetimeRef = useRef(0);
  const mountedRef = useRef(true);
  const itemsRef = useRef<SteamMatchCandidate[]>(savedSearch?.items ?? EMPTY_MATCHES);
  const pendingQueryRef = useRef<string | null>(null);
  const resultsRootRef = useRef<HTMLDivElement>(null);
  const disabledRef = useRef(disabled);
  const onApplyRef = useRef(onApply);
  disabledRef.current = disabled;
  onApplyRef.current = onApply;
  // One modal at a time: a double press must not open a second review or steal focus from the first.
  const applyingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifetimeRef.current += 1;
    };
  }, []);

  const changeQuery = (value: string) => {
    queryRef.current = value;
    searchRequestRef.current += 1;
    pendingQueryRef.current = null;
    setQuery(value);
    itemsRef.current = EMPTY_MATCHES;
    setItems(EMPTY_MATCHES);
    setStatus("idle");
    setSearchError(null);
    onSearchChange({ query: value, items: [], status: "idle", error: null });
  };

  const search = async () => {
    const requestedQuery = queryRef.current.trim();
    if (!mountedRef.current || disabled || !requestedQuery || pendingQueryRef.current === requestedQuery) return;
    const request = ++searchRequestRef.current;
    const lifetime = lifetimeRef.current;
    pendingQueryRef.current = requestedQuery;
    itemsRef.current = EMPTY_MATCHES;
    setItems(EMPTY_MATCHES);
    setStatus("loading");
    setSearchError(null);
    const isCurrent = () => lifetimeRef.current === lifetime && searchRequestRef.current === request;
    try {
      const response = await searchSteamMatches(requestedQuery, 8);
      if (!isCurrent()) return;
      if (response.error) {
        setSearchError(response.error);
        setStatus("error");
        onSearchChange({ query: queryRef.current, items: [], status: "error", error: response.error });
      } else {
        itemsRef.current = response.items;
        setItems(response.items);
        setStatus(response.items.length ? "results" : "empty");
        onSearchChange({
          query: queryRef.current,
          items: response.items,
          status: response.items.length ? "results" : "empty",
          error: null,
        });
      }
    } catch {
      if (!isCurrent()) return;
      setSearchError("steam_search_unavailable");
      setStatus("error");
      onSearchChange({ query: queryRef.current, items: [], status: "error", error: "steam_search_unavailable" });
    } finally {
      if (isCurrent()) pendingQueryRef.current = null;
    }
  };

  /** Load the candidate into the editor; the review modal opens before anything merges. */
  const apply = async (candidate: SteamMatchCandidate) => {
    if (applyingRef.current || !mountedRef.current || disabledRef.current || !itemsRef.current.includes(candidate)) return;
    applyingRef.current = true;
    try {
      await onApplyRef.current(candidate.steam_appid, candidate.cover_url);
    } finally {
      applyingRef.current = false;
    }
    // Return focus to the row only while it is still listed (no new search, still mounted).
    requestAnimationFrame(() => {
      if (!mountedRef.current || !itemsRef.current.includes(candidate)) return;
      resultsRootRef.current
        ?.querySelector<HTMLElement>(`[data-steam-match-appid="${candidate.steam_appid}"] .decky-metadata-editor__result`)
        ?.focus();
    });
  };

  return (
    <div className="DialogControlsSection DialogLabelledControlsSection DialogSettingsSection">
      <div className="SettingsDialogSubHeader">{t("matchPicker.search")}</div>
      <Field
        label={t("matchPicker.searchAriaLabel")}
        description={t("matchPicker.help")}
        childrenLayout="below"
        childrenContainerWidth="max"
        bottomSeparator="standard"
      >
        <div style={editorSearchRowStyle}>
          <div style={editorSearchInputStyle}>
            <TextField
              className={editorFocusTargetClassName}
              aria-label={t("matchPicker.searchAriaLabel")}
              value={query}
              disabled={disabled}
              onChange={(event) => changeQuery(event.target.value)}
              style={{ ...fieldStyle, width: "100%" }}
            />
          </div>
          <FocusableButton
            className={editorFocusTargetClassName}
            disabled={disabled || status === "loading" || !query.trim()}
            onClick={() => void search()}
            style={editorSearchButtonStyle}
          >
            {status === "loading" ? t("matchPicker.searching") : t("matchPicker.search")}
          </FocusableButton>
        </div>
      </Field>
      <div ref={resultsRootRef}>
        <Field
          focusable={false}
          description={
            <span aria-live="polite">
              {status === "idle" ? t("matchPicker.idle") : null}
              {status === "loading" ? t("matchPicker.searching") : null}
              {status === "empty" ? t("matchPicker.empty") : null}
              {status === "error" && searchError ? translateBackendError(searchError) : null}
            </span>
          }
          bottomSeparator="none"
        />
        {items.map((candidate) => (
          <div key={candidate.steam_appid} data-steam-match-appid={candidate.steam_appid}>
            <Field
              className={`decky-metadata-editor__result ${editorFocusTargetClassName}`}
              label={candidate.title}
              icon={candidate.cover_url ? <img src={candidate.cover_url} alt="" style={editorSteamMatchImageStyle} /> : undefined}
              focusable={true}
              highlightOnFocus={true}
              disabled={disabled}
              bottomSeparator="standard"
              onActivate={() => void apply(candidate)}
              onClick={() => void apply(candidate)}
            >
              <div style={compactTextStyle}>
                {candidate.steam_appid === matchedSteamAppId
                  ? t("matchPicker.appIdCurrent", { appId: candidate.steam_appid })
                  : t("matchPicker.appId", { appId: candidate.steam_appid })}
              </div>
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
};
