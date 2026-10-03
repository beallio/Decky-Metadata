import { executeInTab, fetchNoCors } from "@decky/api";
import { Router } from "@decky/ui";
import type { ProtonDbTier } from "../types";
import { protonDbBadgeController } from "./controller";
import { PROTONDB_COLORS, protonDbTierLabel } from "./Icon";

export type StoreBadgePayload = Readonly<{
  steamAppId: number;
  tier: ProtonDbTier;
}>;

type ScriptPayload = StoreBadgePayload & Readonly<{
  color: string;
  label: string;
}>;

type SteamHistoryBoundary = {
  location?: { pathname?: unknown };
  listen: (listener: () => void) => unknown;
};

type StoreCefPageTarget = Readonly<{
  id: string | undefined;
  title: string;
  url: unknown;
}>;
type StoreCefTarget = Readonly<{
  id: string;
  title: string;
  steamAppId: number;
}>;

const LOCAL_CDP_TARGETS_URL = "http://localhost:8080/json";
const STEAM_STORE_ROUTE = "/steamweb";
const TARGET_DISCOVERY_INTERVAL_MS = 1_500;
const MAX_STEAM_APP_ID = 0x80000000;
const STORE_TIER_KEYS: Record<ProtonDbTier, true> = {
  platinum: true,
  gold: true,
  silver: true,
  bronze: true,
  borked: true,
};

let storeScriptRevision = Math.max(1, Date.now() * 1_000);
const nextStoreScriptRevision = (): number => {
  storeScriptRevision += 1;
  if (!Number.isSafeInteger(storeScriptRevision)) storeScriptRevision = Math.max(1, Date.now() * 1_000);
  return storeScriptRevision;
};

const isSteamAppId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < MAX_STEAM_APP_ID;

const isProtonDbTier = (value: unknown): value is ProtonDbTier =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(STORE_TIER_KEYS, value);

const isStoreBadgePayload = (value: unknown): value is StoreBadgePayload =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  "steamAppId" in value && isSteamAppId(value.steamAppId) &&
  "tier" in value && isProtonDbTier(value.tier);

const isSteamHistoryBoundary = (value: unknown): value is SteamHistoryBoundary =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  "listen" in value && typeof value.listen === "function";

const validTargetText = (value: unknown, maximumLength: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximumLength &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

const parseStoreAppId = (value: unknown): number | undefined => {
  if (!validTargetText(value, 2_048)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "store.steampowered.com" ||
        url.username !== "" || url.password !== "" || url.port !== "") return undefined;
    const match = /^\/app\/([1-9][0-9]*)(?:\/|$)/.exec(url.pathname);
    if (!match) return undefined;
    const steamAppId = Number(match[1]);
    return isSteamAppId(steamAppId) ? steamAppId : undefined;
  } catch {
    return undefined;
  }
};

const makeScriptPayload = (payload: StoreBadgePayload | null): ScriptPayload | null => {
  if (!payload) return null;
  if (!isStoreBadgePayload(payload)) throw new TypeError("Invalid ProtonDB Store badge payload");
  return {
    steamAppId: payload.steamAppId,
    tier: payload.tier,
    color: PROTONDB_COLORS[payload.tier],
    label: protonDbTierLabel(payload.tier),
  };
};

