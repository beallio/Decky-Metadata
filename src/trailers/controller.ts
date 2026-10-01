import { evalInBigPicture, findIgnTrailer, getTrailerSettings, setTrailerSettings } from "../backend";
import type { IgnTrailerResult, TrailerQuality, TrailerSettings, TrailerStatus } from "../types";
import { pluginConflicts, type FeatureConflict, type PluginConflictSource } from "../pluginConflicts";
import {
  currentRoutePath,
  getNativeOverview,
  isNativeNonSteamShortcut,
  metadataCache,
  metadataMatchRevisionSnapshot,
  metadataState,
  subscribeMetadataMatchChanges,
} from "../steam/core";
import { ensureMetadataCache } from "../steam/metadataPatch";
import { ignGameUrl, nativeTrailerGameTitle, parseTrailerRootRoute, resolveTrailerSource, SHORTCUT_APP_ID_BOUNDARY } from "./source";
import { deckyMetadataTrailerRuntimeFactory } from "./runtime";

export const DEFAULT_TRAILER_SETTINGS: TrailerSettings = {
  enabled: false,
  audioEnabled: false,
  hideLogoDuringTrailer: false,
  quality: "auto",
  fadeInDelaySeconds: 3,
};

const POLL_INTERVAL_MS = 2000;
const BRIDGE_TIMEOUT_MS = 24000;
const QUALITY_OPTIONS: TrailerQuality[] = ["auto", 720, 1080, 1440, 2160];
const AUDIO_CHANGE_EVENT = "decky-metadata-trailer:audio-change";
const OWNER_KEY = "__deckyMetadataTrailerOwner";
const RUNTIME_KEY = "__deckyMetadataTrailerRuntime";

const TRANSLATIONS = {
  en: {
    audio: "Trailer audio",
    autoplayBlocked: "Autoplay is blocked by Steam",
    disabled: "Disabled",
    noSteamTrailer: "No Steam trailer found",
    searchTrailerForApp: "Finding Steam trailer for app {appId}",
    steamTrailer: "Steam trailer",
    steamTrailerNotPlayable: "Steam trailer is not playable",
    searchIgnTrailer: "Finding an IGN game trailer",
    noGameTrailer: "No playable game trailer found",
    stoppedForLaunch: "Trailer stopped for launch",
    trailerActive: "Trailer active",
    trailerLabel: "Trailer: {name}",
    waitingGamePage: "Waiting for a Steam game page",
    muteTrailer: "Mute trailer",
    expandTrailer: "Expand trailer",
    mediaSourceUnavailable: "MediaSource is not available",
  },
};

type TrailerIdentity = { pageAppId: number; sourceAppId: number | null } | null;

type RuntimeSnapshot = {
  appId?: number;
  sourceAppId?: number | null;
  status: string;
  trailerName?: string;
  gameTitle?: string;
  trailerAudioEnabled?: boolean;
  displayWidth?: number | null;
  displayHeight?: number | null;
  targetHeight?: number;
  needsIgnFallback?: boolean;
};

export type TrailerControllerSnapshot = TrailerStatus & {
  settingsLoaded: boolean;
  busy: boolean;
  settingsError: string;
  matchRevision: number;
  conflict: FeatureConflict;
  effectiveEnabled: boolean;
};

type OwnerRecord = {
  ownerId: string;
  active: boolean;
  settings: TrailerSettings;
  settingsRevision: number;
  identity: TrailerIdentity;
  ignFallback?: IgnTrailerResult | null;
};

const normalizeSettings = (value: unknown): TrailerSettings => {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : false,
    audioEnabled: typeof input.audioEnabled === "boolean" ? input.audioEnabled : false,
    hideLogoDuringTrailer: typeof input.hideLogoDuringTrailer === "boolean" ? input.hideLogoDuringTrailer : false,
    fadeInDelaySeconds: Number.isInteger(input.fadeInDelaySeconds) &&
      (input.fadeInDelaySeconds as number) >= 0 && (input.fadeInDelaySeconds as number) <= 10
      ? input.fadeInDelaySeconds as number : 3,
    quality: QUALITY_OPTIONS.includes(input.quality as TrailerQuality)
      ? input.quality as TrailerQuality
      : "auto",
  };
};

