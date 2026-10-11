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
import { ignGameUrl, isTrailerHomeRoute, nativeTrailerGameTitle, parseTrailerRootRoute, resolveTrailerAppSource, resolveTrailerSource, SHORTCUT_APP_ID_BOUNDARY } from "./source";
import { deckyMetadataTrailerRuntimeFactory } from "./runtime";
import { steamUiDocuments } from "../steam/steamUiHost";

export const DEFAULT_TRAILER_SETTINGS: TrailerSettings = {
  enabled: false,
  detailEnabled: true,
  homeEnabled: false,
  audioEnabled: false,
  hideLogoDuringTrailer: false,
  quality: "auto",
  detailFadeInDelaySeconds: 3,
  homeFadeInDelaySeconds: 3,
};

const POLL_INTERVAL_MS = 2000;
const BRIDGE_TIMEOUT_MS = 24000;
const AUDIO_CHANGE_EVENT = "decky-metadata-trailer:audio-change";
const HOME_SELECTION_EVENT = "decky-metadata-trailer:home-selection";
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
    waitingGamePage: "Waiting for a game page or Home selection",
    waitingHomeSelection: "Select or hover over a game on Home",
    waitingHomeDelay: "Waiting to show the Home trailer",
    muteTrailer: "Mute trailer",
    expandTrailer: "Expand trailer",
    mediaSourceUnavailable: "MediaSource is not available",
  },
};

type TrailerIdentity = {
  view: "detail" | "home";
  pageAppId: number;
  sourceAppId: number | null;
  selectionRevision?: number;
  enteredAt?: number;
} | null;

type HomeSelection = { appId: number; selectionRevision: number; enteredAt: number };

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
  homeSelectionRevision: number;
  identity: TrailerIdentity;
  ignFallback?: IgnTrailerResult | null;
};

type RuntimeHandle = {
  product?: string;
  ownerId?: string;
  update?: (settings: TrailerSettings, revision: number, identity: TrailerIdentity, fallback: IgnTrailerResult | null | undefined) => unknown;
  snapshot?: () => unknown;
  destroy?: () => void;
};

declare global {
  interface Window {
    // These globals belong to the controller and its serialized Steam UI player.
    __deckyMetadataTrailerOwner?: OwnerRecord;
    __deckyMetadataTrailerRuntime?: RuntimeHandle;
  }
}


const normalizeSettings = (value: unknown): TrailerSettings => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_TRAILER_SETTINGS };
  const enabled = "enabled" in value ? value.enabled : undefined;
  const detailEnabled = "detailEnabled" in value ? value.detailEnabled : undefined;
  const homeEnabled = "homeEnabled" in value ? value.homeEnabled : undefined;
  const audioEnabled = "audioEnabled" in value ? value.audioEnabled : undefined;
  const hideLogoDuringTrailer = "hideLogoDuringTrailer" in value ? value.hideLogoDuringTrailer : undefined;
  const detailDelay = "detailFadeInDelaySeconds" in value ? value.detailFadeInDelaySeconds : undefined;
  const homeDelay = "homeFadeInDelaySeconds" in value ? value.homeFadeInDelaySeconds : undefined;
  const quality = "quality" in value ? value.quality : undefined;
  return {
    enabled: typeof enabled === "boolean" ? enabled : false,
    detailEnabled: typeof detailEnabled === "boolean" ? detailEnabled : true,
    homeEnabled: typeof homeEnabled === "boolean" ? homeEnabled : false,
    audioEnabled: typeof audioEnabled === "boolean" ? audioEnabled : false,
    hideLogoDuringTrailer: typeof hideLogoDuringTrailer === "boolean" ? hideLogoDuringTrailer : false,
    detailFadeInDelaySeconds: typeof detailDelay === "number" &&
      Number.isInteger(detailDelay) && detailDelay >= 0 && detailDelay <= 10 ? detailDelay : 3,
    homeFadeInDelaySeconds: typeof homeDelay === "number" &&
      Number.isInteger(homeDelay) && homeDelay >= 0 && homeDelay <= 10 ? homeDelay : 3,
    quality: quality === "auto" || quality === 720 || quality === 1080 || quality === 1440 || quality === 2160
      ? quality : "auto",
  };
};

const sameIdentity = (left: TrailerIdentity, right: TrailerIdentity) =>
  left?.view === right?.view && left?.pageAppId === right?.pageAppId &&
  left?.sourceAppId === right?.sourceAppId && left?.selectionRevision === right?.selectionRevision;

