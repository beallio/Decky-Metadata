import { findModuleChild } from "@decky/ui";
import {
  autoFetchMetadata,
  fetchMetadata,
  frontendLog,
  getAllMetadata,
  getCompatibilityDefault,
  getCompatibilityDefaultMatchedOnly,
  saveMetadata,
} from "../backend";
import { clearDeckyNativeActivityForApp } from "./activity";
import { decideBIsModOrShortcut } from "./spoofDecision";
import { withInCallTruth } from "./inCallTruth";
import { hasMatchedSteamAppId, reassertMatchedAppData } from "./detailsReassert";
import { DeckCompatibilityCategory, MetadataData } from "../types";
import * as log from "../log";
import {
  NON_STEAM_APP_TYPE,
  Unpatch,
  appName,
  canRecoverStaleGameDetailRoute,
  cleanTitle,
  currentRoutePath,
  gameDetailAppIdFromPath,
  getNativeOverview,
  getOverview,
  isCompatibilityLifecycleCurrent,
  isCurrentMatchedRenderRoute,
  isCurrentGameInfoRoute,
  isNonSteamApp,
  isNativeNonSteamShortcut,
  isNonSteamAppWithoutPatchedMethod,
  metadataCache,
  notifyCompatibilityRevision,
  patchMethod,
  safeAfterPatch,
  consumeRouteShield,
  metadataState,
} from "./core";

declare const appStore: any;
declare const appDetailsStore: any;
declare const appDetailsCache: any;

let bypassTraceEnabled = false;
const bypassArmTraceAt: Record<string, number> = {};

const bIsModTraceAt: Record<string, number> = {};
const traceBIsModDecision = (
  appId: number,
  path: string,
  originalRet: any,
  finalRet: boolean,
  reason: string,
  shieldState: any,
  bypassCounterBefore: number,
  bypassCounterAfter: number,
  hasCache: boolean,
  isCurrentMatchedRenderRoute: boolean
) => {
  if (!bypassTraceEnabled) return;
  const now = Date.now();
  const key = `${appId}-${reason}`;
  if (now - (bIsModTraceAt[key] || 0) < 1000) return;
  bIsModTraceAt[key] = now;
  void frontendLog("trace", "BIsModOrShortcut decision", {
    appId,
    path,
    originalRet,
    finalRet,
    reason,
    shieldState,
    bypassCounterBefore,
    bypassCounterAfter,
    hasCache,
    isCurrentMatchedRenderRoute,
  }).catch(() => undefined);
};


export const setBypassTraceEnabled = (enabled: boolean) => {
  bypassTraceEnabled = !!enabled;
  if (!bypassTraceEnabled) {
    Object.keys(bypassArmTraceAt).forEach((key) => delete bypassArmTraceAt[key]);
    Object.keys(bIsModTraceAt).forEach((key) => delete bIsModTraceAt[key]);
  }
};

export const isBypassTraceEnabled = () => bypassTraceEnabled;

const traceBypassArm = (source: "GetPerClientData" | "BHasRecentlyLaunched") => {
  if (!bypassTraceEnabled) return;
  const now = Date.now();
  if (now - (bypassArmTraceAt[source] || 0) < 1000) return;
  bypassArmTraceAt[source] = now;
  void frontendLog("trace", "bypass armed", { source }).catch(() => undefined);
};

const traceBypassTruthWindowHit = (appId: number, bypassCounter: number) => {
  if (!bypassTraceEnabled) return;
  if (!Number.isFinite(appId) || !metadataCache[String(appId)]) return;
  const routeAppId = gameDetailAppIdFromPath(currentRoutePath());
  if (routeAppId !== appId) return;
  void frontendLog("trace", "bypass truth window hit", { appId, bypassCounter }).catch(() => undefined);
};

const shortcutAppIdForSteamAppId = (steamAppId: number): number | null => {
  if (!Number.isFinite(steamAppId) || steamAppId <= 0) return null;
  for (const [shortcutAppIdText, metadata] of Object.entries(metadataCache)) {
    const shortcutAppId = Number(shortcutAppIdText);
    const metadataSteamAppId = Number((metadata as MetadataData | undefined)?.steam_appid);
    if (
      Number.isFinite(shortcutAppId) &&
      shortcutAppId > 0 &&
      metadataSteamAppId === steamAppId
    ) {
      return shortcutAppId;
    }
  }
  return null;
};

const ensureDetailsOverviewSafeFields = (appId: number) => {
  try {
    const appData = appDetailsStore?.GetAppData?.(appId);
    const details = appData?.details;
    const overview = getOverview(appId);
    if (!details || !isNonSteamApp(overview)) return;

    const detailsAppId = Number(details.unAppID ?? details.appid ?? details.nAppID ?? 0);
    const detailsOverview = Number.isFinite(detailsAppId) && detailsAppId > 0 ? getOverview(detailsAppId) : null;

    // Steam's play bar calls GetAppOverviewByAppID(details.unAppID).BIsApplicationOrTool().
    // For non-Steam games that have been enriched with official Steam data, the first
    // page render can temporarily expose a details object whose unAppID points nowhere
    // in the local library. Keep it tied to the actual shortcut AppID so SteamUI never
    // dereferences a null overview during the first open.
    if (!detailsOverview) {
      details.unAppID = appId;
    }

    // Some SteamUI reactions iterate these arrays while details are still being
    // bootstrapped. Non-Steam shortcut details can miss them on first render.
    if (!Array.isArray(details.vecDLC)) details.vecDLC = [];
    if (!Array.isArray(details.vecChildConfigApps)) details.vecChildConfigApps = [];
    if (!Array.isArray(details.vecScreenShots)) details.vecScreenShots = [];

    if (details.appid == null) details.appid = appId;
    if (details.nAppID == null) details.nAppID = appId;
  } catch (_error) {
    // Best-effort guard only; never block Steam's native bootstrap.
  }
};


const isCompatibilityCategory = (value: unknown): value is DeckCompatibilityCategory =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;

