import { afterPatch, findInReactTree } from "@decky/ui";
import { MetadataData, NativePartnerEvent, SteamInternals, SteamOverview } from "../types";

declare const appStore: SteamInternals["appStore"];
declare const appDetailsStore: SteamInternals["appDetailsStore"];

export type Unpatch = () => void;

export const patchInstallStatus = {
  activity: "pending",
  partnerEvents: "pending",
  contextMenu: "pending",
  router: "pending"
};

/** Typed accessor for the Steam internals exposed on `globalThis`. */
export const steamInternals = () => globalThis as unknown as SteamInternals;

export const hasSteamInternals = () => !!steamInternals().SteamClient && typeof appStore !== "undefined" && !!appStore && typeof appDetailsStore !== "undefined" && !!appDetailsStore;
export const hasActivityStore = () => !!steamInternals().appActivityStore;
export const hasAppDetailsStore = () => typeof appDetailsStore !== "undefined" && !!appDetailsStore;

export const metadataCache: Record<string, MetadataData> = {};

export const NON_STEAM_APP_TYPE = 1073741824;
export const GAME_DETAIL_ROUTES = [
  "/library/app/:appid",
  "/library/details/:appid",
  "/library/:collection/app/:appid",
];
export const GAME_ACTIVITY_ROUTES = [
  "/library/app/:appid/activity",
  "/library/app/:appid/activity/:rest",
  "/library/details/:appid/activity",
  "/library/details/:appid/activity/:rest",
  "/library/:collection/app/:appid/activity",
  "/library/:collection/app/:appid/activity/:rest",
];

export const metadataState: {
  bypassCounter: number;
  bypassBypass: number;
  metadataLoaded: boolean;
  metadataLoadPromise: Promise<void> | null;
  loadingMetadata: Set<number>;
  loadingScreenshots: Set<number>;
  lastObservedGameDetailAppId: number;
} = {
  bypassCounter: 0,
  bypassBypass: 0,
  metadataLoaded: false,
  metadataLoadPromise: null,
  loadingMetadata: new Set<number>(),
  loadingScreenshots: new Set<number>(),
  lastObservedGameDetailAppId: 0,
};

export const cleanTitle = (value: string) =>
  String(value || "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const isNonSteamAppWithoutPatchedMethod = (overview: any): boolean => {
  if (!overview) return false;
  if (Number(overview?.app_type) === NON_STEAM_APP_TYPE) return true;
  try {
    if (overview?.BIsShortcut?.()) return true;
  } catch (_error) {
    return false;
  }
  const appId = Number(overview?.appid);
  return Number.isFinite(appId) && !!metadataCache[String(appId)];
};

export const currentRoutePath = () => {
  const steamRouter = steamInternals().Router;
  const location = steamRouter?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
  const windowLocation = steamInternals().window as { pathname?: string; search?: string; hash?: string; href?: string } | undefined;
  return [
    location?.pathname,
    location?.search,
    location?.hash,
    windowLocation?.pathname,
    windowLocation?.search,
    windowLocation?.hash,
    windowLocation?.href,
  ]
    .filter(Boolean)
    .join(" ");
};

export const isNonSteamApp = (overview: any): boolean => {
  if (isNonSteamAppWithoutPatchedMethod(overview)) return true;
  try {
    if (overview?.BIsModOrShortcut?.()) return true;
  } catch (_error) {
    return false;
  }
  return false;
};

export const getOverview = (appId: number): SteamOverview | null => {
  try {
    return appStore?.GetAppOverviewByAppID?.(appId) ?? null;
  } catch (_error) {
    return null;
  }
};

export const steamAppIdForApp = (appId: number): number =>
  Number(metadataCache[String(appId)]?.steam_appid) || 0;


type SteamLinkTarget = {
  kind: "store" | "community";
  appId: number;
  replace: (mappedAppId: number) => string;
};

type SteamLinkRewrite = {
  url: string;
  rewrote: boolean;
  fromAppId?: number;
  toAppId?: number;
};

export const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

