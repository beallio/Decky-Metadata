import { getMiniAchievementsEnabled, setMiniAchievementsEnabled } from "../backend";
import * as log from "../log";
import { installMiniAchievementsPatch } from "./miniAchievements";

export type MiniAchievementsSnapshot = {
  enabled: boolean;
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
};

const initialSnapshot = (): MiniAchievementsSnapshot => ({
  enabled: false,
  settingsLoaded: false,
  busy: false,
  settingsError: "",
});

/** Own the patch outside QAM so closing a section or panel cannot disable it. */
export class MiniAchievementsController {
  private mounted = false;
  private generation = 0;
  private snapshot = initialSnapshot();
  private disposePatch: (() => void) | undefined;
  private listeners = new Set<() => void>();

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    const generation = ++this.generation;
    this.snapshot = initialSnapshot();
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
    const dispose = this.disposePatch;
    this.disposePatch = undefined;
    try {
      dispose?.();
    } catch (error) {
      log.error("patch", "mini-achievements cleanup failed", error);
    }
    this.snapshot = initialSnapshot();
    this.emit();
    this.listeners.clear();
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.mounted || !this.snapshot.settingsLoaded || this.snapshot.busy) return false;
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
    try {
      if (this.snapshot.enabled) {
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