export const effectiveCompatibilityCategory = (
  metadata: MetadataData | undefined,
  globalDefault: DeckCompatibilityCategory | null = metadataState.compatibilityDefault,
  matchedOnly: boolean = metadataState.compatibilityDefaultMatchedOnly,
): DeckCompatibilityCategory | null => {
  if (isCompatibilityCategory(metadata?.deck_compat_override)) {
    return metadata.deck_compat_override;
  }
  if (metadata?.deck_compat_override === "valve") {
    return isCompatibilityCategory(metadata.deck_compat_category)
      ? metadata.deck_compat_category
      : null;
  }
  // The matched-games-only scope keeps the global default off shortcuts the
  // plugin has no record for. A record without a Steam match still counts;
  // both remaining sources below live in a record anyway.
  if (isCompatibilityCategory(globalDefault) && (!matchedOnly || metadata !== undefined)) {
    return globalDefault;
  }
  if (isCompatibilityCategory(metadata?.deck_compat_category)) {
    return metadata.deck_compat_category;
  }
  return null;
};

const packedCompatibilityValue = (overview: any): number => {
  const packed = Number(overview?.steam_hw_compat_category_packed);
  return Number.isFinite(packed) ? packed : 0;
};

const restoreCompatibilityBaseline = (appId: number, overview = getNativeOverview(appId)): boolean => {
  const key = String(appId);
  if (
    !isNativeNonSteamShortcut(overview) ||
    !Object.prototype.hasOwnProperty.call(metadataState.compatibilityBaselines, key)
  ) {
    return false;
  }
  try {
    const packed = packedCompatibilityValue(overview);
    overview.steam_hw_compat_category_packed =
      (packed & ~0xf) | metadataState.compatibilityBaselines[key];
    delete metadataState.compatibilityBaselines[key];
    return true;
  } catch (_error) {
    return false;
  }
};

export const restoreAllCompatibilityBaselines = () => {
  const overviews = new Map<number, any>();
  try {
    Array.from(appStore?.allApps || []).forEach((overview: any) => {
      if (isNativeNonSteamShortcut(overview)) overviews.set(Number(overview.appid), overview);
    });
  } catch {
    // A changed store leaves untouched baselines for a later native update.
  }
  Object.keys(metadataState.compatibilityBaselines).forEach((key) => {
    restoreCompatibilityBaseline(Number(key), overviews.get(Number(key)));
  });
};

/** Publish a compatibility revision without disturbing Steam navigation state. */
export const refreshCompatibilitySurfaces = () => {
  return notifyCompatibilityRevision();
};

const applyCompatibilityCategory = (
  appId: number,
  overview: any,
  category: DeckCompatibilityCategory | null
) => {
  if (category === null) {
    return restoreCompatibilityBaseline(appId, overview);
  }
  try {
    const key = String(appId);
    const previousPacked = packedCompatibilityValue(overview);
    if (!Object.prototype.hasOwnProperty.call(metadataState.compatibilityBaselines, key)) {
      metadataState.compatibilityBaselines[key] = previousPacked & 0xf;
    }
    // bits 0-1 = steam_deck_compat_category; bits 2-3 = Steam's verified-filter copy.
    // Keep bits >= 4 from Steam's original packed state.
    const nextPacked =
      (previousPacked & ~0xf) | category | (category << 2);
    if (nextPacked === previousPacked) return false;
    overview.steam_hw_compat_category_packed = nextPacked;
    return packedCompatibilityValue(overview) === nextPacked;
  } catch {
    // Steam objects are not always writable during early bootstrap.
    return false;
  }
};

const desiredCompatibilityNibble = (
  appId: number,
  heldNibble: number,
  category: DeckCompatibilityCategory | null,
) => {
  if (category === null) {
    const baseline = metadataState.compatibilityBaselines[String(appId)];
    return Number.isInteger(baseline) && baseline >= 0 && baseline <= 0xf
      ? baseline
      : heldNibble;
  }
  return category | (category << 2);
};

type DeferredCompatibilityUpdate = {
  appId: number;
  heldNibble: number;
};

const deferredCompatibilityUpdates = new Map<number, DeferredCompatibilityUpdate>();
// Editor writes must not replace Steam's observable overview map until the
// matching Game Info route has rendered under its return shield. The direct
// packed-field write is already complete; this set tracks only the delayed
// collection/filter publication.
const deferredEditorCompatibilityPublications = new Set<number>();

/**
 * Hold only the exact selected Game Info tab. QAM and context-menu overlays do
 * not change this main-window route, while another tab, page, game, or the
 * metadata editor does.
 */
const deferActiveCompatibilityUpdate = (
  appId: number,
  heldNibble: number,
  category: DeckCompatibilityCategory | null,
) => {
  const existing = deferredCompatibilityUpdates.get(appId);
  const held = existing?.heldNibble ?? heldNibble;
  if (desiredCompatibilityNibble(appId, held, category) === held) {
    // Repeated edits can return to the already visible state. There is then no
    // stale mutation to replay after the user leaves Game Info.
    deferredCompatibilityUpdates.delete(appId);
    return false;
  }
  if (!existing) deferredCompatibilityUpdates.set(appId, { appId, heldNibble: held });
  return true;
};

/**
 * Apply only compatibility data to an exact native overview object. Steam can
 * replace this non-observable object between callers, so the app-store getter
 * uses this same helper before it returns a replacement to SteamUI.
 */
const applyCompatibilityToOverview = (
  appId: number,
  overview: any,
  routeContext = currentRoutePath(),
) => {
  if (Number(overview?.appid) !== Number(appId) || !isNativeNonSteamShortcut(overview)) {
    return false;
  }
  const metadata = metadataCache[String(appId)];
  const category = effectiveCompatibilityCategory(metadata, metadataState.compatibilityDefault);
  if (isCurrentGameInfoRoute(routeContext, appId)) {
    const packed = packedCompatibilityValue(overview);
    const heldNibble = packed & 0xf;
    // Read the retained held value before deferring. The helper can remove a
    // pending entry when the latest policy returns to that held value, while a
    // native replacement still needs the held nibble reconciled in place.
    const held = deferredCompatibilityUpdates.get(appId)?.heldNibble ?? heldNibble;
    deferActiveCompatibilityUpdate(appId, held, category);
    const heldPacked = (packed & ~0xf) | held;
    if (heldPacked === packed) return false;
    try {
      // Reload adoption can find a replacement native object after the old
      // hook lifetime ended. Restore only the held view state in place: the
      // pending policy still waits for Game Info to exit, and this active
      // object must not be republished under a new identity.
      overview.steam_hw_compat_category_packed = heldPacked;
    } catch {
      // Steam can replace this private object while the active view is held.
    }
    return false;
  }
  deferredCompatibilityUpdates.delete(appId);
  return applyCompatibilityCategory(appId, overview, category);
};