type IgnLookup = { title: string; gameUrl: string | null } | null;
const sameIgnLookup = (left: IgnLookup, right: IgnLookup) =>
  left?.title === right?.title && left?.gameUrl === right?.gameUrl;

const isRuntimeSnapshot = (value: unknown): value is RuntimeSnapshot =>
  value !== null && typeof value === "object" && "status" in value && typeof value.status === "string";


const runtimeMissingScript = `(() => {
  const runtime = window.${RUNTIME_KEY};
  const owner = window.opener?.${OWNER_KEY} ?? window.${OWNER_KEY};
  if (!owner?.active || runtime?.ownerId !== owner.ownerId) {
    return { status: 'Steam UI unavailable', runtimeMissing: true };
  }
  // A suspended Steam-tab runtime cannot scan its opener for a newer revision.
  if (runtime.settingsRevision !== owner.settingsRevision && typeof runtime.update === 'function') {
    return runtime.update(owner.settings, owner.settingsRevision, owner.identity, owner.ignFallback);
  }
  return runtime.snapshot();
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
  private homeSelection: HomeSelection | null = null;
  private homeSelectionRevision = 0;
  private homeDelayTimer: number | undefined;
  private identityRequestEpoch = 0;
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
    const detail = (event as CustomEvent<unknown>).detail;
    if (detail === null || typeof detail !== "object" || !("ownerId" in detail) ||
        !("settingsRevision" in detail) || !("audioEnabled" in detail)) return;
    const owner = window[OWNER_KEY];
    if (!this.mounted || owner?.ownerId !== this.ownerId ||
        detail?.ownerId !== this.ownerId || detail.settingsRevision !== this.settingsRevision ||
        typeof detail.audioEnabled !== "boolean" || detail.audioEnabled === this.settings.audioEnabled) return;
    void this.updateSettings({ audioEnabled: detail.audioEnabled });
  };

  private handleHomeSelection = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (detail === null || typeof detail !== "object" || !("ownerId" in detail) ||
        !("settingsRevision" in detail) || !("selectionRevision" in detail) ||
        !("appId" in detail) || !("enteredAt" in detail)) return;
    const owner = window[OWNER_KEY];
    if (!this.isEffectivelyEnabled() || !this.settings.homeEnabled ||
        !isTrailerHomeRoute(currentRoutePath()) || owner?.ownerId !== this.ownerId ||
        detail?.ownerId !== this.ownerId || detail.settingsRevision !== this.settingsRevision ||
        typeof detail.selectionRevision !== "number" ||
        !Number.isSafeInteger(detail.selectionRevision) || detail.selectionRevision < 0) return;
    if (detail.appId !== null && (typeof detail.appId !== "number" || !Number.isInteger(detail.appId) ||
        detail.appId <= 0 || detail.appId > 0xffffffff || typeof detail.enteredAt !== "number" ||
        !Number.isSafeInteger(detail.enteredAt) || detail.enteredAt < 0)) return;
    if (detail.selectionRevision <= this.homeSelectionRevision) return;
    this.homeSelectionRevision = detail.selectionRevision;
    this.homeSelection = typeof detail.appId === "number" && typeof detail.enteredAt === "number" ? {
      appId: detail.appId, selectionRevision: detail.selectionRevision, enteredAt: detail.enteredAt,
    } : null;
    this.cancelHomeDelay();
    this.identityRequestEpoch += 1;
    this.resetPlaybackIdentity();
    this.settingsRevision += 1;
    this.publishOwner();
    if (!this.updateReachableRuntimes()) void this.runInSteamTab(runtimeMissingScript);
    if (this.homeSelection) this.scheduleHomeIdentity();
    this.emit();
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
    window.addEventListener(HOME_SELECTION_EVENT, this.handleHomeSelection);
    this.unsubscribeMatchChanges = subscribeMetadataMatchChanges((appId, revision) => {
      this.matchRevision = revision;
      if (appId === this.pageAppId) void this.refreshPageIdentity();
      else this.emit();
    });
    void this.loadSettings();
    this.emit();
  }

  /** Stop local playback ownership before any best-effort remote cleanup. */
  stop() {
    if (!this.mounted) return;
    this.mounted = false;
    this.ignRequestEpoch += 1;
    this.identityRequestEpoch += 1;
    this.cancelHomeDelay();
    this.homeSelection = null;
    window.removeEventListener(HOME_SELECTION_EVENT, this.handleHomeSelection);
    this.unsubscribeConflicts?.();
    this.unsubscribeConflicts = undefined;
    this.ignRequested = false;
    this.ignLookup = null;
    this.ignFallback = undefined;
    if (this.statusTimer !== undefined) window.clearInterval(this.statusTimer);
    this.statusTimer = undefined;
    this.unsubscribeMatchChanges?.();
    this.unsubscribeMatchChanges = undefined;
    const owner = window[OWNER_KEY];
    if (owner?.ownerId === this.ownerId) owner.active = false;
    for (const [target, listener] of this.audioWindows) {
      try { target.removeEventListener(AUDIO_CHANGE_EVENT, listener); } catch { }
    }
    this.audioWindows.clear();
    for (const doc of steamUiDocuments()) {
      try {
        const target = doc.defaultView;
        const runtime = target?.[RUNTIME_KEY];
        if (runtime?.ownerId !== this.ownerId || typeof runtime.destroy !== "function") continue;
        runtime.destroy();
        if (target?.[RUNTIME_KEY] === runtime) delete target[RUNTIME_KEY];
      } catch { /* Direct teardown is best effort for closing Steam windows. */ }
    }
    if (window[OWNER_KEY]?.ownerId === this.ownerId) delete window[OWNER_KEY];
    const ownerId = JSON.stringify(this.ownerId);
    const cleanup = `(() => { const runtime=window.${RUNTIME_KEY}; if(runtime?.ownerId!==${ownerId}) return {status:'Steam UI unavailable',runtimeMissing:true}; runtime.destroy?.(); if(window.${RUNTIME_KEY}===runtime) delete window.${RUNTIME_KEY}; return {status:'Trailer runtime removed'}; })()`;
    void evalInBigPicture(cleanup).catch(() => undefined);
    this.listeners.clear();
  }

  setEnabled(enabled: boolean) {
    return this.updateSettings({ enabled });
  }

  setDetailEnabled(detailEnabled: boolean) {
    return this.updateSettings({ detailEnabled });
  }

  setHomeEnabled(homeEnabled: boolean) {
    return this.updateSettings({ homeEnabled });
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
  setDetailFadeInDelaySeconds(detailFadeInDelaySeconds: number) {
    return this.updateSettings({ detailFadeInDelaySeconds });
  }

  setHomeFadeInDelaySeconds(homeFadeInDelaySeconds: number) {
    return this.updateSettings({ homeFadeInDelaySeconds });
  }

  private isEffectivelyEnabled(): boolean {
    return this.mounted && this.settingsLoaded && this.settings.enabled &&
      (this.settings.detailEnabled || this.settings.homeEnabled) && !this.conflict.pluginName;
  }

  private effectiveSettings(): TrailerSettings {
    const enabled = this.isEffectivelyEnabled();
    return enabled === this.settings.enabled ? this.settings : { ...this.settings, enabled };
  }

  private syncPolling() {
    if (this.isEffectivelyEnabled()) {
      if (this.statusTimer === undefined) {
        this.statusTimer = window.setInterval(() => void this.poll(), POLL_INTERVAL_MS);
      }
    } else {
      if (this.statusTimer !== undefined) window.clearInterval(this.statusTimer);
      this.statusTimer = undefined;
      this.cancelHomeDelay();
    }
  }

  private cancelHomeDelay() {
    if (this.homeDelayTimer !== undefined) window.clearTimeout(this.homeDelayTimer);
    this.homeDelayTimer = undefined;
  }

  private scheduleHomeIdentity() {
    this.cancelHomeDelay();
    const selection = this.homeSelection;
    if (!selection || !this.isEffectivelyEnabled() || !this.settings.homeEnabled) return;
    const delay = Math.max(0, this.settings.homeFadeInDelaySeconds * 1000 - (Date.now() - selection.enteredAt));
    this.status = "Waiting to show the Home trailer";
    this.homeDelayTimer = window.setTimeout(() => {
      this.homeDelayTimer = undefined;
      if (this.homeSelection !== selection || !isTrailerHomeRoute(currentRoutePath())) return;
      void this.refreshPageIdentity();
    }, delay);
  }

  private resetPlaybackIdentity() {
    this.ignRequestEpoch += 1;
    this.ignRequested = false;
    this.ignLookup = null;
    this.ignFallback = undefined;
    this.identity = null;
    this.runtimeSnapshot = undefined;
  }

  private syncConflict(): void {
    const next = this.conflicts.getConflict("trailers");
    if (next.pluginName === this.conflict.pluginName &&
        next.detectionAvailable === this.conflict.detectionAvailable) return;
    const wasEnabled = this.isEffectivelyEnabled();
    this.conflict = next;
    if (wasEnabled !== this.isEffectivelyEnabled()) {
      this.identityRequestEpoch += 1;
      this.homeSelection = null;
      this.cancelHomeDelay();
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
    this.syncPolling();
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
      this.syncPolling();
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
    if (next.enabled === previous.enabled && next.detailEnabled === previous.detailEnabled &&
        next.homeEnabled === previous.homeEnabled && next.audioEnabled === previous.audioEnabled &&
        next.hideLogoDuringTrailer === previous.hideLogoDuringTrailer && next.quality === previous.quality &&
        next.detailFadeInDelaySeconds === previous.detailFadeInDelaySeconds &&
        next.homeFadeInDelaySeconds === previous.homeFadeInDelaySeconds) {
      return true;
    }
    this.settings = next;
    const ownerId = this.ownerId;
    const transactionId = ++this.settingsTransactionId;
    this.pendingSettingsWrites += 1;
    this.settingsBusy = true;
    this.settingsError = "";
    this.syncPolling();
    if (!this.isEffectivelyEnabled() || !next.homeEnabled) {
      this.homeSelection = null;
      this.cancelHomeDelay();
    } else if (next.homeFadeInDelaySeconds !== previous.homeFadeInDelaySeconds && this.homeSelection && !this.identity) {
      this.scheduleHomeIdentity();
    }
    if (!this.isEffectivelyEnabled() || (this.identity?.view === "detail" && !next.detailEnabled) ||
        (this.identity?.view === "home" && !next.homeEnabled)) {
      this.identityRequestEpoch += 1;
      this.resetPlaybackIdentity();
    }
    this.settingsRevision += 1;
    this.publishOwner();
    const direct = this.updateReachableRuntimes();
    this.status = !next.enabled ? "Disabled" : next.detailEnabled || next.homeEnabled
      ? "Checking the current game" : "Detail and Home trailers are off";
    this.emit();
    if (!direct) void this.runInSteamTab(runtimeMissingScript);
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
        this.syncPolling();
        if (!this.settings.homeEnabled || !this.isEffectivelyEnabled()) {
          this.homeSelection = null;
          this.cancelHomeDelay();
        }
        if (!this.isEffectivelyEnabled() ||
            (this.identity?.view === "detail" && !this.settings.detailEnabled) ||
            (this.identity?.view === "home" && !this.settings.homeEnabled)) {
          this.identityRequestEpoch += 1;
          this.resetPlaybackIdentity();
        }
        this.settingsRevision += 1;
        this.publishOwner();
        if (!this.updateReachableRuntimes()) void this.runInSteamTab(runtimeMissingScript);
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
    const owner = window[OWNER_KEY];
    return this.mounted && this.ownerId === ownerId && owner?.ownerId === ownerId && owner.active;
  }

  private publishOwner() {
    const record: OwnerRecord = {
      ownerId: this.ownerId,
      active: this.mounted,
      settings: { ...this.settings, enabled: this.isEffectivelyEnabled() },
      settingsRevision: this.settingsRevision,
      homeSelectionRevision: this.homeSelectionRevision,
      identity: this.identity,
      ignFallback: this.ignFallback,
    };
    window[OWNER_KEY] = record;
  }

  private destroyOlderRuntimes() {
    for (const doc of steamUiDocuments()) {
      try {
        const target = doc.defaultView;
        const runtime = target?.[RUNTIME_KEY];
        if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId === this.ownerId ||
            typeof runtime.destroy !== "function") continue;
        runtime.destroy();
        if (target?.[RUNTIME_KEY] === runtime) delete target[RUNTIME_KEY];
      } catch { /* A closing window does not own this mount. */ }
    }
  }

  private refreshAudioListeners() {
    const current = new Set<Window>([window]);
    for (const doc of steamUiDocuments()) {
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
    if (!this.isEffectivelyEnabled()) return { identity: null, status: "Disabled" };
    const home = isTrailerHomeRoute(route);
    const selection = home ? this.homeSelection : null;
    if (home && !this.settings.homeEnabled) return { identity: null, status: "Home view trailers are off" };
    if (home && !selection) {
      return { identity: null, status: "Select or hover over a game on Home" };
    }
    if (home && selection && Date.now() - selection.enteredAt < this.settings.homeFadeInDelaySeconds * 1000) {
      if (this.homeDelayTimer === undefined) this.scheduleHomeIdentity();
      return { identity: null, status: "Waiting to show the Home trailer" };
    }
    if (!home && !this.settings.detailEnabled) return { identity: null, status: "Detail view trailers are off" };
    const pageAppId = home ? selection!.appId : parseTrailerRootRoute(route);
    if (!pageAppId) return { identity: null, status: "Open a game's main Steam Library page or select a game on Home" };
    if (pageAppId !== this.pageAppId) {
      this.pageAppId = pageAppId;
      this.pageOverview = null;
    }
    if (this.pageOverview === null || typeof this.pageOverview !== "object" ||
        !("appid" in this.pageOverview) || Number(this.pageOverview.appid) !== pageAppId) {
      this.pageOverview = getNativeOverview(pageAppId);
    }
    if (this.pageOverview === null || typeof this.pageOverview !== "object" ||
        !("appid" in this.pageOverview) || Number(this.pageOverview.appid) !== pageAppId) {
      return { identity: null, status: "Steam game is not available" };
    }
    if (pageAppId >= SHORTCUT_APP_ID_BOUNDARY && !isNativeNonSteamShortcut(this.pageOverview)) {
      return { identity: null, status: "This game is not a native non-Steam shortcut" };
    }
    if (pageAppId >= SHORTCUT_APP_ID_BOUNDARY && !metadataState.metadataLoaded) {
      try { await ensureMetadataCache(); }
      catch { return { identity: null, status: "Saved Steam matches are not available" }; }
      if (!this.isEffectivelyEnabled()) return { identity: null, status: "Disabled" };
    }
    const metadata = metadataCache[String(pageAppId)] ?? null;
    const context = {
      overview: this.pageOverview, metadata,
      hydrated: pageAppId < SHORTCUT_APP_ID_BOUNDARY || metadataState.metadataLoaded,
    };
    const resolved = home
      ? resolveTrailerAppSource({ ...context, appId: pageAppId })
      : resolveTrailerSource({ ...context, route, heroAppId: pageAppId });
    if (!resolved) return { identity: null, status: "Game trailer is unavailable" };
    const gameUrl = ignGameUrl(metadata);
    const title = nativeTrailerGameTitle(this.pageOverview) ||
      (typeof metadata?.title === "string" ? metadata.title.trim() : "") ||
      (gameUrl ? gameUrl.slice(gameUrl.lastIndexOf("/") + 1) : "");
    return {
      identity: {
        view: home ? "home" : "detail",
        pageAppId: resolved.pageAppId, sourceAppId: resolved.sourceAppId,
        ...(selection ? { selectionRevision: selection.selectionRevision, enteredAt: selection.enteredAt } : {}),
      },
      ignLookup: title ? { title, gameUrl } : null,
      status: resolved.sourceAppId === null ? "Waiting for an IGN game trailer" : "Waiting for a Steam trailer",
    };
  }

  private async refreshPageIdentity() {
    if (!this.mounted) return;
    const epoch = ++this.identityRequestEpoch;
    const route = currentRoutePath();
    const selection = this.homeSelection;
    const next = await this.resolveCurrentIdentity();
    if (!this.mounted || epoch !== this.identityRequestEpoch ||
        route !== currentRoutePath() || (isTrailerHomeRoute(route) && selection !== this.homeSelection)) return;
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
    for (const doc of steamUiDocuments()) {
      try {
        const runtime = doc.defaultView?.[RUNTIME_KEY];
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
    for (const doc of steamUiDocuments()) {
      try {
        const runtime = doc.defaultView?.[RUNTIME_KEY];
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
    if (!this.isEffectivelyEnabled() || (!this.identity && !this.settings.homeEnabled)) return;
    if (this.installInFlight) {
      this.pendingInstall = true;
      return;
    }
    const ownerId = this.ownerId;
    this.installInFlight = true;
    try {
      do {
        this.pendingInstall = false;
        if (!this.isEffectivelyEnabled() || (!this.identity && !this.settings.homeEnabled)) return;
        const result = await this.runInSteamTab(this.buildInstallScript());
        if (!this.mounted || this.ownerId !== ownerId || window[OWNER_KEY]?.ownerId !== ownerId) return;
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
      this.syncPolling();
      if (!this.isEffectivelyEnabled() || this.installInFlight) return;
      if (this.settings.homeEnabled && !this.identity && !this.readReachableRuntime()) {
        await this.installOrUpdate();
        return;
      }
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
