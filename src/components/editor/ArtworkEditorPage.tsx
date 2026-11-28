import {
  DialogButton,
  Field,
  Focusable,
  GamepadButton,
  showModal,
} from "@decky/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARTWORK_TAB_ORDER,
  artworkController,
  defaultSlotFilter,
} from "../../artwork/controller";
import {
  getGameArtworkState,
  sgdbListAssets,
  sgdbResolveGame,
} from "../../backend";
import { translateBackendError, useT } from "../../i18n";
import { toastError, toastSuccess } from "../../toast";
import { nativeFocusedElement, takeNativeFocus } from "../../steam/nativeFocus";
import { colors } from "../../tokens";
import type {
  ArtworkSettings,
  ArtworkSlot,
  ArtworkTabId,
  GameArtworkState,
  SgdbAsset,
  SgdbGame,
  SgdbSlotFilter,
} from "../../types";
import { ArtworkDetailsModal } from "./artwork/ArtworkDetailsModal";
import { ArtworkFilterModal } from "./artwork/ArtworkFilterModal";
import { ArtworkManageTab } from "./artwork/ArtworkManageTab";
import {
  artworkBrowserClass,
  artworkBrowserCss,
  SLOT_ASPECT_RATIO,
  SLOT_GRID_MIN_WIDTH,
} from "./artwork/artworkStyles";

export type ArtworkEditorPageProps = {
  appId: number;
  gameName: string;
  isSteamGame?: boolean;
  savedSteamAppId: number | null;
  unsavedSteamAppId: number | null;
  entryBusy: boolean;
  onGoToSteamMatch: () => void;
  onSaveMatch: () => void;
  onOpenArtworkSettings?: () => void;
};

export function computeVisibleArtworkTabs(settings: ArtworkSettings): ArtworkTabId[] {
  const hidden = new Set<ArtworkTabId>(settings.hiddenTabs ?? []);
  const ordered = (settings.tabOrder?.length ? settings.tabOrder : ARTWORK_TAB_ORDER).filter(
    (tab) => tab === "manage" || !hidden.has(tab),
  );
  if (!ordered.includes("manage")) ordered.push("manage");
  return ordered;
}

export function resolveInitialArtworkTab(settings: ArtworkSettings): ArtworkTabId {
  const visible = computeVisibleArtworkTabs(settings);
  if (settings.defaultTab && visible.includes(settings.defaultTab)) {
    return settings.defaultTab;
  }
  return visible[0] ?? "manage";
}

export function countActiveSlotFilters(slot: ArtworkSlot, filter: SgdbSlotFilter): number {
  const defaults = defaultSlotFilter(slot);
  let diffs = 0;
  if (filter.dimensions.join(",") !== defaults.dimensions.join(",")) diffs += 1;
  if (filter.styles.length > 0) diffs += 1;
  if (filter.mimes.length > 0) diffs += 1;
  if (filter.types.join(",") !== defaults.types.join(",")) diffs += 1;
  if (filter.nsfw !== defaults.nsfw) diffs += 1;
  if (filter.humor !== defaults.humor) diffs += 1;
  if (filter.epilepsy !== defaults.epilepsy) diffs += 1;
  return diffs;
}

const tabLabelKey = (tab: ArtworkTabId): string =>
  tab === "manage" ? "editor.artwork.tab.manage" : `qam.artwork.slot.${tab}.label`;

const slotLabelKey = (slot: ArtworkSlot): string => `qam.artwork.slot.${slot}.label`;