type CompatibilityPublication = { appId: number; overview: any };

const RETAINED_COMPATIBILITY_BASELINES_KEY = "__deckyMetadataRetainedCompatibilityBaselines";

export const retainCompatibilityBaselinesForReload = () => {
  const baselines = metadataState.compatibilityBaselines;
  if (
    Object.keys(baselines).length === 0 &&
    deferredCompatibilityUpdates.size === 0 &&
    deferredEditorCompatibilityPublications.size === 0
  ) return;
  (globalThis as Record<string, unknown>)[RETAINED_COMPATIBILITY_BASELINES_KEY] = {
    baselines: { ...baselines },
    deferred: Array.from(deferredCompatibilityUpdates.values()),
    editorPublications: Array.from(deferredEditorCompatibilityPublications),
  };
};

export const discardRetainedCompatibilityState = () => {
  delete (globalThis as Record<string, unknown>)[RETAINED_COMPATIBILITY_BASELINES_KEY];
};

const resumeRetainedCompatibilityBaselines = () => {
  const host = globalThis as Record<string, unknown>;
  const retained = host[RETAINED_COMPATIBILITY_BASELINES_KEY];
  if (!retained || typeof retained !== "object") return;
  const state = retained as {
    baselines?: Record<string, unknown>;
    deferred?: Array<Partial<DeferredCompatibilityUpdate>>;
    editorPublications?: unknown[];
  };
  // Accept the bare baseline record written by the preceding plugin version so
  // an in-place import from that version remains safe.
  const baselines = state.baselines && typeof state.baselines === "object"
    ? state.baselines
    : retained as Record<string, unknown>;
  Object.entries(baselines).forEach(([appId, value]) => {
    if (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xf) {
      metadataState.compatibilityBaselines[appId] = Number(value);
    }
  });
  if (Array.isArray(state.deferred)) {
    state.deferred.forEach(({ appId, heldNibble }) => {
      if (
        Number.isSafeInteger(appId) &&
        Number(appId) > 0 &&
        Number.isInteger(heldNibble) &&
        Number(heldNibble) >= 0 &&
        Number(heldNibble) <= 0xf
      ) {
        deferredCompatibilityUpdates.set(Number(appId), {
          appId: Number(appId),
          heldNibble: Number(heldNibble),
        });
      }
    });
  }
  if (Array.isArray(state.editorPublications)) {
    state.editorPublications.forEach((appId) => {
      if (Number.isSafeInteger(appId) && Number(appId) > 0) {
        deferredEditorCompatibilityPublications.add(Number(appId));
      }
    });
  }
  discardRetainedCompatibilityState();
};

const createCompatibilityReplacement = (overview: any) => {
  const prototype = Object.getPrototypeOf(overview);
  const NativeOverview = overview?.constructor;
  if (!prototype || typeof NativeOverview !== "function") return null;
  try {
    // Publish through Steam's observable native map with a fresh native
    // instance. Constructor-owned state must stay on that instance, while
    // copied fields retain the exact shortcut identity and packed policy.
    const replacement = new NativeOverview();
    if (!replacement || Object.getPrototypeOf(replacement) !== prototype) return null;
    if (
      typeof overview.BHasObservables === "function" &&
      typeof replacement.BHasObservables === "function" &&
      overview.BHasObservables() !== replacement.BHasObservables()
    ) {
      return null;
    }
    Object.keys(overview).forEach((key) => {
      if (key !== "LOG_CHANGE") replacement[key] = overview[key];
    });
    replacement.RestorePreservedState?.(overview.GetPreservedState?.());
    return replacement;
  } catch {
    // A changed native constructor leaves the current map entry untouched.
    return null;
  }
};

/**
 * Steam's compatibility collections observe m_mapApps, not the plugin's
 * revision listeners. Publish only after a completed linear write batch.
 */
const publishCompatibilityReplacements = (updates: Iterable<CompatibilityPublication>) => {
  let published = false;
  try {
    const overviews = appStore?.m_mapApps;
    if (!overviews || typeof overviews.get !== "function" || typeof overviews.set !== "function") return false;
    for (const { appId, overview } of updates) {
      // Never publish a stale entry, an alias, or an official Steam overview.
      if (overviews.get(appId) !== overview || !isNativeNonSteamShortcut(overview)) continue;
      const replacement = createCompatibilityReplacement(overview);
      if (!replacement) continue;
      // Another plugin can decorate the observable map setter and retain the
      // native setter as `originalSet`. This replacement already copies every
      // current native field, so re-entering a foreign decorator can replay
      // its side effects against a live Game Info tree during plugin reload.
      // Publish through the preserved native setter when it is explicitly
      // available; it still emits the map replacement Steam filters observe.
      const nativeSet = overviews.originalSet;
      if (typeof nativeSet === "function" && nativeSet !== overviews.set) {
        nativeSet.call(overviews, appId, replacement);
      } else {
        overviews.set(appId, replacement);
      }
      published = true;
    }
  } catch {
    // Steam can replace this private map during a batch. The current objects
    // remain correct, and a later policy or metadata update can publish again.
  }
  return published;
};

/**
 * Complete one editor-originated Steam collection update after its exact Game
 * Info tree has re-entered. The return shield is armed by the caller first so
 * this map replacement cannot be classified as the non-Steam placeholder.
 */
export const publishDeferredEditorCompatibility = (appId: number) => {
  if (!deferredEditorCompatibilityPublications.has(appId)) return false;
  const overview = getNativeOverview(appId);
  if (!overview || !isNativeNonSteamShortcut(overview)) {
    // A deleted shortcut or an official alias must never be recreated.
    deferredEditorCompatibilityPublications.delete(appId);
    return false;
  }
  if (!publishCompatibilityReplacements([{ appId, overview }])) return false;
  deferredEditorCompatibilityPublications.delete(appId);
  return true;
};

