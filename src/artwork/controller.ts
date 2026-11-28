import {
  clearLocalArtworkFile,
  fetchSteamArtworkAsset,
  getAllArtworkLocks,
  getArtworkSettings,
  getArtworkSummary,
  getGameArtworkState,
  getSgdbKeyStatus,
  getTransparentArtworkAsset,
  readLocalArtworkFile,
  saveLocalArtworkIcon,
  setArtworkLocked,
  setArtworkSettings,
  sgdbFetchAsset,
} from "../backend";
import { t, translateBackendError } from "../i18n";
import * as log from "../log";
import { pluginConflicts } from "../pluginConflicts";
import { metadataCache } from "../steam/core";
import { matchedSteamAppId } from "../steam/detailsReassert";
import {
  ARTWORK_SLOT_ORDER,
  applySteamArtworkSlot,
  clearSteamArtworkSlot,
} from "../steam/customArtwork";
import { toastError, toastSuccess } from "../toast";
import type {
  ArtworkSettings,
  ArtworkSlot,
  ArtworkSummary,
  ArtworkTabId,
  FetchedArtworkAsset,
  GameArtworkState,
  GameOption,
  MetadataData,
  SgdbFiltersBySlot,
  SgdbKeyStatus,
  SgdbSlotFilter,
} from "../types";

export const ARTWORK_TAB_ORDER: readonly ArtworkTabId[] = [
  "cover",
  "wide",
  "hero",
  "logo",
  "icon",
  "manage",
];

export const SGDB_DIMENSION_OPTIONS: Record<ArtworkSlot, readonly string[]> = {
  cover: ["600x900", "342x482", "660x930", "512x512", "1024x1024"],
  wide: ["460x215", "920x430", "512x512", "1024x1024"],
  hero: ["1920x620", "3840x1240", "1600x650"],
  logo: [],
  icon: ["16x16", "24x24", "32x32", "48x48", "64x64", "96x96", "128x128", "192x192", "256x256", "512x512", "1024x1024"],
};

export const SGDB_STYLE_OPTIONS: Record<ArtworkSlot, readonly string[]> = {
  cover: ["alternate", "blurred", "white_logo", "material", "no_logo"],
  wide: ["alternate", "blurred", "white_logo", "material", "no_logo"],
  hero: ["alternate", "blurred", "material"],
  logo: ["official", "white", "black", "custom"],
  icon: ["official", "custom"],
};

export const SGDB_MIME_OPTIONS: Record<ArtworkSlot, readonly string[]> = {
  cover: ["image/png", "image/jpeg", "image/webp"],
  wide: ["image/png", "image/jpeg", "image/webp"],
  hero: ["image/png", "image/jpeg", "image/webp"],
  logo: ["image/png", "image/webp"],
  icon: ["image/png", "image/vnd.microsoft.icon"],
};

export const defaultSlotFilter = (slot: ArtworkSlot): SgdbSlotFilter => ({
  dimensions:
    slot === "cover"
      ? ["600x900", "342x482", "660x930"]
      : slot === "wide"
        ? ["460x215", "920x430"]
        : slot === "hero"
          ? ["1920x620", "3840x1240", "1600x650"]
          : [],
  styles: [],
  mimes: [],
  types: ["static"],
  nsfw: false,
  humor: true,
  epilepsy: false,
});

export const defaultArtworkFilters = (): SgdbFiltersBySlot => ({
  cover: defaultSlotFilter("cover"),
  wide: defaultSlotFilter("wide"),
  hero: defaultSlotFilter("hero"),
  logo: defaultSlotFilter("logo"),
  icon: defaultSlotFilter("icon"),
});

export const DEFAULT_ARTWORK_SETTINGS: ArtworkSettings = {
  autoApply: false,
  preserveExisting: true,
  slots: {
    cover: true,
    wide: true,
    hero: true,
    logo: true,
    icon: true,
  },
  sgdbApiKey: "",
  defaultTab: "cover",
  tabOrder: [...ARTWORK_TAB_ORDER],
  hiddenTabs: [],
  filters: defaultArtworkFilters(),
};

