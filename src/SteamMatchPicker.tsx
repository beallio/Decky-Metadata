import { Field, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { getSteamMatchPreview, searchSteamMatches } from "./backend";
import {
  editorFocusTargetClassName,
  editorSearchButtonStyle,
  editorSearchInputStyle,
  editorSearchRowStyle,
  editorSteamMatchImageStyle,
} from "./metadataEditorStyles";
import { compactTextStyle, fieldStyle, FocusableButton, rowStackStyle } from "./styles";
import { translateBackendError, useT } from "./i18n";
import type { SteamMatchCandidate, SteamMatchPreview } from "./types";

type SteamMatchPickerProps = {
  initialQuery: string;
  matchedSteamAppId: number | null;
  disabled: boolean;
  onApply: (steamAppId: number) => Promise<void>;
};

type SearchStatus = "idle" | "loading" | "results" | "empty" | "error";
const EMPTY_MATCHES: SteamMatchCandidate[] = [];

// The ID line carries up to two independent markers; each combination is one sentence.
const candidateTitleLine = (
  candidate: SteamMatchCandidate,
  matchedSteamAppId: number | null,
  selected: SteamMatchCandidate | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const isCurrentMatch = candidate.steam_appid === matchedSteamAppId;
  const isSelected = candidate.steam_appid === selected?.steam_appid;
  if (isCurrentMatch && isSelected) {
    return t("matchPicker.appIdCurrentSelected", { appId: candidate.steam_appid });
  }
  if (isCurrentMatch) {
    return t("matchPicker.appIdCurrent", { appId: candidate.steam_appid });
  }
  if (isSelected) {
    return t("matchPicker.appIdSelected", { appId: candidate.steam_appid });
  }
  return t("matchPicker.appId", { appId: candidate.steam_appid });
};

export const SteamMatchPicker = ({ initialQuery, matchedSteamAppId, disabled, onApply }: SteamMatchPickerProps) => {
  const t = useT();
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
        ?.querySelector<HTMLElement>(`[data-steam-match-appid="${appId}"] .decky-metadata-editor__result`)
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
      setSearchError("steam_search_unavailable");
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
      setPreviewError("steam_preview_unavailable");
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
              onActivate={() => void select(candidate)}
              onClick={() => void select(candidate)}
            >
              <div style={compactTextStyle}>
                {candidateTitleLine(candidate, matchedSteamAppId, selected, t)}
              </div>
            </Field>
            {selected?.steam_appid === candidate.steam_appid ? (
              <div style={rowStackStyle}>
                {previewLoading ? (
                  <Field
                    focusable={false}
                    description={<span aria-live="polite">{t("matchPicker.loadingDetails")}</span>}
                    bottomSeparator="none"
                  />
                ) : null}
                {previewError ? (
                  <Field
                    focusable={false}
                    description={<span role="status">{translateBackendError(previewError)}</span>}
                    bottomSeparator="none"
                  />
                ) : null}
                {preview ? (
                  <>
                    {!selected.cover_url && preview.cover_url ? (
                      <div>
                        <img
                          src={preview.cover_url}
                          alt={t("matchPicker.artworkAlt", { title: preview.title })}
                          style={{ ...editorSteamMatchImageStyle, objectFit: "contain" }}
                        />
                      </div>
                    ) : null}
                    {preview.developers.length ? (
                      <Field label={t("editor.field.developers")} focusable={false} bottomSeparator="standard">
                        {preview.developers.join(", ")}
                      </Field>
                    ) : (
                      <Field focusable={false} description={t("matchPicker.developerUnavailable")} bottomSeparator="none" />
                    )}
                    {preview.release_date_label ? (
                      <Field label={t("editor.field.releaseDate")} focusable={false} bottomSeparator="standard">
                        {preview.release_date_label}
                      </Field>
                    ) : (
                      <Field focusable={false} description={t("matchPicker.releaseUnavailable")} bottomSeparator="none" />
                    )}
                    {preview.app_type && preview.app_type !== "game" ? (
                      <Field
                        focusable={false}
                        description={t("matchPicker.steamType", { type: preview.app_type })}
                        bottomSeparator="none"
                      />
                    ) : null}
                  </>
                ) : null}
                <Field focusable={false} description={t("matchPicker.applyHelp")} bottomSeparator="none" />
                <div style={{ display: "flex", gap: 8 }}>
                  <FocusableButton
                    className={editorFocusTargetClassName}
                    disabled={disabled || previewLoading}
                    onClick={() => void apply()}
                    style={{ flex: 1 }}
                  >
                    {t("matchPicker.apply")}
                  </FocusableButton>
                  <FocusableButton
                    className={editorFocusTargetClassName}
                    disabled={disabled}
                    onClick={cancelSelection}
                    style={{ flex: 1 }}
                  >
                    {t("matchPicker.cancel")}
                  </FocusableButton>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