/**
 * Recompute pending work after the main Game Info view exits. A history
 * callback supplies its new location directly, because the joined route
 * snapshot can still include the old Game Info path during navigation.
 */
export const flushDeferredCompatibilityPublications = (routeContext = currentRoutePath()) => {
  const publications: CompatibilityPublication[] = [];
  let changed = false;
  for (const { appId } of Array.from(deferredCompatibilityUpdates.values())) {
    if (isCurrentGameInfoRoute(routeContext, appId)) continue;
    const metadata = metadataCache[String(appId)];
    // An inheriting shortcut cannot safely resolve until its persisted global
    // default has loaded. Explicit and Follow Valve choices are independent.
    if (
      !metadataState.compatibilityDefaultLoaded &&
      !isCompatibilityCategory(metadata?.deck_compat_override) &&
      metadata?.deck_compat_override !== "valve"
    ) {
      continue;
    }
    deferredCompatibilityUpdates.delete(appId);
    const overview = getNativeOverview(appId);
    if (applyCompatibilityToOverview(appId, overview, routeContext)) {
      changed = true;
      publications.push({ appId, overview });
    }
  }
  publishCompatibilityReplacements(publications);
  if (changed) notifyCompatibilityRevision();
  return changed;
};

const nativeShortcutOverviewsById = () => {
  const overviews = new Map<number, any>();
  try {
    Array.from(appStore?.allApps || []).forEach((overview: any) => {
      const appId = Number(overview?.appid);
      if (Number.isFinite(appId) && appId > 0 && isNativeNonSteamShortcut(overview)) {
        overviews.set(appId, overview);
      }
    });
  } catch {
    // Steam can replace its app list during bootstrap. The next bounded pass retries.
  }
  return overviews;
};

/** Apply the confirmed global policy in one linear pass over native shortcuts. */
export const applyCompatibilityDefault = () => {
  let changed = false;
  const publications: CompatibilityPublication[] = [];
  let overviews: any[] = [];
  try {
    overviews = Array.from(appStore?.allApps || []);
  } catch {
    return false;
  }
  overviews.forEach((overview) => {
    const appId = Number(overview?.appid);
    if (!Number.isFinite(appId) || appId <= 0) return;
    if (applyCompatibilityToOverview(appId, overview)) {
      changed = true;
      publications.push({ appId, overview });
    }
  });
  publishCompatibilityReplacements(publications);
  return changed;
};

/** Commit only a backend-confirmed setting, and invalidate older loads first. */
export const setConfirmedCompatibilityDefault = (
  category: DeckCompatibilityCategory | null,
  lifecycleGeneration = metadataState.compatibilityLifecycleGeneration,
) => {
  if (lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) {
    return metadataState.compatibilityDefault;
  }
  const changedPolicy = metadataState.compatibilityDefault !== category || !metadataState.compatibilityDefaultLoaded;
  metadataState.compatibilityDefaultGeneration += 1;
  metadataState.compatibilityDefault = category;
  metadataState.compatibilityDefaultLoaded = true;
  const compatibilityChanged = applyCompatibilityDefault();
  if (changedPolicy || compatibilityChanged) notifyCompatibilityRevision();
  return category;
};

/** Commit only a backend-confirmed scope, using the same one-pass policy path. */
export const setConfirmedCompatibilityDefaultMatchedOnly = (
  matchedOnly: boolean,
  lifecycleGeneration = metadataState.compatibilityLifecycleGeneration,
) => {
  if (lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) {
    return metadataState.compatibilityDefaultMatchedOnly;
  }
  const changedPolicy = metadataState.compatibilityDefaultMatchedOnly !== matchedOnly;
  metadataState.compatibilityDefaultGeneration += 1;
  metadataState.compatibilityDefaultMatchedOnly = matchedOnly;
  const compatibilityChanged = applyCompatibilityDefault();
  if (changedPolicy || compatibilityChanged) notifyCompatibilityRevision();
  return matchedOnly;
};

/** Start a new plugin lifetime and make unfinished work from the old one inert. */
export const beginCompatibilityLifecycle = () => {
  metadataState.compatibilityLifecycleGeneration += 1;
  metadataState.compatibilityDefaultGeneration += 1;
  metadataState.compatibilityDefault = null;
  metadataState.compatibilityDefaultLoaded = false;
  metadataState.compatibilityDefaultMatchedOnly = false;
  metadataState.compatibilityDefaultLoadPromise = null;
  metadataState.metadataLoadPromise = null;
  deferredCompatibilityUpdates.clear();
  deferredEditorCompatibilityPublications.clear();
  resumeRetainedCompatibilityBaselines();
  return metadataState.compatibilityLifecycleGeneration;
};

/** Load the shared setting once. A failed load remains an error, not Automatic. */
export const ensureCompatibilityDefault = async (): Promise<DeckCompatibilityCategory | null> => {
  if (metadataState.compatibilityDefaultLoaded) return metadataState.compatibilityDefault;
  if (!metadataState.compatibilityDefaultLoadPromise) {
    const requestGeneration = metadataState.compatibilityDefaultGeneration;
    const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
    // Both values are one policy. Publishing the category before the scope
    // would briefly apply the wrong policy to unmatched shortcuts, so they
    // load together and only then satisfy compatibilityDefaultLoaded.
    const request = Promise.all([
      getCompatibilityDefault(),
      getCompatibilityDefaultMatchedOnly(),
    ]).then(([value, matchedOnly]) => {
      const category = isCompatibilityCategory(value) ? value : null;
      if (
        requestGeneration !== metadataState.compatibilityDefaultGeneration ||
        lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration
      ) {
        return metadataState.compatibilityDefault;
      }
      metadataState.compatibilityDefault = category;
      metadataState.compatibilityDefaultMatchedOnly = matchedOnly === true;
      metadataState.compatibilityDefaultLoaded = true;
      applyCompatibilityDefault();
      notifyCompatibilityRevision();
      return category;
    });
    const loadPromise = request.finally(() => {
      if (metadataState.compatibilityDefaultLoadPromise === loadPromise) {
        metadataState.compatibilityDefaultLoadPromise = null;
      }
    });
    metadataState.compatibilityDefaultLoadPromise = loadPromise;
  }
  return metadataState.compatibilityDefaultLoadPromise;
};