export function normalizeArtworkSettings(raw?: Partial<ArtworkSettings> | null): ArtworkSettings {
  const defaults = structuredClone(DEFAULT_ARTWORK_SETTINGS);
  if (!raw || typeof raw !== "object") return defaults;
  const tabOrder: ArtworkTabId[] = [];
  if (Array.isArray(raw.tabOrder)) {
    for (const tab of raw.tabOrder) {
      if (ARTWORK_TAB_ORDER.includes(tab) && !tabOrder.includes(tab)) {
        tabOrder.push(tab);
      }
    }
  }
  for (const tab of ARTWORK_TAB_ORDER) {
    if (!tabOrder.includes(tab)) tabOrder.push(tab);
  }
  const hiddenTabs: ArtworkSlot[] = Array.isArray(raw.hiddenTabs)
    ? raw.hiddenTabs.filter(
        (tab, idx, arr): tab is ArtworkSlot =>
          ARTWORK_SLOT_ORDER.includes(tab) && arr.indexOf(tab) === idx,
      )
    : [];
  const filters = defaultArtworkFilters();
  if (raw.filters && typeof raw.filters === "object") {
    for (const slot of ARTWORK_SLOT_ORDER) {
      const saved = raw.filters[slot];
      if (!saved || typeof saved !== "object") continue;
      filters[slot] = {
        dimensions: Array.isArray(saved.dimensions)
          ? saved.dimensions.filter((d) => SGDB_DIMENSION_OPTIONS[slot].includes(d))
          : filters[slot].dimensions,
        styles: Array.isArray(saved.styles)
          ? saved.styles.filter((s) => SGDB_STYLE_OPTIONS[slot].includes(s))
          : filters[slot].styles,
        mimes: Array.isArray(saved.mimes)
          ? saved.mimes.filter((m) => SGDB_MIME_OPTIONS[slot].includes(m))
          : filters[slot].mimes,
        types: Array.isArray(saved.types)
          ? saved.types.filter((item) => item === "static" || item === "animated")
          : filters[slot].types,
        nsfw: typeof saved.nsfw === "boolean" ? saved.nsfw : filters[slot].nsfw,
        humor: typeof saved.humor === "boolean" ? saved.humor : filters[slot].humor,
        epilepsy: typeof saved.epilepsy === "boolean" ? saved.epilepsy : filters[slot].epilepsy,
      };
    }
  }
  return {
    autoApply: typeof raw.autoApply === "boolean" ? raw.autoApply : defaults.autoApply,
    preserveExisting:
      typeof raw.preserveExisting === "boolean" ? raw.preserveExisting : defaults.preserveExisting,
    slots: {
      cover: typeof raw.slots?.cover === "boolean" ? raw.slots.cover : defaults.slots.cover,
      wide: typeof raw.slots?.wide === "boolean" ? raw.slots.wide : defaults.slots.wide,
      hero: typeof raw.slots?.hero === "boolean" ? raw.slots.hero : defaults.slots.hero,
      logo: typeof raw.slots?.logo === "boolean" ? raw.slots.logo : defaults.slots.logo,
      icon: typeof raw.slots?.icon === "boolean" ? raw.slots.icon : defaults.slots.icon,
    },
    sgdbApiKey: typeof raw.sgdbApiKey === "string" ? raw.sgdbApiKey.trim() : "",
    defaultTab:
      raw.defaultTab && ARTWORK_TAB_ORDER.includes(raw.defaultTab) ? raw.defaultTab : "cover",
    tabOrder,
    hiddenTabs,
    filters,
  };
}

export const EMPTY_SGDB_KEY_STATUS: SgdbKeyStatus = {
  hasUserKey: false,
  hasBuiltInKey: false,
  configured: false,
};

export const EMPTY_ARTWORK_SUMMARY: ArtworkSummary = {
  matched: 0,
  complete: 0,
  missing_games: 0,
  missing_slots: 0,
  existing_enabled_slots: 0,
  locked_games: 0,
};

export type ArtworkBulkMode = "fill-missing" | "replace-all" | "auto";

export type ArtworkProgress = {
  running: boolean;
  mode: ArtworkBulkMode;
  completed: number;
  total: number;
  current: string;
};

