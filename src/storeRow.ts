import { executeInTab, fetchNoCors } from "@decky/api";
import { Router } from "@decky/ui";
import { hltbController } from "./hltb/gameView";
import { hltbStore, type HltbInputs } from "./hltb/store";
import { protonDbBadgeController } from "./protondb/controller";
import { PROTONDB_COLORS, protonDbTierLabel } from "./protondb/Icon";
import { getNativeOverview } from "./steam/core";
import type { ProtonDbTier } from "./types";

export type StoreInfoRowItem = Readonly<{ value: string; label: string }>;

/** One row of cards under the Store page video; either card may be absent. */
export type StoreInfoRowPayload = Readonly<{
  steamAppId: number;
  hltb: Readonly<{ hltbId: number | null; items: StoreInfoRowItem[] }> | null;
  protondb: Readonly<{ tier: ProtonDbTier; color: string; label: string }> | null;
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
const MAX_STORE_TITLE_LENGTH = 512;
const ROW_ID = "decky-metadata-store-info-row";
const ROW_STYLE_ID = "decky-metadata-store-info-row-style";
const SUMMARY_BAR_ID = "summaryBarTop";
const STORE_TIER_KEYS: Record<ProtonDbTier, true> = {
  platinum: true,
  gold: true,
  silver: true,
  bronze: true,
  borked: true,
};

const STORE_TITLE_PROBE_SCRIPT = `(() => {
  const node = document.getElementById("appHubAppName");
  return node && typeof node.textContent === "string" ? node.textContent : null;
})()`;

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

const isRowText = (value: unknown, maximumLength: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximumLength &&
  !/[\u0000-\u001f\u007f]/.test(value);

const isRowItem = (value: unknown): value is StoreInfoRowItem =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  "value" in value && isRowText(value.value, 32) && "label" in value && isRowText(value.label, 64);

const isHltbCard = (value: unknown): value is StoreInfoRowPayload["hltb"] =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  "hltbId" in value && (value.hltbId === null || isSteamAppId(value.hltbId)) &&
  "items" in value && Array.isArray(value.items) && value.items.length <= 4 && value.items.every(isRowItem);

const isProtonDbCard = (value: unknown): value is StoreInfoRowPayload["protondb"] =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  "tier" in value && isProtonDbTier(value.tier) &&
  "color" in value && isRowText(value.color, 64) &&
  "label" in value && isRowText(value.label, 64);

const isStoreInfoRowPayload = (value: unknown): value is StoreInfoRowPayload =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  "steamAppId" in value && isSteamAppId(value.steamAppId) &&
  "hltb" in value && (value.hltb === null || isHltbCard(value.hltb)) &&
  "protondb" in value && (value.protondb === null || isProtonDbCard(value.protondb));

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

const scriptPayloadOf = (payload: StoreInfoRowPayload | null): StoreInfoRowPayload | null => {
  if (payload === null) return null;
  if (!isStoreInfoRowPayload(payload)) throw new TypeError("Invalid Store info row payload");
  return payload.hltb === null && payload.protondb === null ? null : payload;
};

/** Stable content identity; the page stamps it and the presence probe re-checks it. */
const signatureOf = (payload: StoreInfoRowPayload | null): string =>
  payload === null ? "" : JSON.stringify(payload);

const storeRowScript = (payload: StoreInfoRowPayload | null, revision: number | null): string => {
  const scriptPayload = scriptPayloadOf(payload);
  const serializedPayload = JSON.stringify(scriptPayload);
  const serializedSignature = JSON.stringify(signatureOf(scriptPayload));
  const serializedRevision = JSON.stringify(revision);
  return `(function () {
  "use strict";
  const requestedPayload = ${serializedPayload};
  const requestedSignature = ${serializedSignature};
  const requestedRevision = ${serializedRevision};
  const ownerKey = "__deckyMetadataStoreInfoRowV1";
  const revisionKey = "__deckyMetadataStoreInfoRowRevisionV1";
  const rowId = "${ROW_ID}";
  const styleId = "${ROW_STYLE_ID}";
  const anchorId = "${SUMMARY_BAR_ID}";
  const ownerAttribute = "data-decky-metadata-store-row";
  const cardClass = "decky-metadata-store-row-card";
  const headingClass = "decky-metadata-store-row-heading";
  const statsClass = "decky-metadata-store-row-stats";
  const valueClass = "decky-metadata-store-row-value";
  const labelClass = "decky-metadata-store-row-label";
  const tierClass = "decky-metadata-store-row-tier";
  const tierLabelClass = "decky-metadata-store-row-tier-label";
  const atomClass = "decky-metadata-store-row-atom";
  const validTiers = Object.freeze({ platinum: true, gold: true, silver: true, bronze: true, borked: true });
  const css = "#" + rowId + "{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:0}" +
    "#" + rowId + ">:only-child{grid-column:1 / -1}" +
    "." + cardClass + "{display:flex;flex-direction:column;gap:2px;padding:10px 12px;background:rgba(14,20,27,.5);color:var(--color-text-body-body,#c6d4df);font:16px/22.4px 'Motiva Sans',Arial,sans-serif;text-decoration:none;box-sizing:border-box;min-width:0}" +
    "." + headingClass + "{font:700 13px/17px 'Motiva Sans',Arial,sans-serif;color:var(--color-text-body-title,#f1f2f3);border-bottom:.67px solid rgb(49,69,96);padding-bottom:3px;margin-bottom:4px;text-transform:uppercase}" +
    "." + statsClass + "{display:flex;justify-content:space-between;list-style:none;margin:0;padding:0}" +
    "." + statsClass + " li{display:flex;flex-direction:column}" +
    "." + valueClass + "{color:#fff;font-weight:700}" +
    "." + labelClass + "{font-size:12px;opacity:.8}" +
    "." + tierClass + "{display:flex;align-items:center;gap:8px}" +
    "." + atomClass + "{width:24px;height:24px;flex:0 0 24px;fill:none;stroke:currentColor;stroke-width:1.7}" +
    "." + tierLabelClass + "{color:#fff;font-weight:700}";
  const isAppId = function (value) {
    return Number.isSafeInteger(value) && value > 0 && value < 2147483648;
  };
  const isText = function (value, maximum) {
    return typeof value === "string" && value.length > 0 && value.length <= maximum &&
      !/[\\u0000-\\u001f\\u007f]/.test(value);
  };
  const isItems = function (value) {
    if (!Array.isArray(value) || value.length > 4) return false;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (!item || typeof item !== "object" || !isText(item.value, 32) || !isText(item.label, 64)) return false;
    }
    return true;
  };
  const isHltb = function (value) {
    return value !== null && typeof value === "object" &&
      (value.hltbId === null || isAppId(value.hltbId)) && isItems(value.items);
  };
  const isProton = function (value) {
    return value !== null && typeof value === "object" && typeof value.tier === "string" &&
      Object.prototype.hasOwnProperty.call(validTiers, value.tier) &&
      isText(value.color, 64) && isText(value.label, 64);
  };
  const isPayload = function (value) {
    return value !== null && typeof value === "object" && isAppId(value.steamAppId) &&
      (value.hltb === null || isHltb(value.hltb)) && (value.protondb === null || isProton(value.protondb)) &&
      (value.hltb !== null || value.protondb !== null);
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
    removeOwnedNode(rowId, "row");
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
    existing.update(requestedPayload, requestedSignature, revision);
    return true;
  }

  let disposed = false;
  let stateRevision = revision;
  let statePayload = requestedPayload;
  let stateSignature = requestedSignature;
  let observedRoot = null;
  let observedBody = null;
  let rootObserver = null;
  let bodyObserver = null;
  let row = null;
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
            return added.some(function (node) { return node !== row; }) || removed.length > 0;
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
    atom.setAttribute("class", atomClass);
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

  function createHeading(text) {
    const heading = document.createElement("div");
    heading.className = headingClass;
    heading.textContent = text;
    return heading;
  }

  function hltbCard(payload) {
    const data = payload.hltb;
    if (!data) return null;
    const card = document.createElement(data.hltbId === null ? "div" : "a");
    card.className = cardClass;
    card.setAttribute("data-card", "hltb");
    card.setAttribute("aria-label", "HowLongToBeat times");
    if (data.hltbId !== null) {
      card.href = "https://howlongtobeat.com/game/" + data.hltbId;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    card.appendChild(createHeading("How Long To Beat"));
    if (data.items.length > 0) {
      const list = document.createElement("ul");
      list.className = statsClass;
      data.items.forEach(function (item) {
        const entry = document.createElement("li");
        const value = document.createElement("span");
        value.className = valueClass;
        value.textContent = item.value;
        const label = document.createElement("span");
        label.className = labelClass;
        label.textContent = item.label;
        entry.appendChild(value);
        entry.appendChild(label);
        list.appendChild(entry);
      });
      card.appendChild(list);
    }
    return card;
  }

  function protonDbCard(payload) {
    const data = payload.protondb;
    if (!data) return null;
    const card = document.createElement("a");
    card.className = cardClass;
    card.setAttribute("data-card", "protondb");
    card.setAttribute("aria-label", "ProtonDB rating: " + data.label);
    card.href = "https://www.protondb.com/app/" + payload.steamAppId;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.appendChild(createHeading("ProtonDB"));
    const body = document.createElement("div");
    body.className = tierClass;
    const atom = createAtom();
    atom.style.setProperty("color", data.color);
    body.appendChild(atom);
    const label = document.createElement("span");
    label.className = tierLabelClass;
    label.textContent = data.label;
    body.appendChild(label);
    card.appendChild(body);
    return card;
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

    const existingRow = ownedNode(rowId, "row");
    if (existingRow === false) return;
    const existingStyle = ownedNode(styleId, "style");
    if (existingStyle === false) return;
    const anchor = document.getElementById(anchorId);
    const parent = anchor && anchor.parentNode;
    if (!anchor || !parent) {
      if (existingRow && typeof existingRow.remove === "function") existingRow.remove();
      return;
    }

    style = existingStyle || document.createElement("style");
    if (!existingStyle) {
      style.id = styleId;
      style.setAttribute(ownerAttribute, "style");
      style.textContent = css;
    }
    if (style.parentNode !== styleHost) styleHost.appendChild(style);

    const appIdText = String(statePayload.steamAppId);
    let marginTop = "";
    try {
      const computed = window.getComputedStyle ? window.getComputedStyle(anchor) : null;
      if (computed && typeof computed.marginTop === "string") marginTop = computed.marginTop;
    } catch {}
    if (existingRow && existingRow.getAttribute("data-app-id") === appIdText &&
        existingRow.getAttribute("data-signature") === stateSignature && existingRow.children.length > 0 &&
        existingRow.parentNode === parent && anchor.previousElementSibling === existingRow) {
      row = existingRow;
      if (marginTop) row.style.marginTop = marginTop;
      return;
    }
    // Rebuild instead of patching in place: one fresh, attached registration per change keeps the nav tree simple.
    row = document.createElement("div");
    row.id = rowId;
    row.setAttribute(ownerAttribute, "row");
    // Read before the row is instrumented, so Left/Right move between cards.
    row.setAttribute("data-panel", JSON.stringify({ "flow-children": "row" }));
    const hltb = hltbCard(statePayload);
    const proton = protonDbCard(statePayload);
    if (hltb) row.appendChild(hltb);
    if (proton) row.appendChild(proton);
    row.setAttribute("data-app-id", appIdText);
    row.setAttribute("data-signature", stateSignature);
    if (marginTop) row.style.marginTop = marginTop;
    if (existingRow && typeof existingRow.remove === "function") existingRow.remove();
    parent.insertBefore(row, anchor);
    // Steam's Store navigation finds a node's parent through the DOM, so register only once the row is attached.
    try {
      if (typeof window.ForceUpdateFocusElements === "function") window.ForceUpdateFocusElements(row);
    } catch {}
  }

  function update(nextPayload, nextSignature, nextRevision) {
    if (disposed || !Number.isSafeInteger(nextRevision) || nextRevision < stateRevision) return;
    stateRevision = nextRevision;
    if (!isPayload(nextPayload) || !isText(nextSignature, 2048) ||
        appIdOnCurrentStorePage() !== nextPayload.steamAppId) {
      dispose();
      return;
    }
    statePayload = nextPayload;
    stateSignature = nextSignature;
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

/** Build the Store-page DOM script for an info-row payload, or for owned-DOM disposal. */
export const buildStoreInfoRowScript = (payload: StoreInfoRowPayload | null): string =>
  storeRowScript(payload, null);

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

const sameTarget = (left: StoreCefTarget, right: StoreCefTarget): boolean =>
  left.id === right.id && left.title === right.title && left.steamAppId === right.steamAppId;

/** Owns the Store target, both feature subscriptions, the route listener, and the discovery timer. */
export const installStoreInfoRow = (): (() => void) => {
  let stopped = false;
  let eligible = false;
  let onStoreRoute = false;
  let discoveryRunning = false;
  let discoveryTimer: number | NodeJS.Timeout | undefined;
  let discoveryRevision = 0;
  let currentTarget: StoreCefTarget | undefined;
  let currentSignature: string | undefined;
  let injectionGeneration = 0;
  let ratingDisposer: (() => void) | undefined;
  let hltbDisposer: (() => void) | undefined;
  let removeHistoryListener: (() => void) | undefined;
  const titleCache = new Map<string, string>();
  const titleProbes = new Map<string, Promise<string>>();

  const isHltbCardEnabled = (): boolean => {
    const snapshot = hltbController.getSnapshot();
    return snapshot.effectiveEnabled && snapshot.settings.store;
  };

  const isProtonDbCardEnabled = (): boolean => {
    const snapshot = protonDbBadgeController.getSnapshot();
    return snapshot.effectiveEnabled && snapshot.settings.store;
  };

  const isEligible = (): boolean =>
    !stopped && onStoreRoute && (isHltbCardEnabled() || isProtonDbCardEnabled());

  const clearDiscoveryTimer = (): void => {
    if (discoveryTimer === undefined) return;
    globalThis.clearTimeout(discoveryTimer);
    discoveryTimer = undefined;
  };

  const releaseHltb = (): void => {
    const dispose = hltbDisposer;
    hltbDisposer = undefined;
    if (dispose) dispose();
  };

  const releaseRating = (): void => {
    const dispose = ratingDisposer;
    ratingDisposer = undefined;
    if (!dispose) return;
    try { dispose(); } catch { /* A torn-down rating controller has already released it. */ }
  };

  const executeRowScript = async (target: StoreCefTarget, payload: StoreInfoRowPayload | null): Promise<boolean> => {
    const script = storeRowScript(payload, nextStoreScriptRevision());
    try {
      const result = await executeInTab(target.title, false, script);
      return result.success && result.result === true;
    } catch {
      return false;
    }
  };

  /** The store page title, read once per target because only the game page knows it from Steam. */
  const titleFor = (target: StoreCefTarget): Promise<string> => {
    const native = String(getNativeOverview(target.steamAppId)?.display_name ?? "").trim();
    if (native.length > 0 && native.length <= MAX_STORE_TITLE_LENGTH && !/[\u0000-\u001f\u007f]/.test(native)) {
      return Promise.resolve(native);
    }
    const key = target.id + "\u0000" + target.steamAppId;
    const cached = titleCache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = titleProbes.get(key);
    if (pending) return pending;
    // An empty result is not cached: the probe can run before the page has its heading.
    const probe = executeInTab(target.title, false, STORE_TITLE_PROBE_SCRIPT).then(
      (result) => {
        const text = result.success && typeof result.result === "string" ? result.result.trim() : "";
        const resolved = text.length > 0 && text.length <= MAX_STORE_TITLE_LENGTH &&
          !/[\u0000-\u001f\u007f]/.test(text) ? text : "";
        titleProbes.delete(key);
        if (titleCache.size > 64) titleCache.clear();
        if (resolved !== "") titleCache.set(key, resolved);
        return resolved;
      },
      () => {
        titleProbes.delete(key);
        return "";
      },
    );
    titleProbes.set(key, probe);
    return probe;
  };

  const hltbCardFor = async (target: StoreCefTarget): Promise<StoreInfoRowPayload["hltb"]> => {
    const settings = hltbController.getSnapshot().settings;
    const title = await titleFor(target);
    if (title === "") return null;
    const inputs: HltbInputs = { steam: target.steamAppId, title, pinned: null };
    const view = hltbStore.view(target.steamAppId, inputs);
    if (view.needsFetch) hltbStore.request(target.steamAppId, false, inputs);
    const entry = view.entry;
    if (!entry || entry.status !== "matched") return null;
    const rows = [
      { show: settings.showMain, seconds: entry.stats?.main ?? 0, label: "Main Story" },
      { show: settings.showMainPlus, seconds: entry.stats?.plus ?? 0, label: "Main + Extras" },
      { show: settings.showComplete, seconds: entry.stats?.complete ?? 0, label: "Completionist" },
      { show: settings.showAllStyles, seconds: entry.stats?.all ?? 0, label: "All Styles" },
    ];
    if (!rows.some((row) => row.seconds > 0)) return null;
    const items = rows
      .filter((row) => row.show)
      .map((row) => ({ value: row.seconds > 0 ? `${(row.seconds / 3600).toFixed(1)} h` : "--", label: row.label }));
    const hltbId = settings.hideViewDetails ? null : (isSteamAppId(entry.hltb_id) ? entry.hltb_id : null);
    if (items.length === 0 && hltbId === null) return null;
    return { hltbId, items };
  };

  const payloadFor = async (target: StoreCefTarget): Promise<StoreInfoRowPayload | null> => {
    const hltb = isHltbCardEnabled() ? await hltbCardFor(target) : null;
    const tier = isProtonDbCardEnabled() ? protonDbBadgeController.getRating(target.steamAppId).tier : null;
    const protondb = tier ? { tier, color: PROTONDB_COLORS[tier], label: protonDbTierLabel(tier) } : null;
    if (hltb === null && protondb === null) return null;
    return { steamAppId: target.steamAppId, hltb, protondb };
  };

  const probeRow = async (target: StoreCefTarget, signature: string): Promise<boolean> => {
    const script = `(() => {
  const row = document.getElementById(${JSON.stringify(ROW_ID)});
  const anchor = document.getElementById(${JSON.stringify(SUMMARY_BAR_ID)});
  const parent = anchor && anchor.parentNode;
  return !!row && !!parent && row.parentNode === parent && anchor.previousElementSibling === row &&
    row.getAttribute("data-app-id") === ${JSON.stringify(String(target.steamAppId))} &&
    row.getAttribute("data-signature") === ${JSON.stringify(signature)};
})()`;
    try {
      const result = await executeInTab(target.title, false, script);
      return result.success && result.result === true;
    } catch {
      return false;
    }
  };

  const applyCurrent = (): void => {
    const target = currentTarget;
    if (!target || !isEligible()) return;
    const generation = ++injectionGeneration;
    void payloadFor(target).then((payload) => {
      if (generation !== injectionGeneration || !isEligible() || !currentTarget ||
          !sameTarget(currentTarget, target)) return;
      const signature = signatureOf(payload);
      if (signature === currentSignature) return;
      void executeRowScript(target, payload).then((applied) => {
        if (generation !== injectionGeneration) return;
        if (applied && isEligible() && currentTarget && sameTarget(currentTarget, target)) {
          currentSignature = signature;
        }
      });
    }, () => undefined);
  };

  const clearCurrentTarget = (): void => {
    const target = currentTarget;
    currentTarget = undefined;
    currentSignature = undefined;
    injectionGeneration += 1;
    titleCache.clear();
    titleProbes.clear();
    releaseRating();
    releaseHltb();
    if (target) void executeRowScript(target, null);
  };

  const onCardDataChanged = (): void => {
    if (isEligible() && currentTarget) applyCurrent();
  };

  const setCurrentTarget = async (target: StoreCefTarget | undefined): Promise<void> => {
    if (!target) {
      clearCurrentTarget();
      return;
    }
    if (currentTarget && sameTarget(currentTarget, target)) {
      const signature = currentSignature;
      if (signature !== undefined) {
        const present = await probeRow(target, signature);
        if (!isEligible() || !currentTarget || !sameTarget(currentTarget, target)) return;
        if (!present) currentSignature = undefined;
      }
      applyCurrent();
      return;
    }

    const previous = currentTarget;
    if (previous && previous.id !== target.id) void executeRowScript(previous, null);
    const appChanged = !previous || previous.steamAppId !== target.steamAppId;
    currentTarget = target;
    currentSignature = undefined;
    injectionGeneration += 1;
    titleCache.clear();
    titleProbes.clear();
    if (appChanged) {
      releaseRating();
      ratingDisposer = protonDbBadgeController.subscribeRating(target.steamAppId, onCardDataChanged);
      releaseHltb();
      hltbDisposer = hltbStore.subscribe(target.steamAppId, onCardDataChanged);
    }
    applyCurrent();
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
    if (nextEligibility !== eligible) {
      eligible = nextEligibility;
      if (!nextEligibility) {
        stopDiscovery();
        return;
      }
    }
    if (!nextEligibility) return;
    if (discoveryTimer === undefined && !discoveryRunning) void discoverTarget();
    else applyCurrent();
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
  const removeHltbListener = hltbController.subscribe(syncEligibility);
  syncEligibility();

  return () => {
    if (stopped) return;
    stopped = true;
    stopDiscovery();
    removeControllerListener();
    removeHltbListener();
    const removeHistory = removeHistoryListener;
    removeHistoryListener = undefined;
    if (removeHistory) {
      try { removeHistory(); } catch { /* Steam may have already discarded this History instance. */ }
    }
    onStoreRoute = false;
  };
};