/** Make a late settings request inert when the plugin unloads. */
export const cancelCompatibilityDefaultLoad = () => {
  metadataState.compatibilityDefaultGeneration += 1;
  metadataState.compatibilityLifecycleGeneration += 1;
  deferredCompatibilityUpdates.clear();
  deferredEditorCompatibilityPublications.clear();
};

/**
 * Steam sends AppOverview protobufs to appInfoStore before it creates and
 * publishes a replacement native object. Patch that input, rather than a
 * getter after publication, so the native object starts with the effective
 * category even though this field is non-observable.
 */
const applyCompatibilityToIncomingOverview = (overview: any) => {
  const appId = Number(overview?.appid?.());
  if (!Number.isFinite(appId) || appId <= 0) return false;
  const current = getNativeOverview(appId);
  const isIncomingShortcut = Number(overview?.app_type?.()) === NON_STEAM_APP_TYPE;
  if (!isIncomingShortcut && !isNativeNonSteamShortcut(current)) return false;

  const category = effectiveCompatibilityCategory(
    metadataCache[String(appId)],
    metadataState.compatibilityDefault,
  );
  const packed = Number(overview?.steam_hw_compat_category_packed?.());
  if (!Number.isFinite(packed) || typeof overview?.set_steam_hw_compat_category_packed !== "function") {
    return false;
  }
  if (isCurrentGameInfoRoute(currentRoutePath(), appId)) {
    const heldNibble = current ? packedCompatibilityValue(current) & 0xf : packed & 0xf;
    // Keep the retained Game Info value stable even if the latest policy
    // collapses the queued update and removes its map entry.
    const held = deferredCompatibilityUpdates.get(appId)?.heldNibble ?? heldNibble;
    deferActiveCompatibilityUpdate(appId, held, category);
    // An unchanged effective policy does not need a deferred exit flush, but
    // Steam can still send a replacement with its native low nibble. Preserve
    // the currently held Game Info state on that incoming object either way.
    const heldPacked = (packed & ~0xf) | held;
    if (heldPacked === packed) return false;
    try {
      overview.set_steam_hw_compat_category_packed(heldPacked);
      return Number(overview.steam_hw_compat_category_packed()) === heldPacked;
    } catch {
      return false;
    }
  }
  deferredCompatibilityUpdates.delete(appId);
  if (category === null) return false;
  const key = String(appId);
  if (!Object.prototype.hasOwnProperty.call(metadataState.compatibilityBaselines, key)) {
    metadataState.compatibilityBaselines[key] = current
      ? packedCompatibilityValue(current) & 0xf
      : packed & 0xf;
  }
  const nextPacked = (packed & ~0xf) | category | (category << 2);
  if (nextPacked === packed) return false;
  try {
    overview.set_steam_hw_compat_category_packed(nextPacked);
    return Number(overview.steam_hw_compat_category_packed()) === nextPacked;
  } catch {
    return false;
  }
};

export const refreshMetadataCache = async () => {
  const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
  const wasLoaded = metadataState.metadataLoaded;
  const all = await getAllMetadata();
  if (lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) return;
  const previousMetadata = { ...metadataCache };
  const affectedAppIds = new Set([
    ...Object.keys(previousMetadata),
    ...Object.keys(all || {}),
    // A restoration can fail while Steam is replacing an overview. Keep each
    // retained baseline in this one entry-based batch so a later refresh can
    // restore it without reverting to one whole-library scan per shortcut.
    ...Object.keys(metadataState.compatibilityBaselines),
  ]);
  const policyChanged = [...affectedAppIds].some((key) =>
    effectiveCompatibilityCategory(previousMetadata[key], metadataState.compatibilityDefault) !==
    effectiveCompatibilityCategory((all || {})[key], metadataState.compatibilityDefault)
  );
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  Object.assign(metadataCache, all || {});
  metadataState.metadataLoaded = true;
  const compatibilityChanged = applyMetadataBatch(affectedAppIds);
  // A first successful load must wake mounted cards even if Steam has not made
  // its overview writable yet. Later no-op refreshes stay quiet.
  if (compatibilityChanged || policyChanged || !wasLoaded) notifyCompatibilityRevision();
};

export const ensureMetadataCache = async () => {
  if (metadataState.metadataLoaded) return;
  if (!metadataState.metadataLoadPromise) {
    metadataState.metadataLoadPromise = refreshMetadataCache().finally(() => {
      metadataState.metadataLoadPromise = null;
    });
  }
  await metadataState.metadataLoadPromise;
};

export const startMetadataBootstrap = (): Unpatch => {
  let cancelled = false;
  let attempts = 0;
  const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
  const tick = async () => {
    if (cancelled || lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) return;
    try {
      await ensureMetadataCache();
      if (cancelled || lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) return;
      try {
        await ensureCompatibilityDefault();
      } catch (error) {
        // Metadata can still apply Valve/explicit choices while the setting is
        // unavailable. The QAM keeps the load as an error and cannot save it.
        log.warn("bridge", "compatibility default bootstrap failed", error);
      }
      if (cancelled || lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) return;
      const metadataChanged = applyMetadataBatch(Object.keys(metadataCache));
      const compatibilityChanged = applyCompatibilityDefault();
      if (metadataChanged || compatibilityChanged) notifyCompatibilityRevision();
    } catch (error) {
      log.warn("bridge", "metadata bootstrap failed", error);
    }
    attempts += 1;
    if (!cancelled && lifecycleGeneration === metadataState.compatibilityLifecycleGeneration && attempts < 24) {
      window.setTimeout(tick, 500);
    }
  };
  void tick();
  return () => {
    cancelled = true;
    if (lifecycleGeneration === metadataState.compatibilityLifecycleGeneration) {
      cancelCompatibilityDefaultLoad();
    }
  };
};