const storeBadgeScript = (payload: StoreBadgePayload | null, revision: number | null): string => {
  const serializedPayload = JSON.stringify(makeScriptPayload(payload));
  const serializedRevision = JSON.stringify(revision);
  return `(function () {
  "use strict";
  const requestedPayload = ${serializedPayload};
  const requestedRevision = ${serializedRevision};
  const ownerKey = "__deckyMetadataProtonDbStoreBadgeV1";
  const revisionKey = "__deckyMetadataProtonDbStoreBadgeRevisionV1";
  const badgeId = "decky-metadata-protondb-store-badge";
  const styleId = "decky-metadata-protondb-store-badge-style";
  const ownerAttribute = "data-decky-metadata-protondb-store";
  const validTiers = Object.freeze({ platinum: true, gold: true, silver: true, bronze: true, borked: true });
  const isAppId = function (value) {
    return Number.isSafeInteger(value) && value > 0 && value < 2147483648;
  };
  const isPayload = function (value) {
    return value !== null && typeof value === "object" && isAppId(value.steamAppId) &&
      typeof value.tier === "string" && Object.prototype.hasOwnProperty.call(validTiers, value.tier) &&
      typeof value.color === "string" && value.color.length > 0 && value.color.length <= 64 &&
      typeof value.label === "string" && value.label.length > 0 && value.label.length <= 64;
  };
  const appIdOnCurrentStorePage = function () {
    try {
      const location = window.location;
      if (!location || location.protocol !== "https:" || location.hostname !== "store.steampowered.com" ||
          location.port !== "") return null;
      const match = /^\\/app\\/([1-9][0-9]*)(?:\\/|$)/.exec(location.pathname);
      if (!match) return null;
      const appId = Number(match[1]);
      return isAppId(appId) ? appId : null;
    } catch {
      return null;
    }
  };
  const removeOwnedNode = function (id, kind) {
    try {
      const node = document.getElementById(id);
      if (node && node.getAttribute(ownerAttribute) === kind && typeof node.remove === "function") node.remove();
    } catch {}
  };
  const removeOrphanedDom = function () {
    removeOwnedNode(badgeId, "badge");
    removeOwnedNode(styleId, "style");
  };
  const currentRevision = window[revisionKey];
  const highWater = Number.isSafeInteger(currentRevision) && currentRevision >= 0 ? currentRevision : 0;
  const revision = requestedRevision === null ? highWater + 1 : requestedRevision;
  if (!Number.isSafeInteger(revision) || revision < highWater) return false;
  window[revisionKey] = revision;
  const existing = window[ownerKey];
  if (requestedPayload === null || !isPayload(requestedPayload) ||
      appIdOnCurrentStorePage() !== requestedPayload.steamAppId) {
    if (existing && typeof existing.dispose === "function") existing.dispose();
    else removeOrphanedDom();
    return requestedPayload === null;
  }
  if (existing && typeof existing.update === "function") {
    existing.update(requestedPayload, revision);
    return true;
  }

  let disposed = false;
  let stateRevision = revision;
  let statePayload = requestedPayload;
  let observedRoot = null;
  let observedBody = null;
  let rootObserver = null;
  let bodyObserver = null;
  let badge = null;
  let style = null;
  const restoreHistoryMethods = [];
  const state = { update: update, dispose: dispose };

  function pageStillMatches() {
    return !disposed && appIdOnCurrentStorePage() === statePayload.steamAppId;
  }

  function handleNavigation() {
    if (disposed) return;
    if (!pageStillMatches()) {
      dispose();
      return;
    }
    render();
  }

  function addHistoryObserver(methodName) {
    try {
      const history = window.history;
      const original = history && history[methodName];
      if (typeof original !== "function") return;
      const wrapped = function () {
        const result = Reflect.apply(original, this, arguments);
        handleNavigation();
        return result;
      };
      history[methodName] = wrapped;
      if (history[methodName] === wrapped) {
        restoreHistoryMethods.push(function () {
          if (window.history && window.history[methodName] === wrapped) history[methodName] = original;
        });
      }
    } catch {}
  }

  function observeDocument() {
    const root = document.documentElement;
    if (root && root !== observedRoot) {
      if (rootObserver) rootObserver.disconnect();
      observedRoot = root;
      rootObserver = new MutationObserver(function () { render(); });
      rootObserver.observe(root, { childList: true });
    }
    const body = document.body;
    if (body !== observedBody) {
      if (bodyObserver) bodyObserver.disconnect();
      observedBody = body;
      bodyObserver = null;
      if (body) {
        bodyObserver = new MutationObserver(function (records) {
          if (disposed) return;
          const externalChange = records.some(function (record) {
            const added = Array.from(record.addedNodes || []);
            const removed = Array.from(record.removedNodes || []);
            return added.some(function (node) { return node !== badge; }) || removed.length > 0;
          });
          if (externalChange) render();
        });
        bodyObserver.observe(body, { childList: true });
      }
    }
  }

  function ownedNode(id, kind) {
    const node = document.getElementById(id);
    if (!node) return null;
    return node.getAttribute(ownerAttribute) === kind ? node : false;
  }

  function createAtom() {
    const namespace = "http://www.w3.org/2000/svg";
    const atom = document.createElementNS(namespace, "svg");
    atom.setAttribute("viewBox", "0 0 32 32");
    atom.setAttribute("aria-hidden", "true");
    atom.setAttribute("focusable", "false");
    atom.setAttribute("class", "decky-metadata-protondb-store-atom");
    ["rotate(0 16 16)", "rotate(60 16 16)", "rotate(120 16 16)"].forEach(function (rotation) {
      const orbit = document.createElementNS(namespace, "ellipse");
      orbit.setAttribute("cx", "16");
      orbit.setAttribute("cy", "16");
      orbit.setAttribute("rx", "13");
      orbit.setAttribute("ry", "5.2");
      orbit.setAttribute("transform", rotation);
      atom.appendChild(orbit);
    });
    const nucleus = document.createElementNS(namespace, "circle");
    nucleus.setAttribute("cx", "16");
    nucleus.setAttribute("cy", "16");
    nucleus.setAttribute("r", "2.3");
    nucleus.setAttribute("fill", "currentColor");
    nucleus.setAttribute("stroke", "none");
    atom.appendChild(nucleus);
    return atom;
  }

  function render() {
    if (disposed) return;
    if (!pageStillMatches()) {
      dispose();
      return;
    }
    observeDocument();
    const body = document.body;
    const styleHost = document.head || document.documentElement;
    if (!body || !styleHost) return;

    const existingBadge = ownedNode(badgeId, "badge");
    if (existingBadge === false) return;
    const existingStyle = ownedNode(styleId, "style");
    if (existingStyle === false) return;
    style = existingStyle || document.createElement("style");
    if (!existingStyle) {
      style.id = styleId;
      style.setAttribute(ownerAttribute, "style");
      style.textContent = "#" + badgeId + "{position:fixed!important;left:auto!important;right:calc(20px + env(safe-area-inset-right,0px))!important;bottom:calc(20px + env(safe-area-inset-bottom,0px))!important;z-index:2147483647!important;transform:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;max-width:calc(100vw - 32px)!important;box-sizing:border-box!important;padding:12px!important;border:0!important;border-radius:5px!important;background:var(--protondb-tier-color)!important;color:#111820!important;text-decoration:none!important;box-shadow:0 3px 16px rgba(0,0,0,.4)!important;pointer-events:auto!important}#" + badgeId + ":focus-visible{outline:2px solid #fff!important;outline-offset:3px!important}#" + badgeId + " .decky-metadata-protondb-store-atom{width:26px!important;height:26px!important;flex:0 0 26px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.7!important}";
    }

    badge = existingBadge || document.createElement("a");
    if (!existingBadge) {
      badge.id = badgeId;
      badge.setAttribute(ownerAttribute, "badge");
      badge.setAttribute("aria-label", "ProtonDB rating");
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
    }

    const tierChanged = badge.getAttribute("data-protondb-tier") !== statePayload.tier;
    if (tierChanged) {
      badge.replaceChildren(createAtom());
      badge.setAttribute("data-protondb-tier", statePayload.tier);
    }
    badge.href = "https://www.protondb.com/app/" + statePayload.steamAppId;
    badge.title = "ProtonDB rating: " + statePayload.label;
    badge.setAttribute("aria-label", "ProtonDB rating: " + statePayload.label);
    badge.style.setProperty("--protondb-tier-color", statePayload.color);
    if (style.parentNode !== styleHost) styleHost.appendChild(style);
    if (badge.parentNode !== body) body.appendChild(badge);
  }

  function update(nextPayload, nextRevision) {
    if (disposed || !Number.isSafeInteger(nextRevision) || nextRevision < stateRevision) return;
    stateRevision = nextRevision;
    if (!isPayload(nextPayload) || appIdOnCurrentStorePage() !== nextPayload.steamAppId) {
      dispose();
      return;
    }
    statePayload = nextPayload;
    render();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (rootObserver) rootObserver.disconnect();
    if (bodyObserver) bodyObserver.disconnect();
    window.removeEventListener("popstate", handleNavigation);
    window.removeEventListener("hashchange", handleNavigation);
    window.removeEventListener("pagehide", dispose);
    window.removeEventListener("pageleave", dispose);
    document.removeEventListener("pageleave", dispose);
    restoreHistoryMethods.forEach(function (restore) {
      try { restore(); } catch {}
    });
    removeOrphanedDom();
    if (window[ownerKey] === state) delete window[ownerKey];
  }

  window[ownerKey] = state;
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener("pagehide", dispose);
  window.addEventListener("pageleave", dispose);
  document.addEventListener("pageleave", dispose);
  addHistoryObserver("pushState");
  addHistoryObserver("replaceState");
  render();
  return true;
})();`;
};