const sameIdentity = (left: TrailerIdentity, right: TrailerIdentity) =>
  left?.pageAppId === right?.pageAppId && left?.sourceAppId === right?.sourceAppId;

type IgnLookup = { title: string; gameUrl: string | null } | null;
const sameIgnLookup = (left: IgnLookup, right: IgnLookup) =>
  left?.title === right?.title && left?.gameUrl === right?.gameUrl;

const isRuntimeSnapshot = (value: unknown): value is RuntimeSnapshot =>
  Boolean(value && typeof value === "object" && typeof (value as RuntimeSnapshot).status === "string");

const documents = (): Document[] => {
  if (typeof document === "undefined") return [];
  const found: Document[] = [];
  const addDocument = (candidate: any) => {
    try {
      if (candidate?.documentElement && !found.includes(candidate)) found.push(candidate);
    } catch { /* Steam can close a popup between discovery and access. */ }
  };
  const addWindow = (candidate: any) => {
    if (!candidate) return;
    for (const getter of [
      () => candidate.document,
      () => candidate.window?.document,
      () => candidate.m_Window?.document,
      () => candidate.m_popup?.document,
      () => candidate.BrowserWindow?.document,
      () => candidate.GetWindow?.()?.document,
    ]) {
      try { addDocument(getter()); } catch { /* Native Steam handles are transient. */ }
    }
  };
  addDocument(document);
  try { addDocument(window.top?.document); } catch { }
  try { addDocument(window.parent?.document); } catch { }
  try { addDocument(window.opener?.document); } catch { }
  try {
    const router = (globalThis as any).DFL?.Router ?? (globalThis as any).Router;
    const store = router?.WindowStore;
    addWindow(store?.GamepadUIMainWindowInstance);
    if (Array.isArray(store?.SteamUIWindows)) store.SteamUIWindows.forEach(addWindow);
  } catch { }
  return found;
};

const runtimeMissingScript = `(() => {
  const runtime = window.${RUNTIME_KEY};
  const owner = window.opener?.${OWNER_KEY} ?? window.${OWNER_KEY};
  return owner?.active && runtime?.ownerId === owner.ownerId
    ? runtime.snapshot()
    : { status: 'Steam UI unavailable', runtimeMissing: true };
})()`;

export class TrailerController {
  private settings = { ...DEFAULT_TRAILER_SETTINGS };
  private confirmedSettings = { ...DEFAULT_TRAILER_SETTINGS };
  private settingsLoaded = false;
  private settingsBusy = false;
  private pendingSettingsWrites = 0;
  private settingsTransactionId = 0;
  private settingsError = "";
  private status = "Loading trailer settings";
  private runtimeSnapshot: RuntimeSnapshot | undefined;
  private listeners = new Set<() => void>();
  private mounted = false;
  private ownerId = "";
  private settingsRevision = 0;
  private identity: TrailerIdentity = null;
  private ignLookup: IgnLookup = null;
  private ignFallback: IgnTrailerResult | null | undefined;
  private ignRequestEpoch = 0;
  private ignRequested = false;
  private pageAppId: number | null = null;
  private pageOverview: unknown = null;
  private matchRevision = metadataMatchRevisionSnapshot();
  private statusTimer: number | undefined;
  private pollInFlight = false;
  private installInFlight = false;
  private pendingInstall = false;
  private settingsSaveQueue: Promise<void> = Promise.resolve();
  private audioWindows = new Map<Window, EventListener>();
  private unsubscribeMatchChanges: (() => void) | undefined;
  private snapshot: TrailerControllerSnapshot;
  private conflict: FeatureConflict;
  private unsubscribeConflicts: (() => void) | undefined;