const applyMetadataToOverview = (appId: number, overview: any) => {
  if (!isNativeNonSteamShortcut(overview)) return false;
  const metadata = metadataCache[String(appId)];
  if (!metadata || !metadata.steam_news?.length) {
    clearDeckyNativeActivityForApp(appId);
  }
  if (!metadata) {
    const compatibilityChanged = applyCompatibilityToOverview(appId, overview);
    return compatibilityChanged;
  }

  let compatibilityChanged = false;
  try {
    if (typeof metadata.rating === "number") {
      overview.metacritic_score = metadata.rating;
    }
    compatibilityChanged = applyCompatibilityToOverview(appId, overview);
    if (!overview.m_setStoreCategories) {
      overview.m_setStoreCategories = new Set<number>();
    }
    metadata.store_categories?.forEach((category) => {
      overview.m_setStoreCategories.add(Number(category));
    });
  } catch {
    // Steam objects are not always writable during early bootstrap.
  }

  const appData = appDetailsStore?.GetAppData?.(appId);
  if (!appData) {
    return compatibilityChanged;
  }
  ensureDetailsOverviewSafeFields(appId);

  const screenshots = steamScreenshotsFromMetadata(appId, metadata);
  reassertMatchedAppData(appData, metadata, screenshots);

  try {
    const releaseDate = metadata.release_date;
    if (typeof releaseDate === "number" && releaseDate > 0) {
      overview.rt_original_release_date = releaseDate;
      overview.rt_steam_release_date = releaseDate;
    }
  } catch (_error) {
    // Steam objects are not always writable during early bootstrap.
  }

  if (screenshots.length) {
    const screenshotData = {
      rgScreenshots: screenshots,
      screenshots,
      vecScreenshots: screenshots,
      vecScreenShots: screenshots,
    };
    appData.screenshots = screenshotData;
  }

  const metadataKey = String(appId);
  if (metadataState.appliedMetadataRef[metadataKey] !== metadata) {
    try {
      appDetailsCache?.SetCachedDataForApp?.(
        appId,
        "descriptions",
        1,
        appData.descriptionsData
      );
      appDetailsCache?.SetCachedDataForApp?.(
        appId,
        "associations",
        1,
        appData.associationData
      );
      if (screenshots.length) {
        appDetailsCache?.SetCachedDataForApp?.(
          appId,
          "screenshots",
          1,
          appData.screenshots
        );
      }
      metadataState.appliedMetadataRef[metadataKey] = metadata;
    } catch (_error) {
      // Cache writes can fail if the page has not finished creating app data.
    }
  }
  return compatibilityChanged;
};

/** Apply metadata records through one native-app lookup, never one full scan per record. */
const applyMetadataBatch = (appIds: Iterable<string | number>) => {
  const overviews = nativeShortcutOverviewsById();
  let compatibilityChanged = false;
  const publications: CompatibilityPublication[] = [];
  for (const appIdValue of appIds) {
    const appId = Number(appIdValue);
    if (!Number.isFinite(appId) || appId <= 0) continue;
    const overview = overviews.get(appId);
    if (overview && applyMetadataToOverview(appId, overview)) {
      compatibilityChanged = true;
      publications.push({ appId, overview });
    }
  }
  publishCompatibilityReplacements(publications);
  return compatibilityChanged;
};

type ApplyMetadataOptions = {
  /**
   * The metadata editor can update a native overview while Steam is still
   * open or returning to Game Info. Publishing a replacement in that window
   * makes Steam classify it against stale editor route tokens and cache the
   * non-Steam placeholder. The direct native write remains immediate; queue
   * the observable-map replacement until the matching Game Info render arms
   * its concrete return shield.
   */
  publishCompatibility?: boolean;
};

export const applyMetadata = (appId: number, options: ApplyMetadataOptions = {}) => {
  const overview = getNativeOverview(appId);
  const compatibilityChanged = applyMetadataToOverview(appId, overview);
  if (compatibilityChanged && overview) {
    if (options.publishCompatibility === false) {
      deferredEditorCompatibilityPublications.add(appId);
    } else {
      publishCompatibilityReplacements([{ appId, overview }]);
    }
  }
  return compatibilityChanged;
};

const steamScreenshotsFromMetadata = (appId: number, metadata: MetadataData) =>
  (metadata.screenshots || [])
    .filter((image) => image?.url)
    .slice(0, 10)
    .map((image, index) => ({
      appid: appId,
      id: image.id || `${appId}-${index}`,
      nScreenshotID: index + 1,
      strCaption: image.caption || metadata.title || "",
      strImageURL: image.url,
      strThumbnailURL: image.url,
      strURL: image.url,
      url: image.url,
      nWidth: image.width || 1280,
      nHeight: image.height || 720,
      width: image.width || 1280,
      height: image.height || 720,
      bSpoiler: false,
    }));

export const tryFetchMetadataForApp = async (appId: number) => {
  const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
  await ensureMetadataCache();
  if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
  if (metadataCache[String(appId)] || metadataState.loadingMetadata.has(appId)) return;
  const overview = getOverview(appId);
  if (!isNonSteamApp(overview)) return;
  metadataState.loadingMetadata.add(appId);
  try {
    const metadata = await autoFetchMetadata(appId, appName(appId));
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
    if (metadata) {
      metadataCache[String(appId)] = metadata;
      applyMetadata(appId);
      notifyCompatibilityRevision();
    }
  } finally {
    metadataState.loadingMetadata.delete(appId);
  }
};

export const tryEnrichScreenshotsForApp = async (appId: number) => {
  const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
  await ensureMetadataCache();
  if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
  const metadata = metadataCache[String(appId)];
  if (
    !metadata ||
    metadata.screenshots?.length ||
    metadataState.loadingScreenshots.has(appId) ||
    String(metadata.source || "").toUpperCase() !== "IGN"
  ) {
    return;
  }
  const source = metadata.source_url || String(metadata.id || "");
  if (!source) return;
  metadataState.loadingScreenshots.add(appId);
  try {
    const refreshed = await fetchMetadata(source);
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
    if (refreshed?.screenshots?.length) {
      const saved = await saveMetadata(appId, {
        ...metadata,
        screenshots: refreshed.screenshots,
      });
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      metadataCache[String(appId)] = saved;
      applyMetadata(appId);
      notifyCompatibilityRevision();
    }
  } catch (error) {
    log.warn("bridge", "screenshot enrichment failed", error);
  } finally {
    metadataState.loadingScreenshots.delete(appId);
  }
};