/** Build the Store-page DOM script for a badge payload, or for owned-DOM disposal. */
export const buildStoreBadgeScript = (payload: StoreBadgePayload | null): string =>
  storeBadgeScript(payload, null);

const isSafeTargetId = (value: unknown): value is string => validTargetText(value, 256);

const parseStoreCefPageTarget = (value: unknown): StoreCefPageTarget | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      !("type" in value) || value.type !== "page" ||
      !("title" in value) || !validTargetText(value.title, 512)) return undefined;
  const id = "id" in value && isSafeTargetId(value.id) ? value.id : undefined;
  return { id, title: value.title, url: "url" in value ? value.url : undefined };
};

const resolveStoreTarget = (value: unknown): StoreCefTarget | undefined => {
  if (!Array.isArray(value)) return undefined;
  const pageTargets: StoreCefPageTarget[] = [];
  for (const candidate of value) {
    const pageTarget = parseStoreCefPageTarget(candidate);
    if (pageTarget) pageTargets.push(pageTarget);
  }
  const candidates: StoreCefTarget[] = [];
  for (const pageTarget of pageTargets) {
    if (!pageTarget.id) continue;
    const steamAppId = parseStoreAppId(pageTarget.url);
    if (steamAppId === undefined) continue;
    candidates.push({ id: pageTarget.id, title: pageTarget.title, steamAppId });
  }
  if (candidates.length !== 1) return undefined;
  const [target] = candidates;
  const matchingTitleCount = pageTargets.filter((candidate) => candidate.title === target.title).length;
  const matchingIdCount = pageTargets.filter((candidate) => candidate.id === target.id).length;
  if (matchingTitleCount !== 1 || matchingIdCount !== 1) return undefined;
  return target;
};

