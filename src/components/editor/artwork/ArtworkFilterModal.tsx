import {
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Focusable,
  ModalRoot,
  TextField,
  ToggleField,
} from "@decky/ui";
import { useState } from "react";
import {
  clearSgdbGameOverride,
  setSgdbGameOverride,
  sgdbSearchGames,
} from "../../../backend";
import {
  defaultSlotFilter,
  SGDB_DIMENSION_OPTIONS,
  SGDB_MIME_OPTIONS,
  SGDB_STYLE_OPTIONS,
} from "../../../artwork/controller";
import { translateBackendError, useT } from "../../../i18n";
import { toastError, toastSuccess } from "../../../toast";
import type { ArtworkSlot, SgdbGame, SgdbSlotFilter } from "../../../types";
import { artworkBrowserClass } from "./artworkStyles";

export type ArtworkFilterModalProps = {
  appId: number;
  slot: ArtworkSlot;
  currentGame: SgdbGame | null;
  isOverride: boolean;
  initialQuery: string;
  initialFilter: SgdbSlotFilter;
  onApplyFilter: (filter: SgdbSlotFilter) => Promise<void>;
  onGameChanged: (game: SgdbGame | null, isOverride: boolean) => void;
  closeModal?: () => void;
};

const toggleArrayItem = (items: string[], value: string): string[] =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const mimeLabel = (mime: string): string => {
  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/webp") return "WebP";
  if (mime === "image/vnd.microsoft.icon") return "ICO";
  return mime;
};

