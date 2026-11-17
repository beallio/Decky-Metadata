import { getProtonDbBadgeSettings, setProtonDbBadgeSettings, type ProviderCacheSnapshot } from "../backend";
import { t, translateBackendError } from "../i18n";
import { loadProviderCache } from "../providerCache";
import type { ProtonDbBadgeSettings } from "../types";
import { pluginConflicts, type FeatureConflict, type PluginConflictSource } from "../pluginConflicts";
import { seedProtonDbAppIdResolutions, setResolvedNameListener } from "./identity";
import { ProtonDbCacheWriter } from "./persist";
import { protonDbRatingCache, type ProtonDbRating, type ProtonDbRatingCache } from "./ratings";

export type ProtonDbBadgeSnapshot = Readonly<{
  settings: ProtonDbBadgeSettings;
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
  conflict: FeatureConflict;
  effectiveEnabled: boolean;
}>;

export type ProtonDbBadgeSettingsStore = {
  get: () => Promise<ProtonDbBadgeSettings>;
  set: (settings: ProtonDbBadgeSettings) => Promise<ProtonDbBadgeSettings>;
};

export const DEFAULT_PROTON_DB_BADGE_SETTINGS: ProtonDbBadgeSettings = Object.freeze({
  enabled: false,
  home: true,
  library: true,
  gameView: true,
  store: true,
  focusOnly: false,
  coverPosition: "bottom-left",
});

const backendSettingsStore: ProtonDbBadgeSettingsStore = {
  get: getProtonDbBadgeSettings,
  set: setProtonDbBadgeSettings,
};

const copySettings = (settings: ProtonDbBadgeSettings): ProtonDbBadgeSettings =>
  Object.freeze({
    enabled: settings.enabled,
    home: settings.home,
    library: settings.library,
    gameView: settings.gameView,
    store: settings.store,
    focusOnly: settings.focusOnly,
    coverPosition: settings.coverPosition,
  });

const errorText = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? translateBackendError(error) : fallback;

export class ProtonDbBadgeController {
  private readonly listeners = new Set<() => void>();
  private lifecycle = 0;
  private mounted = false;
  private unsubscribeConflicts: (() => void) | undefined;
  private snapshot: ProtonDbBadgeSnapshot;
  /** Last settings the backend confirmed; a failed save shows these again. */
  private confirmed: ProtonDbBadgeSettings | undefined;
  /** Latest requested settings waiting for the in-flight save, plus their callers. */
  private queued: { settings: ProtonDbBadgeSettings; settles: Array<(saved: boolean) => void> } | undefined;
  private saving = false;

  constructor(
    private readonly settingsStore: ProtonDbBadgeSettingsStore = backendSettingsStore,
    private readonly ratings: ProtonDbRatingCache = protonDbRatingCache,
    private readonly conflicts: PluginConflictSource = pluginConflicts,
    private readonly loadCache: () => Promise<ProviderCacheSnapshot> = loadProviderCache,
    private readonly writer: ProtonDbCacheWriter = new ProtonDbCacheWriter(),
  ) {
    this.snapshot = Object.freeze({
      settings: copySettings(DEFAULT_PROTON_DB_BADGE_SETTINGS),
      settingsLoaded: false,
      busy: false,
      settingsError: "",
      conflict: conflicts.getConflict("protondb"),
      effectiveEnabled: false,
    });
  }

  getSnapshot(): ProtonDbBadgeSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    const lifecycle = ++this.lifecycle;
    this.ratings.mount();
    this.ratings.setResultListener((id, tier, updatedAt) => this.writer.rating(id, tier, updatedAt));
    setResolvedNameListener((shortcutId, name, steamId) => this.writer.name(shortcutId, name, steamId));
    void this.loadCache().then(
      (cache) => {
        if (!this.isCurrent(lifecycle)) return;
        const { ratings, name_ids: names } = cache.protondb;
        this.ratings.seed(Object.entries(ratings).map(([id, entry]) => [Number(id), entry.tier, entry.updated_at] as const));
        seedProtonDbAppIdResolutions(Object.entries(names).map(([id, entry]) => [Number(id), entry.name, entry.steam_appid] as const));
      },
      () => undefined, // Without the saved cache, ratings are fetched as before.
    );
    this.unsubscribeConflicts = this.conflicts.subscribe(() => {
      this.publish({ conflict: this.conflicts.getConflict("protondb") });
    });
    this.publish({
      busy: true, settingsLoaded: false, settingsError: "",
      conflict: this.conflicts.getConflict("protondb"),
    });