export type ArtworkControllerSnapshot = {
  settings: ArtworkSettings;
  settingsLoaded: boolean;
  settingsError: string;
  sgdbKeyStatus: SgdbKeyStatus;
  summary: ArtworkSummary;
  summaryLoaded: boolean;
  busy: boolean;
  progress: ArtworkProgress | null;
  sgdbInstalled: boolean;
  revision: number;
};

export type GameApplyResult = {
  applied: number;
  failed: number;
  skippedLocked: boolean;
};

export type ArtworkControllerDeps = {
  getArtworkSettings: () => Promise<ArtworkSettings>;
  setArtworkSettings: (settings: ArtworkSettings) => Promise<ArtworkSettings>;
  getSgdbKeyStatus?: () => Promise<SgdbKeyStatus>;
  getArtworkSummary: (games: GameOption[]) => Promise<ArtworkSummary>;
  getAllArtworkLocks: () => Promise<Record<string, boolean>>;
  setArtworkLocked: (appId: number, locked: boolean) => Promise<boolean>;
  getGameArtworkState: (appId: number, steamAppId: number | null) => Promise<GameArtworkState>;
  fetchSteamArtworkAsset: (
    appId: number,
    steamAppId: number,
    slot: ArtworkSlot,
  ) => Promise<FetchedArtworkAsset>;
  saveLocalArtworkIcon: (appId: number, ext: string, base64: string) => Promise<string | null>;
  sgdbFetchAsset?: (
    appId: number,
    slot: ArtworkSlot,
    url: string,
  ) => Promise<FetchedArtworkAsset>;
  readLocalArtworkFile?: (
    appId: number,
    slot: ArtworkSlot,
    filePath: string,
  ) => Promise<FetchedArtworkAsset>;
  getTransparentArtworkAsset?: (
    appId: number,
    slot: ArtworkSlot,
  ) => Promise<FetchedArtworkAsset>;
  clearLocalArtworkFile: (appId: number, slot: ArtworkSlot) => Promise<{ ok: boolean; removed: boolean }>;
  applySteamArtworkSlot: (
    appId: number,
    slot: ArtworkSlot,
    asset: Pick<FetchedArtworkAsset, "base64" | "ext" | "file_path">,
  ) => Promise<void>;
  clearSteamArtworkSlot: (appId: number, slot: ArtworkSlot) => Promise<void>;
  getMetadataCache: () => Record<string, MetadataData>;
  isSteamGridDbActive: () => boolean;
  subscribePluginConflicts: (listener: () => void) => () => void;
  toastSuccess: (title: string, body: string) => void;
  toastError: (title: string, body: string) => void;
};

export class ArtworkController {
  private snapshot: ArtworkControllerSnapshot;
  private readonly slotGenerations = new Map<number, Partial<Record<ArtworkSlot, number>>>();
  private readonly slotCommitTails = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private mounted = false;
  private unsubscribeConflicts: (() => void) | null = null;
  private settingsLoadPromise: Promise<ArtworkSettings> | null = null;
  private lastGames: GameOption[] = [];
  /** Last settings the backend confirmed; a failed save shows these again. */
  private confirmed: ArtworkSettings | undefined;
  /** Latest requested settings waiting for the in-flight save, plus their callers. */
  private queued: { settings: ArtworkSettings; settles: Array<(saved: boolean) => void> } | undefined;
  private saving = false;
  constructor(private readonly deps: ArtworkControllerDeps) {
    this.snapshot = {
      settings: structuredClone(DEFAULT_ARTWORK_SETTINGS),
      settingsLoaded: false,
      settingsError: "",
      sgdbKeyStatus: { ...EMPTY_SGDB_KEY_STATUS },
      summary: { ...EMPTY_ARTWORK_SUMMARY },
      summaryLoaded: false,
      busy: false,
      progress: null,
      sgdbInstalled: deps.isSteamGridDbActive(),
      revision: 0,
    };
  }

