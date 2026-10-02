export type ConflictingFeature = "protondb" | "trailers" | "miniAchievements";

export type FeatureConflict = Readonly<{
  pluginName: string | null;
  detectionAvailable: boolean;
}>;

export interface PluginConflictSource {
  getConflict(feature: ConflictingFeature): FeatureConflict;
  subscribe(listener: () => void): () => void;
}

const UNAVAILABLE: FeatureConflict = Object.freeze({ pluginName: null, detectionAvailable: false });
const CLEAR: FeatureConflict = Object.freeze({ pluginName: null, detectionAvailable: true });
const KNOWN_CONFLICTS: Record<ConflictingFeature, FeatureConflict> = {
  protondb: Object.freeze({ pluginName: "ProtonDB Badges", detectionAvailable: true }),
  trailers: Object.freeze({ pluginName: "TrailerHero", detectionAvailable: true }),
  miniAchievements: Object.freeze({ pluginName: "Decky UI Restored", detectionAvailable: true }),
};
const FEATURES: readonly ConflictingFeature[] = ["protondb", "trailers", "miniAchievements"];
const FALLBACK_POLL_MS = 1_000;

type StateEvents = Pick<EventTarget, "addEventListener" | "removeEventListener">;
type PluginEntry = { name: string };

const isPluginList = (value: unknown): value is PluginEntry[] =>
  Array.isArray(value) && value.every((entry: unknown) =>
    entry !== null && typeof entry === "object" && "name" in entry && typeof entry.name === "string");

const isStateEvents = (value: unknown): value is StateEvents =>
  value !== null && typeof value === "object" && "addEventListener" in value &&
  typeof value.addEventListener === "function" && "removeEventListener" in value &&
  typeof value.removeEventListener === "function";

const currentLoader = (): unknown =>
  "DeckyPluginLoader" in globalThis ? globalThis.DeckyPluginLoader : undefined;

/** Read-only adapter for Loader internals; no peer-plugin settings are accessed. */
export class PluginConflictMonitor implements PluginConflictSource {
  private mounted = false;
  private events: StateEvents | undefined;
  private pollTimer: number | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly conflicts: Record<ConflictingFeature, FeatureConflict> = {
    protondb: UNAVAILABLE,
    trailers: UNAVAILABLE,
    miniAchievements: UNAVAILABLE,
  };
  private readonly handleUpdate = () => this.refresh();

  constructor(private readonly getLoader: () => unknown = currentLoader) {}

  getConflict(feature: ConflictingFeature): FeatureConflict {
    return this.conflicts[feature];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.refresh();
  }

  stop(): void {
    this.mounted = false;
    this.attachEvents(undefined);
    this.setPolling(false);
    this.publish(undefined, undefined);
    this.listeners.clear();
  }

  private attachEvents(events: unknown): void {
    if (events === this.events) return;
    try { this.events?.removeEventListener("update", this.handleUpdate); } catch { /* Loader may be unloading. */ }
    this.events = undefined;
    try {
      if (isStateEvents(events)) {
        events.addEventListener("update", this.handleUpdate);
        this.events = events;
      }
    } catch { /* Poll when Loader state notifications are unavailable. */ }
  }

  private setPolling(enabled: boolean): void {
    if (enabled && this.pollTimer === undefined) {
      this.pollTimer = window.setInterval(this.handleUpdate, FALLBACK_POLL_MS);
    } else if (!enabled && this.pollTimer !== undefined) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private refresh(): void {
    if (!this.mounted) return;
    let plugins: PluginEntry[] | undefined;
    let disabled: PluginEntry[] | undefined;
    try {
      const loader = this.getLoader();
      const state = loader !== null && typeof loader === "object" && "deckyState" in loader
        ? loader.deckyState : undefined;
      if (state !== null && typeof state === "object") {
        this.attachEvents("eventBus" in state ? state.eventBus : undefined);
        const inventory: unknown = "publicState" in state && typeof state.publicState === "function"
          ? state.publicState() : undefined;
        if (inventory !== null && typeof inventory === "object" && "plugins" in inventory &&
            "disabledPlugins" in inventory && isPluginList(inventory.plugins) && isPluginList(inventory.disabledPlugins)) {
          plugins = inventory.plugins;
          disabled = inventory.disabledPlugins;
        }
      } else {
        this.attachEvents(undefined);
      }
    } catch {
      this.attachEvents(undefined);
    }
    this.publish(plugins, disabled);
    this.setPolling(!this.events || !plugins || !disabled);
  }

  private publish(plugins: PluginEntry[] | undefined, disabled: PluginEntry[] | undefined): void {
    let changed = false;
    for (const feature of FEATURES) {
      const conflict = KNOWN_CONFLICTS[feature];
      const next = !plugins || !disabled ? UNAVAILABLE
        : plugins.some(plugin => plugin.name === conflict.pluginName) &&
          !disabled.some(plugin => plugin.name === conflict.pluginName) ? conflict : CLEAR;
      if (next === this.conflicts[feature]) continue;
      this.conflicts[feature] = next;
      changed = true;
    }
    if (!changed) return;
    for (const listener of this.listeners) {
      try { listener(); } catch { /* One feature must not block another subscriber. */ }
    }
  }
}

export function featureConflictNotice(conflict: FeatureConflict, feature: string, savedEnabled: boolean): string {
  if (conflict.pluginName) {
    return `${conflict.pluginName} is enabled in Decky Loader. Disable that plugin to use ${feature} here.` +
      (savedEnabled ? " Your setting is saved; this feature will resume when the other plugin is disabled." : "");
  }
  return conflict.detectionAvailable ? ""
    : `Could not check for conflicting plugins. Use only one ${feature} provider at a time.`;
}

export const pluginConflicts = new PluginConflictMonitor();

export function startPluginConflicts(): () => void {
  pluginConflicts.mount();
  return () => pluginConflicts.stop();
}