    void this.settingsStore.get().then(
      (settings) => {
        if (!this.isCurrent(lifecycle)) return;
        const saved = copySettings(settings);
        this.confirmed = saved;
        this.publish({ settings: saved, settingsLoaded: true, busy: false, settingsError: "" });
      },
      (error: unknown) => {
        if (!this.isCurrent(lifecycle)) return;
        this.publish({
          settingsLoaded: false,
          busy: false,
          settingsError: errorText(error, t("protondb.settingsLoadError")),
        });
      },
    );
  }

  stop(): void {
    this.mounted = false;
    this.lifecycle += 1;
    this.queued?.settles.forEach((settle) => settle(false));
    this.queued = undefined;
    this.saving = false;
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = undefined;
    this.ratings.setResultListener(undefined);
    setResolvedNameListener(undefined);
    this.writer.flush();
    this.ratings.stop();
    this.publish({
      settingsLoaded: false,
      busy: false,
      settingsError: "",
    });
    this.listeners.clear();
  }

  async setSettings(settings: ProtonDbBadgeSettings): Promise<boolean> {
    if (!this.mounted || !this.snapshot.settingsLoaded) return false;
    const requested = copySettings(settings);
    if (requested.enabled && !this.snapshot.settings.enabled && this.snapshot.conflict.pluginName) return false;
    // Publish optimistically: the section builds its next change from the snapshot,
    // and controls must not dim while a save is in flight.
    this.publish({ settings: requested, busy: true, settingsError: "" });
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

  /** Saves one request at a time so a toggle pressed during a save is not lost. */
  private async drainSaves(): Promise<void> {
    const lifecycle = this.lifecycle;
    while (this.queued && this.isCurrent(lifecycle)) {
      const { settings, settles } = this.queued;
      this.queued = undefined;
      let saved = false;
      try {
        const confirmed = copySettings(await this.settingsStore.set(settings));
        if (this.isCurrent(lifecycle)) {
          this.confirmed = confirmed;
          saved = true;
          // A newer request is queued; showing this value first would flash it.
          if (!this.queued) this.publish({ settings: confirmed, settingsLoaded: true, busy: false, settingsError: "" });
        }
      } catch (error) {
        if (this.isCurrent(lifecycle)) {
          this.queued?.settles.forEach((settle) => settle(false));
          this.queued = undefined;
          this.publish({
            settings: this.confirmed ?? this.snapshot.settings,
            busy: false,
            settingsError: errorText(error, t("protondb.settingsSaveError")),
          });
        }
      }
      for (const settle of settles) settle(saved);
    }
    // A remount may already own the save state; only the current generation clears it.
    if (this.isCurrent(lifecycle)) this.saving = false;
  }

  getRating(steamAppId: number): ProtonDbRating {
    return this.ratings.getRating(steamAppId);
  }

  subscribeRating(steamAppId: number, listener: () => void): () => void {
    return this.ratings.subscribeRating(steamAppId, listener);
  }

  private isCurrent(lifecycle: number): boolean {
    return this.mounted && this.lifecycle === lifecycle;
  }

  private publish(update: Partial<ProtonDbBadgeSnapshot>): void {
    const settings = update.settings ?? this.snapshot.settings;
    const conflict = update.conflict ?? this.snapshot.conflict;
    const settingsLoaded = update.settingsLoaded ?? this.snapshot.settingsLoaded;
    const effectiveEnabled = this.mounted && settingsLoaded && settings.enabled && !conflict.pluginName;
    this.snapshot = Object.freeze({ ...this.snapshot, ...update, effectiveEnabled });
    this.ratings.setEnabled(effectiveEnabled);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // One settings consumer must not block the other mounted consumers.
      }
    }
  }
}

export const protonDbBadgeController = new ProtonDbBadgeController();

export type { ProtonDbRating } from "./ratings";