  getSnapshot(): ArtworkControllerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.snapshot.settingsLoaded && !this.settingsLoadPromise) {
      void this.ensureSettingsLoaded();
    }
    return () => this.listeners.delete(listener);
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.unsubscribeConflicts = this.deps.subscribePluginConflicts(() => {
      const sgdbInstalled = this.deps.isSteamGridDbActive();
      if (sgdbInstalled !== this.snapshot.sgdbInstalled) {
        this.publish({ sgdbInstalled });
      }
    });
    this.publish({ sgdbInstalled: this.deps.isSteamGridDbActive() });
    void this.ensureSettingsLoaded();
  }

  stop(): void {
    this.mounted = false;
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = null;
  }

  async ensureSettingsLoaded(): Promise<ArtworkSettings> {
    if (this.snapshot.settingsLoaded) return this.snapshot.settings;
    if (!this.settingsLoadPromise) {
      this.settingsLoadPromise = this.deps
        .getArtworkSettings()
        .then((raw) => {
          const settings = normalizeArtworkSettings(raw);
          this.publish({ settings, settingsLoaded: true, settingsError: "" });
          void this.refreshKeyStatus();
          return settings;
        })
        .catch((error) => {
          log.warn("artwork", "artwork settings load failed", error);
          this.publish({ settingsError: translateBackendError(error) });
          return this.snapshot.settings;
        })
        .finally(() => {
          this.settingsLoadPromise = null;
        });
    }
    return this.settingsLoadPromise;
  }

  async refreshKeyStatus(): Promise<SgdbKeyStatus> {
    if (!this.deps.getSgdbKeyStatus) return this.snapshot.sgdbKeyStatus;
    try {
      const sgdbKeyStatus = await this.deps.getSgdbKeyStatus();
      this.publish({ sgdbKeyStatus });
      return sgdbKeyStatus;
    } catch (error) {
      log.warn("artwork", "sgdb key status load failed", error);
      return this.snapshot.sgdbKeyStatus;
    }
  }

  private slotGeneration(appId: number, slot: ArtworkSlot): number {
    return this.slotGenerations.get(appId)?.[slot] ?? 0;
  }

  private captureSlotGenerations(appId: number): Record<ArtworkSlot, number> {
    const generations = {} as Record<ArtworkSlot, number>;
    for (const slot of ARTWORK_SLOT_ORDER) generations[slot] = this.slotGeneration(appId, slot);
    return generations;
  }

  private invalidateAutomaticSlot(appId: number, slot: ArtworkSlot): void {
    const generations = this.slotGenerations.get(appId) ?? {};
    generations[slot] = (generations[slot] ?? 0) + 1;
    this.slotGenerations.set(appId, generations);
  }

  async setSettings(next: ArtworkSettings): Promise<boolean> {
    if (!this.snapshot.settingsLoaded) return false;
    // While idle, the snapshot is what the backend last confirmed.
    if (!this.saving) this.confirmed = this.snapshot.settings;
    const requested = normalizeArtworkSettings(next);
    this.publish({ settings: requested, settingsError: "" });
    return new Promise<boolean>((resolve) => {
      if (this.queued) {
        // Latest wins; earlier callers settle with this newer value's save.
        this.queued.settings = requested;
        this.queued.settles.push(resolve);
      } else {
        this.queued = { settings: requested, settles: [resolve] };
      }
      if (this.saving) return;
      this.saving = true;
      void this.drainSaves();
    });
  }

  /** Saves one request at a time, so an older response can never overwrite a newer change. */
  private async drainSaves(): Promise<void> {
    while (this.queued) {
      const { settings, settles } = this.queued;
      this.queued = undefined;
      const previousKey = this.confirmed?.sgdbApiKey;
      let saved = false;
      try {
        const confirmed = normalizeArtworkSettings(await this.deps.setArtworkSettings(settings));
        this.confirmed = confirmed;
        saved = true;
        if (confirmed.sgdbApiKey !== previousKey) void this.refreshKeyStatus();
        // A newer request is queued; showing this value first would flash it.
        if (!this.queued) {
          this.publish({ settings: confirmed, settingsLoaded: true, settingsError: "" });
          if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
        }
      } catch (error) {
        log.warn("artwork", "artwork settings save failed", error);
        // A newer queued change carries the full settings and supersedes this one; save it instead of rolling back.
        if (!this.queued) {
          this.publish({ settings: this.confirmed ?? this.snapshot.settings, settingsError: translateBackendError(error) });
        }
      }
      for (const settle of settles) settle(saved);
    }
    this.saving = false;
  }

  async updateSlotFilter(slot: ArtworkSlot, filter: SgdbSlotFilter): Promise<boolean> {
    const current = await this.ensureSettingsLoaded();
    if (!this.snapshot.settingsLoaded) return false;
    return this.setSettings({
      ...current,
      filters: {
        ...current.filters,
        [slot]: filter,
      },
    });
  }

  async refreshSummary(games: GameOption[]): Promise<ArtworkSummary> {
    this.lastGames = games;
    try {
      const summary = await this.deps.getArtworkSummary(games);
      this.publish({ summary, summaryLoaded: true });
      return summary;
    } catch (error) {
      log.warn("artwork", "artwork summary load failed", error);
      return this.snapshot.summary;
    }
  }

  async setGameLocked(appId: number, locked: boolean): Promise<boolean> {
    const saved = await this.deps.setArtworkLocked(appId, locked);
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
    return saved;
  }

  async applySingleSlot(appId: number, steamAppId: number, slot: ArtworkSlot): Promise<void> {
    this.invalidateAutomaticSlot(appId, slot);
    const generation = this.slotGeneration(appId, slot);
    const asset = await this.deps.fetchSteamArtworkAsset(appId, steamAppId, slot);
    const didApply = await this.queueSlotCommit(appId, slot, async () => {
      if (this.slotGeneration(appId, slot) !== generation) return false;
      await this.applyFetchedSteamAsset(appId, slot, asset);
      return true;
    });
    if (!didApply) return;
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
  }

  private async applyFetchedSteamAsset(
    appId: number,
    slot: ArtworkSlot,
    asset: FetchedArtworkAsset,
  ): Promise<void> {
    const filePath =
      slot === "icon" && appId >= 0x80000000 && !asset.file_path
        ? await this.deps.saveLocalArtworkIcon(appId, asset.ext, asset.base64)
        : asset.file_path;
    await this.deps.applySteamArtworkSlot(appId, slot, { ...asset, file_path: filePath });
  }

  private queueSlotCommit<T>(
    appId: number,
    slot: ArtworkSlot,
    commit: () => Promise<T>,
  ): Promise<T> {
    const key = `${appId}:${slot}`;
    const previous = this.slotCommitTails.get(key) ?? Promise.resolve();
    const result = previous.then(commit);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.slotCommitTails.set(key, tail);
    void tail.then(() => {
      if (this.slotCommitTails.get(key) === tail) this.slotCommitTails.delete(key);
    });
    return result;
  }

  async applySgdbAsset(appId: number, slot: ArtworkSlot, url: string): Promise<void> {
    this.invalidateAutomaticSlot(appId, slot);
    const generation = this.slotGeneration(appId, slot);
    if (!this.deps.sgdbFetchAsset) throw new Error("artwork_download_failed");
    const asset = await this.deps.sgdbFetchAsset(appId, slot, url);
    const didApply = await this.queueSlotCommit(appId, slot, async () => {
      if (this.slotGeneration(appId, slot) !== generation) return false;
      await this.deps.applySteamArtworkSlot(appId, slot, asset);
      return true;
    });
    if (!didApply) return;
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
  }

  async applyLocalFile(appId: number, slot: ArtworkSlot, filePath: string): Promise<void> {
    this.invalidateAutomaticSlot(appId, slot);
    const generation = this.slotGeneration(appId, slot);
    if (!this.deps.readLocalArtworkFile) throw new Error("artwork_file_unreadable");
    const asset = await this.deps.readLocalArtworkFile(appId, slot, filePath);
    const didApply = await this.queueSlotCommit(appId, slot, async () => {
      if (this.slotGeneration(appId, slot) !== generation) return false;
      await this.deps.applySteamArtworkSlot(appId, slot, asset);
      return true;
    });
    if (!didApply) return;
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
  }

  async applyTransparentSlot(appId: number, slot: ArtworkSlot): Promise<void> {
    this.invalidateAutomaticSlot(appId, slot);
    const generation = this.slotGeneration(appId, slot);
    if (!this.deps.getTransparentArtworkAsset) throw new Error("artwork_apply_failed");
    const asset = await this.deps.getTransparentArtworkAsset(appId, slot);
    const didApply = await this.queueSlotCommit(appId, slot, async () => {
      if (this.slotGeneration(appId, slot) !== generation) return false;
      await this.deps.applySteamArtworkSlot(appId, slot, asset);
      return true;
    });
    if (!didApply) return;
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
  }

  async clearSingleSlot(appId: number, slot: ArtworkSlot): Promise<void> {
    this.invalidateAutomaticSlot(appId, slot);
    await this.queueSlotCommit(appId, slot, async () => {
      await this.deps.clearSteamArtworkSlot(appId, slot);
      await this.deps.clearLocalArtworkFile(appId, slot);
    });
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
  }

  /**
   * Apply enabled Steam artwork slots for one matched game.
   * `mode = "policy"` uses `settings.preserveExisting`; `"fill-missing"` and `"replace-all"` override it.
   */
  async applyForGame(
    appId: number,
    steamAppId: number,
    mode: "fill-missing" | "replace-all" | "policy",
    options?: { ignoreLock?: boolean },
  ): Promise<GameApplyResult> {
    return this.applyForGameWithGenerations(
      appId,
      steamAppId,
      mode,
      options,
      this.captureSlotGenerations(appId),
    );
  }

  private async applyForGameWithGenerations(
    appId: number,
    steamAppId: number,
    mode: "fill-missing" | "replace-all" | "policy",
    options: { ignoreLock?: boolean } | undefined,
    slotGenerations: Record<ArtworkSlot, number>,
  ): Promise<GameApplyResult> {
    const settings = await this.ensureSettingsLoaded();
    const state = await this.deps.getGameArtworkState(appId, steamAppId);
    if (!options?.ignoreLock && state.locked) {
      return { applied: 0, failed: 0, skippedLocked: true };
    }
    const preserveExisting =
      mode === "fill-missing" || (mode === "policy" && settings.preserveExisting);
    let applied = 0;
    let failed = 0;
    for (const slot of ARTWORK_SLOT_ORDER) {
      if (!settings.slots[slot]) continue;
      const slotState = state.slots[slot];
      if (!slotState?.available) continue;
      if (preserveExisting && slotState.present) continue;
      try {
        if (this.slotGeneration(appId, slot) !== slotGenerations[slot]) continue;
        const asset = await this.deps.fetchSteamArtworkAsset(appId, steamAppId, slot);
        if (this.slotGeneration(appId, slot) !== slotGenerations[slot]) continue;
        const didApply = await this.queueSlotCommit(appId, slot, async () => {
          if (this.slotGeneration(appId, slot) !== slotGenerations[slot]) return false;
          await this.applyFetchedSteamAsset(appId, slot, asset);
          return true;
        });
        if (!didApply) continue;
        applied += 1;
      } catch (error) {
        failed += 1;
        log.warn("artwork", `failed applying ${slot} for ${appId}`, error);
      }
    }
    if (applied > 0) {
      this.bumpRevision();
      if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
    }
    return { applied, failed, skippedLocked: false };
  }

  async autoApplyForMatchedGame(appId: number, steamAppId: number, gameName: string): Promise<void> {
    const slotGenerations = this.captureSlotGenerations(appId);
    const settings = await this.ensureSettingsLoaded();
    if (!settings.autoApply) return;
    if (this.snapshot.busy) return;
    try {
      const result = await this.applyForGameWithGenerations(
        appId,
        steamAppId,
        "policy",
        undefined,
        slotGenerations,
      );
      if (result.applied > 0) {
        this.deps.toastSuccess(
          t("artwork.toast.appliedTitle"),
          t("artwork.toast.appliedGameBody", { count: result.applied, game: gameName }),
        );
      }
    } catch (error) {
      log.warn("artwork", "auto-apply after steam match failed", error);
    }
  }

  async runBulk(games: GameOption[], mode: ArtworkBulkMode): Promise<void> {
    if (this.snapshot.busy) return;
    // Claim the run before the first await so overlapping calls cannot both start.
    this.publish({ busy: true });
    try {
      const settings = await this.ensureSettingsLoaded();
      if (mode === "auto" && !settings.autoApply) return;
      const anySlotEnabled = ARTWORK_SLOT_ORDER.some((slot) => settings.slots[slot]);
      if (!anySlotEnabled) return;

      const cache = this.deps.getMetadataCache();
      let locks: Record<string, boolean> = {};
      try {
        locks = await this.deps.getAllArtworkLocks();
      } catch (error) {
        log.warn("artwork", "artwork locks load failed", error);
      }

      const targets = games
        .map((game) => ({ game, steamAppId: matchedSteamAppId(cache[String(game.appid)]) }))
        .filter(
          (entry): entry is { game: GameOption; steamAppId: number } =>
            entry.steamAppId !== null && locks[String(entry.game.appid)] !== true,
        );

      if (targets.length === 0) {
        if (mode !== "auto") {
          this.deps.toastSuccess(t("artwork.toast.upToDateTitle"), t("artwork.toast.upToDateBody"));
        }
        return;
      }

      let totalApplied = 0;
      let totalFailed = 0;
      let gamesUpdated = 0;
      const gameMode = mode === "auto" ? "policy" : mode;
      for (let index = 0; index < targets.length; index += 1) {
        const { game, steamAppId } = targets[index];
        this.publish({
          progress: {
            running: true,
            mode,
            completed: index,
            total: targets.length,
            current: game.name,
          },
        });
        // applyForGame re-checks the per-game lock, which also covers a failed lock-list load.
        const result = await this.applyForGame(game.appid, steamAppId, gameMode);
        totalApplied += result.applied;
        totalFailed += result.failed;
        if (result.applied > 0) gamesUpdated += 1;
      }
      await this.refreshSummary(games);
      if (totalApplied > 0) {
        this.deps.toastSuccess(
          t("artwork.toast.appliedTitle"),
          totalFailed > 0
            ? t("artwork.toast.bulkPartialBody", {
                slots: totalApplied,
                games: gamesUpdated,
                failed: totalFailed,
              })
            : t("artwork.toast.bulkCompleteBody", {
                slots: totalApplied,
                games: gamesUpdated,
              }),
        );
      } else if (totalFailed > 0 && mode !== "auto") {
        this.deps.toastError(
          t("artwork.toast.failedTitle"),
          t("artwork.toast.bulkFailedBody", { failed: totalFailed }),
        );
      } else if (mode !== "auto") {
        this.deps.toastSuccess(t("artwork.toast.upToDateTitle"), t("artwork.toast.upToDateBody"));
      }
    } catch (error) {
      if (mode !== "auto") {
        this.deps.toastError(t("artwork.toast.failedTitle"), translateBackendError(error));
      } else {
        log.warn("artwork", "auto bulk artwork failed", error);
      }
    } finally {
      this.publish({ busy: false, progress: null });
    }
  }

  private bumpRevision(): void {
    this.publish({ revision: this.snapshot.revision + 1 });
  }

  private publish(update: Partial<ArtworkControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }
}

export const artworkController = new ArtworkController({
  getArtworkSettings,
  setArtworkSettings,
  getSgdbKeyStatus,
  getArtworkSummary,
  getAllArtworkLocks,
  setArtworkLocked,
  getGameArtworkState,
  fetchSteamArtworkAsset,
  saveLocalArtworkIcon,
  sgdbFetchAsset,
  readLocalArtworkFile,
  getTransparentArtworkAsset,
  clearLocalArtworkFile,
  applySteamArtworkSlot,
  clearSteamArtworkSlot,
  getMetadataCache: () => metadataCache,
  isSteamGridDbActive: () => pluginConflicts.isPluginActive("SteamGridDB"),
  subscribePluginConflicts: (listener) => pluginConflicts.subscribe(listener),
  toastSuccess,
  toastError,
});