export function ArtworkFilterModal({
  appId,
  slot,
  currentGame,
  isOverride,
  initialQuery,
  initialFilter,
  onApplyFilter,
  onGameChanged,
  closeModal,
}: ArtworkFilterModalProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState(currentGame?.name || initialQuery);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SgdbGame[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [draft, setDraft] = useState<SgdbSlotFilter>(() => ({
    dimensions: [...initialFilter.dimensions],
    styles: [...initialFilter.styles],
    mimes: [...initialFilter.mimes],
    types: [...initialFilter.types],
    nsfw: initialFilter.nsfw,
    humor: initialFilter.humor,
    epilepsy: initialFilter.epilepsy,
  }));
  const [saving, setSaving] = useState(false);

  const dimensionOptions = SGDB_DIMENSION_OPTIONS[slot];
  const styleOptions = SGDB_STYLE_OPTIONS[slot];
  const mimeOptions = SGDB_MIME_OPTIONS[slot];

  const runSearch = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError("");
    try {
      const results = await sgdbSearchGames(trimmed);
      setSearchResults(results);
    } catch (error) {
      setSearchError(translateBackendError(error));
    } finally {
      setSearching(false);
    }
  };

  const selectGame = async (game: SgdbGame) => {
    setSaving(true);
    try {
      await setSgdbGameOverride(appId, game.id, game.name);
      onGameChanged({ ...game, source: "override" }, true);
      toastSuccess(
        t("artwork.toast.appliedTitle"),
        t("editor.artwork.gameChangedBody", { game: game.name }),
      );
      closeModal?.();
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      setSaving(false);
    }
  };

  const resetGameOverride = async () => {
    setSaving(true);
    try {
      await clearSgdbGameOverride(appId);
      onGameChanged(null, false);
      closeModal?.();
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      setSaving(false);
    }
  };

  const applyFilters = async () => {
    setSaving(true);
    try {
      await onApplyFilter(draft);
      closeModal?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalRoot onCancel={closeModal} onEscKeypress={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "75vh", overflowY: "auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
          {t("editor.artwork.filterModalTitle", { slot: t(`qam.artwork.slot.${slot}.label`) })}
        </div>

        <DialogControlsSection>
          <DialogControlsSectionHeader>{t("editor.artwork.changeGameHeading")}</DialogControlsSectionHeader>
          <Field
            label={t("editor.artwork.searchGameLabel")}
            description={
              currentGame
                ? t("editor.artwork.currentGameDesc", {
                    game: currentGame.name,
                    source: isOverride ? t("editor.artwork.sourceOverride") : t("editor.artwork.sourceAuto"),
                  })
                : t("editor.artwork.noGameMatched")
            }
            childrenLayout="below"
            childrenContainerWidth="max"
          >
            <Focusable
              flow-children="horizontal"
              style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}
            >
              <div style={{ flex: "1 1 auto" }}>
                <TextField
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <DialogButton
                className={`${artworkBrowserClass}__action-btn`}
                disabled={searching || !searchQuery.trim()}
                onClick={() => void runSearch()}
              >
                {searching ? t("editor.searching") : t("editor.search")}
              </DialogButton>
              {isOverride ? (
                <DialogButton
                  className={`${artworkBrowserClass}__action-btn`}
                  disabled={saving}
                  onClick={() => void resetGameOverride()}
                >
                  {t("editor.artwork.resetGameButton")}
                </DialogButton>
              ) : null}
            </Focusable>
          </Field>
          {searchError ? (
            <Field focusable={false} description={searchError} bottomSeparator="none" />
          ) : null}
          {searchResults !== null ? (
            searchResults.length === 0 ? (
              <Field focusable={false} description={t("editor.artwork.noSearchResults")} bottomSeparator="none" />
            ) : (
              searchResults.slice(0, 8).map((game) => (
                <Field
                  key={game.id}
                  label={game.name}
                  description={t("editor.artwork.sgdbIdLabel", { id: game.id })}
                  focusable={true}
                  highlightOnFocus={true}
                  onActivate={() => void selectGame(game)}
                  onClick={() => void selectGame(game)}
                />
              ))
            )
          ) : null}
        </DialogControlsSection>

        <DialogControlsSection>
          <DialogControlsSectionHeader>{t("editor.artwork.filtersHeading")}</DialogControlsSectionHeader>

          {dimensionOptions.length > 0 ? (
            <Field label={t("editor.artwork.filterDimensions")} childrenLayout="below" childrenContainerWidth="max">
              <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__chip-row`}>
                {dimensionOptions.map((dim) => {
                  const selected = draft.dimensions.includes(dim);
                  return (
                    <Focusable
                      key={dim}
                      className={`${artworkBrowserClass}__chip${selected ? " is-selected" : ""}`}
                      onActivate={() =>
                        setDraft((prev) => ({
                          ...prev,
                          dimensions: toggleArrayItem(prev.dimensions, dim),
                        }))
                      }
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          dimensions: toggleArrayItem(prev.dimensions, dim),
                        }))
                      }
                    >
                      {dim}
                    </Focusable>
                  );
                })}
              </Focusable>
            </Field>
          ) : null}

          {styleOptions.length > 0 ? (
            <Field label={t("editor.artwork.filterStyles")} childrenLayout="below" childrenContainerWidth="max">
              <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__chip-row`}>
                {styleOptions.map((style) => {
                  const selected = draft.styles.includes(style);
                  return (
                    <Focusable
                      key={style}
                      className={`${artworkBrowserClass}__chip${selected ? " is-selected" : ""}`}
                      onActivate={() =>
                        setDraft((prev) => ({
                          ...prev,
                          styles: toggleArrayItem(prev.styles, style),
                        }))
                      }
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          styles: toggleArrayItem(prev.styles, style),
                        }))
                      }
                    >
                      {style.replace("_", " ")}
                    </Focusable>
                  );
                })}
              </Focusable>
            </Field>
          ) : null}

          <Field label={t("editor.artwork.filterFormats")} childrenLayout="below" childrenContainerWidth="max">
            <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__chip-row`}>
              {mimeOptions.map((mime) => {
                const selected = draft.mimes.includes(mime);
                return (
                  <Focusable
                    key={mime}
                    className={`${artworkBrowserClass}__chip${selected ? " is-selected" : ""}`}
                    onActivate={() =>
                      setDraft((prev) => ({
                        ...prev,
                        mimes: toggleArrayItem(prev.mimes, mime),
                      }))
                    }
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        mimes: toggleArrayItem(prev.mimes, mime),
                      }))
                    }
                  >
                    {mimeLabel(mime)}
                  </Focusable>
                );
              })}
            </Focusable>
          </Field>

          <Field label={t("editor.artwork.filterTypes")} childrenLayout="below" childrenContainerWidth="max">
            <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__chip-row`}>
              {(["static", "animated"] as const).map((kind) => {
                const selected = draft.types.includes(kind);
                return (
                  <Focusable
                    key={kind}
                    className={`${artworkBrowserClass}__chip${selected ? " is-selected" : ""}`}
                    onActivate={() =>
                      setDraft((prev) => ({
                        ...prev,
                        types: toggleArrayItem(prev.types, kind),
                      }))
                    }
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        types: toggleArrayItem(prev.types, kind),
                      }))
                    }
                  >
                    {t(`editor.artwork.type.${kind}`)}
                  </Focusable>
                );
              })}
            </Focusable>
          </Field>

          <ToggleField
            label={t("editor.artwork.filterHumor")}
            checked={draft.humor}
            onChange={(humor) => setDraft((prev) => ({ ...prev, humor }))}
          />
          <ToggleField
            label={t("editor.artwork.filterNsfw")}
            checked={draft.nsfw}
            onChange={(nsfw) => setDraft((prev) => ({ ...prev, nsfw }))}
          />
          <ToggleField
            label={t("editor.artwork.filterEpilepsy")}
            checked={draft.epilepsy}
            onChange={(epilepsy) => setDraft((prev) => ({ ...prev, epilepsy }))}
          />
        </DialogControlsSection>

        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 4 }}
        >
          <DialogButton
            className={`${artworkBrowserClass}__action-btn`}
            disabled={saving}
            onClick={() => setDraft(defaultSlotFilter(slot))}
          >
            {t("editor.artwork.resetFilters")}
          </DialogButton>
          <div style={{ display: "flex", gap: 8 }}>
            <DialogButton
              className={`${artworkBrowserClass}__action-btn`}
              disabled={saving}
              onClick={closeModal}
            >
              {t("editor.artwork.cancelAction")}
            </DialogButton>
            <DialogButton
              className={`${artworkBrowserClass}__action-btn`}
              disabled={saving}
              onClick={() => void applyFilters()}
            >
              {t("editor.artwork.applyFilters")}
            </DialogButton>
          </div>
        </Focusable>
      </div>
    </ModalRoot>
  );
}
