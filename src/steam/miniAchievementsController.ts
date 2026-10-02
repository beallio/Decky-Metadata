import { getMiniAchievementsEnabled, setMiniAchievementsEnabled } from "../backend";
import * as log from "../log";
import { installMiniAchievementsPatch } from "./miniAchievements";
import { pluginConflicts, type FeatureConflict, type PluginConflictSource } from "../pluginConflicts";

export type MiniAchievementsSnapshot = {
  enabled: boolean;
  conflict: FeatureConflict;
  effectiveEnabled: boolean;
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
};

const initialSnapshot = (conflict: FeatureConflict): MiniAchievementsSnapshot => ({
  enabled: false,
  conflict,
  effectiveEnabled: false,
  settingsLoaded: false,
  busy: false,
  settingsError: "",
});

/** Own the patch outside QAM so closing a section or panel cannot disable it. */
export class MiniAchievementsController {
  private mounted = false;
  private generation = 0;
  private snapshot: MiniAchievementsSnapshot;
  private disposePatch: (() => void) | undefined;
  private unsubscribeConflicts: (() => void) | undefined;
  private listeners = new Set<() => void>();

  constructor(private readonly conflicts: PluginConflictSource = pluginConflicts) {
    this.snapshot = initialSnapshot(conflicts.getConflict("miniAchievements"));
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    const generation = ++this.generation;
    this.snapshot = initialSnapshot(this.conflicts.getConflict("miniAchievements"));
    this.unsubscribeConflicts = this.conflicts.subscribe(() => {
      this.snapshot = { ...this.snapshot, conflict: this.conflicts.getConflict("miniAchievements") };
      this.applyRuntime();
      this.emit();
    });
    this.emit();
    void getMiniAchievementsEnabled().then((enabled) => {
      if (!this.isCurrent(generation)) return;
      this.snapshot = { ...this.snapshot, enabled, settingsLoaded: true };
      this.applyRuntime();
      this.emit();
    }).catch((error) => {
      if (!this.isCurrent(generation)) return;
      this.snapshot = {
        ...this.snapshot,
        settingsError: `Mini achievements could not be loaded. Reload the plugin to retry: ${String(error)}`,
      };
      log.warn("bridge", "mini-achievements setting load failed", error);
      this.emit();
    });
  }

  stop() {
    if (!this.mounted) return;
    this.mounted = false;
    this.generation += 1;
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = undefined;
    const dispose = this.disposePatch;
    this.disposePatch = undefined;
    try {
      dispose?.();
    } catch (error) {
      log.error("patch", "mini-achievements cleanup failed", error);
    }
    this.snapshot = initialSnapshot(this.conflicts.getConflict("miniAchievements"));
    this.emit();
    this.listeners.clear();
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.mounted || !this.snapshot.settingsLoaded || this.snapshot.busy) return false;
    if (enabled && !this.snapshot.enabled && this.snapshot.conflict.pluginName) return false;
    if (enabled === this.snapshot.enabled) return true;
    const generation = this.generation;
    this.snapshot = { ...this.snapshot, busy: true, settingsError: "" };
    this.emit();
    try {
      const confirmed = await setMiniAchievementsEnabled(enabled);
      if (!this.isCurrent(generation)) return false;
      this.snapshot = { ...this.snapshot, enabled: confirmed, busy: false };
      const applied = this.applyRuntime();
      this.emit();
      return applied;
    } catch (error) {
      if (!this.isCurrent(generation)) return false;
      this.snapshot = {
        ...this.snapshot,
        busy: false,
        settingsError: `Mini achievements could not be saved: ${String(error)}`,
      };
      log.warn("bridge", "mini-achievements setting save failed", error);
      this.emit();
      return false;
    }
  }

  private isCurrent(generation: number) {
    return this.mounted && generation === this.generation;
  }

  private applyRuntime(): boolean {
    const effectiveEnabled = this.mounted && this.snapshot.settingsLoaded &&
      this.snapshot.enabled && !this.snapshot.conflict.pluginName;
    if (this.snapshot.effectiveEnabled !== effectiveEnabled) {
      this.snapshot = { ...this.snapshot, effectiveEnabled };
    }
    try {
      if (effectiveEnabled) {
        this.disposePatch ??= installMiniAchievementsPatch();
      } else {
        const dispose = this.disposePatch;
        this.disposePatch = undefined;
        dispose?.();
      }
      return true;
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        settingsError: `Mini achievements could not be applied. Reload the plugin: ${String(error)}`,
      };
      log.error("patch", "mini-achievements runtime transition failed", error);
      return false;
    }
  }

  private emit() {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A closing QAM panel cannot block the feature. */ }
    }
  }
}

export const miniAchievementsController = new MiniAchievementsController();

export function startMiniAchievementsController(): () => void {
  miniAchievementsController.mount();
  return () => miniAchievementsController.stop();
}
