import { getProtonDbBadgeSettings, setProtonDbBadgeSettings } from "../backend";
import type { ProtonDbBadgeSettings } from "../types";
import { protonDbRatingCache, type ProtonDbRating, type ProtonDbRatingCache } from "./ratings";

export type ProtonDbBadgeSnapshot = Readonly<{
  settings: ProtonDbBadgeSettings;
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
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
  error instanceof Error && error.message ? error.message : fallback;

export class ProtonDbBadgeController {
  private readonly listeners = new Set<() => void>();
  private lifecycle = 0;
  private mounted = false;
  private snapshot: ProtonDbBadgeSnapshot = Object.freeze({
    settings: copySettings(DEFAULT_PROTON_DB_BADGE_SETTINGS),
    settingsLoaded: false,
    busy: false,
    settingsError: "",
  });

  constructor(
    private readonly settingsStore: ProtonDbBadgeSettingsStore = backendSettingsStore,
    private readonly ratings: ProtonDbRatingCache = protonDbRatingCache,
  ) {}

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
    this.publish({ busy: true, settingsLoaded: false, settingsError: "" });

    void this.settingsStore.get().then(
      (settings) => {
        if (!this.isCurrent(lifecycle)) return;
        const saved = copySettings(settings);
        this.ratings.setEnabled(saved.enabled);
        this.publish({ settings: saved, settingsLoaded: true, busy: false, settingsError: "" });
      },
      (error: unknown) => {
        if (!this.isCurrent(lifecycle)) return;
        this.ratings.setEnabled(false);
        this.publish({
          settingsLoaded: false,
          busy: false,
          settingsError: errorText(error, "Unable to load ProtonDB badge settings."),
        });
      },
    );
  }

  stop(): void {
    this.mounted = false;
    this.lifecycle += 1;
    this.ratings.stop();
    this.publish({
      settingsLoaded: false,
      busy: false,
      settingsError: "",
    });
    this.listeners.clear();
  }

  async setSettings(settings: ProtonDbBadgeSettings): Promise<boolean> {
    if (!this.mounted || !this.snapshot.settingsLoaded || this.snapshot.busy) return false;

    const lifecycle = this.lifecycle;
    const requested = copySettings(settings);
    this.publish({ busy: true, settingsError: "" });

    try {
      const saved = copySettings(await this.settingsStore.set(requested));
      if (!this.isCurrent(lifecycle)) return false;
      this.ratings.setEnabled(saved.enabled);
      this.publish({ settings: saved, settingsLoaded: true, busy: false, settingsError: "" });
      return true;
    } catch (error) {
      if (!this.isCurrent(lifecycle)) return false;
      this.publish({
        busy: false,
        settingsError: errorText(error, "Unable to save ProtonDB badge settings."),
      });
      return false;
    }
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
    this.snapshot = Object.freeze({ ...this.snapshot, ...update });
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
