import { clearHltbCache, getHltbSettings, setHltbSettings, type ProviderCacheSnapshot } from "../backend";
import * as log from "../log";
import { pluginConflicts, type FeatureConflict, type PluginConflictSource } from "../pluginConflicts";
import { loadProviderCache } from "../providerCache";
import { DEFAULT_HLTB_SETTINGS, normalizeHltbSettings, type HltbSettings } from "./settings";
import { hltbStore, type HltbStore } from "./store";

export type HltbSnapshot = Readonly<{
  settings: HltbSettings;
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
  conflict: FeatureConflict;
  effectiveEnabled: boolean;
}>;

type Runtime = { install: () => () => void };

/** Owns the HLTB setting, its conflict state, and its game-page patch outside QAM. */
export class HltbController {
  private mounted = false;
  private generation = 0;
  private snapshot: HltbSnapshot;
  private disposeRuntime: (() => void) | undefined;
  private unsubscribeConflicts: (() => void) | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly runtime: Runtime,
    private readonly store: HltbStore = hltbStore,
    private readonly conflicts: PluginConflictSource = pluginConflicts,
    private readonly loadCache: () => Promise<ProviderCacheSnapshot> = loadProviderCache,
    private readonly settingsStore = { get: getHltbSettings, set: setHltbSettings, clear: clearHltbCache },
  ) {
    this.snapshot = this.initialSnapshot();
  }

  getSnapshot = (): HltbSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    const generation = ++this.generation;
    this.snapshot = { ...this.initialSnapshot(), busy: true };
    this.unsubscribeConflicts = this.conflicts.subscribe(() => {
      this.publish({ conflict: this.conflicts.getConflict("hltb") });
    });
    void this.loadCache().then(
      (cache) => { if (this.isCurrent(generation)) this.store.seed(cache.hltb.entries); },
      () => undefined, // Without the saved cache, times are looked up when pages open.
    );
    void this.settingsStore.get().then(
      (settings) => {
        if (this.isCurrent(generation)) this.publish({ settings: normalizeHltbSettings(settings), settingsLoaded: true, busy: false });
      },
      (error: unknown) => {
        if (!this.isCurrent(generation)) return;
        log.warn("bridge", "HLTB settings load failed", error);
        this.publish({ busy: false, settingsError: "HLTB settings could not be loaded. Reload the plugin to retry." });
      },
    );
  }

  stop(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.generation += 1;
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = undefined;
    this.publish({ settingsLoaded: false, busy: false });
    this.store.reset();
    this.listeners.clear();
  }

  async setSettings(next: HltbSettings): Promise<boolean> {
    const current = this.snapshot;
    if (!this.mounted || !current.settingsLoaded || current.busy) return false;
    if (next.enabled && !current.settings.enabled && current.conflict.pluginName) return false;
    const generation = this.generation;
    this.publish({ busy: true, settingsError: "" });
    try {
      const saved = normalizeHltbSettings(await this.settingsStore.set(normalizeHltbSettings(next)));
      if (!this.isCurrent(generation)) return false;
      this.publish({ settings: saved, busy: false });
      return true;
    } catch (error) {
      if (!this.isCurrent(generation)) return false;
      log.warn("bridge", "HLTB settings save failed", error);
      this.publish({ busy: false, settingsError: "HLTB settings could not be saved." });
      return false;
    }
  }

  /** The per-game Show/Hide choice from the game's menu. */
  async toggleHidden(appId: number): Promise<boolean> {
    const { settings } = this.snapshot;
    const hidden = settings.hiddenAppIds.includes(appId);
    return this.setSettings({
      ...settings,
      hiddenAppIds: hidden ? settings.hiddenAppIds.filter((id) => id !== appId) : [...settings.hiddenAppIds, appId],
    });
  }

  async clearCache(): Promise<boolean> {
    if (!this.mounted) return false;
    try {
      await this.settingsStore.clear();
      this.store.reset();
      return true;
    } catch (error) {
      log.warn("bridge", "HLTB cache clear failed", error);
      this.publish({ settingsError: "The HLTB cache could not be cleared." });
      return false;
    }
  }

  private initialSnapshot(): HltbSnapshot {
    return Object.freeze({
      settings: DEFAULT_HLTB_SETTINGS, settingsLoaded: false, busy: false, settingsError: "",
      conflict: this.conflicts.getConflict("hltb"), effectiveEnabled: false,
    });
  }

  private isCurrent(generation: number): boolean {
    return this.mounted && generation === this.generation;
  }

  private publish(update: Partial<HltbSnapshot>): void {
    const next = { ...this.snapshot, ...update };
    const effectiveEnabled = this.mounted && next.settingsLoaded && next.settings.enabled && !next.conflict.pluginName;
    const changed = effectiveEnabled !== this.snapshot.effectiveEnabled;
    this.snapshot = Object.freeze({ ...next, effectiveEnabled });
    if (changed) this.applyRuntime(effectiveEnabled);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A closing QAM panel cannot block the feature.
      }
    }
  }

  private applyRuntime(enabled: boolean): void {
    try {
      if (enabled) {
        this.disposeRuntime ??= this.runtime.install();
      } else {
        const dispose = this.disposeRuntime;
        this.disposeRuntime = undefined;
        dispose?.();
      }
    } catch (error) {
      log.error("patch", "HLTB runtime transition failed", error);
      this.snapshot = Object.freeze({ ...this.snapshot, settingsError: "HLTB times could not be applied. Reload the plugin." });
    }
  }
}
