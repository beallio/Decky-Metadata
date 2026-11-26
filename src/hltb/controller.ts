import { clearHltbCache, getAllSteamOverrides, getHltbSettings, setHltbSettings, type ProviderCacheSnapshot } from "../backend";
import { t } from "../i18n";
import * as log from "../log";
import { pluginConflicts, type FeatureConflict, type PluginConflictSource } from "../pluginConflicts";
import { loadProviderCache } from "../providerCache";
import type { SteamOverride } from "../types";
import { DEFAULT_HLTB_SETTINGS, normalizeHltbSettings, type HltbSettings } from "./settings";
import { clearSteamOverrideCache, replaceSteamOverrides } from "./steamOverrides";
import { hltbStore, type HltbStore } from "./store";

export type HltbSnapshot = Readonly<{
  settings: HltbSettings;
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
  conflict: FeatureConflict;
  effectiveEnabled: boolean;
  /** Result of the last Clear HLTB cache press, shown under the button. */
  cacheStatus: "idle" | "clearing" | "cleared" | "failed";
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
  /** Last settings the backend confirmed; a failed save shows these again. */
  private confirmed: HltbSettings | undefined;
  /** Latest requested settings waiting for the in-flight save, plus their callers. */
  private queued: { settings: HltbSettings; settles: Array<(saved: boolean) => void> } | undefined;
  private saving = false;

  constructor(
    private readonly runtime: Runtime,
    private readonly store: HltbStore = hltbStore,
    private readonly conflicts: PluginConflictSource = pluginConflicts,
    private readonly loadCache: () => Promise<ProviderCacheSnapshot> = loadProviderCache,
    private readonly settingsStore = { get: getHltbSettings, set: setHltbSettings, clear: clearHltbCache },
    private readonly loadSteamOverrides: () => Promise<Record<string, SteamOverride>> = () =>
      typeof getAllSteamOverrides === "function" ? getAllSteamOverrides() : Promise.resolve({}),
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
    const overridesReady = this.loadSteamOverrides().then(
      (entries) => { if (this.isCurrent(generation)) replaceSteamOverrides(entries); },
      () => undefined, // Without saved overrides, automatic Steam matching still works.
    );
    void Promise.all([this.settingsStore.get(), overridesReady]).then(
      ([settings]) => {
        if (!this.isCurrent(generation)) return;
        const saved = normalizeHltbSettings(settings);
        this.confirmed = saved;
        this.publish({ settings: saved, settingsLoaded: true, busy: false });
      },
      (error: unknown) => {
        if (!this.isCurrent(generation)) return;
        log.warn("bridge", "HLTB settings load failed", error);
        this.publish({ busy: false, settingsError: t("hltb.settingsError.loadFailed") });
      },
    );
  }

  stop(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.generation += 1;
    this.queued?.settles.forEach((settle) => settle(false));
    this.queued = undefined;
    this.saving = false;
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = undefined;
    this.publish({ settingsLoaded: false, busy: false });
    this.store.reset();
    clearSteamOverrideCache();
    this.listeners.clear();
  }

  async setSettings(next: HltbSettings): Promise<boolean> {
    const current = this.snapshot;
    if (!this.mounted || !current.settingsLoaded) return false;
    const requested = normalizeHltbSettings(next);
    if (requested.enabled && !current.settings.enabled && current.conflict.pluginName) return false;
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
    const generation = this.generation;
    while (this.queued && this.isCurrent(generation)) {
      const { settings, settles } = this.queued;
      this.queued = undefined;
      let saved = false;
      try {
        const confirmed = normalizeHltbSettings(await this.settingsStore.set(settings));
        if (this.isCurrent(generation)) {
          this.confirmed = confirmed;
          saved = true;
          // A newer request is queued; showing this value first would flash it.
          if (!this.queued) this.publish({ settings: confirmed, busy: false });
        }
      } catch (error) {
        if (this.isCurrent(generation)) {
          log.warn("bridge", "HLTB settings save failed", error);
          this.queued?.settles.forEach((settle) => settle(false));
          this.queued = undefined;
          this.publish({
            settings: this.confirmed ?? this.snapshot.settings,
            busy: false,
            settingsError: t("hltb.settingsError.saveFailed"),
          });
        }
      }
      for (const settle of settles) settle(saved);
    }
    // A remount may already own the save state; only the current generation clears it.
    if (this.isCurrent(generation)) this.saving = false;
  }

  async clearCache(): Promise<boolean> {
    if (!this.mounted) return false;
    this.publish({ cacheStatus: "clearing" });
    try {
      await this.settingsStore.clear();
      this.store.reset();
      this.publish({ cacheStatus: "cleared" });
      return true;
    } catch (error) {
      log.warn("bridge", "HLTB cache clear failed", error);
      this.publish({ cacheStatus: "failed" });
      return false;
    }
  }

  private initialSnapshot(): HltbSnapshot {
    return Object.freeze({
      settings: DEFAULT_HLTB_SETTINGS, settingsLoaded: false, busy: false, settingsError: "",
      conflict: this.conflicts.getConflict("hltb"), effectiveEnabled: false, cacheStatus: "idle",
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
      this.snapshot = Object.freeze({ ...this.snapshot, settingsError: t("hltb.settingsError.applyFailed") });
    }
  }
}