export function ArtworkEditorPage({
  appId,
  gameName,
  isSteamGame = false,
  savedSteamAppId,
  unsavedSteamAppId,
  entryBusy,
  onGoToSteamMatch,
  onSaveMatch,
  onOpenArtworkSettings,
}: ArtworkEditorPageProps) {
  const t = useT();
  const [snapshot, setSnapshot] = useState(() => artworkController.getSnapshot());
  const visibleTabs = useMemo(
    () => computeVisibleArtworkTabs(snapshot.settings),
    [snapshot.settings],
  );
  const [activeTab, setActiveTab] = useState<ArtworkTabId>(() =>
    resolveInitialArtworkTab(artworkController.getSnapshot().settings),
  );
  const [artworkState, setArtworkState] = useState<GameArtworkState | null>(null);
  const [sgdbGame, setSgdbGame] = useState<SgdbGame | null>(null);
  const [sgdbIsOverride, setSgdbIsOverride] = useState(false);
  const [resolvingGame, setResolvingGame] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const [assets, setAssets] = useState<SgdbAsset[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [gameReloadTick, setGameReloadTick] = useState(0);
  const requestSeqRef = useRef(0);
  const browserRef = useRef<HTMLDivElement | null>(null);
  // Entry focus starts on the active slot tab; move it into the artwork once the first cards render.
  const cardFocusPendingRef = useRef(true);
  const stateSeqRef = useRef(0);

  useEffect(() => {
    const unsub = artworkController.subscribe(() => setSnapshot(artworkController.getSnapshot()));
    void artworkController.ensureSettingsLoaded();
    return unsub;
  }, []);

  // Keep active tab valid when user changes tab visibility in settings.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(resolveInitialArtworkTab(snapshot.settings));
    }
  }, [activeTab, snapshot.settings, visibleTabs]);

  // Reset to user's configured default tab when switching games.
  useEffect(() => {
    setActiveTab(resolveInitialArtworkTab(artworkController.getSnapshot().settings));
    cardFocusPendingRef.current = true;
    setSgdbGame(null);
    setSgdbIsOverride(false);
    setAssets([]);
    setPage(0);
    setHasMore(false);
    setAssetError("");
    setMissingKey(false);
    setOfficialOnly(false);
    setArtworkState(null);
  }, [appId]);

  const loadArtworkState = useCallback(async () => {
    // The page stays mounted across games; only the newest request may publish its result.
    const seq = ++stateSeqRef.current;
    try {
      const next = await getGameArtworkState(appId, savedSteamAppId);
      if (seq === stateSeqRef.current) setArtworkState(next);
    } catch {
      // Keep previous state on transient failure.
    }
  }, [appId, savedSteamAppId]);

  useEffect(() => {
    void loadArtworkState();
  }, [loadArtworkState, snapshot.revision]);

  // Resolve SteamGridDB game (persisted override -> Steam AppID -> name search).
  useEffect(() => {
    let cancelled = false;
    setResolvingGame(true);
    setMissingKey(false);
    setAssetError("");
    void sgdbResolveGame(appId, savedSteamAppId, gameName)
      .then((res) => {
        if (cancelled) return;
        setSgdbGame(res.game);
        setSgdbIsOverride(res.override);
      })
      .catch((error) => {
        if (cancelled) return;
        const raw = error instanceof Error ? error.message : String(error ?? "");
        if (raw.includes("sgdb_missing_api_key")) {
          setMissingKey(true);
          setSgdbGame(null);
          setSgdbIsOverride(false);
        } else {
          setAssetError(translateBackendError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setResolvingGame(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, savedSteamAppId, gameName, snapshot.settings.sgdbApiKey, gameReloadTick]);

  const activeSlot: ArtworkSlot | null = activeTab === "manage" ? null : activeTab;
  const activeFilter: SgdbSlotFilter | null = activeSlot
    ? snapshot.settings.filters[activeSlot] ?? defaultSlotFilter(activeSlot)
    : null;

  const fetchAssetsPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!activeSlot || !activeFilter || !sgdbGame || officialOnly) return;
      const seq = ++requestSeqRef.current;
      setLoadingAssets(true);
      setAssetError("");
      try {
        const result = await sgdbListAssets(sgdbGame.id, activeSlot, activeFilter, targetPage);
        if (seq !== requestSeqRef.current) return;
        setAssets((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setHasMore(result.has_more);
      } catch (error) {
        if (seq !== requestSeqRef.current) return;
        const raw = error instanceof Error ? error.message : String(error ?? "");
        if (raw.includes("sgdb_missing_api_key")) {
          setMissingKey(true);
        } else {
          setAssetError(translateBackendError(error));
        }
        if (!append) {
          setAssets([]);
          setHasMore(false);
        }
      } finally {
        if (seq === requestSeqRef.current) setLoadingAssets(false);
      }
    },
    [activeSlot, activeFilter, sgdbGame, officialOnly],
  );

  useEffect(() => {
    if (!activeSlot || !sgdbGame || missingKey || officialOnly) {
      // Drop any in-flight page so it cannot land on this game or this mode.
      requestSeqRef.current += 1;
      setLoadingAssets(false);
      setAssets([]);
      setHasMore(false);
      return;
    }
    void fetchAssetsPage(0, false);
  }, [activeSlot, sgdbGame, activeFilter, missingKey, officialOnly, fetchAssetsPage]);

  const cycleTab = useCallback(
    (delta: number) => {
      if (visibleTabs.length <= 1) return;
      cardFocusPendingRef.current = false;
      setActiveTab((current) => {
        const idx = visibleTabs.indexOf(current);
        const nextIdx = (idx + delta + visibleTabs.length) % visibleTabs.length;
        return visibleTabs[nextIdx];
      });
    },
    [visibleTabs],
  );

  // A manual tab change cancels the entry jump into the first artwork card.
  const selectTab = (tab: ArtworkTabId) => {
    if (tab !== activeTab) cardFocusPendingRef.current = false;
    setActiveTab(tab);
  };

  const busy = entryBusy || snapshot.busy || actionBusy;
  const hasUnsavedSteamMatch = !isSteamGame && unsavedSteamAppId !== savedSteamAppId;

  const applySgdb = async (slot: ArtworkSlot, asset: SgdbAsset) => {
    if (busy) return;
    setActionBusy(true);
    try {
      await artworkController.applySgdbAsset(appId, slot, asset.url);
      toastSuccess(
        t("artwork.toast.appliedTitle"),
        t("editor.artwork.appliedSlotBody", { slot: t(slotLabelKey(slot)), game: gameName }),
      );
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const applyOfficial = async (slot: ArtworkSlot) => {
    if (busy || savedSteamAppId === null) return;
    setActionBusy(true);
    try {
      await artworkController.applySingleSlot(appId, savedSteamAppId, slot);
      toastSuccess(
        t("artwork.toast.appliedTitle"),
        t("editor.artwork.appliedSlotBody", { slot: t(slotLabelKey(slot)), game: gameName }),
      );
    } catch (error) {
      toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const openFilterModal = () => {
    if (!activeSlot || !activeFilter) return;
    showModal(
      <ArtworkFilterModal
        appId={appId}
        slot={activeSlot}
        currentGame={sgdbGame}
        isOverride={sgdbIsOverride}
        initialQuery={gameName}
        initialFilter={activeFilter}
        onApplyFilter={async (nextFilter) => {
          const saved = await artworkController.updateSlotFilter(activeSlot, nextFilter);
          if (!saved) toastError(t("artwork.toast.failedTitle"), artworkController.getSnapshot().settingsError);
          return saved;
        }}
        onGameChanged={(game, isOverride) => {
          if (game) {
            setSgdbGame(game);
            setSgdbIsOverride(isOverride);
          } else {
            setSgdbIsOverride(false);
            setGameReloadTick((tick) => tick + 1);
          }
        }}
      />,
    );
  };

  const openDetailsModal = (slot: ArtworkSlot, asset: SgdbAsset) => {
    showModal(
      <ArtworkDetailsModal
        slot={slot}
        asset={asset}
        applying={busy}
        onApply={() => void applySgdb(slot, asset)}
      />,
    );
  };

  const handleBrowserButtonDown = (evt: { detail?: { button?: number } }) => {
    const button = evt?.detail?.button;
    if (button === GamepadButton.BUMPER_LEFT) {
      cycleTab(-1);
    } else if (button === GamepadButton.BUMPER_RIGHT) {
      cycleTab(1);
    }
  };

  const officialSlotState = activeSlot ? artworkState?.slots[activeSlot] ?? null : null;
  const showOfficialCard =
    activeSlot !== null &&
    savedSteamAppId !== null &&
    Boolean(officialSlotState?.available && officialSlotState?.steam_url);
  const activeFilterCount =
    activeSlot && activeFilter ? countActiveSlotFilters(activeSlot, activeFilter) : 0;
  const showAssetCards = !officialOnly && !missingKey && assets.length > 0;
  // The editor's entry focus targets this marker: the first artwork card, or the first toolbar button until cards exist.
  const cardsFocusTarget = showOfficialCard || showAssetCards;

  useEffect(() => {
    if (!cardFocusPendingRef.current) return;
    if (activeSlot === null) {
      cardFocusPendingRef.current = false;
      return;
    }
    const browser = browserRef.current;
    if (!cardsFocusTarget || !browser) return;
    cardFocusPendingRef.current = false;
    // Steam's gamepad focus, else DOM focus in the editor's own window (plugin code runs in another window).
    const focused = nativeFocusedElement() ?? browser.ownerDocument.activeElement;
    // Never take focus the user already moved off the toolbar where entry focus starts.
    if (focused && focused !== browser.ownerDocument.body && !focused.closest(`.${artworkBrowserClass}__toolbar`)) return;
    takeNativeFocus(browser.querySelector(`.${artworkBrowserClass}__grid [data-artwork-initial-focus]`));
  }, [activeSlot, cardsFocusTarget]);

  return (
    <Focusable
      ref={browserRef}
      className={artworkBrowserClass}
      onButtonDown={handleBrowserButtonDown as never}
      onSecondaryButton={activeSlot ? openFilterModal : undefined}
      onSecondaryActionDescription={activeSlot ? t("editor.artwork.filterActionHint") : undefined}
    >
      <style>{artworkBrowserCss}</style>

      {/* Slot tabs switch only with L1/R1 (or touch), like Steam's library tabs, so they are not focus targets. */}
      <div className={`${artworkBrowserClass}__tabs`}>
        <span className={`${artworkBrowserClass}__bumper`} aria-hidden="true">
          {t("editor.artwork.bumperLeft")}
        </span>
        <div className={`${artworkBrowserClass}__tab-list`}>
          {visibleTabs.map((tab) => (
            <div
              key={tab}
              data-artwork-tab={tab}
              className={`${artworkBrowserClass}__tab${tab === activeTab ? " is-active" : ""}`}
              onClick={() => selectTab(tab)}
            >
              {t(tabLabelKey(tab))}
            </div>
          ))}
        </div>
        <span className={`${artworkBrowserClass}__bumper`} aria-hidden="true">
          {t("editor.artwork.bumperRight")}
        </span>
      </div>

      {activeSlot !== null ? (
        <>
          {hasUnsavedSteamMatch ? (
            <div className={`${artworkBrowserClass}__notice`}>
              <div style={{ fontSize: 13, color: colors.text }}>
                {t("editor.artwork.pendingMatchDescription")}
              </div>
              <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                <DialogButton
                  className={`${artworkBrowserClass}__action-btn`}
                  disabled={busy}
                  onClick={onSaveMatch}
                >
                  {t("editor.artwork.saveMatchAction")}
                </DialogButton>
              </Focusable>
            </div>
          ) : null}

          {/* Toolbar: active SGDB game + Change Game/Filter (Y) + Official toggle */}
          <div className={`${artworkBrowserClass}__toolbar`}>
            <div className={`${artworkBrowserClass}__game-meta`}>
              <span className={`${artworkBrowserClass}__game-title`}>
                {resolvingGame
                  ? t("editor.artwork.resolvingGame")
                  : sgdbGame
                    ? sgdbGame.name
                    : gameName}
              </span>
              {sgdbIsOverride ? (
                <span className={`${artworkBrowserClass}__pill`}>
                  {t("editor.artwork.sourceOverride")}
                </span>
              ) : null}
              {activeFilterCount > 0 ? (
                <span className={`${artworkBrowserClass}__pill`}>
                  {t("editor.artwork.filtersActiveCount", { count: activeFilterCount })}
                </span>
              ) : null}
            </div>
            <Focusable flow-children="horizontal" className={`${artworkBrowserClass}__toolbar-actions`}>
              {!missingKey ? (
                <DialogButton
                  className={`${artworkBrowserClass}__action-btn`}
                  data-artwork-initial-focus={cardsFocusTarget ? undefined : ""}
                  disabled={busy}
                  onClick={openFilterModal}
                >
                  {t("editor.artwork.filterButton")}
                </DialogButton>
              ) : null}
              {savedSteamAppId !== null ? (
                <DialogButton
                  className={`${artworkBrowserClass}__action-btn`}
                  data-artwork-initial-focus={!cardsFocusTarget && missingKey ? "" : undefined}
                  disabled={busy}
                  onClick={() => setOfficialOnly((prev) => !prev)}
                >
                  {officialOnly
                    ? t("editor.artwork.showAllSources")
                    : t("editor.artwork.officialOnlyButton")}
                </DialogButton>
              ) : null}
            </Focusable>
          </div>

          {/* Missing API key notice (Official Steam card still renders below when available) */}
          {missingKey ? (
            <div className={`${artworkBrowserClass}__notice`}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
                {t("editor.artwork.missingKeyTitle")}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary }}>
                {t("editor.artwork.missingKeyDescription")}
              </div>
              {onOpenArtworkSettings ? (
                <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                  <DialogButton
                    className={`${artworkBrowserClass}__action-btn`}
                    onClick={onOpenArtworkSettings}
                  >
                    {t("editor.artwork.openSettingsAction")}
                  </DialogButton>
                </Focusable>
              ) : null}
            </div>
          ) : null}

          {assetError ? (
            <Field
              focusable={false}
              description={<span style={{ color: colors.warning }}>{assetError}</span>}
              bottomSeparator="none"
            />
          ) : null}

          {/* Responsive aspect-ratio artwork grid */}
          {showOfficialCard || assets.length > 0 ? (
            <Focusable
              className={`${artworkBrowserClass}__grid`}
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${SLOT_GRID_MIN_WIDTH[activeSlot]}px, 1fr))`,
              }}
            >
              {showOfficialCard && officialSlotState?.steam_url ? (
                <Focusable
                  key="official-steam"
                  data-artwork-initial-focus=""
                  className={`${artworkBrowserClass}__card`}
                  onActivate={() => void applyOfficial(activeSlot)}
                  onClick={() => void applyOfficial(activeSlot)}
                  onOKActionDescription={t("editor.artwork.applyAction")}
                >
                  <div
                    className={`${artworkBrowserClass}__card-media${
                      activeSlot === "logo" || activeSlot === "icon" ? " is-transparent-bg" : ""
                    }`}
                    style={{ aspectRatio: SLOT_ASPECT_RATIO[activeSlot] }}
                  >
                    <img
                      className={`${artworkBrowserClass}__card-img`}
                      src={officialSlotState.steam_url}
                      alt=""
                      style={{
                        objectFit:
                          activeSlot === "logo" || activeSlot === "icon" ? "contain" : "cover",
                      }}
                    />
                    <div className={`${artworkBrowserClass}__badges`}>
                      <span
                        className={`${artworkBrowserClass}__badge ${artworkBrowserClass}__badge--official`}
                      >
                        {t("editor.artwork.badgeOfficial")}
                      </span>
                    </div>
                  </div>
                  <div className={`${artworkBrowserClass}__card-meta`}>
                    <span className={`${artworkBrowserClass}__card-author`}>
                      {t("editor.artwork.officialSourceLabel")}
                    </span>
                  </div>
                </Focusable>
              ) : null}

              {!officialOnly && !missingKey
                ? assets.map((asset, idx) => (
                    <Focusable
                      key={asset.id}
                      data-artwork-initial-focus={idx === 0 && !showOfficialCard ? "" : undefined}
                      className={`${artworkBrowserClass}__card`}
                      onActivate={() => void applySgdb(activeSlot, asset)}
                      onClick={() => void applySgdb(activeSlot, asset)}
                      onOKActionDescription={t("editor.artwork.applyAction")}
                      onSecondaryButton={openFilterModal}
                      onSecondaryActionDescription={t("editor.artwork.filterActionHint")}
                      onOptionsButton={() => openDetailsModal(activeSlot, asset)}
                      onOptionsActionDescription={t("editor.artwork.detailsActionHint")}
                    >
                      <div
                        className={`${artworkBrowserClass}__card-media${
                          activeSlot === "logo" || activeSlot === "icon" ? " is-transparent-bg" : ""
                        }`}
                        style={{ aspectRatio: SLOT_ASPECT_RATIO[activeSlot] }}
                      >
                        <img
                          className={`${artworkBrowserClass}__card-img`}
                          src={asset.thumb}
                          alt=""
                          loading="lazy"
                          style={{
                            objectFit:
                              activeSlot === "logo" || activeSlot === "icon" ? "contain" : "cover",
                          }}
                        />
                        <div className={`${artworkBrowserClass}__badges`}>
                          {asset.animated ? (
                            <span
                              className={`${artworkBrowserClass}__badge ${artworkBrowserClass}__badge--animated`}
                            >
                              {t("editor.artwork.badgeAnimated")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className={`${artworkBrowserClass}__card-meta`}>
                        <span className={`${artworkBrowserClass}__card-author`}>
                          {asset.author.name || t("editor.artwork.unknownAuthor")}
                        </span>
                        {asset.width > 0 && asset.height > 0 ? (
                          <span>{`${asset.width}x${asset.height}`}</span>
                        ) : null}
                      </div>
                    </Focusable>
                  ))
                : null}
            </Focusable>
          ) : !resolvingGame && !loadingAssets && !missingKey ? (
            <div className={`${artworkBrowserClass}__notice`}>
              <div style={{ fontSize: 13, color: colors.textSecondary }}>
                {!sgdbGame
                  ? t("editor.artwork.noGameMatched")
                  : t("editor.artwork.noAssetsForFilter")}
              </div>
              <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                <DialogButton
                  className={`${artworkBrowserClass}__action-btn`}
                  onClick={openFilterModal}
                >
                  {t("editor.artwork.filterButton")}
                </DialogButton>
              </Focusable>
            </div>
          ) : null}

          {loadingAssets ? (
            <Field focusable={false} description={t("editor.artwork.loading")} bottomSeparator="none" />
          ) : null}

          {!officialOnly && !missingKey && hasMore && !loadingAssets ? (
            <Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center" }}>
              <DialogButton
                className={`${artworkBrowserClass}__action-btn`}
                disabled={busy}
                onClick={() => void fetchAssetsPage(page + 1, true)}
              >
                {t("editor.artwork.loadMore")}
              </DialogButton>
            </Focusable>
          ) : null}
        </>
      ) : (
        <ArtworkManageTab
          appId={appId}
          gameName={gameName}
          isSteamGame={isSteamGame}
          savedSteamAppId={savedSteamAppId}
          unsavedSteamAppId={unsavedSteamAppId}
          state={artworkState}
          busy={busy}
          onBusyChange={setActionBusy}
          onRefreshState={loadArtworkState}
          onSelectSlotTab={(slot) => setActiveTab(slot)}
          onGoToSteamMatch={onGoToSteamMatch}
          onSaveMatch={onSaveMatch}
        />
      )}
    </Focusable>
  );
}