const steamWebLinkTarget = (url: string): SteamLinkTarget | null => {
  const match =
    url.match(/(?:https?:\/\/)?store\.steampowered\.com\/app\/(\d+)/i) ||
    url.match(/(?:https?:\/\/)?steamcommunity\.com\/app\/(\d+)/i);
  const queryMatch =
    match ||
    url.match(/(?:https?:\/\/)?(?:store\.steampowered\.com|steamcommunity\.com)\/[^?#]*\?(?:[^#&]*&)*appid=(\d+)/i);
  if (!queryMatch?.[1]) return null;
  const appId = Number(queryMatch[1]);
  if (!Number.isFinite(appId) || appId <= 0) return null;
  const kind = /steamcommunity\.com/i.test(queryMatch[0]) ? "community" : "store";
  const idIndex = queryMatch.index === undefined ? -1 : queryMatch.index + queryMatch[0].lastIndexOf(queryMatch[1]);
  if (idIndex < 0) return null;
  return {
    kind,
    appId,
    replace: (mappedAppId: number) =>
      `${url.slice(0, idIndex)}${mappedAppId}${url.slice(idIndex + queryMatch[1].length)}`,
  };
};

const steamProtocolLinkTarget = (url: string): SteamLinkTarget | null => {
  const storeMatch =
    url.match(/^steam:\/\/store\/(\d+)/i) ||
    url.match(/^steam:\/\/url\/StoreAppPage\/(\d+)/i);
  if (storeMatch?.[1]) {
    const appId = Number(storeMatch[1]);
    const idIndex = storeMatch.index === undefined ? -1 : storeMatch.index + storeMatch[0].lastIndexOf(storeMatch[1]);
    if (Number.isFinite(appId) && appId > 0 && idIndex >= 0) {
      return {
        kind: "store",
        appId,
        replace: (mappedAppId: number) =>
          `${url.slice(0, idIndex)}${mappedAppId}${url.slice(idIndex + storeMatch[1].length)}`,
      };
    }
  }

  const openUrlMatch = url.match(/^steam:\/\/openurl\/(.+)$/i);
  if (!openUrlMatch?.[1]) return null;
  const rawTarget = openUrlMatch[1];
  const decodedTarget = safeDecodeURIComponent(rawTarget);
  const nested = steamWebLinkTarget(decodedTarget) || steamWebLinkTarget(rawTarget);
  if (!nested) return null;
  return {
    kind: nested.kind,
    appId: nested.appId,
    replace: (mappedAppId: number) => `steam://openurl/${nested.replace(mappedAppId)}`,
  };
};

export const steamLinkTarget = (url: string): SteamLinkTarget | null => {
  try {
    const rawUrl = String(url || "");
    return steamProtocolLinkTarget(rawUrl) || steamWebLinkTarget(rawUrl);
  } catch (_error) {
    return null;
  }
};

export const rewriteSteamLinkToMatchedApp = (url: string): SteamLinkRewrite => {
  try {
    const rawUrl = String(url || "");
    const target = steamLinkTarget(rawUrl);
    if (!target) return { url: rawUrl, rewrote: false };
    const mapped = steamAppIdForApp(target.appId);
    if (mapped > 0 && mapped !== target.appId) {
      return {
        url: target.replace(mapped),
        rewrote: true,
        fromAppId: target.appId,
        toAppId: mapped,
      };
    }
    return { url: rawUrl, rewrote: false };
  } catch (_error) {
    return { url: String(url || ""), rewrote: false };
  }
};

export const rewriteSteamwebNavState = (state: any): { state: any; rewrote: boolean } => {
  try {
    if (!state || typeof state !== "object") return { state, rewrote: false };

    let clone: any;
    try {
      clone = structuredClone(state);
    } catch (_error) {
      return { state, rewrote: false };
    }

    let rewrote = false;
    const seen = new WeakSet<object>();
    const walk = (value: any, depth: number) => {
      if (!value || typeof value !== "object" || depth < 0) return;
      if (seen.has(value)) return;
      seen.add(value);

      const keys: Iterable<any> = Array.isArray(value) ? value.keys() : Object.keys(value);
      for (const key of keys) {
        const item = value[key];
        if (typeof item === "string") {
          const rewritten = rewriteSteamLinkToMatchedApp(item);
          if (rewritten.rewrote) {
            value[key] = rewritten.url;
            rewrote = true;
          }
          continue;
        }
        if (item && typeof item === "object") {
          walk(item, depth - 1);
        }
      }
    };

    walk(clone, 6);
    return { state: clone, rewrote };
  } catch (_error) {
    return { state, rewrote: false };
  }
};

export const appName = (appId: number): string => {
  const overview = getOverview(appId);
  return cleanTitle(
    overview?.display_name ||
      overview?.localized_name ||
      overview?.name ||
      `App ${appId}`
  );
};

export const DECKY_NATIVE_ACTIVITY_WINDOW_KEY = "__deckyNativeActivityCache";
export const DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY = "__deckyNativePartnerEvents";
export const DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY = "__deckyNativePartnerEventStore";

export const deckyNativeActivityCache = () => {
  const host = steamInternals();
  if (!host[DECKY_NATIVE_ACTIVITY_WINDOW_KEY]) host[DECKY_NATIVE_ACTIVITY_WINDOW_KEY] = new Map<number, unknown>();
  return host[DECKY_NATIVE_ACTIVITY_WINDOW_KEY] as Map<number, unknown>;
};

export const deckyNativePartnerEventCache = () => {
  const host = steamInternals();
  if (!host[DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY]) host[DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY] = new Map<string, NativePartnerEvent>();
  return host[DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY] as Map<string, NativePartnerEvent>;
};

export const deckyNativePartnerEventStore = () => steamInternals()[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY] || null;

export const activityAppIdFromUrl = (url: string) => {
  const decoded = decodeURIComponent(String(url || ""));
  const patterns = [
    /library\/(?:appactivityfeed|appactivity|activityfeed|activity|appnews|appupdates)\/(\d+)/i,
    /(?:appactivityfeed|appactivity|activityfeed|activity|appnews|appupdates)[^?]*[?&](?:appid|app_id|appId)=(\d+)/i,
    /(?:appid|app_id|appId)=(\d+).*?(?:appactivity|activity|appnews|appupdates)/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
};


export const gameDetailAppIdFromPath = (path: string) => {
  const decoded = decodeURIComponent(String(path || ""));
  const patterns = [
    /\/library\/(?:app|details|[^/]+\/app)\/(\d+)(?:[/?#\s].*)?/i,
    /(?:^|[?#&\s])appid=(\d+)/i,
    /(?:^|[?#&\s])app_id=(\d+)/i,
    /\bapp\/(\d+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) return Number(match[1] || 0);
  }
  return 0;
};

const appIdFromDom = () => {
  const attributes = ["href", "data-appid", "data-app-id", "data-appid64", "data-ds-appid", "aria-label", "title"];
  const candidates = deepQuerySelectorAll("a, button, [role='button'], [role='tab'], [data-appid], [data-app-id], [data-ds-appid]");
  for (const element of candidates) {
    if (!visibleElement(element)) continue;
    for (const attribute of attributes) {
      const value = (element as HTMLElement).getAttribute(attribute) || "";
      const appId = gameDetailAppIdFromPath(value);
      if (appId) return appId;
    }
  }
  return 0;
};


const appIdFromVisibleMetadataTitle = () => {
  try {
    const pageText = normalizedTabText(document.body?.textContent || "");
    if (!pageText || !metadataCache) return 0;
    const candidates = Object.entries(metadataCache)
      .map(([key, metadata]) => {
        const appId = Number(key);
        const title = normalizedTabText(metadata?.title || appName(appId));
        return { appId, title };
      })
      .filter((candidate) => candidate.appId && candidate.title && candidate.title.length >= 3)
      .sort((a, b) => b.title.length - a.title.length);
    for (const candidate of candidates) {
      if (pageText.includes(candidate.title)) return candidate.appId;
    }
  } catch (_error) {
    // Best-effort fallback only.
  }
  return 0;
};

export const currentGameDetailAppId = () => {
  const routeAppId = gameDetailAppIdFromPath(currentRoutePath());
  if (routeAppId) return routeAppId;
  if (metadataState.lastObservedGameDetailAppId) return metadataState.lastObservedGameDetailAppId;
  const titleAppId = appIdFromVisibleMetadataTitle();
  if (titleAppId) return titleAppId;
  const domAppId = appIdFromDom();
  if (domAppId && (metadataCache[String(domAppId)] || isNonSteamAppWithoutPatchedMethod(getOverview(domAppId)))) return domAppId;
  return domAppId || 0;
};

export const visibleElement = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
};

export const deepQuerySelectorAll = (selector: string, root: Document | ShadowRoot | Element = document): Element[] => {
  const results: Element[] = [];
  const seen = new Set<Element>();
  const visit = (scope: Document | ShadowRoot | Element) => {
    let elements: Element[] = [];
    try {
      elements = Array.from((scope as any).querySelectorAll?.(selector) || []);
    } catch (_error) {
      elements = [];
    }
    elements.forEach((element) => {
      if (!seen.has(element)) {
        seen.add(element);
        results.push(element);
      }
      const shadowRoot = (element as HTMLElement).shadowRoot;
      if (shadowRoot) visit(shadowRoot);
    });
  };
  visit(root);
  return results;
};

export const normalizedTabText = (value: string) =>
  String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();

export const patchMethod = (
  target: any,
  methodName: string,
  replacement: (thisValue: any, original: (...args: any[]) => any, args: any[]) => any
): Unpatch => {
  if (!target?.[methodName]) return () => undefined;
  const original = target[methodName];
  target[methodName] = function patchedMethod(...args: any[]) {
    const boundOriginal = original.bind(this);
    try {
      return replacement(this, boundOriginal, args);
    } catch (_error) {
      // A patch replacement must never break the Steam method it wraps.
      try {
        return boundOriginal(...args);
      } catch (_originalError) {
        return undefined;
      }
    }
  };
  return () => {
    target[methodName] = original;
  };
};

export const safeAfterPatch = (
  target: any,
  methodName: string,
  handler: (args: any[], ret: any) => any
) =>
  afterPatch(target, methodName, function patchedAfter(this: any, args: any[], ret: any) {
    try {
      return handler.call(this, args, ret);
    } catch (_error) {
      // An afterPatch handler must never break the Steam method it augments.
      return ret;
    }
  });

export const overviewFromReactTree = (tree: any): any | null => {
  try {
    const holder = findInReactTree(tree, (node: any) => {
      const overview = node?.props?.overview || node?.overview;
      return overview?.appid ? true : undefined;
    });
    return holder?.props?.overview || holder?.overview || null;
  } catch (_error) {
    return null;
  }
};

export const appIdFromReactTree = (tree: any) => {
  const overview = overviewFromReactTree(tree);
  const appId = Number(overview?.appid || 0);
  return Number.isFinite(appId) ? appId : 0;
};


export const historyPathFromArgs = (args: any[]) => {
  const first = args?.[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    return String(first.pathname || first.path || first.href || first.url || "");
  }
  return "";
};

export const historyStateFromArgs = (args: any[]) => {
  const first = args?.[0];
  const second = args?.[1];
  // React Router / Steam history may call push(path, { state }), push(path, state),
  // push({ pathname, state }), replace(location, state), or the raw browser
  // history API with the state as first argument. The previous build only handled
  // the direct state shapes, so Steam's Navigator.App(appid, { gidPartnerEvent })
  // slipped through as args[1].state and kept polluting the back stack.
  if (first && typeof first === "object") {
    if (first.state?.event_to_show) return first.state;
    if (first.event_to_show) return first;
    if ("state" in first && first.state) return first.state;
  }
  if (second && typeof second === "object") {
    if (second.state?.event_to_show) return second.state;
    if (second.event_to_show) return second;
    if ("state" in second && second.state) return second.state;
  }
  return second;
};