export const installMetadataPatches = (unpatchers: Unpatch[]) => {
  const overviewProto = appStore?.allApps?.[0]?.__proto__;
  const detailsProto = appDetailsStore?.__proto__;
  const infoStore = (globalThis as any).appInfoStore;
  if (!overviewProto || !detailsProto) return;

  let incomingCompatibilityChanged = false;
  let updateOverviewPatched = false;
  let fallbackRevisionQueued = false;
  const publishFallbackCompatibilityRevision = () => {
    if (fallbackRevisionQueued) return;
    fallbackRevisionQueued = true;
    queueMicrotask(() => {
      fallbackRevisionQueued = false;
      if (!incomingCompatibilityChanged) return;
      incomingCompatibilityChanged = false;
      notifyCompatibilityRevision();
    });
  };
  if (infoStore?.OnAppOverviewChange) {
    unpatchers.push(
      patchMethod(infoStore, "OnAppOverviewChange", (_thisValue, original, args) => {
        const incoming = Array.isArray(args[0]) ? args[0] : [];
        incomingCompatibilityChanged = incoming.reduce(
          (changed: boolean, overview: any) => applyCompatibilityToIncomingOverview(overview) || changed,
          incomingCompatibilityChanged,
        );
        const result = original(...args);
        // Some Steam builds expose UpdateAppOverview as a read-only native
        // method. Publish once in a microtask after this input batch instead
        // of allowing that optional lifecycle hook to abort every Steam patch.
        if (!updateOverviewPatched && incomingCompatibilityChanged) {
          publishFallbackCompatibilityRevision();
        }
        return result;
      })
    );
  }

  if (appStore?.UpdateAppOverview) {
    try {
      unpatchers.push(
        patchMethod(appStore, "UpdateAppOverview", (_thisValue, original, args) => {
          incomingCompatibilityChanged = false;
          const result = original(...args);
          if (incomingCompatibilityChanged) notifyCompatibilityRevision();
          return result;
        })
      );
      updateOverviewPatched = true;
    } catch (error) {
      log.warn("bridge", "UpdateAppOverview patch unavailable; using input-batch revision", error);
    }
  }

  // GetAppData is the narrowest durable boundary around native details
  // replacements. Populate a new matched-shortcut details object before any
  // SteamUI caller can observe the transient shortcut-only version. The
  // identity guard keeps ordinary reads and renders allocation-free.
  if (detailsProto?.GetAppData) {
    const observedDetails = new Map<number, any>();
    unpatchers.push(
      patchMethod(detailsProto, "GetAppData", (_thisValue, original, args) => {
        const appId = Number(args[0]);
        const appData = original(...args);
        const details = appData?.details;
        if (!Number.isFinite(appId) || appId <= 0 || !details) {
          if (Number.isFinite(appId)) observedDetails.delete(appId);
          return appData;
        }
        if (observedDetails.get(appId) === details) return appData;
        observedDetails.set(appId, details);

        const metadata = metadataCache[String(appId)];
        const overview = getOverview(appId);
        if (hasMatchedSteamAppId(metadata) && isNonSteamAppWithoutPatchedMethod(overview)) {
          reassertMatchedAppData(
            appData,
            metadata,
            steamScreenshotsFromMetadata(appId, metadata)
          );
        }
        return appData;
      })
    );
  }

  if (appStore?.GetAppOverviewByAppID) {
    unpatchers.push(
      patchMethod(appStore, "GetAppOverviewByAppID", (_thisValue, original, args) => {
        const requestedAppId = Number(args[0]);
        const result = original(...args);
        if (!Number.isFinite(requestedAppId) || requestedAppId <= 0) {
          return result;
        }
        if (result) return result;
        const shortcutAppId = shortcutAppIdForSteamAppId(requestedAppId);
        if (!shortcutAppId || shortcutAppId === requestedAppId) return result;
        try {
          const shortcutOverview = original(shortcutAppId);
          if (isNonSteamAppWithoutPatchedMethod(shortcutOverview)) return shortcutOverview;
        } catch (_error) {
          // Fall through to Steam's native null result.
        }
        return result;
      })
    );
  }

  unpatchers.push(
    patchMethod(detailsProto, "GetDescriptions", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      const overview = getOverview(appId);
      const originalResult = original(...args);
      if (isNonSteamApp(overview)) {
        ensureDetailsOverviewSafeFields(appId);
        const metadata = metadataCache[String(appId)];
        if (metadata) {
          applyMetadata(appId);
          const appData = appDetailsStore?.GetAppData?.(appId);
          // Keep Steam's first-run detail bootstrap intact. Returning Decky data
          // before Steam has created the native details object can make SteamUI
          // render the play bar with an invalid/null AppOverview and crash on
          // BIsApplicationOrTool during the first page open.
          if (appData?.details && appData?.descriptionsData) {
            return appData.descriptionsData;
          }
        } else {
          const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
          void ensureMetadataCache().then(() => {
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
            if (metadataCache[String(appId)]) {
              applyMetadata(appId);
              void tryEnrichScreenshotsForApp(appId);
            } else {
              void tryFetchMetadataForApp(appId);
            }
          });
        }
      }
      return originalResult;
    })
  );

  unpatchers.push(
    patchMethod(detailsProto, "GetAssociations", (_thisValue, original, args) => {
      const appId = Number(args[0]);
      const originalResult = original(...args);
      const overview = getOverview(appId);
      if (isNonSteamApp(overview)) ensureDetailsOverviewSafeFields(appId);
      if (isNonSteamApp(overview) && metadataCache[String(appId)]) {
        applyMetadata(appId);
        const appData = appDetailsStore?.GetAppData?.(appId);
        if (appData?.details && appData?.associationData) {
          return appData.associationData;
        }
      }
      return originalResult;
    })
  );


  unpatchers.push(
    patchMethod(overviewProto, "BHasStoreCategory", (thisValue, original, args) => {
      if (isNonSteamApp(thisValue)) {
        const category = Number(args[0]);
        const metadata = metadataCache[String(thisValue.appid)];
        if (metadata?.store_categories?.includes(category)) return true;
      }
      return original(...args);
    })
  );

  if (overviewProto?.BIsModOrShortcut) {
    unpatchers.push(
      safeAfterPatch(overviewProto, "BIsModOrShortcut", function (this: any, _args: any[], ret: any) {
        const appId = Number(this?.appid);
        const path = currentRoutePath();
        const hasCache = !!metadataCache[String(appId)];
        const isCurrentMatchedRender = isCurrentMatchedRenderRoute(path, appId);
        const bypassCounterBefore = metadataState.bypassCounter;
        const shieldBefore = metadataState.routeShield ? { ...metadataState.routeShield } : null;

        // The precedence rules live in decideBIsModOrShortcut (pure,
        // unit-tested) — see src/steam/spoofDecision.ts.
        const decision = decideBIsModOrShortcut({
          isPatchedNonSteam: isNonSteamAppWithoutPatchedMethod(this),
          originalRet: ret,
          bypassCounter: metadataState.bypassCounter,
          hasCache,
          isCurrentMatchedRenderRoute: isCurrentMatchedRender,
          canRecoverStaleRoute: canRecoverStaleGameDetailRoute(path, appId),
          consumeShield: () => consumeRouteShield(appId),
        });
        metadataState.bypassCounter = decision.nextBypassCounter;

        const shieldAfter = decision.shieldConsulted
          ? (metadataState.routeShield ? { ...metadataState.routeShield } : null)
          : shieldBefore;
        const shieldState = { before: shieldBefore, after: shieldAfter, hit: decision.shieldHit };
        traceBIsModDecision(
          appId,
          path,
          ret,
          decision.finalRet,
          decision.reason,
          shieldState,
          bypassCounterBefore,
          metadataState.bypassCounter,
          hasCache,
          isCurrentMatchedRender
        );
        if (decision.reason === "truth-window") {
          traceBypassTruthWindowHit(appId, metadataState.bypassCounter);
        }
        return decision.finalRet;
      }).unpatch
    );
  }

  if (detailsProto?.BHasRecentlyLaunched) {
    unpatchers.push(
      safeAfterPatch(detailsProto, "BHasRecentlyLaunched", (_args: any[], ret: any) => {
        const wasIdle = metadataState.bypassCounter === 0;
        metadataState.bypassCounter = 4;
        if (wasIdle) traceBypassArm("BHasRecentlyLaunched");
        return ret;
      }).unpatch
    );
  }

  ["GetGameID", "GetPrimaryAppID"].forEach((methodName) => {
    if (!overviewProto?.[methodName]) return;
    unpatchers.push(
      patchMethod(overviewProto, methodName, (_thisValue, original, args) => {
        return withInCallTruth(metadataState, () => original(...args));
      })
    );
  });

  if (overviewProto?.GetCanonicalReleaseDate) {
    unpatchers.push(
      patchMethod(overviewProto, "GetCanonicalReleaseDate", (thisValue, original, args) => {
        const metadata = metadataCache[String(thisValue?.appid)];
        if (isNonSteamApp(thisValue) && metadata?.release_date) {
          return metadata.release_date;
        }
        return original(...args);
      })
    );
  }

  if (overviewProto?.GetPerClientData) {
    unpatchers.push(
      safeAfterPatch(overviewProto, "GetPerClientData", (_args: any[], ret: any) => {
        const wasIdle = metadataState.bypassCounter === 0;
        metadataState.bypassCounter = 4;
        if (wasIdle) traceBypassArm("GetPerClientData");
        return ret;
      }).unpatch
    );
  }

  try {
    const appDetailsSections = findModuleChild((module: any) => {
      if (typeof module !== "object") return undefined;
      for (const prop in module) {
        try {
          if (typeof module[prop]?.prototype?.GetSections === "function") {
            return module[prop];
          }
        } catch (_error) {
          continue;
        }
      }
      return undefined;
    });
    if (appDetailsSections?.prototype?.GetSections) {
      unpatchers.push(
        safeAfterPatch(
          appDetailsSections.prototype,
          "GetSections",
          function (this: any, _args: any[], ret: Set<string>) {
            const overview = this?.props?.overview;
            const appId = Number(overview?.appid);
            if (appId && isNonSteamApp(overview)) ensureDetailsOverviewSafeFields(appId);
            if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
              metadataState.lastObservedGameDetailAppId = appId;
              const metadata = metadataCache[String(appId)];
              if (metadata?.screenshots?.length) {
                ret.add("screenshots");
              } else {
                void tryEnrichScreenshotsForApp(appId);
              }
              ret.add("community");
              // Add the real Steam Activity section too. News are deliberately
              // served through the Activity feed patch, not the Community feed.
              ret.add("activity");
            }
            return ret;
          }
        ).unpatch
      );
    }
  } catch (error) {
    log.warn("patch", "app details sections patch skipped", error);
  }
};

