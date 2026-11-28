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
import { useRef, useState } from "react";
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
import { artworkBrowserClass, mimeLabel } from "./artworkStyles";

export type ArtworkFilterModalProps = {
  appId: number;
  slot: ArtworkSlot;
  currentGame: SgdbGame | null;
  isOverride: boolean;
  initialQuery: string;
  initialFilter: SgdbSlotFilter;
  onApplyFilter: (filter: SgdbSlotFilter) => Promise<boolean>;
  onGameChanged: (game: SgdbGame | null, isOverride: boolean) => void;
  closeModal?: () => void;
};

const toggleArrayItem = (items: string[], value: string): string[] =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

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
  const searchSeqRef = useRef(0);
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
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setSearchResults(null);
    setSearchError("");
    try {
      const results = await sgdbSearchGames(trimmed);
      if (seq === searchSeqRef.current) setSearchResults(results);
    } catch (error) {
      if (seq === searchSeqRef.current) setSearchError(translateBackendError(error));
    } finally {
      if (seq === searchSeqRef.current) setSearching(false);
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
      if (await onApplyFilter(draft)) closeModal?.();
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

          {[
            {
              label: t("editor.artwork.filterDimensions"),
              visible: dimensionOptions.length > 0,
              options: dimensionOptions,
              selected: draft.dimensions,
              toggle: (value: string) =>
                setDraft((prev) => ({ ...prev, dimensions: toggleArrayItem(prev.dimensions, value) })),
            },
            {
              label: t("editor.artwork.filterStyles"),
              visible: styleOptions.length > 0,
              options: styleOptions,
              selected: draft.styles,
              format: (value: string) => value.replace("_", " "),
              toggle: (value: string) =>
                setDraft((prev) => ({ ...prev, styles: toggleArrayItem(prev.styles, value) })),
            },
            {
              label: t("editor.artwork.filterFormats"),
              visible: true,
              options: mimeOptions,
              selected: draft.mimes,
              format: mimeLabel,
              toggle: (value: string) =>
                setDraft((prev) => ({ ...prev, mimes: toggleArrayItem(prev.mimes, value) })),
            },
            {
              label: t("editor.artwork.filterTypes"),
              visible: true,
              options: ["static", "animated"],
              selected: draft.types,
              format: (value: string) => t(`editor.artwork.type.${value}`),
              toggle: (value: string) =>
                setDraft((prev) => ({ ...prev, types: toggleArrayItem(prev.types, value) })),
            },
          ].map(({ label, options, selected, format, toggle, visible }) => visible ? (
            <Field key={label} label={label} childrenLayout="below" childrenContainerWidth="max">
              <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__chip-row`}>
                {options.map((value) => {
                  const isSelected = selected.includes(value);
                  const onToggle = () => toggle(value);
                  return (
                    <Focusable
                      key={value}
                      className={`${artworkBrowserClass}__chip${isSelected ? " is-selected" : ""}`}
                      onActivate={onToggle}
                      onClick={onToggle}
                    >
                      {format ? format(value) : value}
                    </Focusable>
                  );
                })}
              </Focusable>
            </Field>
          ) : null)}

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
