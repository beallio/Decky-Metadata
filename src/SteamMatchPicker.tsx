import { PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { getSteamMatchPreview, searchSteamMatches } from "./backend";
import {
  editorFocusTargetClassName,
  editorSearchButtonStyle,
  editorSearchInputRowSpacingStyle,
  editorSearchResultsSpacingStyle,
  editorSearchRowStyle,
  editorSteamMatchCardStyle,
  editorSteamMatchImageStyle,
  editorSteamMatchPreviewStyle,
} from "./metadataEditorStyles";
import { t } from "./i18n";
import { compactTextStyle, fieldStyle, FocusableButton, rowStackStyle } from "./styles";
import type { SteamMatchCandidate, SteamMatchPreview } from "./types";

type SteamMatchPickerProps = {
  initialQuery: string;
  matchedSteamAppId: number | null;
  disabled: boolean;
  onApply: (steamAppId: number) => Promise<void>;
};

type SearchStatus = "idle" | "loading" | "results" | "empty" | "error";
const EMPTY_MATCHES: SteamMatchCandidate[] = [];

export const SteamMatchPicker = ({ initialQuery, matchedSteamAppId, disabled, onApply }: SteamMatchPickerProps) => {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<SteamMatchCandidate[]>(EMPTY_MATCHES);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SteamMatchCandidate | null>(null);
  const [preview, setPreview] = useState<SteamMatchPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const queryRef = useRef(initialQuery);
  const searchRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const lifetimeRef = useRef(0);
  const mountedRef = useRef(true);
  const itemsRef = useRef<SteamMatchCandidate[]>(EMPTY_MATCHES);
  const selectedRef = useRef<SteamMatchCandidate | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const resultsRootRef = useRef<HTMLDivElement>(null);
  const disabledRef = useRef(disabled);
  const onApplyRef = useRef(onApply);
  disabledRef.current = disabled;
  onApplyRef.current = onApply;
  // A row can be selected again; identity alone does not retire its old button.
  const confirmationRequest = previewRequestRef.current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifetimeRef.current += 1;
    };
  }, []);

  const clearSelection = () => {
    previewRequestRef.current += 1;
    selectedRef.current = null;
    setSelected(null);
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
  };

  const cancelSelection = () => {
    const appId = selectedRef.current?.steam_appid;
    clearSelection();
    const request = previewRequestRef.current;
    requestAnimationFrame(() => {
      if (!mountedRef.current || previewRequestRef.current !== request || appId === undefined) return;
      resultsRootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-steam-match-appid="${appId}"] button`)
        ?.focus();
    });
  };

  const changeQuery = (value: string) => {
    queryRef.current = value;
    searchRequestRef.current += 1;
    pendingQueryRef.current = null;
    setQuery(value);
    itemsRef.current = EMPTY_MATCHES;
    setItems(EMPTY_MATCHES);
    setStatus("idle");
    setSearchError(null);
    clearSelection();
  };

  const search = async () => {
    const requestedQuery = queryRef.current.trim();
    if (!mountedRef.current || disabled || !requestedQuery || pendingQueryRef.current === requestedQuery) return;
    const request = ++searchRequestRef.current;
    const lifetime = lifetimeRef.current;
    pendingQueryRef.current = requestedQuery;
    clearSelection();
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
      } else {
        itemsRef.current = response.items;
        setItems(response.items);
        setStatus(response.items.length ? "results" : "empty");
      }
    } catch {
      if (!isCurrent()) return;
      setSearchError("Steam search is unavailable. Try again.");
      setStatus("error");
    } finally {
      if (isCurrent()) pendingQueryRef.current = null;
    }
  };

  const select = async (candidate: SteamMatchCandidate) => {
    if (!mountedRef.current || disabled || !itemsRef.current.includes(candidate)) return;
    if (selectedRef.current === candidate && (previewLoading || preview)) return;
    const request = ++previewRequestRef.current;
    const lifetime = lifetimeRef.current;
    selectedRef.current = candidate;
    setSelected(candidate);
    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(null);
    const isCurrent = () => lifetimeRef.current === lifetime && previewRequestRef.current === request;
    try {
      const response = await getSteamMatchPreview(candidate.steam_appid);
      if (!isCurrent()) return;
      setPreview(response.preview);
      setPreviewError(response.error);
    } catch {
      if (!isCurrent()) return;
      setPreviewError(t("steamMatch.detailsUnavailable"));
    } finally {
      if (isCurrent()) setPreviewLoading(false);
    }
  };

  const apply = async () => {
    if (
      !mountedRef.current || disabledRef.current || previewLoading ||
      previewRequestRef.current !== confirmationRequest ||
      !selected || selectedRef.current !== selected
    ) return;
    await onApplyRef.current(selected.steam_appid);
  };

  return (
    <PanelSection title={t("steamMatch.title")}>
      <PanelSectionRow>
        <div style={compactTextStyle}>
          {t("steamMatch.help")}
        </div>
        {matchedSteamAppId ? <div style={compactTextStyle}>{t("steamMatch.currentAppId", { appId: matchedSteamAppId })}</div> : null}
        <div style={{ ...editorSearchRowStyle, ...editorSearchInputRowSpacingStyle }}>
          <TextField
            className={editorFocusTargetClassName}
            aria-label={t("steamMatch.ariaLabel")}
            value={query}
            disabled={disabled}
            onChange={(event) => changeQuery(event.target.value)}
            style={fieldStyle}
          />
          <FocusableButton
            className={`DialogButton ${editorFocusTargetClassName}`}
            disabled={disabled || status === "loading" || !query.trim()}
            onClick={() => void search()}
            style={editorSearchButtonStyle}
          >
            {status === "loading" ? t("steamMatch.searching") : t("steamMatch.search")}
          </FocusableButton>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div ref={resultsRootRef} style={{ ...rowStackStyle, ...editorSearchResultsSpacingStyle }}>
          <div aria-live="polite" style={compactTextStyle}>
            {status === "idle" ? t("steamMatch.idle") : null}
            {status === "loading" ? t("steamMatch.searching") : null}
            {status === "empty" ? t("steamMatch.empty") : null}
            {status === "error" ? searchError : null}
          </div>
          {items.map((candidate) => (
            <div key={candidate.steam_appid} data-steam-match-appid={candidate.steam_appid} style={rowStackStyle}>
              <FocusableButton
                className={`DialogButton ${editorFocusTargetClassName} decky-metadata-editor__result`}
                aria-pressed={selected?.steam_appid === candidate.steam_appid}
                disabled={disabled}
                onClick={() => void select(candidate)}
                style={editorSteamMatchCardStyle}
              >
                {candidate.cover_url ? <img src={candidate.cover_url} alt="" style={editorSteamMatchImageStyle} /> : null}
                <div style={{ minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                  <b>{candidate.title}</b>
                  <div style={compactTextStyle}>
                    {t("steamMatch.row.appId", { appId: candidate.steam_appid })}
                    {candidate.steam_appid === matchedSteamAppId ? t("steamMatch.row.current") : null}
                    {candidate.steam_appid === selected?.steam_appid ? t("steamMatch.row.selected") : null}
                  </div>
                </div>
              </FocusableButton>
              {selected?.steam_appid === candidate.steam_appid ? (
                <div style={editorSteamMatchPreviewStyle}>
                  {previewLoading ? <div aria-live="polite" style={compactTextStyle}>{t("steamMatch.loading")}</div> : null}
                  {previewError ? <div role="status" style={compactTextStyle}>{previewError}</div> : null}
                  {preview ? (
                    <>
                      {!selected.cover_url && preview.cover_url ? <img src={preview.cover_url} alt={t("steamMatch.artworkAlt", { title: preview.title })} style={editorSteamMatchImageStyle} /> : null}
                      <div style={compactTextStyle}>{preview.developers.length
                        ? t("steamMatch.developer", { names: preview.developers.join(", ") })
                        : t("steamMatch.developerUnavailable")}</div>
                      <div style={compactTextStyle}>{preview.release_date_label
                        ? t("steamMatch.release", { date: preview.release_date_label })
                        : t("steamMatch.releaseUnavailable")}</div>
                      {preview.app_type && preview.app_type !== "game" ? <div style={compactTextStyle}>{t("steamMatch.appType", { type: preview.app_type })}</div> : null}
                    </>
                  ) : null}
                  <div style={compactTextStyle}>{t("steamMatch.applyNote")}</div>
                  <FocusableButton
                    className={`DialogButton ${editorFocusTargetClassName}`}
                    disabled={disabled || previewLoading}
                    onClick={() => void apply()}
                  >
                    {t("steamMatch.apply")}
                  </FocusableButton>
                  <FocusableButton
                    className={`DialogButton ${editorFocusTargetClassName}`}
                    disabled={disabled}
                    onClick={cancelSelection}
                  >
                    {t("steamMatch.cancel")}
                  </FocusableButton>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
};