export const allNonSteamGames = async (): Promise<{ appid: number; name: string; exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string }[]> => {
  const byId = new Map<number, { appid: number; name: string; exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string }>();
  const addEntry = (entry: any) => {
    const appid = Number(
      entry?.appid ?? entry?.app_id ?? entry?.unAppID ?? entry?.nAppID ?? entry
    );
    if (!Number.isFinite(appid) || appid <= 0) return;
    const overview = getOverview(appid);
    const nonSteam = entry?.isNonSteam === true || isNonSteamApp(overview);
    if (!nonSteam) return;
    const previous = byId.get(appid) || ({} as { appid?: number; name?: string; exe?: string; start_dir?: string; launch_options?: string; shortcut_path?: string });
    byId.set(appid, {
      ...previous,
      appid,
      name: cleanTitle(
        overview?.display_name ||
          overview?.localized_name ||
          entry?.name ||
          entry?.title ||
          previous.name ||
          `App ${appid}`
      ),
      exe: entry?.exe || previous.exe || "",
      start_dir: entry?.start_dir || previous.start_dir || "",
      launch_options: entry?.launch_options || previous.launch_options || "",
      shortcut_path: entry?.shortcut_path || previous.shortcut_path || "",
    });
  };

  try {
    appStore?.allApps?.forEach?.(addEntry);
    appStore?.m_mapAppOverview?.forEach?.(addEntry);
  } catch (_error) {
    // Continue with backend fallback.
  }

  try {
    const localShortcuts = await import("../backend").then((m) => m.getLocalShortcuts());
    localShortcuts.forEach(addEntry);
  } catch (_error) {
    // Optional fallback.
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
};