const findSteamHistory = (): SteamHistoryBoundary | undefined => {
  try {
    // tempNavStore's exported History publishes before its location catches up.
    // Use the active main-window History, which owns Steam's actual Store route.
    const mainWindow: unknown = Router.WindowStore?.GamepadUIMainWindowInstance;
    if (typeof mainWindow !== "object" || mainWindow === null ||
        !("m_history" in mainWindow) || !isSteamHistoryBoundary(mainWindow.m_history)) return undefined;
    return mainWindow.m_history;
  } catch {
    return undefined;
  }
};

const routePath = (history: SteamHistoryBoundary): string => {
  const pathname = history.location?.pathname;
  return typeof pathname === "string" ? pathname : "";
};

const isDisposer = (value: unknown): value is () => void => typeof value === "function";

const listStoreCefTargets = async (): Promise<StoreCefTarget | undefined> => {
  try {
    const response = await fetchNoCors(LOCAL_CDP_TARGETS_URL, { method: "GET" });
    if (response.status !== 200) return undefined;
    return resolveStoreTarget(await response.json());
  } catch {
    return undefined;
  }
};

/** Owns the current Store target, rating subscription, route listener, and discovery timer. */
export const installProtonDbStoreBadge = (): (() => void) => {
  let stopped = false;
  let eligible = false;
  let onStoreRoute = false;
  let discoveryRunning = false;
  let discoveryTimer: number | NodeJS.Timeout | undefined;
  let discoveryRevision = 0;
  let currentTarget: StoreCefTarget | undefined;
  let currentTargetSignature: string | undefined;
  let pendingSignature: string | undefined;
  let injectionGeneration = 0;
  let ratingDisposer: (() => void) | undefined;
  let removeHistoryListener: (() => void) | undefined;

  const isEligible = (): boolean => {
    if (stopped || !onStoreRoute) return false;
    const snapshot = protonDbBadgeController.getSnapshot();
    return snapshot.effectiveEnabled && snapshot.settings.store;
  };

  const clearDiscoveryTimer = (): void => {
    if (discoveryTimer === undefined) return;
    globalThis.clearTimeout(discoveryTimer);
    discoveryTimer = undefined;
  };

  const executeBadgeScript = async (target: StoreCefTarget, payload: StoreBadgePayload | null): Promise<boolean> => {
    const script = storeBadgeScript(payload, nextStoreScriptRevision());
    try {
      const result = await executeInTab(target.title, false, script);
      return result.success && result.result === true;
    } catch {
      return false;
    }
  };

  const releaseRating = (): void => {
    const dispose = ratingDisposer;
    ratingDisposer = undefined;
    if (!dispose) return;
    try { dispose(); } catch { /* A torn-down rating controller has already released it. */ }
  };

  const clearCurrentTarget = (): void => {
    const target = currentTarget;
    currentTarget = undefined;
    currentTargetSignature = undefined;
    pendingSignature = undefined;
    injectionGeneration += 1;
    releaseRating();
    if (target) executeBadgeScript(target, null);
  };

  const applyCurrentRating = (): void => {
    if (!isEligible() || !currentTarget) return;
    const target = currentTarget;
    const tier = protonDbBadgeController.getRating(target.steamAppId).tier;
    const payload = tier ? { steamAppId: target.steamAppId, tier } : null;
    const signature = target.id + "\u0000" + target.title + "\u0000" + target.steamAppId + "\u0000" + (tier || "none");
    if (signature === currentTargetSignature || signature === pendingSignature) return;
    const generation = ++injectionGeneration;
    pendingSignature = signature;
    void executeBadgeScript(target, payload).then(applied => {
      if (generation !== injectionGeneration) return;
      pendingSignature = undefined;
      if (applied && isEligible() && currentTarget?.id === target.id &&
          currentTarget.title === target.title && currentTarget.steamAppId === target.steamAppId) {
        currentTargetSignature = signature;
      }
    });
  };

  const onRatingChanged = (): void => {
    if (!isEligible() || !currentTarget) return;
    applyCurrentRating();
  };

  const setCurrentTarget = async (target: StoreCefTarget | undefined): Promise<void> => {
    if (!target) {
      clearCurrentTarget();
      return;
    }
    if (currentTarget && currentTarget.id === target.id && currentTarget.title === target.title &&
        currentTarget.steamAppId === target.steamAppId) {
      const tier = protonDbBadgeController.getRating(target.steamAppId).tier;
      if (tier && currentTargetSignature) {
        const presenceScript = `(() => {
          const badge = document.getElementById("decky-metadata-protondb-store-badge");
          return !!badge && badge.getAttribute("data-protondb-tier") === ${JSON.stringify(tier)}
            && badge.getAttribute("href") === ${JSON.stringify(`https://www.protondb.com/app/${target.steamAppId}`)};
        })()`;
        try {
          const present = await executeInTab(target.title, false, presenceScript);
          if (!isEligible() || currentTarget?.id !== target.id) return;
          if (!present.success || present.result !== true) currentTargetSignature = undefined;
        } catch {
          if (!isEligible()) return;
          currentTargetSignature = undefined;
        }
      }
      applyCurrentRating();
      return;
    }

    const previous = currentTarget;
    if (previous && previous.id !== target.id) executeBadgeScript(previous, null);
    const appChanged = !previous || previous.steamAppId !== target.steamAppId;
    currentTarget = target;
    currentTargetSignature = undefined;
    pendingSignature = undefined;
    injectionGeneration += 1;
    if (appChanged) {
      releaseRating();
      ratingDisposer = protonDbBadgeController.subscribeRating(target.steamAppId, onRatingChanged);
    }
    applyCurrentRating();
  };

  const scheduleDiscovery = (): void => {
    if (!isEligible() || discoveryTimer !== undefined || discoveryRunning) return;
    discoveryTimer = globalThis.setTimeout(() => {
      discoveryTimer = undefined;
      void discoverTarget();
    }, TARGET_DISCOVERY_INTERVAL_MS);
  };

  const discoverTarget = async (): Promise<void> => {
    if (!isEligible() || discoveryRunning) return;
    discoveryRunning = true;
    const currentDiscoveryRevision = ++discoveryRevision;
    try {
      const target = await listStoreCefTargets();
      if (!isEligible() || currentDiscoveryRevision !== discoveryRevision) return;
      await setCurrentTarget(target);
    } finally {
      discoveryRunning = false;
      if (isEligible()) scheduleDiscovery();
    }
  };

  const stopDiscovery = (): void => {
    eligible = false;
    discoveryRevision += 1;
    clearDiscoveryTimer();
    clearCurrentTarget();
  };

  const syncEligibility = (): void => {
    const nextEligibility = isEligible();
    if (nextEligibility === eligible) {
      if (nextEligibility && discoveryTimer === undefined && !discoveryRunning) void discoverTarget();
      return;
    }
    eligible = nextEligibility;
    if (!nextEligibility) {
      stopDiscovery();
      return;
    }
    if (discoveryTimer === undefined && !discoveryRunning) void discoverTarget();
  };

  const history = findSteamHistory();
  if (history) {
    onStoreRoute = routePath(history) === STEAM_STORE_ROUTE;
    try {
      const unlisten = history.listen(() => {
        onStoreRoute = routePath(history) === STEAM_STORE_ROUTE;
        syncEligibility();
      });
      if (isDisposer(unlisten)) removeHistoryListener = unlisten;
    } catch {
      onStoreRoute = false;
    }
  }

  const removeControllerListener = protonDbBadgeController.subscribe(syncEligibility);
  syncEligibility();

  return () => {
    if (stopped) return;
    stopped = true;
    stopDiscovery();
    removeControllerListener();
    const removeHistory = removeHistoryListener;
    removeHistoryListener = undefined;
    if (removeHistory) {
      try { removeHistory(); } catch { /* Steam may have already discarded this History instance. */ }
    }
    onStoreRoute = false;
  };
};
