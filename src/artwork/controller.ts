import {
  clearLocalArtworkFile,
  fetchSteamArtworkAsset,
  getAllArtworkLocks,
  getArtworkSettings,
  getArtworkSummary,
  getGameArtworkState,
  setArtworkLocked,
  setArtworkSettings,
} from "../backend";
import { t, translateBackendError } from "../i18n";
import * as log from "../log";
import { pluginConflicts } from "../pluginConflicts";
import { metadataCache } from "../steam/core";
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
  FetchedArtworkAsset,
  GameArtworkState,
  GameOption,
  MetadataData,
} from "../types";

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
  getArtworkSummary: (games: GameOption[]) => Promise<ArtworkSummary>;
  getAllArtworkLocks: () => Promise<Record<string, boolean>>;
  setArtworkLocked: (appId: number, locked: boolean) => Promise<boolean>;
  getGameArtworkState: (appId: number, steamAppId: number | null) => Promise<GameArtworkState>;
  fetchSteamArtworkAsset: (
    appId: number,
    steamAppId: number,
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

const normalizedSteamAppId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id < 0x80000000 ? id : null;
};

export class ArtworkController {
  private snapshot: ArtworkControllerSnapshot;
  private readonly listeners = new Set<() => void>();
  private mounted = false;
  private unsubscribeConflicts: (() => void) | null = null;
  private settingsLoadPromise: Promise<ArtworkSettings> | null = null;
  private lastGames: GameOption[] = [];

  constructor(private readonly deps: ArtworkControllerDeps) {
    this.snapshot = {
      settings: structuredClone(DEFAULT_ARTWORK_SETTINGS),
      settingsLoaded: false,
      settingsError: "",
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
        .then((settings) => {
          this.publish({ settings, settingsLoaded: true, settingsError: "" });
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

  async setSettings(next: ArtworkSettings): Promise<boolean> {
    const previous = this.snapshot.settings;
    this.publish({ settings: next, settingsError: "" });
    try {
      const saved = await this.deps.setArtworkSettings(next);
      this.publish({ settings: saved, settingsLoaded: true, settingsError: "" });
      if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
      return true;
    } catch (error) {
      log.warn("artwork", "artwork settings save failed", error);
      this.publish({ settings: previous, settingsError: translateBackendError(error) });
      return false;
    }
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
    const asset = await this.deps.fetchSteamArtworkAsset(appId, steamAppId, slot);
    await this.deps.applySteamArtworkSlot(appId, slot, asset);
    this.bumpRevision();
    if (this.lastGames.length > 0) void this.refreshSummary(this.lastGames);
  }

  async clearSingleSlot(appId: number, slot: ArtworkSlot): Promise<void> {
    await this.deps.clearSteamArtworkSlot(appId, slot);
    await this.deps.clearLocalArtworkFile(appId, slot).catch(() => undefined);
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
        const asset = await this.deps.fetchSteamArtworkAsset(appId, steamAppId, slot);
        await this.deps.applySteamArtworkSlot(appId, slot, asset);
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
    const settings = await this.ensureSettingsLoaded();
    if (!settings.autoApply) return;
    if (this.snapshot.busy) return;
    try {
      const result = await this.applyForGame(appId, steamAppId, "policy");
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
      .map((game) => ({
        game,
        steamAppId: normalizedSteamAppId(cache[String(game.appid)]?.steam_appid),
      }))
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

    this.publish({
      busy: true,
      progress: {
        running: true,
        mode,
        completed: 0,
        total: targets.length,
        current: targets[0].game.name,
      },
    });

    let totalApplied = 0;
    let totalFailed = 0;
    let gamesUpdated = 0;
    try {
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
        const result = await this.applyForGame(game.appid, steamAppId, gameMode, {
          ignoreLock: true,
        });
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
  getArtworkSummary,
  getAllArtworkLocks,
  setArtworkLocked,
  getGameArtworkState,
  fetchSteamArtworkAsset,
  clearLocalArtworkFile,
  applySteamArtworkSlot,
  clearSteamArtworkSlot,
  getMetadataCache: () => metadataCache,
  isSteamGridDbActive: () => pluginConflicts.isPluginActive("SteamGridDB"),
  subscribePluginConflicts: (listener) => pluginConflicts.subscribe(listener),
  toastSuccess,
  toastError,
});