  private handleAudioChange = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const owner = (window as any)[OWNER_KEY] as OwnerRecord | undefined;
    if (!this.mounted || owner?.ownerId !== this.ownerId ||
        detail?.ownerId !== this.ownerId || detail.settingsRevision !== this.settingsRevision ||
        typeof detail.audioEnabled !== "boolean" || detail.audioEnabled === this.settings.audioEnabled) return;
    void this.updateSettings({ audioEnabled: detail.audioEnabled });
  };

  constructor(private readonly conflicts: PluginConflictSource = pluginConflicts) {
    this.conflict = conflicts.getConflict("trailers");
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  mount() {
    if (this.mounted) return;
    this.ownerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.mounted = true;
    this.conflict = this.conflicts.getConflict("trailers");
    this.unsubscribeConflicts = this.conflicts.subscribe(() => this.syncConflict());
    this.pendingSettingsWrites = 0;
    this.settingsBusy = false;
    this.destroyOlderRuntimes();
    this.publishOwner();
    this.refreshAudioListeners();
    this.unsubscribeMatchChanges = subscribeMetadataMatchChanges((appId, revision) => {
      this.matchRevision = revision;
      if (appId === this.pageAppId) void this.refreshPageIdentity();
      else this.emit();
    });
    void this.loadSettings();
    this.statusTimer = window.setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.emit();
  }

  /** Stop local playback ownership before any best-effort remote cleanup. */
  stop() {
    if (!this.mounted) return;
    this.mounted = false;
    this.ignRequestEpoch += 1;
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = undefined;
    this.ignRequested = false;
    this.ignLookup = null;
    this.ignFallback = undefined;
    if (this.statusTimer !== undefined) window.clearInterval(this.statusTimer);
    this.statusTimer = undefined;
    this.unsubscribeMatchChanges?.();
    this.unsubscribeMatchChanges = undefined;
    const owner = (window as any)[OWNER_KEY] as OwnerRecord | undefined;
    if (owner?.ownerId === this.ownerId) owner.active = false;
    for (const [target, listener] of this.audioWindows) {
      try { target.removeEventListener(AUDIO_CHANGE_EVENT, listener); } catch { }
    }
    this.audioWindows.clear();
    for (const doc of documents()) {
      try {
        const target = doc.defaultView as any;
        const runtime = target?.[RUNTIME_KEY];
        if (runtime?.ownerId !== this.ownerId || typeof runtime.destroy !== "function") continue;
        runtime.destroy();
        if (target[RUNTIME_KEY] === runtime) delete target[RUNTIME_KEY];
      } catch { /* Direct teardown is best effort for closing Steam windows. */ }
    }
    if ((window as any)[OWNER_KEY]?.ownerId === this.ownerId) delete (window as any)[OWNER_KEY];
    const ownerId = JSON.stringify(this.ownerId);
    const cleanup = `(() => { const runtime=window.${RUNTIME_KEY}; if(runtime?.ownerId!==${ownerId}) return {status:'Steam UI unavailable',runtimeMissing:true}; runtime.destroy?.(); if(window.${RUNTIME_KEY}===runtime) delete window.${RUNTIME_KEY}; return {status:'Trailer runtime removed'}; })()`;
    void evalInBigPicture(cleanup).catch(() => undefined);
    this.listeners.clear();
  }

  setEnabled(enabled: boolean) {
    return this.updateSettings({ enabled });
  }

  setAudioEnabled(audioEnabled: boolean) {
    return this.updateSettings({ audioEnabled });
  }

  setHideLogoDuringTrailer(hideLogoDuringTrailer: boolean) {
    return this.updateSettings({ hideLogoDuringTrailer });
  }

  setQuality(quality: TrailerQuality) {
    return this.updateSettings({ quality });
  }
  setFadeInDelaySeconds(fadeInDelaySeconds: number) {
    return this.updateSettings({ fadeInDelaySeconds });
  }

  private isEffectivelyEnabled(): boolean {
    return this.mounted && this.settingsLoaded && this.settings.enabled && !this.conflict.pluginName;
  }

  private effectiveSettings(): TrailerSettings {
    const enabled = this.isEffectivelyEnabled();
    return enabled === this.settings.enabled ? this.settings : { ...this.settings, enabled };
  }

  private syncConflict(): void {
    const next = this.conflicts.getConflict("trailers");
    if (next.pluginName === this.conflict.pluginName &&
        next.detectionAvailable === this.conflict.detectionAvailable) return;
    const wasEnabled = this.isEffectivelyEnabled();
    this.conflict = next;
    if (wasEnabled !== this.isEffectivelyEnabled()) {
      this.ignRequestEpoch += 1;
      this.ignRequested = false;
      this.ignLookup = null;
      this.ignFallback = undefined;
      this.identity = null;
      this.runtimeSnapshot = undefined;
      this.settingsRevision += 1;
      this.publishOwner();
      this.updateReachableRuntimes();
      if (!this.isEffectivelyEnabled()) {
        // A Steam-tab runtime may be outside the directly reachable windows.
        const ownerId = JSON.stringify(this.ownerId);
        const settings = JSON.stringify(this.effectiveSettings());
        const revision = this.settingsRevision;
        void this.runInSteamTab(`(() => {
          const runtime = window.${RUNTIME_KEY};
          if (runtime?.ownerId !== ${ownerId} || typeof runtime.update !== "function") return;
          return runtime.update(${settings}, ${revision}, null, undefined);
        })()`);
      } else {
        void this.poll();
      }
    }
    this.emit();
  }

  private buildSnapshot(): TrailerControllerSnapshot {
    const remote = this.runtimeSnapshot;
    return {
      settings: { ...this.settings },
      appId: remote?.appId,
      sourceAppId: remote?.sourceAppId ?? this.identity?.sourceAppId,
      status: this.conflict.pluginName && this.settings.enabled
        ? `Paused while ${this.conflict.pluginName} is enabled` : this.status,
      trailerName: remote?.trailerName,
      gameTitle: remote?.gameTitle,
      displayWidth: remote?.displayWidth ?? null,
      displayHeight: remote?.displayHeight ?? null,
      targetHeight: remote?.targetHeight ?? (this.settings.quality === "auto" ? 720 : this.settings.quality),
      settingsLoaded: this.settingsLoaded,
      busy: this.settingsBusy,
      settingsError: this.settingsError,
      matchRevision: this.matchRevision,
      conflict: this.conflict,
      effectiveEnabled: this.isEffectivelyEnabled(),
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A panel update cannot block the controller. */ }
    }
  }

  private async loadSettings() {
    try {
      const loaded = normalizeSettings(await getTrailerSettings());
      if (!this.mounted) return;
      this.settings = loaded;
      this.confirmedSettings = { ...loaded };
      this.settingsLoaded = true;
      this.settingsError = "";
      this.settingsRevision += 1;
      this.publishOwner();
      this.status = loaded.enabled ? "Waiting for a Steam game page" : "Disabled";
      this.emit();
      await this.poll();
    } catch (error) {
      if (!this.mounted) return;
      this.settingsError = `Trailer settings could not be loaded: ${String(error)}`;
      this.status = "Trailer settings unavailable";
      this.emit();
    }
  }

  private async updateSettings(change: Partial<TrailerSettings>): Promise<boolean> {
    if (!this.mounted || !this.settingsLoaded) return false;
    if (change.enabled === true && !this.settings.enabled && this.conflict.pluginName) return false;
    const previous = { ...this.settings };
    const next = normalizeSettings({ ...this.settings, ...change });
    if (next.enabled === previous.enabled && next.audioEnabled === previous.audioEnabled &&
        next.hideLogoDuringTrailer === previous.hideLogoDuringTrailer && next.quality === previous.quality &&
        next.fadeInDelaySeconds === previous.fadeInDelaySeconds) {
      return true;
    }
    this.settings = next;
    const ownerId = this.ownerId;
    const transactionId = ++this.settingsTransactionId;
    this.pendingSettingsWrites += 1;
    this.settingsBusy = true;
    this.settingsError = "";
    this.settingsRevision += 1;
    this.publishOwner();
    const direct = this.updateReachableRuntimes();
    this.status = next.enabled ? "Checking the current Steam game page" : "Disabled";
    this.emit();
    if (!direct && this.isEffectivelyEnabled()) void this.poll();

    let succeeded = true;
    const save = this.settingsSaveQueue.then(async () => {
      if (!this.ownsMount(ownerId)) return;
      await setTrailerSettings(next);
    });
    this.settingsSaveQueue = save.then(
      () => {
        if (this.ownsMount(ownerId)) this.confirmedSettings = { ...next };
      },
      () => undefined,
    );
    try {
      await save;
    } catch (error) {
      succeeded = false;
      if (this.ownsMount(ownerId) && transactionId === this.settingsTransactionId) {
        this.settings = { ...this.confirmedSettings };
        this.settingsRevision += 1;
        this.publishOwner();
        this.updateReachableRuntimes();
        this.settingsError = `Trailer settings could not be saved: ${String(error)}`;
        this.status = "Trailer settings were restored";
      }
    } finally {
      if (this.ownsMount(ownerId)) {
        this.pendingSettingsWrites = Math.max(0, this.pendingSettingsWrites - 1);
        this.settingsBusy = this.pendingSettingsWrites > 0;
        this.emit();
      }
    }
    if (succeeded && this.ownsMount(ownerId) && this.isEffectivelyEnabled()) void this.poll();
    return succeeded;
  }

  private ownsMount(ownerId: string) {
    const owner = (window as any)[OWNER_KEY] as OwnerRecord | undefined;
    return this.mounted && this.ownerId === ownerId && owner?.ownerId === ownerId && owner.active;
  }

  private publishOwner() {
    const record: OwnerRecord = {
      ownerId: this.ownerId,
      active: this.mounted,
      settings: { ...this.settings, enabled: this.isEffectivelyEnabled() },
      settingsRevision: this.settingsRevision,
      identity: this.identity,
      ignFallback: this.ignFallback,
    };
    (window as any)[OWNER_KEY] = record;
  }

  private destroyOlderRuntimes() {
    for (const doc of documents()) {
      try {
        const target = doc.defaultView as any;
        const runtime = target?.[RUNTIME_KEY];
        if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId === this.ownerId ||
            typeof runtime.destroy !== "function") continue;
        runtime.destroy();
        if (target[RUNTIME_KEY] === runtime) delete target[RUNTIME_KEY];
      } catch { /* A closing window does not own this mount. */ }
    }
  }

  private refreshAudioListeners() {
    const current = new Set<Window>([window]);
    for (const doc of documents()) {
      try { if (doc.defaultView) current.add(doc.defaultView); } catch { }
    }
    for (const [target, listener] of this.audioWindows) {
      if (current.has(target)) continue;
      try { target.removeEventListener(AUDIO_CHANGE_EVENT, listener); } catch { }
      this.audioWindows.delete(target);
    }
    for (const target of current) {
      if (this.audioWindows.has(target)) continue;
      try {
        target.addEventListener(AUDIO_CHANGE_EVENT, this.handleAudioChange);
        this.audioWindows.set(target, this.handleAudioChange);
      } catch { /* Popups can become cross-origin or close between polls. */ }
    }
  }

  private async resolveCurrentIdentity(): Promise<{ identity: TrailerIdentity; status: string; ignLookup?: IgnLookup }> {
    const route = currentRoutePath();
    const pageAppId = parseTrailerRootRoute(route);
    if (!this.isEffectivelyEnabled()) return { identity: null, status: "Disabled" };
    if (!pageAppId) return { identity: null, status: "Open a game's main Steam Library page" };
    if (pageAppId !== this.pageAppId) {
      this.pageAppId = pageAppId;
      this.pageOverview = null;
    }
    if (Number((this.pageOverview as any)?.appid) !== pageAppId) {
      // Steam can hydrate the native overview after the route becomes visible.
      // This is a direct AppID lookup; do not scan every app on healthy polls.
      this.pageOverview = getNativeOverview(pageAppId);
    }
    if (!this.pageOverview || Number((this.pageOverview as any)?.appid) !== pageAppId) {
      return { identity: null, status: "Steam game page is not available" };
    }
    if (pageAppId >= SHORTCUT_APP_ID_BOUNDARY && !isNativeNonSteamShortcut(this.pageOverview)) {
      return { identity: null, status: "This page is not a native non-Steam shortcut" };
    }
    if (pageAppId >= SHORTCUT_APP_ID_BOUNDARY && !metadataState.metadataLoaded) {
      try { await ensureMetadataCache(); }
      catch { return { identity: null, status: "Saved Steam matches are not available" }; }
      if (!this.mounted) return { identity: null, status: "Disabled" };
    }
    const metadata = metadataCache[String(pageAppId)] ?? null;
    const resolved = resolveTrailerSource({
      route,
      heroAppId: pageAppId,
      overview: this.pageOverview,
      metadata,
      hydrated: pageAppId < SHORTCUT_APP_ID_BOUNDARY || metadataState.metadataLoaded,
    });
    if (resolved) {
      const gameUrl = ignGameUrl(metadata);
      const title = nativeTrailerGameTitle(this.pageOverview) ||
        (typeof metadata?.title === "string" ? metadata.title.trim() : "") ||
        (gameUrl ? gameUrl.slice(gameUrl.lastIndexOf("/") + 1) : "");
      return {
        identity: { pageAppId: resolved.pageAppId, sourceAppId: resolved.sourceAppId },
        ignLookup: title ? { title, gameUrl } : null,
        status: resolved.sourceAppId === null ? "Waiting for an IGN game trailer" : "Waiting for the matching Steam hero",
      };
    }
    return {
      identity: null,
      status: pageAppId >= SHORTCUT_APP_ID_BOUNDARY
        ? "A game title or saved Steam match is needed for trailers"
        : "Game trailer is unavailable for this page",
    };
  }

  private async refreshPageIdentity() {
    if (!this.mounted) return;
    const next = await this.resolveCurrentIdentity();
    if (!this.isEffectivelyEnabled()) {
      next.identity = null;
      next.ignLookup = null;
      next.status = "Disabled";
    }
    const lookup = next.ignLookup ?? null;
    if (!this.mounted || (sameIdentity(next.identity, this.identity) && sameIgnLookup(lookup, this.ignLookup))) return;
    this.ignRequestEpoch += 1;
    this.ignRequested = false;
    this.ignFallback = undefined;
    this.ignLookup = lookup;
    this.identity = next.identity;
    this.runtimeSnapshot = undefined;
    this.status = next.status;
    this.settingsRevision += 1;
    this.publishOwner();
    const direct = this.updateReachableRuntimes();
    this.emit();
    if (!direct && this.isEffectivelyEnabled() && this.identity) void this.installOrUpdate();
  }

  private updateReachableRuntimes() {
    let found = false;
    for (const doc of documents()) {
      try {
        const runtime = (doc.defaultView as any)?.[RUNTIME_KEY];
        if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId !== this.ownerId ||
            typeof runtime.update !== "function") continue;
        const result = runtime.update(this.effectiveSettings(), this.settingsRevision, this.identity, this.ignFallback);
        if (isRuntimeSnapshot(result)) this.runtimeSnapshot = result;
        found = true;
      } catch { /* The CEF bridge can recover a missing or inaccessible runtime. */ }
    }
    return found;
  }

  private readReachableRuntime(): boolean {
    for (const doc of documents()) {
      try {
        const runtime = (doc.defaultView as any)?.[RUNTIME_KEY];
        if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId !== this.ownerId ||
            typeof runtime.snapshot !== "function") continue;
        const result = runtime.snapshot();
        if (isRuntimeSnapshot(result)) {
          this.runtimeSnapshot = result;
          this.status = result.status;
          return true;
        }
      } catch { }
    }
    return false;
  }

  private buildInstallScript() {
    return `(() => {
      const settings = ${JSON.stringify(this.effectiveSettings())};
      const ownerId = ${JSON.stringify(this.ownerId)};
      const settingsRevision = ${this.settingsRevision};
      const identity = ${JSON.stringify(this.identity)};
      const ignFallback = ${JSON.stringify(this.ignFallback) ?? "undefined"};
      const translations = ${JSON.stringify(TRANSLATIONS)};
      const factory = ${deckyMetadataTrailerRuntimeFactory.toString()};
      return factory(settings, ownerId, settingsRevision, translations, identity, ignFallback);
    })()`;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Steam debugger timed out")), timeoutMs);
      Promise.resolve(promise).then(resolve, reject).finally(() => window.clearTimeout(timer));
    });
  }

  private async runInSteamTab(code: string): Promise<Record<string, unknown> | undefined> {
    try {
      const result = await this.withTimeout(evalInBigPicture(code), BRIDGE_TIMEOUT_MS);
      return result && typeof result === "object" ? result as Record<string, unknown> : undefined;
    } catch {
      this.runtimeSnapshot = undefined;
      this.status = "Steam UI unavailable";
      this.emit();
      return undefined;
    }
  }

  private async installOrUpdate() {
    if (!this.isEffectivelyEnabled() || !this.identity) return;
    if (this.installInFlight) {
      this.pendingInstall = true;
      return;
    }
    const ownerId = this.ownerId;
    this.installInFlight = true;
    try {
      do {
        this.pendingInstall = false;
        if (!this.isEffectivelyEnabled() || !this.identity) return;
        const result = await this.runInSteamTab(this.buildInstallScript());
        if (!this.mounted || this.ownerId !== ownerId || (window as any)[OWNER_KEY]?.ownerId !== ownerId) return;
        this.applyRemoteResult(result);
        this.refreshAudioListeners();
      } while (this.isEffectivelyEnabled() && this.ownerId === ownerId && this.pendingInstall);
    } finally {
      this.installInFlight = false;
      if (this.mounted && this.pendingInstall) void this.installOrUpdate();
    }
  }

  private applyRemoteResult(result: Record<string, unknown> | undefined) {
    if (!result) return;
    if (result.runtimeMissing === true) {
      this.status = String(result.status || "Steam UI unavailable");
      this.runtimeSnapshot = undefined;
      this.emit();
      return;
    }
    if (!isRuntimeSnapshot(result)) return;
    this.runtimeSnapshot = result;
    this.status = result.status;
    this.emit();
    if (result.needsIgnFallback) void this.loadIgnFallback();
  }

  private async loadIgnFallback() {
    if (!this.isEffectivelyEnabled() || !this.identity || this.ignRequested) return;
    this.ignRequested = true;
    const epoch = this.ignRequestEpoch;
    const ownerId = this.ownerId;
    const identity = this.identity;
    const lookup = this.ignLookup;
    let result: IgnTrailerResult | null = null;
    try {
      if (lookup) result = await findIgnTrailer(lookup.title, lookup.gameUrl);
    } catch { /* A failed IGN lookup leaves the original artwork in place. */ }
    if (!this.ownsMount(ownerId) || epoch !== this.ignRequestEpoch ||
        !sameIdentity(identity, this.identity) || !sameIgnLookup(lookup, this.ignLookup)) return;
    this.ignFallback = result;
    this.settingsRevision += 1;
    this.publishOwner();
    this.updateReachableRuntimes();
    this.emit();
  }

  private async poll() {
    if (!this.mounted || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      this.refreshAudioListeners();
      await this.refreshPageIdentity();
      if (!this.isEffectivelyEnabled() || this.installInFlight) return;
      if (this.readReachableRuntime()) {
        this.emit();
        if (this.runtimeSnapshot?.needsIgnFallback) void this.loadIgnFallback();
        return;
      }
      const result = await this.runInSteamTab(runtimeMissingScript);
      if (!this.mounted) return;
      if (result?.runtimeMissing === true) {
        this.applyRemoteResult(result);
        if (this.isEffectivelyEnabled() && this.identity) await this.installOrUpdate();
      } else {
        this.applyRemoteResult(result);
      }
    } finally {
      this.pollInFlight = false;
    }
  }
}

export const trailerController = new TrailerController();
export const startTrailerController = () => {
  trailerController.mount();
  return () => trailerController.stop();
};
