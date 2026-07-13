const manifest = {"name":"Decky Metadata"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
const callable = api.callable;
const routerHook = api.routerHook;
const toaster = api.toaster;

var DefaultContext = {
  color: undefined,
  size: undefined,
  className: undefined,
  style: undefined,
  attr: undefined
};
var IconContext = SP_REACT.createContext && /*#__PURE__*/SP_REACT.createContext(DefaultContext);

var _excluded = ["attr", "size", "title"];
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (-1 !== e.indexOf(n)) continue; t[n] = r[n]; } return t; }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), true).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function Tree2Element(tree) {
  return tree && tree.map((node, i) => /*#__PURE__*/SP_REACT.createElement(node.tag, _objectSpread({
    key: i
  }, node.attr), Tree2Element(node.child)));
}
function GenIcon(data) {
  return props => /*#__PURE__*/SP_REACT.createElement(IconBase, _extends({
    attr: _objectSpread({}, data.attr)
  }, props), Tree2Element(data.child));
}
function IconBase(props) {
  var elem = conf => {
    var {
        attr,
        size,
        title
      } = props,
      svgProps = _objectWithoutProperties(props, _excluded);
    var computedSize = size || conf.size || "1em";
    var className;
    if (conf.className) className = conf.className;
    if (props.className) className = (className ? className + " " : "") + props.className;
    return /*#__PURE__*/SP_REACT.createElement("svg", _extends({
      stroke: "currentColor",
      fill: "currentColor",
      strokeWidth: "0"
    }, conf.attr, attr, svgProps, {
      className: className,
      style: _objectSpread(_objectSpread({
        color: props.color || conf.color
      }, conf.style), props.style),
      height: computedSize,
      width: computedSize,
      xmlns: "http://www.w3.org/2000/svg"
    }), title && /*#__PURE__*/SP_REACT.createElement("title", null, title), props.children);
  };
  return IconContext !== undefined ? /*#__PURE__*/SP_REACT.createElement(IconContext.Consumer, null, conf => elem(conf)) : elem(DefaultContext);
}

// THIS FILE IS AUTO GENERATED
function FaExclamationTriangle (props) {
  return GenIcon({"attr":{"viewBox":"0 0 576 512"},"child":[{"tag":"path","attr":{"d":"M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"},"child":[]}]})(props);
}function FaDatabase (props) {
  return GenIcon({"attr":{"viewBox":"0 0 448 512"},"child":[{"tag":"path","attr":{"d":"M448 73.143v45.714C448 159.143 347.667 192 224 192S0 159.143 0 118.857V73.143C0 32.857 100.333 0 224 0s224 32.857 224 73.143zM448 176v102.857C448 319.143 347.667 352 224 352S0 319.143 0 278.857V176c48.125 33.143 136.208 48.572 224 48.572S399.874 209.143 448 176zm0 160v102.857C448 479.143 347.667 512 224 512S0 479.143 0 438.857V336c48.125 33.143 136.208 48.572 224 48.572S399.874 369.143 448 336z"},"child":[]}]})(props);
}function FaCheckCircle (props) {
  return GenIcon({"attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"},"child":[]}]})(props);
}

const getAllMetadata = callable("get_all_metadata");
const getMetadata = callable("get_metadata");
const saveMetadata = callable("save_metadata");
const removeMetadata = callable("remove_metadata");
const clearMetadataCache = callable("clear_metadata_cache");
const refreshDelistedIndex = callable("refresh_delisted_index");
const getDelistedIndexStatus = callable("get_delisted_index_status");
const frontendLog = callable("frontend_log");
const searchMetadata = callable("search_metadata");
const fetchMetadata = callable("fetch_metadata");
const applyFetchedMetadata = callable("apply_fetched_metadata");
const getCommunityFallbackPage = callable("get_community_fallback_page");
const autoFetchMetadata = callable("auto_fetch_metadata");
const enrichSteamApp = callable("enrich_steam_app");
const startScanMissing = callable("start_scan_missing");
const getMissingMetadataCount = callable("get_missing_metadata_count");
const getScanProgress = callable("get_scan_progress");
const startRefreshSteamActivities = callable("start_refresh_steam_activities");
const refreshSteamActivityForApp = callable("refresh_steam_activity_for_app");
const getActivityRefreshProgress = callable("get_activity_refresh_progress");
const getLocalShortcuts = callable("get_local_shortcuts");
const getPluginVersion = callable("get_plugin_version");
const getDebugLogging = callable("get_debug_logging");
const setDebugLogging = callable("set_debug_logging");

var backend = /*#__PURE__*/Object.freeze({
    __proto__: null,
    applyFetchedMetadata: applyFetchedMetadata,
    autoFetchMetadata: autoFetchMetadata,
    clearMetadataCache: clearMetadataCache,
    enrichSteamApp: enrichSteamApp,
    fetchMetadata: fetchMetadata,
    frontendLog: frontendLog,
    getActivityRefreshProgress: getActivityRefreshProgress,
    getAllMetadata: getAllMetadata,
    getCommunityFallbackPage: getCommunityFallbackPage,
    getDebugLogging: getDebugLogging,
    getDelistedIndexStatus: getDelistedIndexStatus,
    getLocalShortcuts: getLocalShortcuts,
    getMetadata: getMetadata,
    getMissingMetadataCount: getMissingMetadataCount,
    getPluginVersion: getPluginVersion,
    getScanProgress: getScanProgress,
    refreshDelistedIndex: refreshDelistedIndex,
    refreshSteamActivityForApp: refreshSteamActivityForApp,
    removeMetadata: removeMetadata,
    saveMetadata: saveMetadata,
    searchMetadata: searchMetadata,
    setDebugLogging: setDebugLogging,
    startRefreshSteamActivities: startRefreshSteamActivities,
    startScanMissing: startScanMissing
});

let verbose = false;
const setVerboseLogging = (enabled) => {
    verbose = !!enabled;
};
const prefix = (area) => `[Decky Metadata][${area}]`;
const info = (area, message, ...args) => {
    if (verbose)
        console.info(prefix(area), message, ...args);
};
const warn = (area, message, ...args) => {
    console.warn(prefix(area), message, ...args);
};
const error = (area, message, ...args) => {
    console.error(prefix(area), message, ...args);
};

// Pure decision logic for the BIsModOrShortcut afterPatch. Extracted so the
// precedence rules are unit-testable: the 2026-07-11 launch regression was an
// ordering bug here (the render shield consumed before the in-call truth
// window), which only surfaced on-device.
const decideBIsModOrShortcut = (input) => {
    const { isPatchedNonSteam, originalRet, bypassCounter, path, consumeShield } = input;
    if (!isPatchedNonSteam) {
        return { finalRet: originalRet, reason: "not-nonsteam", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    if (originalRet !== true) {
        return { finalRet: originalRet, reason: "original-not-shortcut", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    // In-call truth must outrank the render shield and the home special case:
    // Steam's launch path derives the shortcut gameid via GetGameID /
    // GetPrimaryAppID, and spoofing inside those calls makes RunGame receive a
    // plain-appid gameid the client silently drops. The shield must not be
    // consulted here at all — its hit budget belongs to render checks.
    if (bypassCounter === -1) {
        return { finalRet: originalRet, reason: "in-call-truth", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    const shieldHit = consumeShield();
    if (shieldHit) {
        return { finalRet: false, reason: "render-shield", shieldConsulted: true, shieldHit: true, nextBypassCounter: bypassCounter };
    }
    if (path === "/library/home") {
        return { finalRet: false, reason: "home-special-case", shieldConsulted: true, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    const nextBypassCounter = bypassCounter > 0 ? bypassCounter - 1 : bypassCounter;
    const shouldBypass = nextBypassCounter > 0;
    return {
        finalRet: shouldBypass,
        reason: shouldBypass ? "truth-window" : "normal-shortcut",
        shieldConsulted: true,
        shieldHit: false,
        nextBypassCounter,
    };
};

const withInCallTruth = (state, run) => {
    const previous = state.bypassCounter;
    state.bypassCounter = -1;
    try {
        return run();
    }
    finally {
        state.bypassCounter = previous;
    }
};

const patchInstallStatus = {
    activity: "pending",
    partnerEvents: "pending",
    contextMenu: "pending"};
/** Typed accessor for the Steam internals exposed on `globalThis`. */
const steamInternals = () => globalThis;
const hasSteamInternals = () => !!steamInternals().SteamClient && typeof appStore !== "undefined" && !!appStore && typeof appDetailsStore !== "undefined" && !!appDetailsStore;
const steamPatchTargetsReady = () => {
    try {
        return hasSteamInternals() && !!appStore?.allApps?.[0]?.__proto__ && !!appDetailsStore?.__proto__;
    }
    catch (_error) {
        return false;
    }
};
const hasActivityStore = () => !!steamInternals().appActivityStore;
const metadataCache = {};
const NON_STEAM_APP_TYPE = 1073741824;
const GAME_DETAIL_ROUTES = [
    "/library/app/:appid",
    "/library/details/:appid",
    "/library/:collection/app/:appid",
];
const GAME_ACTIVITY_ROUTES = [
    "/library/app/:appid/activity",
    "/library/app/:appid/activity/:rest",
    "/library/details/:appid/activity",
    "/library/details/:appid/activity/:rest",
    "/library/:collection/app/:appid/activity",
    "/library/:collection/app/:appid/activity/:rest",
];
const metadataState = {
    bypassCounter: 0,
    metadataLoaded: false,
    metadataLoadPromise: null,
    loadingMetadata: new Set(),
    loadingScreenshots: new Set(),
    appliedMetadataRef: {},
    lastObservedGameDetailAppId: 0,
    routeShield: null,
};
const cleanTitle = (value) => String(value || "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const isNonSteamAppWithoutPatchedMethod = (overview) => {
    if (!overview)
        return false;
    if (Number(overview?.app_type) === NON_STEAM_APP_TYPE)
        return true;
    try {
        if (overview?.BIsShortcut?.())
            return true;
    }
    catch (_error) {
        return false;
    }
    const appId = Number(overview?.appid);
    return Number.isFinite(appId) && !!metadataCache[String(appId)];
};
const currentRoutePath = () => {
    const steamRouter = steamInternals().Router;
    const location = steamRouter?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
    const windowLocation = steamInternals().window;
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
const isNonSteamApp = (overview) => {
    if (isNonSteamAppWithoutPatchedMethod(overview))
        return true;
    try {
        if (overview?.BIsModOrShortcut?.())
            return true;
    }
    catch (_error) {
        return false;
    }
    return false;
};
const getOverview = (appId) => {
    try {
        return appStore?.GetAppOverviewByAppID?.(appId) ?? null;
    }
    catch (_error) {
        return null;
    }
};
const steamAppIdForApp = (appId) => Number(metadataCache[String(appId)]?.steam_appid) || 0;
const safeDecodeURIComponent = (value) => {
    try {
        return decodeURIComponent(value);
    }
    catch (_error) {
        return value;
    }
};
const steamWebLinkTarget = (url) => {
    const match = url.match(/(?:https?:\/\/)?store\.steampowered\.com\/app\/(\d+)/i) ||
        url.match(/(?:https?:\/\/)?steamcommunity\.com\/app\/(\d+)/i);
    const queryMatch = match ||
        url.match(/(?:https?:\/\/)?(?:store\.steampowered\.com|steamcommunity\.com)\/[^?#]*\?(?:[^#&]*&)*appid=(\d+)/i);
    if (!queryMatch?.[1])
        return null;
    const appId = Number(queryMatch[1]);
    if (!Number.isFinite(appId) || appId <= 0)
        return null;
    const kind = /steamcommunity\.com/i.test(queryMatch[0]) ? "community" : "store";
    const idIndex = queryMatch.index === undefined ? -1 : queryMatch.index + queryMatch[0].lastIndexOf(queryMatch[1]);
    if (idIndex < 0)
        return null;
    return {
        kind,
        appId,
        replace: (mappedAppId) => `${url.slice(0, idIndex)}${mappedAppId}${url.slice(idIndex + queryMatch[1].length)}`,
    };
};
const steamProtocolLinkTarget = (url) => {
    const storeMatch = url.match(/^steam:\/\/store\/(\d+)/i) ||
        url.match(/^steam:\/\/url\/StoreAppPage\/(\d+)/i);
    if (storeMatch?.[1]) {
        const appId = Number(storeMatch[1]);
        const idIndex = storeMatch.index === undefined ? -1 : storeMatch.index + storeMatch[0].lastIndexOf(storeMatch[1]);
        if (Number.isFinite(appId) && appId > 0 && idIndex >= 0) {
            return {
                kind: "store",
                appId,
                replace: (mappedAppId) => `${url.slice(0, idIndex)}${mappedAppId}${url.slice(idIndex + storeMatch[1].length)}`,
            };
        }
    }
    const openUrlMatch = url.match(/^steam:\/\/openurl\/(.+)$/i);
    if (!openUrlMatch?.[1])
        return null;
    const rawTarget = openUrlMatch[1];
    const decodedTarget = safeDecodeURIComponent(rawTarget);
    const nested = steamWebLinkTarget(decodedTarget) || steamWebLinkTarget(rawTarget);
    if (!nested)
        return null;
    return {
        kind: nested.kind,
        appId: nested.appId,
        replace: (mappedAppId) => `steam://openurl/${nested.replace(mappedAppId)}`,
    };
};
const steamLinkTarget = (url) => {
    try {
        const rawUrl = String(url || "");
        return steamProtocolLinkTarget(rawUrl) || steamWebLinkTarget(rawUrl);
    }
    catch (_error) {
        return null;
    }
};
const rewriteSteamLinkToMatchedApp = (url) => {
    try {
        const rawUrl = String(url || "");
        const target = steamLinkTarget(rawUrl);
        if (!target)
            return { url: rawUrl, rewrote: false };
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
    }
    catch (_error) {
        return { url: String(url || ""), rewrote: false };
    }
};
const rewriteSteamwebNavState = (state) => {
    try {
        if (!state || typeof state !== "object")
            return { state, rewrote: false };
        let clone;
        try {
            clone = structuredClone(state);
        }
        catch (_error) {
            return { state, rewrote: false };
        }
        let rewrote = false;
        const seen = new WeakSet();
        const walk = (value, depth) => {
            if (!value || typeof value !== "object" || depth < 0)
                return;
            if (seen.has(value))
                return;
            seen.add(value);
            const keys = Array.isArray(value) ? value.keys() : Object.keys(value);
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
    }
    catch (_error) {
        return { state, rewrote: false };
    }
};
const appName = (appId) => {
    const overview = getOverview(appId);
    return cleanTitle(overview?.display_name ||
        overview?.localized_name ||
        overview?.name ||
        `App ${appId}`);
};
const DECKY_NATIVE_ACTIVITY_WINDOW_KEY = "__deckyNativeActivityCache";
const DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY = "__deckyNativePartnerEvents";
const DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY = "__deckyNativePartnerEventStore";
const deckyNativeActivityCache = () => {
    const host = steamInternals();
    if (!host[DECKY_NATIVE_ACTIVITY_WINDOW_KEY])
        host[DECKY_NATIVE_ACTIVITY_WINDOW_KEY] = new Map();
    return host[DECKY_NATIVE_ACTIVITY_WINDOW_KEY];
};
const deckyNativePartnerEventCache = () => {
    const host = steamInternals();
    if (!host[DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY])
        host[DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY] = new Map();
    return host[DECKY_NATIVE_PARTNER_EVENTS_WINDOW_KEY];
};
const deckyNativePartnerEventStore = () => steamInternals()[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY] || null;
const activityAppIdFromUrl = (url) => {
    const decoded = decodeURIComponent(String(url || ""));
    const patterns = [
        /library\/(?:appactivityfeed|appactivity|activityfeed|activity|appnews|appupdates)\/(\d+)/i,
        /(?:appactivityfeed|appactivity|activityfeed|activity|appnews|appupdates)[^?]*[?&](?:appid|app_id|appId)=(\d+)/i,
        /(?:appid|app_id|appId)=(\d+).*?(?:appactivity|activity|appnews|appupdates)/i,
    ];
    for (const pattern of patterns) {
        const match = decoded.match(pattern);
        if (match)
            return Number(match[1]);
    }
    return 0;
};
const gameDetailAppIdFromPath = (path) => {
    const decoded = decodeURIComponent(String(path || ""));
    const patterns = [
        /\/library\/(?:app|details|[^/]+\/app)\/(\d+)(?:[/?#\s].*)?/i,
        /(?:^|[?#&\s])appid=(\d+)/i,
        /(?:^|[?#&\s])app_id=(\d+)/i,
        /\bapp\/(\d+)\b/i,
    ];
    for (const pattern of patterns) {
        const match = decoded.match(pattern);
        if (match)
            return Number(match[1] || 0);
    }
    return 0;
};
const appIdFromDom = () => {
    const attributes = ["href", "data-appid", "data-app-id", "data-appid64", "data-ds-appid", "aria-label", "title"];
    const candidates = deepQuerySelectorAll("a, button, [role='button'], [role='tab'], [data-appid], [data-app-id], [data-ds-appid]");
    for (const element of candidates) {
        if (!visibleElement(element))
            continue;
        for (const attribute of attributes) {
            const value = element.getAttribute(attribute) || "";
            const appId = gameDetailAppIdFromPath(value);
            if (appId)
                return appId;
        }
    }
    return 0;
};
const appIdFromVisibleMetadataTitle = () => {
    try {
        const pageText = normalizedTabText(document.body?.textContent || "");
        if (!pageText || !metadataCache)
            return 0;
        const candidates = Object.entries(metadataCache)
            .map(([key, metadata]) => {
            const appId = Number(key);
            const title = normalizedTabText(metadata?.title || appName(appId));
            return { appId, title };
        })
            .filter((candidate) => candidate.appId && candidate.title && candidate.title.length >= 3)
            .sort((a, b) => b.title.length - a.title.length);
        for (const candidate of candidates) {
            if (pageText.includes(candidate.title))
                return candidate.appId;
        }
    }
    catch (_error) {
        // Best-effort fallback only.
    }
    return 0;
};
const currentGameDetailAppId = () => {
    const routeAppId = gameDetailAppIdFromPath(currentRoutePath());
    if (routeAppId)
        return routeAppId;
    if (metadataState.lastObservedGameDetailAppId)
        return metadataState.lastObservedGameDetailAppId;
    const titleAppId = appIdFromVisibleMetadataTitle();
    if (titleAppId)
        return titleAppId;
    const domAppId = appIdFromDom();
    if (domAppId && (metadataCache[String(domAppId)] || isNonSteamAppWithoutPatchedMethod(getOverview(domAppId))))
        return domAppId;
    return domAppId || 0;
};
const visibleElement = (element) => {
    if (!(element instanceof HTMLElement))
        return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2)
        return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
};
const deepQuerySelectorAll = (selector, root = document) => {
    const results = [];
    const seen = new Set();
    const visit = (scope) => {
        let elements = [];
        try {
            elements = Array.from(scope.querySelectorAll?.(selector) || []);
        }
        catch (_error) {
            elements = [];
        }
        elements.forEach((element) => {
            if (!seen.has(element)) {
                seen.add(element);
                results.push(element);
            }
            const shadowRoot = element.shadowRoot;
            if (shadowRoot)
                visit(shadowRoot);
        });
    };
    visit(root);
    return results;
};
const normalizedTabText = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
const patchMethod = (target, methodName, replacement) => {
    if (!target?.[methodName])
        return () => undefined;
    const original = target[methodName];
    target[methodName] = function patchedMethod(...args) {
        const boundOriginal = original.bind(this);
        try {
            return replacement(this, boundOriginal, args);
        }
        catch (_error) {
            // A patch replacement must never break the Steam method it wraps.
            try {
                return boundOriginal(...args);
            }
            catch (_originalError) {
                return undefined;
            }
        }
    };
    return () => {
        target[methodName] = original;
    };
};
const safeAfterPatch = (target, methodName, handler) => DFL.afterPatch(target, methodName, function patchedAfter(args, ret) {
    try {
        return handler.call(this, args, ret);
    }
    catch (_error) {
        // An afterPatch handler must never break the Steam method it augments.
        return ret;
    }
});
const overviewFromReactTree = (tree) => {
    try {
        const holder = DFL.findInReactTree(tree, (node) => {
            const overview = node?.props?.overview || node?.overview;
            return overview?.appid ? true : undefined;
        });
        return holder?.props?.overview || holder?.overview || null;
    }
    catch (_error) {
        return null;
    }
};
const appIdFromReactTree = (tree) => {
    const overview = overviewFromReactTree(tree);
    const appId = Number(overview?.appid || 0);
    return Number.isFinite(appId) ? appId : 0;
};
const historyPathFromArgs = (args) => {
    const first = args?.[0];
    if (typeof first === "string")
        return first;
    if (first && typeof first === "object") {
        return String(first.pathname || first.path || first.href || first.url || "");
    }
    return "";
};
const historyStateFromArgs = (args) => {
    const first = args?.[0];
    const second = args?.[1];
    // React Router / Steam history may call push(path, { state }), push(path, state),
    // push({ pathname, state }), replace(location, state), or the raw browser
    // history API with the state as first argument. The previous build only handled
    // the direct state shapes, so Steam's Navigator.App(appid, { gidPartnerEvent })
    // slipped through as args[1].state and kept polluting the back stack.
    if (first && typeof first === "object") {
        if (first.state?.event_to_show)
            return first.state;
        if (first.event_to_show)
            return first;
        if ("state" in first && first.state)
            return first.state;
    }
    if (second && typeof second === "object") {
        if (second.state?.event_to_show)
            return second.state;
        if (second.event_to_show)
            return second;
        if ("state" in second && second.state)
            return second.state;
    }
    return second;
};
// The hit budget is only a runaway backstop; the 2000 ms TTL is the real expiry required by launch flows.
const ROUTE_SHIELD_MAX_HITS = 64;
const ROUTE_SHIELD_TTL_MS = 2000;
let shieldSeq = 0;
const armRouteShield = (appId, path, trigger) => {
    if (appId <= 0)
        return;
    shieldSeq += 1;
    metadataState.routeShield = {
        appId,
        path,
        trigger,
        armedAt: Date.now(),
        remaining: ROUTE_SHIELD_MAX_HITS,
        seqId: shieldSeq,
    };
};
const consumeRouteShield = (appId) => {
    const shield = metadataState.routeShield;
    if (!shield)
        return false;
    if (shield.appId !== appId)
        return false;
    const age = Date.now() - shield.armedAt;
    if (age > ROUTE_SHIELD_TTL_MS || shield.remaining <= 0) {
        metadataState.routeShield = null; // Stale or exhausted
        return false;
    }
    shield.remaining -= 1;
    return true;
};
const clearRouteShield = () => {
    metadataState.routeShield = null;
};

let bypassTraceEnabled = false;
const bypassArmTraceAt = {};
const bIsModTraceAt = {};
const traceBIsModDecision = (appId, path, originalRet, finalRet, reason, shieldState, bypassCounterBefore, bypassCounterAfter, hasCache) => {
    if (!bypassTraceEnabled)
        return;
    const now = Date.now();
    const key = `${appId}-${reason}`;
    if (now - (bIsModTraceAt[key] || 0) < 1000)
        return;
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
    }).catch(() => undefined);
};
const setBypassTraceEnabled = (enabled) => {
    bypassTraceEnabled = !!enabled;
    if (!bypassTraceEnabled) {
        Object.keys(bypassArmTraceAt).forEach((key) => delete bypassArmTraceAt[key]);
        Object.keys(bIsModTraceAt).forEach((key) => delete bIsModTraceAt[key]);
    }
};
const isBypassTraceEnabled = () => bypassTraceEnabled;
const traceBypassArm = (source) => {
    if (!bypassTraceEnabled)
        return;
    const now = Date.now();
    if (now - (bypassArmTraceAt[source] || 0) < 1000)
        return;
    bypassArmTraceAt[source] = now;
    void frontendLog("trace", "bypass armed", { source }).catch(() => undefined);
};
const traceBypassTruthWindowHit = (appId, bypassCounter) => {
    if (!bypassTraceEnabled)
        return;
    if (!Number.isFinite(appId) || !metadataCache[String(appId)])
        return;
    const routeAppId = gameDetailAppIdFromPath(currentRoutePath());
    if (routeAppId !== appId)
        return;
    void frontendLog("trace", "bypass truth window hit", { appId, bypassCounter }).catch(() => undefined);
};
const shortcutAppIdForSteamAppId = (steamAppId) => {
    if (!Number.isFinite(steamAppId) || steamAppId <= 0)
        return null;
    for (const [shortcutAppIdText, metadata] of Object.entries(metadataCache)) {
        const shortcutAppId = Number(shortcutAppIdText);
        const metadataSteamAppId = Number(metadata?.steam_appid);
        if (Number.isFinite(shortcutAppId) &&
            shortcutAppId > 0 &&
            metadataSteamAppId === steamAppId) {
            return shortcutAppId;
        }
    }
    return null;
};
const ensureDetailsOverviewSafeFields = (appId) => {
    try {
        const appData = appDetailsStore?.GetAppData?.(appId);
        const details = appData?.details;
        const overview = getOverview(appId);
        if (!details || !isNonSteamApp(overview))
            return;
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
        if (!Array.isArray(details.vecDLC))
            details.vecDLC = [];
        if (!Array.isArray(details.vecChildConfigApps))
            details.vecChildConfigApps = [];
        if (!Array.isArray(details.vecScreenShots))
            details.vecScreenShots = [];
        if (details.appid == null)
            details.appid = appId;
        if (details.nAppID == null)
            details.nAppID = appId;
    }
    catch (_error) {
        // Best-effort guard only; never block Steam's native bootstrap.
    }
};
const refreshMetadataCache = async () => {
    const all = await getAllMetadata();
    Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
    Object.assign(metadataCache, all || {});
    metadataState.metadataLoaded = true;
    Object.keys(metadataCache).forEach((key) => applyMetadata(Number(key)));
};
const ensureMetadataCache = async () => {
    if (metadataState.metadataLoaded)
        return;
    if (!metadataState.metadataLoadPromise) {
        metadataState.metadataLoadPromise = refreshMetadataCache().finally(() => {
            metadataState.metadataLoadPromise = null;
        });
    }
    await metadataState.metadataLoadPromise;
};
const startMetadataBootstrap = () => {
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
        if (cancelled)
            return;
        try {
            await ensureMetadataCache();
            Object.keys(metadataCache).forEach((key) => applyMetadata(Number(key)));
        }
        catch (error) {
            warn("bridge", "metadata bootstrap failed", error);
        }
        attempts += 1;
        if (!cancelled && attempts < 24) {
            window.setTimeout(tick, 500);
        }
    };
    void tick();
    return () => {
        cancelled = true;
    };
};
const applyMetadata = (appId) => {
    const overview = getOverview(appId);
    if (!isNonSteamApp(overview))
        return;
    const metadata = metadataCache[String(appId)];
    if (!metadata)
        return;
    try {
        if (typeof metadata.rating === "number") {
            overview.metacritic_score = metadata.rating;
        }
        if (typeof metadata.deck_compat_category === "number" &&
            metadata.deck_compat_category >= 1 &&
            metadata.deck_compat_category <= 3) {
            const category = metadata.deck_compat_category & 3;
            const prevPacked = Number(overview.steam_hw_compat_category_packed) || 0;
            // bits 0-1 = steam_deck_compat_category; bits 2-3 = verified-filter copy; keep bits >= 4
            overview.steam_hw_compat_category_packed =
                (prevPacked & -16) | category | (category << 2);
        }
        if (!overview.m_setStoreCategories) {
            overview.m_setStoreCategories = new Set();
        }
        metadata.store_categories?.forEach((category) => {
            overview.m_setStoreCategories.add(Number(category));
        });
    }
    catch (_error) {
        // Steam objects are not always writable during early bootstrap.
    }
    const appData = appDetailsStore?.GetAppData?.(appId);
    if (!appData)
        return;
    ensureDetailsOverviewSafeFields(appId);
    const description = metadata.description || metadata.short_description || "";
    appData.descriptionsData = {
        strFullDescription: description,
        strSnippet: description,
    };
    appData.associationData = {
        rgDevelopers: (metadata.developers || []).map((developer) => ({
            strName: developer.name,
            strURL: developer.url || "",
        })),
        rgPublishers: (metadata.publishers || []).map((publisher) => ({
            strName: publisher.name,
            strURL: publisher.url || "",
        })),
        rgFranchises: [],
    };
    try {
        const releaseDate = metadata.release_date;
        if (typeof releaseDate === "number" && releaseDate > 0) {
            overview.rt_original_release_date = releaseDate;
            overview.rt_steam_release_date = releaseDate;
        }
    }
    catch (_error) {
        // Steam objects are not always writable during early bootstrap.
    }
    const screenshots = steamScreenshotsFromMetadata(appId, metadata);
    if (screenshots.length) {
        const screenshotData = {
            rgScreenshots: screenshots,
            screenshots,
            vecScreenshots: screenshots,
            vecScreenShots: screenshots,
        };
        appData.screenshots = screenshotData;
        if (appData.details) {
            appData.details.nScreenshots = screenshots.length;
            appData.details.vecScreenShots = screenshots;
        }
    }
    if (appData.details) {
        if (metadata.steam_store_state === "delisted") {
            appData.details.bCommunityMarketPresence = false;
        }
        else if (screenshots.length) {
            appData.details.bCommunityMarketPresence = true;
        }
    }
    const metadataKey = String(appId);
    if (metadataState.appliedMetadataRef[metadataKey] !== metadata) {
        try {
            appDetailsCache?.SetCachedDataForApp?.(appId, "descriptions", 1, appData.descriptionsData);
            appDetailsCache?.SetCachedDataForApp?.(appId, "associations", 1, appData.associationData);
            if (screenshots.length) {
                appDetailsCache?.SetCachedDataForApp?.(appId, "screenshots", 1, appData.screenshots);
            }
            metadataState.appliedMetadataRef[metadataKey] = metadata;
        }
        catch (_error) {
            // Cache writes can fail if the page has not finished creating app data.
        }
    }
};
const steamScreenshotsFromMetadata = (appId, metadata) => (metadata.screenshots || [])
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
const tryFetchMetadataForApp = async (appId) => {
    await ensureMetadataCache();
    if (metadataCache[String(appId)] || metadataState.loadingMetadata.has(appId))
        return;
    const overview = getOverview(appId);
    if (!isNonSteamApp(overview))
        return;
    metadataState.loadingMetadata.add(appId);
    try {
        const metadata = await autoFetchMetadata(appId, appName(appId));
        if (metadata) {
            metadataCache[String(appId)] = metadata;
            applyMetadata(appId);
            window.dispatchEvent(new Event("decky-metadata:updated"));
        }
    }
    finally {
        metadataState.loadingMetadata.delete(appId);
    }
};
const tryEnrichScreenshotsForApp = async (appId) => {
    await ensureMetadataCache();
    const metadata = metadataCache[String(appId)];
    if (!metadata ||
        metadata.screenshots?.length ||
        metadataState.loadingScreenshots.has(appId) ||
        String(metadata.source || "").toUpperCase() !== "IGN") {
        return;
    }
    const source = metadata.source_url || String(metadata.id || "");
    if (!source)
        return;
    metadataState.loadingScreenshots.add(appId);
    try {
        const refreshed = await fetchMetadata(source);
        if (refreshed?.screenshots?.length) {
            const saved = await saveMetadata(appId, {
                ...metadata,
                screenshots: refreshed.screenshots,
            });
            metadataCache[String(appId)] = saved;
            applyMetadata(appId);
            window.dispatchEvent(new Event("decky-metadata:updated"));
        }
    }
    catch (error) {
        warn("bridge", "screenshot enrichment failed", error);
    }
    finally {
        metadataState.loadingScreenshots.delete(appId);
    }
};
const installMetadataPatches = (unpatchers) => {
    const overviewProto = appStore?.allApps?.[0]?.__proto__;
    const detailsProto = appDetailsStore?.__proto__;
    if (!overviewProto || !detailsProto)
        return;
    if (appStore?.GetAppOverviewByAppID) {
        unpatchers.push(patchMethod(appStore, "GetAppOverviewByAppID", (_thisValue, original, args) => {
            const requestedAppId = Number(args[0]);
            const result = original(...args);
            if (result || !Number.isFinite(requestedAppId) || requestedAppId <= 0) {
                return result;
            }
            const shortcutAppId = shortcutAppIdForSteamAppId(requestedAppId);
            if (!shortcutAppId || shortcutAppId === requestedAppId)
                return result;
            try {
                const shortcutOverview = original(shortcutAppId);
                if (isNonSteamAppWithoutPatchedMethod(shortcutOverview))
                    return shortcutOverview;
            }
            catch (_error) {
                // Fall through to Steam's native null result.
            }
            return result;
        }));
    }
    unpatchers.push(patchMethod(detailsProto, "GetDescriptions", (_thisValue, original, args) => {
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
            }
            else {
                void ensureMetadataCache().then(() => {
                    if (metadataCache[String(appId)]) {
                        applyMetadata(appId);
                        void tryEnrichScreenshotsForApp(appId);
                    }
                    else {
                        void tryFetchMetadataForApp(appId);
                    }
                });
            }
        }
        return originalResult;
    }));
    unpatchers.push(patchMethod(detailsProto, "GetAssociations", (_thisValue, original, args) => {
        const appId = Number(args[0]);
        const originalResult = original(...args);
        const overview = getOverview(appId);
        if (isNonSteamApp(overview))
            ensureDetailsOverviewSafeFields(appId);
        if (isNonSteamApp(overview) && metadataCache[String(appId)]) {
            applyMetadata(appId);
            const appData = appDetailsStore?.GetAppData?.(appId);
            if (appData?.details && appData?.associationData) {
                return appData.associationData;
            }
        }
        return originalResult;
    }));
    unpatchers.push(patchMethod(overviewProto, "BHasStoreCategory", (thisValue, original, args) => {
        if (isNonSteamApp(thisValue)) {
            const category = Number(args[0]);
            const metadata = metadataCache[String(thisValue.appid)];
            if (metadata?.store_categories?.includes(category))
                return true;
        }
        return original(...args);
    }));
    if (overviewProto?.BIsModOrShortcut) {
        unpatchers.push(safeAfterPatch(overviewProto, "BIsModOrShortcut", function (_args, ret) {
            const appId = Number(this?.appid);
            const path = currentRoutePath();
            const hasCache = !!metadataCache[String(appId)];
            const bypassCounterBefore = metadataState.bypassCounter;
            const shieldBefore = metadataState.routeShield ? { ...metadataState.routeShield } : null;
            // The precedence rules live in decideBIsModOrShortcut (pure,
            // unit-tested) — see src/steam/spoofDecision.ts.
            const decision = decideBIsModOrShortcut({
                isPatchedNonSteam: isNonSteamAppWithoutPatchedMethod(this),
                originalRet: ret,
                bypassCounter: metadataState.bypassCounter,
                path,
                consumeShield: () => consumeRouteShield(appId),
            });
            metadataState.bypassCounter = decision.nextBypassCounter;
            const shieldAfter = decision.shieldConsulted
                ? (metadataState.routeShield ? { ...metadataState.routeShield } : null)
                : shieldBefore;
            const shieldState = { before: shieldBefore, after: shieldAfter, hit: decision.shieldHit };
            traceBIsModDecision(appId, path, ret, decision.finalRet, decision.reason, shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache);
            if (decision.reason === "truth-window") {
                traceBypassTruthWindowHit(appId, metadataState.bypassCounter);
            }
            return decision.finalRet;
        }).unpatch);
    }
    if (detailsProto?.BHasRecentlyLaunched) {
        unpatchers.push(safeAfterPatch(detailsProto, "BHasRecentlyLaunched", (_args, ret) => {
            const wasIdle = metadataState.bypassCounter === 0;
            metadataState.bypassCounter = 4;
            if (wasIdle)
                traceBypassArm("BHasRecentlyLaunched");
            return ret;
        }).unpatch);
    }
    ["GetGameID", "GetPrimaryAppID"].forEach((methodName) => {
        if (!overviewProto?.[methodName])
            return;
        unpatchers.push(patchMethod(overviewProto, methodName, (_thisValue, original, args) => {
            return withInCallTruth(metadataState, () => original(...args));
        }));
    });
    if (overviewProto?.GetCanonicalReleaseDate) {
        unpatchers.push(patchMethod(overviewProto, "GetCanonicalReleaseDate", (thisValue, original, args) => {
            const metadata = metadataCache[String(thisValue?.appid)];
            if (isNonSteamApp(thisValue) && metadata?.release_date) {
                return metadata.release_date;
            }
            return original(...args);
        }));
    }
    if (overviewProto?.GetPerClientData) {
        unpatchers.push(safeAfterPatch(overviewProto, "GetPerClientData", (_args, ret) => {
            const wasIdle = metadataState.bypassCounter === 0;
            metadataState.bypassCounter = 4;
            if (wasIdle)
                traceBypassArm("GetPerClientData");
            return ret;
        }).unpatch);
    }
    try {
        const appDetailsSections = DFL.findModuleChild((module) => {
            if (typeof module !== "object")
                return undefined;
            for (const prop in module) {
                try {
                    if (typeof module[prop]?.prototype?.GetSections === "function") {
                        return module[prop];
                    }
                }
                catch (_error) {
                    continue;
                }
            }
            return undefined;
        });
        if (appDetailsSections?.prototype?.GetSections) {
            unpatchers.push(safeAfterPatch(appDetailsSections.prototype, "GetSections", function (_args, ret) {
                const overview = this?.props?.overview;
                const appId = Number(overview?.appid);
                if (appId && isNonSteamApp(overview))
                    ensureDetailsOverviewSafeFields(appId);
                if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
                    metadataState.lastObservedGameDetailAppId = appId;
                    const metadata = metadataCache[String(appId)];
                    if (metadata?.screenshots?.length) {
                        ret.add("screenshots");
                    }
                    else {
                        void tryEnrichScreenshotsForApp(appId);
                    }
                    ret.add("community");
                    // Add the real Steam Activity section too. News are deliberately
                    // served through the Activity feed patch, not the Community feed.
                    ret.add("activity");
                }
                return ret;
            }).unpatch);
        }
    }
    catch (error) {
        warn("patch", "app details sections patch skipped", error);
    }
};
const allNonSteamGames = async () => {
    const byId = new Map();
    const addEntry = (entry) => {
        const appid = Number(entry?.appid ?? entry?.app_id ?? entry?.unAppID ?? entry?.nAppID ?? entry);
        if (!Number.isFinite(appid) || appid <= 0)
            return;
        const overview = getOverview(appid);
        const nonSteam = entry?.isNonSteam === true || isNonSteamApp(overview);
        if (!nonSteam)
            return;
        const previous = byId.get(appid) || {};
        byId.set(appid, {
            ...previous,
            appid,
            name: cleanTitle(overview?.display_name ||
                overview?.localized_name ||
                entry?.name ||
                entry?.title ||
                previous.name ||
                `App ${appid}`),
            exe: entry?.exe || previous.exe || "",
            start_dir: entry?.start_dir || previous.start_dir || "",
            launch_options: entry?.launch_options || previous.launch_options || "",
            shortcut_path: entry?.shortcut_path || previous.shortcut_path || "",
        });
    };
    try {
        appStore?.allApps?.forEach?.(addEntry);
        appStore?.m_mapAppOverview?.forEach?.(addEntry);
    }
    catch (_error) {
        // Continue with backend fallback.
    }
    try {
        const localShortcuts = await Promise.resolve().then(function () { return backend; }).then((m) => m.getLocalShortcuts());
        localShortcuts.forEach(addEntry);
    }
    catch (_error) {
        // Optional fallback.
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const DECKY_HIDE_APP_LINKS_CLASS = "decky-hide-applinks";
const DECKY_HIDE_APP_LINKS_STYLE_ID = "decky-hide-applinks-style";
const isAppDetailsQuickLinksModule = (candidate) => !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.GameInfoQuickLinks === "string" &&
    typeof candidate.GameInfoContainer === "string";
const appDetailsQuickLinksModuleFromExports = (module) => {
    if (isAppDetailsQuickLinksModule(module))
        return module;
    if (!module || typeof module !== "object")
        return undefined;
    for (const candidate of Object.values(module)) {
        if (isAppDetailsQuickLinksModule(candidate))
            return candidate;
    }
    return undefined;
};
const resolveAppDetailsQuickLinksClasses = () => {
    try {
        let discovered = DFL.findModuleChild(appDetailsQuickLinksModuleFromExports);
        if (!discovered) {
            discovered = DFL.findModuleChild((module) => {
                if (!module || typeof module !== "object")
                    return undefined;
                for (const candidate of Object.values(module)) {
                    const nested = appDetailsQuickLinksModuleFromExports(candidate);
                    if (nested)
                        return nested;
                }
                return undefined;
            });
        }
        const quickLinks = discovered?.GameInfoQuickLinks;
        return typeof quickLinks === "string" && quickLinks.trim() ? [quickLinks.trim()] : [];
    }
    catch (_error) {
        return [];
    }
};
const onGameDetailRoute = (path) => {
    const decoded = safeDecodeURIComponent(String(path || ""));
    if (/\/achievements(\b|\/)/i.test(decoded))
        return false;
    return gameDetailAppIdFromPath(decoded) > 0 || /\/library\/(app|details)\//i.test(decoded);
};
const appLinksHiderClassSelector = (className) => {
    const trimmed = className.trim();
    return /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(trimmed) ? `.${trimmed}` : "";
};
const buildUnmatchedAppLinksHiderStyle = (linkRowClasses) => {
    const selectors = Array.from(new Set(linkRowClasses))
        .map(appLinksHiderClassSelector)
        .filter(Boolean)
        .map((selector) => `body.${DECKY_HIDE_APP_LINKS_CLASS} ${selector}`);
    if (!selectors.length) {
        return "/* decky: AppDetails GameInfoQuickLinks class unresolved; no fallback rule. */";
    }
    const targetSelector = selectors.join(",\n");
    return `
${targetSelector} {
  display: none !important;
}
`;
};
const appLinksHiderTargetDocument = () => {
    try {
        const doc = window?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_BrowserWindow
            ?.document;
        if (doc && typeof doc.createElement === "function" && doc.head && doc.body) {
            return doc;
        }
    }
    catch (_error) {
        // fall through
    }
    return null;
};
const appLinksDomClassPresent = (className, doc) => {
    const trimmed = className.trim();
    if (!trimmed)
        return false;
    try {
        const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(trimmed)
            : trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return !!doc.querySelector(`.${escaped}`);
    }
    catch (_error) {
        return false;
    }
};
const unmatchedAppLinksDecisionDetails = () => {
    const appId = currentGameDetailAppId();
    const overview = appId ? getOverview(appId) : null;
    const isNonSteam = !!(appId && isNonSteamApp(overview));
    const steamAppId = appId ? steamAppIdForApp(appId) : 0;
    return { appId, isNonSteam, steamAppId };
};
const logUnmatchedAppLinksDecision = (decision, resolvedLinkRowClasses, lastSignature, doc) => {
    const details = unmatchedAppLinksDecisionDetails();
    const signature = `${decision}|${resolvedLinkRowClasses.join(",")}|${details.appId}`;
    if (signature === lastSignature)
        return lastSignature;
    try {
        void frontendLog("applinks", "hider decision", {
            decision,
            appId: details.appId,
            isNonSteam: details.isNonSteam,
            steamAppId: details.steamAppId,
            resolvedClasses: resolvedLinkRowClasses,
            classPresentInDom: resolvedLinkRowClasses[0]
                ? !!doc && appLinksDomClassPresent(resolvedLinkRowClasses[0], doc)
                : false,
        }).catch(() => undefined);
    }
    catch (_error) {
        // Diagnostic logging must never affect the passive hider.
    }
    return signature;
};
const shouldHideUnmatchedAppLinks = () => {
    const path = currentRoutePath();
    if (!onGameDetailRoute(path))
        return false;
    const appId = currentGameDetailAppId();
    if (!appId)
        return false;
    return isNonSteamApp(getOverview(appId)) && steamAppIdForApp(appId) === 0;
};
const installUnmatchedAppLinksHider = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__deckyAppLinksHider) {
        unpatchers.push(() => undefined);
        return;
    }
    if (typeof document === "undefined" || !document.body || !document.head) {
        unpatchers.push(() => undefined);
        return;
    }
    globalState.__deckyAppLinksHider = { installed: true };
    let resolvedQuickLinksClasses = [];
    let appliedQuickLinksClasses = "";
    let lastDecisionLogSignature = "";
    let injectedDoc = null;
    const update = () => {
        try {
            const doc = appLinksHiderTargetDocument();
            if (!doc)
                return;
            if (resolvedQuickLinksClasses.length === 0) {
                resolvedQuickLinksClasses = resolveAppDetailsQuickLinksClasses();
            }
            let style = doc.getElementById(DECKY_HIDE_APP_LINKS_STYLE_ID);
            let forceStyleRefresh = injectedDoc !== doc;
            if (!style) {
                style = doc.createElement("style");
                style.id = DECKY_HIDE_APP_LINKS_STYLE_ID;
                doc.head.appendChild(style);
                forceStyleRefresh = true;
            }
            injectedDoc = doc;
            const nextAppliedQuickLinksClasses = resolvedQuickLinksClasses.join(" ");
            if (forceStyleRefresh ||
                !style.textContent ||
                nextAppliedQuickLinksClasses !== appliedQuickLinksClasses) {
                style.textContent = buildUnmatchedAppLinksHiderStyle(resolvedQuickLinksClasses);
                appliedQuickLinksClasses = nextAppliedQuickLinksClasses;
            }
            const decision = shouldHideUnmatchedAppLinks();
            lastDecisionLogSignature = logUnmatchedAppLinksDecision(decision, resolvedQuickLinksClasses, lastDecisionLogSignature, doc);
            doc.body.classList.toggle(DECKY_HIDE_APP_LINKS_CLASS, decision);
        }
        catch (_error) {
            // Passive UI polish must never affect Steam navigation or rendering.
        }
    };
    update();
    const timer = window.setInterval(update, 400);
    unpatchers.push(() => {
        try {
            window.clearInterval(timer);
            if (injectedDoc) {
                injectedDoc.body.classList.remove(DECKY_HIDE_APP_LINKS_CLASS);
                injectedDoc.getElementById(DECKY_HIDE_APP_LINKS_STYLE_ID)?.remove();
            }
        }
        catch (_error) {
            // Best effort teardown.
        }
        delete globalState.__deckyAppLinksHider;
    });
};

const PLAYHUB_COMMUNITY_IGN_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_RAWG_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_STEAM_ICON = "https://store.steampowered.com/favicon.ico";
const rewriteCommunityFeedUrlForSteamApp = (url, steamAppId) => {
    const cleanSteamAppId = Number(steamAppId || 0);
    if (cleanSteamAppId <= 0)
        return null;
    if (!/library\/appcommunityfeed\/\d+/.test(String(url || "")))
        return null;
    return String(url || "").replace(/appcommunityfeed\/\d+/, `appcommunityfeed/${cleanSteamAppId}`);
};
const pageFromValue = (value) => {
    if (value == null || String(value).trim() === "")
        return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return null;
    return Math.max(1, Math.min(Math.trunc(parsed), 100));
};
const pageFromTransportValue = (value, depth = 0) => {
    if (depth > 3 || value == null)
        return null;
    if (value instanceof URLSearchParams) {
        for (const key of ["p", "page", "itemspage", "screenshotspage"]) {
            const page = pageFromValue(value.get(key));
            if (page)
                return page;
        }
        return null;
    }
    if (typeof value === "string") {
        const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : value;
        const params = new URLSearchParams(query);
        for (const key of ["p", "page", "itemspage", "screenshotspage"]) {
            const page = pageFromValue(params.get(key));
            if (page)
                return page;
        }
        const cursorPage = value.match(/(?:^|[^a-z])page[_:=/-]?(\d+)/i)?.[1];
        return pageFromValue(cursorPage);
    }
    if (typeof value === "object") {
        const record = value;
        for (const key of ["p", "page", "itemspage", "screenshotspage"]) {
            const page = pageFromValue(record[key]);
            if (page)
                return page;
        }
        for (const key of ["body", "data", "params", "cursor"]) {
            const page = pageFromTransportValue(record[key], depth + 1);
            if (page)
                return page;
        }
    }
    return null;
};
const requestedCommunityPage = (url, transportArgs = []) => {
    for (const value of transportArgs) {
        const page = pageFromTransportValue(value);
        if (page)
            return page;
    }
    return pageFromTransportValue(url) || 1;
};
const nativeHubHasContent = (response) => Boolean(response && typeof response === "object" && Array.isArray(response.hub) && response.hub.length);
const syntheticCommunityId = (appId, page, index) => {
    const cleanAppId = String(Math.max(0, Math.trunc(Number(appId) || 0))).padStart(10, "0").slice(-10);
    const cleanPage = String(Math.max(1, Math.min(Math.trunc(Number(page) || 1), 100))).padStart(3, "0");
    const cleanIndex = String(Math.max(0, Math.trunc(Number(index) || 0))).padStart(2, "0").slice(-2);
    return `90909${cleanAppId}${cleanPage}${cleanIndex}`;
};
const communityProviderIcon = (source) => {
    const cleanSource = String(source || "").trim().toLowerCase();
    if (cleanSource.includes("steam"))
        return PLAYHUB_COMMUNITY_STEAM_ICON;
    if (cleanSource.includes("rawg"))
        return PLAYHUB_COMMUNITY_RAWG_ICON;
    return PLAYHUB_COMMUNITY_IGN_ICON;
};
const communityCreator = (source, avatar) => ({
    steamid: "76561197960287930",
    name: source || "Playhub Metadata",
    avatar,
    avatar_url: avatar,
    avatar_medium: avatar,
    avatar_full: avatar,
    avatarFullURL: avatar,
});
const fallbackPageToNativeHub = (appId, fallback) => ({
    cached: fallback.source === "metadata",
    hub: fallback.items.map((item, index) => {
        const sourceLabel = fallback.source === "steam-scrape"
            ? item.author ? `Steam Community · ${item.author}` : "Steam Community"
            : item.author || "Metadata";
        const providerIcon = communityProviderIcon(sourceLabel);
        const itemLink = item.link || item.image_url;
        const publishedFileId = syntheticCommunityId(appId, fallback.page, index);
        return {
            appid: appId,
            consumer_appid: appId,
            published_file_id: publishedFileId,
            publishedfileid: publishedFileId,
            type: 5,
            title: item.title,
            preview_image_url: item.image_url,
            full_image_url: item.image_url,
            image_width: item.width,
            image_height: item.height,
            url: itemLink,
            link: itemLink,
            external_url: itemLink,
            strURL: itemLink,
            avatar: providerIcon,
            avatar_url: providerIcon,
            creator_avatar_url: providerIcon,
            author_avatar_url: providerIcon,
            owner_avatar_url: providerIcon,
            content_descriptorids: [],
            spoiler_tag: false,
            description: item.description,
            creator: communityCreator(sourceLabel, providerIcon),
            author: sourceLabel,
            time_created: Math.floor(Date.now() / 1000) - index * 60,
            votes_up: 0,
            votes_down: 0,
            num_comments_public: 0,
            reactions: [],
        };
    }),
});
const resolveCommunityFeed = async ({ appId, page, originalArgs, rewrittenArgs, nativeRequest, fallbackRequest, onFallbackError, }) => {
    const nativeArgs = rewrittenArgs || originalArgs;
    let native;
    let nativeError;
    try {
        native = await nativeRequest(nativeArgs);
        if (nativeHubHasContent(native))
            return native;
    }
    catch (error) {
        nativeError = error;
    }
    try {
        const fallback = await fallbackRequest(appId, page);
        if (fallback.items.length)
            return fallbackPageToNativeHub(appId, fallback);
    }
    catch (error) {
        onFallbackError?.(error);
        // Native preservation rules below intentionally handle fallback failures.
    }
    if (!nativeError)
        return native;
    if (rewrittenArgs)
        return nativeRequest(originalArgs);
    throw nativeError;
};
const resolveCommunityRequest = (options) => options.isNonSteam
    ? resolveCommunityFeed(options)
    : options.nativeRequest(options.originalArgs);

const ACTIVITY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const createActivityRefreshGate = (intervalMs = ACTIVITY_REFRESH_INTERVAL_MS) => {
    const attempts = new Map();
    const inFlight = new Set();
    const isFresh = (timestampMs, nowMs) => typeof timestampMs === "number" && timestampMs > 0 && nowMs - timestampMs < intervalMs;
    return {
        shouldAttempt: (appId, nowMs, enrichedAtSeconds) => {
            if (!appId || inFlight.has(appId))
                return false;
            if (isFresh(attempts.get(appId), nowMs))
                return false;
            const enrichedAtMs = Number(enrichedAtSeconds || 0) * 1000;
            if (isFresh(enrichedAtMs, nowMs))
                return false;
            return true;
        },
        markAttempt: (appId, nowMs) => {
            if (!appId)
                return;
            attempts.set(appId, nowMs);
            inFlight.add(appId);
        },
        markSettled: (appId) => {
            inFlight.delete(appId);
        },
    };
};

let ensureMetadataCacheFn = async () => undefined;
const configureActivityMetadataLoader = (ensureMetadataCache) => {
    ensureMetadataCacheFn = ensureMetadataCache;
};
const activityRefreshGate = createActivityRefreshGate();
const maybeRefreshSteamNewsForApp = (appId) => {
    if (!appId || !isNonSteamApp(getOverview(appId)))
        return;
    const enrichedAt = Number(metadataCache[String(appId)]?.steam_news_enriched_at || 0);
    const nowMs = Date.now();
    if (!activityRefreshGate.shouldAttempt(appId, nowMs, enrichedAt))
        return;
    activityRefreshGate.markAttempt(appId, nowMs);
    void (async () => {
        try {
            const previous = metadataCache[String(appId)];
            const refreshed = await refreshSteamActivityForApp(appId);
            if (!refreshed)
                return;
            const newsKey = (metadata) => JSON.stringify((metadata?.steam_news || []).map((item) => [item.id, item.gid, item.title, item.date]));
            const changed = newsKey(previous) !== newsKey(refreshed);
            metadataCache[String(appId)] = refreshed;
            if (changed)
                await refreshDeckyNativeActivityForApp(appId);
        }
        catch (error) {
            info("activity", "per-app news refresh failed", error);
        }
        finally {
            activityRefreshGate.markSettled(appId);
        }
    })();
};
const isDeckyCommunityId = (value) => typeof value === "string" && value.startsWith("90909");
const deckyActivityId = (appId, index, date) => `decky-activity-${appId}-${date || 0}-${index}`;
const numericSteamNewsGid = (value) => {
    const text = String(value || "");
    const direct = text.match(/^\d{8,}$/);
    if (direct)
        return direct[0];
    const fromUrl = text.match(/(?:announcements\/detail|news\/app\/\d+\/view)\/(\d{8,})/i);
    if (fromUrl?.[1])
        return fromUrl[1];
    const fromOldAnnouncement = text.match(/old_announce_(\d{8,})/i);
    if (fromOldAnnouncement?.[1])
        return fromOldAnnouncement[1];
    const anyNumericGid = text.match(/\b(\d{8,})\b/);
    return anyNumericGid?.[1] || "";
};
const cleanSteamNewsDisplayText = (value) => String(value || "")
    .replace(/\[previewyoutube=[A-Za-z0-9_-]{11}(?:;[^\]]*)?\]\s*\[\/previewyoutube\]/gi, " ")
    .replace(/\[previewyoutube=[^\]]+\]/gi, " ")
    .replace(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/\d+\/[^\s<>\)\]\[]+/gi, " ")
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, " ")
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[\/?(?:p|br|hr|quote|spoiler|table|tr|td|th|img|url|h1|h2|h3|h4|b|i|u|s|strike|list|\*|code|noparse|previewyoutube|video|youtube|size|color|font|center|left|right)[^\]]*\]/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
const steamNewsRawBodyForModal = (value) => String(value || "")
    .replace(/\\\//g, "/")
    .trim();
const steamAppHeaderImage = (steamAppId) => steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg` : "";
const steamNewsImageCandidatesForMetadata = (_metadata, news) => {
    const rawSources = Array.isArray(news.image_sources) ? news.image_sources : [];
    return Array.from(new Set([
        news.image,
        news.image_url,
        news.preview_image_url,
        ...rawSources,
    ].map(cleanSteamImageUrl).filter(Boolean)));
};
const normaliseActivityNewsKeyText = (value) => String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
const uniqueSteamNewsForActivity = (metadata) => {
    const seen = new Set();
    return (metadata.steam_news || [])
        .filter((item) => item?.url && item?.title)
        .filter((item) => {
        const title = normaliseActivityNewsKeyText(item.title);
        const summary = normaliseActivityNewsKeyText(item.summary || "").slice(0, 160);
        const canonicalUrl = String(item.url || "").replace(/[?#].*$/, "").toLocaleLowerCase("en-US");
        const day = Math.floor((Number(item.date || 0) || 0) / 86400);
        const key = `${title}|${canonicalUrl || day}|${summary}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .slice(0, 12);
};
const steamActivityNewsItemsFromMetadata = (appId, metadata) => uniqueSteamNewsForActivity(metadata)
    .map((news, index) => {
    const date = Number(news.date || 0) || Math.floor(Date.now() / 1000) - index * 60;
    const imageCandidates = steamNewsImageCandidatesForMetadata(metadata, news);
    const imageUrl = imageCandidates[0] || "";
    const fallbackImageUrl = steamAppHeaderImage(metadata.steam_appid);
    const displayImageUrl = imageUrl || fallbackImageUrl;
    const eventType = normalizeDeckySteamActivityType(news.event_type || news.type);
    const eventTags = deckySteamActivityTypeTags(eventType);
    const eventLabel = deckySteamActivityTypeLabel(eventType);
    const rawBody = steamNewsRawBodyForModal(news.raw_body || news.body || news.summary || "");
    const summary = eventType === 12 ? "" : cleanSteamNewsDisplayText(news.summary || news.title || "");
    const title = cleanSteamNewsDisplayText(news.title || metadata.title || "Steam news");
    const url = news.url || metadata.steam_store_url || "";
    const id = deckyActivityId(appId, index, date);
    const steamGid = numericSteamNewsGid(news.gid || news.news_id || news.announcement_gid || news.event_gid || news.id || news.url);
    const eventGid = numericSteamNewsGid(news.event_gid || news.gid || news.news_id || news.announcement_gid || news.id || news.url);
    const jsondata = JSON.stringify({
        localized_title_image: displayImageUrl,
        localized_capsule_image: displayImageUrl,
        localized_spotlight_image: displayImageUrl,
        localized_summary: summary,
        localized_body: rawBody,
        store_url: url,
    });
    return {
        appid: appId,
        gid: steamGid || id,
        id,
        news_id: steamGid || id,
        announcement_gid: steamGid || id,
        clan_steamid: "103582791429521412",
        event_name: title,
        event_type: eventType,
        type: eventType,
        title,
        headline: title,
        description: summary,
        summary,
        body: cleanSteamNewsDisplayText(news.body || summary),
        raw_body: rawBody,
        contents: summary,
        url,
        external_url: url,
        link: url,
        image: displayImageUrl,
        image_url: displayImageUrl,
        event_image_url: imageUrl,
        image_sources: imageCandidates,
        fallback_image_url: fallbackImageUrl,
        header_image_url: fallbackImageUrl,
        capsule: displayImageUrl,
        capsule_image: displayImageUrl,
        preview_image_url: displayImageUrl,
        full_image_url: displayImageUrl || url,
        rtime32_start_time: date,
        rtime32_end_time: date,
        rtime32_last_modified: date,
        posttime: date,
        published: date,
        time_created: date,
        date,
        feedlabel: news.feedLabel || news.author || eventLabel,
        author: news.author || news.feedLabel || eventLabel,
        comment_count: 0,
        upvotes: 0,
        downvotes: 0,
        jsondata,
        announcement_body: {
            gid: steamGid || id,
            clanid: "0",
            posterid: "0",
            headline: title,
            posttime: date,
            updatetime: date,
            body: rawBody || summary,
            commentcount: 0,
            tags: eventTags,
            language: 0,
            hidden: 0,
            forum_topic_id: "0",
            event_gid: eventGid || steamGid || id,
            voteupcount: 0,
            votedowncount: 0,
        },
    };
});
const steamActivityPayloadForApp = async (appId) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    void maybeRefreshSteamNewsForApp(appId);
    await ensureMetadataCacheFn();
    let metadata = metadataCache[String(appId)];
    if (!metadata)
        return null;
    const items = metadata ? steamActivityNewsItemsFromMetadata(appId, metadata) : [];
    if (!items.length)
        return null;
    // Steam client internals changed names across versions. Return a deliberately
    // redundant shape so the native Activity store can read the same cards through
    // the field name it expects, while keeping the items Steam-like.
    return {
        events: items,
        rgEvents: items,
        rgNews: items,
        rgActivity: items,
        rgFeedItems: items,
        activity: items,
        activities: items,
        news: items,
        items,
        results: items,
        count: items.length,
        bHasMore: false,
        success: 1,
    };
};
const STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE = 1002;
const STEAM_PARTNER_EVENT_TYPE_NEWS = 28;
const DECKY_SUPPORTED_STEAM_ACTIVITY_TYPES = new Set([12, 13, 14, 15, 23, 24, 25, 28, 35]);
const DECKY_STEAM_ACTIVITY_TYPE_LABELS = {
    12: "Minor update / Patch notes",
    13: "Update",
    14: "Major update",
    15: "Downloadable content",
    23: "Event: Loot",
    24: "Event: Perks",
    25: "Event: Challenge",
    28: "News",
    35: "In-game event",
};
const DECKY_STEAM_ACTIVITY_TYPE_TAGS = {
    12: ["patchnotes", "update", "decky_metadata"],
    13: ["update", "decky_metadata"],
    14: ["majorupdate", "update", "decky_metadata"],
    15: ["dlc", "release", "decky_metadata"],
    23: ["loot", "event", "decky_metadata"],
    24: ["perks", "event", "decky_metadata"],
    25: ["challenge", "event", "decky_metadata"],
    28: ["news", "decky_metadata"],
    35: ["ingame", "event", "decky_metadata"],
};
const normalizeDeckySteamActivityType = (value) => {
    const type = Number(value || 0) || STEAM_PARTNER_EVENT_TYPE_NEWS;
    return DECKY_SUPPORTED_STEAM_ACTIVITY_TYPES.has(type) ? type : STEAM_PARTNER_EVENT_TYPE_NEWS;
};
const deckySteamActivityTypeLabel = (type) => DECKY_STEAM_ACTIVITY_TYPE_LABELS[type] || "News";
const deckySteamActivityTypeTags = (type) => DECKY_STEAM_ACTIVITY_TYPE_TAGS[type] || DECKY_STEAM_ACTIVITY_TYPE_TAGS[28];
const fakeSteamId = (accountId = 0, steamId64 = "76561197960287930") => ({
    GetAccountID: () => accountId,
    ConvertTo64BitString: () => steamId64,
    toString: () => steamId64,
});
const toSteamClanImageUrl = (value) => {
    const text = String(value || "").trim().replace(/\\\//g, "/");
    const match = text.match(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/(\d+)\/([^\s<>\)\]\[]+)/i);
    if (!match)
        return text;
    return `https://clan.cloudflare.steamstatic.com/images/${match[1]}/${match[2].replace(/[\"'.,;:]+$/g, "")}`;
};
const cleanSteamImageUrl = (value) => {
    let text = String(value || "").trim();
    if (!text)
        return "";
    try {
        text = decodeURIComponent(text);
    }
    catch (_error) {
        // Keep the original URL if it is not URI encoded.
    }
    text = text.replace(/\\\//g, "/").replace(/&amp;/gi, "&").trim();
    text = text.replace(/\[\/?img\].*$/i, "").replace(/[\]\)>.,;:'"]+$/g, "").trim();
    text = toSteamClanImageUrl(text);
    if (text.startsWith("//"))
        text = `https:${text}`;
    if (text.startsWith("http://"))
        text = text.replace(/^http:\/\//i, "https://");
    return /^https:\/\//i.test(text) ? text : "";
};
const collectSteamNewsImages = (steamAppId, item) => {
    const values = [
        item.image,
        item.image_url,
        item.preview_image_url,
        item.full_image_url,
        item.capsule_image,
        item.capsule,
        item.localized_title_image,
        item.localized_capsule_image,
        item.localized_spotlight_image,
        item.header_image_url,
        item.fallback_image_url,
    ];
    if (Array.isArray(item.image_sources))
        values.push(...item.image_sources);
    // Keep the explicit fallback at the end: cards with no embedded artwork should
    // still show the game header, but embedded/event-specific images stay first.
    return Array.from(new Set(values.map(cleanSteamImageUrl).filter(Boolean)));
};
const uniqueNonEmptyStrings = (values) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
const deckyNativePartnerEventKeys = (event) => {
    const gid = numericSteamNewsGid(event?.AnnouncementGID || event?.announcement_gid || event?.announcementGID || event?.gid || event?.GID || event?.url);
    const oldAnnouncementGid = gid ? `old_announce_${gid}` : "";
    return uniqueNonEmptyStrings([
        event?.GID,
        event?.gid,
        event?.event_gid,
        event?.AnnouncementGID,
        event?.announcement_gid,
        event?.announcementGID,
        gid,
        oldAnnouncementGid,
    ]);
};
const collectNativePartnerEventStores = () => {
    const host = steamInternals();
    const stores = [];
    const add = (candidate) => {
        if (!candidate || typeof candidate !== "object")
            return;
        const c = candidate;
        const looksLikeStore = typeof c.GetClanEventModel === "function" ||
            typeof c.GetClanEventFromAnnouncementGID === "function" ||
            typeof c.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
            c.m_mapExistingEvents?.set;
        if (looksLikeStore && !stores.includes(c))
            stores.push(c);
    };
    add(host.partnerEventStore);
    add(host.g_PartnerEventStore);
    add(host.g_PartnerEventSummaryStore);
    add(host[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY]);
    try {
        const discovered = DFL.findModuleChild((module) => {
            if (!module || typeof module !== "object")
                return undefined;
            for (const prop in module) {
                const candidate = module[prop];
                if (candidate &&
                    typeof candidate === "object" &&
                    (typeof candidate.GetClanEventFromAnnouncementGID === "function" ||
                        typeof candidate.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
                        typeof candidate.GetClanEventModel === "function")) {
                    return candidate;
                }
            }
            return undefined;
        });
        add(discovered);
    }
    catch (_error) {
        // Decky may not expose the module yet. The interval installer retries.
    }
    if (stores[0])
        host[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY] = stores[0];
    return stores;
};
const registerDeckyNativePartnerEventInSteamStore = (event, partnerStore) => {
    const store = partnerStore || deckyNativePartnerEventStore();
    if (!store || !event)
        return;
    const keys = deckyNativePartnerEventKeys(event);
    const numericGid = numericSteamNewsGid(event?.AnnouncementGID || event?.announcement_gid || event?.GID || event?.gid);
    const canonicalEventGid = String(event?.GID || (numericGid ? `old_announce_${numericGid}` : "")).trim();
    try {
        if (store.m_mapExistingEvents?.set) {
            keys.forEach((key) => store.m_mapExistingEvents.set(key, event));
        }
        if (numericGid && store.m_mapAnnouncementBodyToEvent?.set) {
            store.m_mapAnnouncementBodyToEvent.set(numericGid, canonicalEventGid || numericGid);
            store.m_mapAnnouncementBodyToEvent.set(String(numericGid), canonicalEventGid || numericGid);
            store.m_mapAnnouncementBodyToEvent.set(`old_announce_${numericGid}`, canonicalEventGid || `old_announce_${numericGid}`);
        }
        const appendToMapList = (map, key, value) => {
            if (!map?.get || !map?.set || !key || !value)
                return;
            const mapKey = typeof key === "number" ? key : Number(key);
            const actualKey = Number.isFinite(mapKey) && mapKey > 0 ? mapKey : key;
            const current = map.get(actualKey) || [];
            if (Array.isArray(current) && !current.includes(value)) {
                map.set(actualKey, [...current, value]);
            }
        };
        appendToMapList(store.m_mapAppIDToGIDs, event.appid, canonicalEventGid);
        appendToMapList(store.m_mapAppIDToGIDs, event.reference_appid || event.steam_appid, canonicalEventGid);
        const clanAccountId = event.clanSteamID?.GetAccountID?.();
        appendToMapList(store.m_mapClanToGIDs, clanAccountId, canonicalEventGid);
        if (canonicalEventGid && typeof store.GetPartnerEventChangeCallback === "function") {
            store.GetPartnerEventChangeCallback(canonicalEventGid)?.Dispatch?.(event);
        }
    }
    catch (error) {
        warn("patch", "unable to register native PartnerEvent", error);
    }
};
const rememberDeckyNativePartnerEvent = (event) => {
    const cache = deckyNativePartnerEventCache();
    deckyNativePartnerEventKeys(event).forEach((key) => cache.set(String(key), event));
    const stores = collectNativePartnerEventStores();
    if (stores.length)
        stores.forEach((store) => registerDeckyNativePartnerEventInSteamStore(event, store));
    else
        registerDeckyNativePartnerEventInSteamStore(event);
};
const cloneDeckyNativePartnerEventForRoute = (event, requestedKey) => {
    if (!event)
        return null;
    const raw = String(requestedKey || "").trim();
    const numericGid = numericSteamNewsGid(raw || event?.AnnouncementGID || event?.announcement_gid || event?.GID || event?.gid);
    // Steam's event overlay validates with a strict `event.GID == initialEventID` check.
    // Activity cards, old announcements and Store News routes may pass either the numeric
    // announcement id or the `old_announce_<gid>` event id, so return a route-local
    // clone whose GID matches the key Steam asked for while keeping AnnouncementGID
    // numeric for the real announcement data.
    const routeGid = raw || String(event?.GID || (numericGid ? `old_announce_${numericGid}` : "0"));
    return {
        ...event,
        GID: routeGid,
        gid: routeGid,
        event_gid: routeGid,
        AnnouncementGID: numericGid || event?.AnnouncementGID || event?.announcement_gid || "0",
        announcement_gid: numericGid || event?.announcement_gid || event?.AnnouncementGID || "0",
        announcementGID: numericGid || event?.announcementGID || event?.AnnouncementGID || "0",
        GetAnnouncementGID: () => numericGid || event?.AnnouncementGID || event?.announcement_gid || "0",
    };
};
const deckyNativePartnerEventForGid = (value, cloneForRoute = false) => {
    const raw = String(value || "").trim();
    const gid = numericSteamNewsGid(raw);
    const cache = deckyNativePartnerEventCache();
    const event = (raw && cache.get(raw)) || (gid && (cache.get(String(gid)) || cache.get(`old_announce_${gid}`))) || null;
    return cloneForRoute ? cloneDeckyNativePartnerEventForRoute(event, raw || gid) : event;
};
const makeDeckyNativePartnerEvent = (appId, steamAppId, item, index) => {
    const date = Number(item.date || item.posttime || item.published || 0) || Math.floor(Date.now() / 1000) - index * 60;
    const announcementGid = numericSteamNewsGid(item.announcement_gid || item.news_id || item.gid || item.id || item.url);
    const eventGid = numericSteamNewsGid(item.event_gid || "");
    const gid = announcementGid || eventGid;
    const nativeEventGid = eventGid && eventGid !== announcementGid ? eventGid : gid ? `old_announce_${gid}` : "0";
    const isOldAnnouncement = nativeEventGid.startsWith("old_announce_");
    const title = cleanSteamNewsDisplayText(item.title || item.event_name || item.headline || "Steam News");
    const summary = cleanSteamNewsDisplayText(item.summary || item.description || item.body || title);
    const body = cleanSteamNewsDisplayText(item.body || item.content || item.description || item.summary || title);
    const images = collectSteamNewsImages(steamAppId, item);
    const primaryImage = images[0] || "";
    const clanSteamID = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
    const type = normalizeDeckySteamActivityType(item.event_type || item.type);
    const isPatchNote = type === 12;
    const eventLabel = deckySteamActivityTypeLabel(type);
    const eventTags = deckySteamActivityTypeTags(type);
    const modalBody = steamNewsRawBodyForModal(item.raw_body || item.rawBody || item.body_html || item.body_raw || item.body || body || summary);
    const activitySummary = isPatchNote ? "" : summary;
    const announcementUrl = item.url || item.external_url || item.link || (steamAppId && announcementGid ? `https://steamcommunity.com/games/${steamAppId}/announcements/detail/${announcementGid}` : steamAppId && eventGid ? `https://store.steampowered.com/news/app/${steamAppId}/view/${eventGid}` : "");
    const jsondata = {
        // Keep the detail viewer from rendering a duplicated non-clickable preview
        // paragraph above Steam's real BBCode/HTML body.
        localized_summary: [""],
        localized_subtitle: [""],
        localized_body: [modalBody],
        localized_title_image: [primaryImage],
        localized_capsule_image: [primaryImage],
        localized_spotlight_image: [primaryImage],
        library_spotlight: true,
        library_spotlight_text: true,
        referenced_appids: steamAppId ? [steamAppId] : [],
    };
    const partnerEvent = {
        __deckyNativePartnerEvent: true,
        GID: nativeEventGid,
        gid: nativeEventGid,
        event_gid: nativeEventGid,
        AnnouncementGID: announcementGid || gid || "0",
        announcement_gid: announcementGid || gid || "0",
        announcementGID: announcementGid || gid || "0",
        appid: appId,
        reference_appid: steamAppId || appId,
        steam_appid: steamAppId || appId,
        type,
        event_type: type,
        bOldAnnouncement: isOldAnnouncement,
        bLoaded: true,
        loadedAllLanguages: true,
        visibility_state: 2,
        postTime: date,
        createTime: date,
        startTime: date,
        endTime: date,
        visibilityStartTime: date,
        visibilityEndTime: date + 86400 * 365,
        rtime32_moderator_reviewed: date,
        rtime32_start_time: date,
        rtime32_end_time: date,
        rtime32_last_modified: date,
        nVotesUp: Number(item.upvotes || 0) || 0,
        nVotesDown: Number(item.downvotes || 0) || 0,
        nCommentCount: Number(item.comment_count || 0) || 0,
        forumTopicGID: item.forumTopicGID || item.forum_topic_id || "0",
        clanSteamID,
        announcementClanSteamID: clanSteamID,
        jsondata,
        name: new Map([[0, title]]),
        description: new Map([[0, modalBody || body || summary]]),
        timestamp_loc_updated: new Map([[0, date]]),
        vecTags: eventTags,
        tags: eventTags,
        BHasTag: (tag) => eventTags.includes(String(tag || "")),
        BHasTagStartingWith: (prefix) => eventTags.some((tag) => tag.startsWith(String(prefix || ""))),
        GetAllTags: () => eventTags,
        BMatchesAllTags: (tags) => !Array.isArray(tags) || tags.every((tag) => eventTags.includes(String(tag || ""))),
        BInRealmGlobal: () => true,
        BInRealmChina: () => false,
        BIsLanguageValidForRealms: () => true,
        GetNameWithFallback: () => title,
        GetGameTitle: () => title,
        GetDescriptionWithFallback: () => modalBody || body || summary,
        GetSummaryWithFallback: () => activitySummary,
        GetSummary: () => activitySummary,
        BHasSummary: () => !!activitySummary,
        GetSubTitle: () => "",
        BHasSubTitle: () => false,
        GetSubTitleWithLanguageFallback: () => "",
        GetSubTitleWithSummaryFallback: () => "",
        GetCategoryAsString: () => eventLabel,
        GetEventTypeAsString: () => eventLabel,
        GetImgArray: () => images,
        GetImageHash: () => null,
        GetImageHashAndExt: () => null,
        GetImageFromBeginningOfDescription: () => primaryImage || "",
        GetImageURL: () => primaryImage,
        GetImageURLWithFallback: () => primaryImage || images[0] || "",
        GetImageForSizeAsArrayWithFallback: (_size, _language, _format, skipFallback) => {
            const out = images.slice();
            if (!skipFallback && steamAppId) {
                out.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`);
                out.push(`https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`);
            }
            return Array.from(new Set(out.map(cleanSteamImageUrl).filter(Boolean)));
        },
        BImageNeedScreenshotFallback: () => images.length === 0,
        BHasSomeImage: () => images.length > 0,
        BHasImage: () => images.length > 0,
        GetFallbackArtworkScreenshot: () => images[0] || (steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg` : ""),
        GetStartTimeAndDateUnixSeconds: () => date,
        GetEndTimeAndDateUnixSeconds: () => date,
        GetPostTimeAndDateUnixSeconds: () => date,
        GetAnnouncementGID: () => announcementGid || gid || "0",
        BHasAnnouncementGID: () => !!(announcementGid || gid),
        GetAppID: () => appId,
        GetReferenceAppID: () => steamAppId || appId,
        GetStoreAppID: () => steamAppId || appId,
        BIsPartnerEvent: () => false,
        BIsOGGEvent: () => !!steamAppId,
        BIsEventInFuture: () => false,
        BHasEventEnded: () => false,
        BIsEventActionEnabled: () => false,
        BShowLibrarySpotlight: () => false,
        BShowLibrarySpotlightText: () => false,
        BIsImageSafeForAllAges: () => true,
        BHasBroadcastEnabled: () => false,
        BEventCanShowBroadcastWidget: () => false,
        BHasBroadcastForceBanner: () => false,
        BSaleShowBroadcastAtTopOfPage: () => false,
        GetVisibilityStartTimeAndDateUnixSeconds: () => date,
        BHasForumTopicGID: () => false,
        GetForumTopicURL: () => "",
        GetAppIDOrReferenceAppID: () => steamAppId || appId,
        GetEventType: () => type,
        BIsVisibleEvent: () => true,
        BIsStagedEvent: () => false,
        BIsUnlistedEvent: () => false,
        BHasEmailEnabled: () => false,
        BHasSaleEnabled: () => false,
        BHasSaleVanity: () => false,
        GetSaleVanity: () => "",
        BHasSaleUpdateLandingPageVanity: () => false,
        GetSaleUpdateLandingPageVanity: () => "",
        GetSaleURL: () => null,
        GetSaleSections: () => [],
        GenerateDynamicSaleSections: () => [],
        GetSaleSectionIncludingFooterSections: () => null,
        GetSaleSectionByID: () => null,
        GetSaleSectionCount: () => 0,
        GetSaleSectionsByType: () => [],
        GetSaleSectionFirstMatchByType: () => null,
        GetSaleItemOfType: () => null,
        GetSaleItemCountOfType: () => 0,
        GetSaleFeaturedAppsCount: () => 0,
        GetSaleFeaturedAppsAndDemosCount: () => 0,
        GetSaleFeaturedBundlesCount: () => 0,
        GetSaleFeaturedPackagesCount: () => 0,
        GetSaleFeaturedApps: () => [],
        GetSaleFeaturedAppsAndDemos: () => [],
        GetSaleFeaturedBundles: () => [],
        GetSaleFeaturedPackages: () => [],
        GetTaggedItems: () => [],
        BHasScheduleEnabled: () => false,
        BAllowedSteamStoreSpotlight: () => false,
        BHasLibaryHomeSpotlight: () => false,
        BHasLibraryHomeSpotlight: () => false,
        BHasSaleProductBanners: () => false,
        GetSteamAwardCategory: () => 0,
        GetSteamAwardNomineeCategories: () => [],
        BIsLockedToGameOwners: () => false,
        GetRequiredAppIDs: () => [],
        GetRequiredPackageIDs: () => [],
        BUseSubscriptionLayout: () => false,
        BIsLockedToPartnerAppRights: () => false,
        GetRequiredPartnerAppRights: () => undefined,
        GetValveAccessLog: () => [],
        BUsesContentHubForItemSource: () => false,
        GetContentHubType: () => undefined,
        GetContentHubCategory: () => undefined,
        GetContentHubTag: () => undefined,
        GetContentHub: () => undefined,
        BContentHubDiscountedOnly: () => false,
        BIsBackgroundImageGroupingEnabled: () => false,
        GetSalePageGroupDefinition: () => undefined,
        GetSalePageBackgroundImageGroupCount: () => 0,
        GetAllSalePageGroups: () => [],
        GetSalePageBackgroundGroup: () => undefined,
        GetIncludedRealmList: () => [0],
        BIsValidForRealm: () => true,
        BIsNextFest: () => false,
        GetLastUpdateTime: () => date,
        GetLastUpdaterSteamIDStr: () => "",
        GetStoreOrCommunityURL: () => announcementUrl,
        GetCommunityDiscussionURL: () => announcementUrl,
        GetStoreNewsURL: () => steamAppId && (announcementGid || eventGid || gid) ? `https://store.steampowered.com/news/app/${steamAppId}/view/${announcementGid || eventGid || gid}` : announcementUrl,
        url: announcementUrl,
    };
    rememberDeckyNativePartnerEvent(partnerEvent);
    return partnerEvent;
};
const makeDeckyNativeActivityEvent = (appId, metadata, item, index) => {
    const steamAppId = Number(metadata.steam_appid || item.appid || appId) || appId;
    const partnerEvent = makeDeckyNativePartnerEvent(appId, steamAppId, item, index);
    const date = Number(partnerEvent.postTime || 0) || Math.floor(Date.now() / 1000) - index * 60;
    const gid = numericSteamNewsGid(partnerEvent.GID || item.url) || String(date);
    const actor = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
    return {
        __deckyNativeActivityEvent: true,
        gameid: String(appId),
        unUniqueID: Number(`${String(gid).slice(-8)}${index}`.slice(-9)) || date + index,
        rtEventTime: date,
        steamIDActor: actor,
        steamIDTarget: fakeSteamId(),
        eEventType: STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE,
        eEventSubType: 0,
        eGameActivityType: 0,
        bIsGameActivity: false,
        commentThreads: [],
        activeThread: 0,
        get appid() {
            return appId;
        },
        get referenceAppID() {
            return steamAppId || appId;
        },
        get announcementGID() {
            return gid;
        },
        get clan_announcementid() {
            return gid;
        },
        get eventModel() {
            return partnerEvent;
        },
        get forumTopicGID() {
            return partnerEvent.forumTopicGID;
        },
        get upvotes() {
            return partnerEvent.nVotesUp;
        },
        get downvotes() {
            return partnerEvent.nVotesDown;
        },
        get comment_count() {
            return partnerEvent.nCommentCount;
        },
        BIsValid: () => true,
        IsEventLoaded: () => true,
        GetEvent: async () => partnerEvent,
        ReloadEvent: async () => partnerEvent,
        GetParentalFeature: () => 0,
        BUserCanDelete: () => false,
        BSupportsCommentThreads: () => false,
        GetActiveCommentThread: () => null,
        SetActiveCommentThread: () => undefined,
    };
};
const makeDeckyNativeActivity = (appId, metadata) => {
    const items = steamActivityNewsItemsFromMetadata(appId, metadata)
        .filter((item) => numericSteamNewsGid(item.gid || item.news_id || item.announcement_gid || item.id || item.url));
    if (!items.length)
        return null;
    const events = items
        .map((item, index) => makeDeckyNativeActivityEvent(appId, metadata, item, index))
        .sort((a, b) => Number(b.rtEventTime || 0) - Number(a.rtEventTime || 0));
    const grouped = new Map();
    for (const event of events) {
        const day = Math.floor(Number(event.rtEventTime || 0) / 86400) * 86400;
        if (!grouped.has(day))
            grouped.set(day, []);
        grouped.get(day).push(event);
    }
    const days = Array.from(grouped.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, dayEvents]) => ({
        isValid: dayEvents.length > 0,
        events: dayEvents,
        GetLatestEventTime: () => Math.max(...dayEvents.map((event) => Number(event.rtEventTime || 0))),
        GetEarliestEventTime: () => Math.min(...dayEvents.map((event) => Number(event.rtEventTime || 0))),
        BHasEvents: () => dayEvents.length > 0,
    }));
    const latest = events[0]?.rtEventTime || 0;
    const earliest = events[events.length - 1]?.rtEventTime || latest;
    return {
        __deckyNativeActivity: true,
        appid: appId,
        m_bNoMoreHistoryAvailable: true,
        lastAddedEventType: STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE,
        lastAddedPartnerEvent: null,
        get appActivityByDay() {
            return days;
        },
        get latest_user_news_time() {
            return latest;
        },
        get earliest_user_news_time() {
            return earliest;
        },
        get latest_game_activity_time() {
            return 0;
        },
        get earliest_game_activity_time() {
            return 0;
        },
        BHasEvents: () => events.length > 0,
        SortEvents: () => undefined,
        RequestStoreItems: async () => undefined,
        MergeUserNews: async () => undefined,
        MergeGameActivity: () => undefined,
        GetAchievementMapCache: () => "[]",
        GetUserNewsCache: () => [],
        GetGameActivityCache: () => [],
    };
};
const getDeckyNativeActivityForApp = (appId) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    void maybeRefreshSteamNewsForApp(appId);
    const cached = deckyNativeActivityCache().get(appId);
    if (cached)
        return cached;
    const metadata = metadataCache[String(appId)];
    if (!metadata)
        return null;
    const native = makeDeckyNativeActivity(appId, metadata);
    if (native)
        deckyNativeActivityCache().set(appId, native);
    return native;
};
const refreshDeckyNativeActivityForApp = async (appId, store) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    await ensureMetadataCacheFn();
    let metadata = metadataCache[String(appId)];
    if (!metadata)
        return null;
    const native = metadata ? makeDeckyNativeActivity(appId, metadata) : null;
    if (!native)
        return null;
    deckyNativeActivityCache().set(appId, native);
    const appActivityStore = store || globalThis.appActivityStore;
    try {
        if (appActivityStore?.m_mapAppActivity?.set)
            appActivityStore.m_mapAppActivity.set(appId, native);
    }
    catch (_error) {
        // If Steam changes the store shape, GetAppActivity still returns our cache.
    }
    return native;
};
const installNativeActivityStorePatch = (unpatchers) => {
    let attempts = 0;
    const tryInstall = () => {
        if (!hasActivityStore()) {
            if (patchInstallStatus.activity === "pending") {
                patchInstallStatus.activity = "skipped-missing-internal";
                warn("patch", "activity UI patch skipped", { status: patchInstallStatus.activity });
            }
            return true;
        }
        const store = globalThis.appActivityStore;
        if (!store || store.__deckyNativeActivityPatched)
            return !!store?.__deckyNativeActivityPatched;
        try {
            store.__deckyNativeActivityPatched = true;
            unpatchers.push(patchMethod(store, "GetAppActivity", (_thisValue, original, args) => {
                const appId = Number(args[0]);
                const native = getDeckyNativeActivityForApp(appId);
                if (native)
                    return native;
                if (appId && isNonSteamApp(getOverview(appId))) {
                    void refreshDeckyNativeActivityForApp(appId, store);
                }
                return original(...args);
            }));
            for (const methodName of ["RequestRestoreActivity", "RestoreActivity", "FetchLatestActivity", "FetchLatestActivityFromServer", "FetchActivityHistory"]) {
                if (typeof store[methodName] !== "function")
                    continue;
                unpatchers.push(patchMethod(store, methodName, (_thisValue, original, args) => {
                    const appId = Number(args[0]);
                    const native = getDeckyNativeActivityForApp(appId);
                    if (native)
                        return methodName.includes("History") || methodName.includes("Server") || methodName.includes("Restore") ? Promise.resolve(native) : undefined;
                    if (appId && isNonSteamApp(getOverview(appId))) {
                        void refreshDeckyNativeActivityForApp(appId, store);
                    }
                    return original(...args);
                }));
            }
            patchInstallStatus.activity = "installed";
            info("patch", "activity store patch installed", { status: patchInstallStatus.activity });
            return true;
        }
        catch (error) {
            patchInstallStatus.activity = "failed";
            warn("patch", "activity store patch failed", { status: patchInstallStatus.activity }, error);
            return true;
        }
    };
    if (tryInstall())
        return;
    const timer = window.setInterval(() => {
        attempts += 1;
        if (tryInstall() || attempts >= 40)
            window.clearInterval(timer);
    }, 500);
    unpatchers.push(() => window.clearInterval(timer));
};
const installNativePartnerEventStorePatch = (unpatchers) => {
    let attempts = 0;
    const patchedStores = new WeakSet();
    const patchOneStore = (partnerStore) => {
        if (!partnerStore || typeof partnerStore !== "object")
            return false;
        globalThis[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY] = partnerStore;
        for (const event of deckyNativePartnerEventCache().values())
            registerDeckyNativePartnerEventInSteamStore(event, partnerStore);
        if (partnerStore.__deckyNativePartnerEventsPatched || patchedStores.has(partnerStore))
            return true;
        partnerStore.__deckyNativePartnerEventsPatched = true;
        patchedStores.add(partnerStore);
        const maybePatch = (methodName, handler) => {
            if (typeof partnerStore[methodName] !== "function")
                return;
            unpatchers.push(patchMethod(partnerStore, methodName, (_thisValue, original, args) => handler(original, args)));
        };
        maybePatch("GetClanEventFromAnnouncementGID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], false);
            return event || original(...args);
        });
        maybePatch("BHasClanAnnouncementGID", (original, args) => {
            if (deckyNativePartnerEventForGid(args[0]))
                return true;
            return original(...args);
        });
        maybePatch("GetClanEventGIDFromAnnouncementGID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], false);
            return event?.GID || original(...args);
        });
        maybePatch("GetClanEventModel", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], true);
            return event || original(...args);
        });
        maybePatch("BHasClanEventModel", (original, args) => {
            if (deckyNativePartnerEventForGid(args[0]))
                return true;
            return original(...args);
        });
        maybePatch("GetClanEventGIDs", (original, args) => {
            const originalResult = original(...args) || [];
            const accountId = args[0]?.GetAccountID?.();
            const deckyGids = Array.from(deckyNativePartnerEventCache().values())
                .filter((event) => !accountId || event?.clanSteamID?.GetAccountID?.() === accountId)
                .map((event) => event?.GID)
                .filter(Boolean);
            return Array.from(new Set([...originalResult, ...deckyGids]));
        });
        maybePatch("GetClanEventGIDsForApp", (original, args) => {
            const appId = Number(args[0]);
            const originalResult = original(...args) || [];
            const deckyGids = Array.from(deckyNativePartnerEventCache().values())
                .filter((event) => Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId)
                .map((event) => event?.GID)
                .filter(Boolean);
            return Array.from(new Set([...originalResult, ...deckyGids]));
        });
        maybePatch("GetRankedClanEvents", (original, args) => {
            const originalResult = original(...args) || [];
            const clanAccountId = args[0]?.GetAccountID?.();
            const appId = Number(args[1] || 0);
            const deckyEvents = Array.from(deckyNativePartnerEventCache().values()).filter((event) => {
                const clanMatches = !clanAccountId || event?.clanSteamID?.GetAccountID?.() === clanAccountId;
                const appMatches = !appId || Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId;
                return clanMatches && appMatches;
            });
            return Array.from(new Map([...originalResult, ...deckyEvents].map((event) => [String(event?.GID || event?.AnnouncementGID), event])).values());
        });
        maybePatch("LoadPartnerEventFromAnnoucementGID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], false);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventFromAnnoucementGIDAndClanSteamID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[1] || args[0], false);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventFromClanEventGID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], true);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventFromClanEventGIDAndClanSteamID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[1] || args[0], true);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventGeneric", (original, args) => {
            // Real Steam signature is (clanSteamID, appid, eventGID, announcementGID, ...).
            const requestKey = args.find((arg) => deckyNativePartnerEventForGid(arg));
            const event = deckyNativePartnerEventForGid(requestKey, !!args[2]);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadHiddenPartnerEvent", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], true);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadHiddenPartnerEventByAnnouncementGID", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[0], false);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadAdjacentPartnerEvents", (original, args) => {
            const requestedId = args[0];
            const appId = Number(args[2] || 0);
            const direct = deckyNativePartnerEventForGid(requestedId, true);
            if (direct)
                return Promise.resolve([direct]);
            const appEvents = Array.from(deckyNativePartnerEventCache().values()).filter((event) => {
                return appId && (Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId);
            });
            if (appEvents.length)
                return Promise.resolve(appEvents);
            return original(...args);
        });
        maybePatch("LoadBatchPartnerEventsByEventGIDsOrAnnouncementGIDs", (original, args) => {
            const eventGids = Array.isArray(args[0]) ? args[0] : [];
            const announcementGids = Array.isArray(args[1]) ? args[1] : [];
            const hits = [];
            const missingEventGids = [];
            const missingAnnouncementGids = [];
            eventGids.forEach((gid) => {
                const event = deckyNativePartnerEventForGid(gid, true);
                if (event)
                    hits.push(event);
                else
                    missingEventGids.push(gid);
            });
            announcementGids.forEach((gid) => {
                const event = deckyNativePartnerEventForGid(gid, false);
                if (event)
                    hits.push(event);
                else
                    missingAnnouncementGids.push(gid);
            });
            if (!hits.length)
                return original(...args);
            if (!missingEventGids.length && !missingAnnouncementGids.length)
                return Promise.resolve(hits);
            return Promise.resolve(original(missingEventGids, missingAnnouncementGids, args[2])).then((rest) => [...hits, ...((Array.isArray(rest) && rest) || [])]);
        });
        maybePatch("FlushEventFromCache", (original, args) => {
            const event = deckyNativePartnerEventForGid(args[1] || args[0]);
            if (event)
                return undefined;
            return original(...args);
        });
        return true;
    };
    const tryInstall = () => {
        if (!hasSteamInternals()) {
            if (patchInstallStatus.partnerEvents === "pending") {
                patchInstallStatus.partnerEvents = "skipped-missing-internal";
                warn("patch", "partner events UI patch skipped", { status: patchInstallStatus.partnerEvents });
            }
            return true;
        }
        try {
            const stores = collectNativePartnerEventStores();
            let patchedAny = false;
            for (const store of stores)
                patchedAny = patchOneStore(store) || patchedAny;
            if (patchedAny) {
                patchInstallStatus.partnerEvents = "installed";
                info("patch", "partner event store patch installed", { status: patchInstallStatus.partnerEvents });
            }
            return patchedAny;
        }
        catch (error) {
            patchInstallStatus.partnerEvents = "failed";
            warn("patch", "partner event store patch failed", { status: patchInstallStatus.partnerEvents }, error);
            return true;
        }
    };
    if (tryInstall())
        return;
    const timer = window.setInterval(() => {
        attempts += 1;
        if (tryInstall() || attempts >= 80)
            window.clearInterval(timer);
    }, 500);
    unpatchers.push(() => window.clearInterval(timer));
};
const isDeckyNativeNewsRouteState = (state) => {
    const eventToShow = state?.event_to_show;
    if (!eventToShow)
        return false;
    const eventId = eventToShow.eventid || eventToShow.gidPartnerEvent || eventToShow.gid || eventToShow.GID;
    return !!eventId && !!deckyNativePartnerEventForGid(eventId);
};
const deckyNativeNewsRouteAppId = (state, fallbackPath = "") => {
    const eventToShow = state?.event_to_show || {};
    const appId = Number(eventToShow.appid || gameDetailAppIdFromPath(fallbackPath));
    return Number.isFinite(appId) && appId > 0 ? appId : 0;
};
const shouldReplaceDeckyNativeNewsPush = (targetPath, state) => {
    if (!isDeckyNativeNewsRouteState(state))
        return false;
    const targetAppId = deckyNativeNewsRouteAppId(state, targetPath);
    const currentAppId = gameDetailAppIdFromPath(currentRoutePath());
    // Steam's native Activity click normally pushes the same game-detail route with
    // only `event_to_show` added. Its close handler then replaces the current route
    // to remove `event_to_show`, leaving a duplicate game-detail entry behind. That
    // is why Andrea had to press B/Esc once for every news he had opened. For
    // Decky native news, make that event navigation replace the current game route
    // instead of pushing a new history entry. The modal still opens natively, but
    // closing it returns to the original route without polluting the back stack.
    return !!targetAppId && (!currentAppId || currentAppId === targetAppId);
};
const currentSteamHistoryState = (steamHistory) => {
    const location = steamHistory?.location || globalThis.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
    return location?.state || null;
};
const shouldBackOutOfDeckyNativeNewsClose = (steamHistory, targetPath, nextState) => {
    const currentState = currentSteamHistoryState(steamHistory);
    if (!isDeckyNativeNewsRouteState(currentState))
        return false;
    if (isDeckyNativeNewsRouteState(nextState))
        return false;
    const currentAppId = deckyNativeNewsRouteAppId(currentState, currentRoutePath());
    const targetAppId = Number(gameDetailAppIdFromPath(targetPath) || currentAppId);
    return !!currentAppId && (!targetAppId || currentAppId === targetAppId);
};
const backSteamHistory = (steamHistory) => {
    if (typeof steamHistory?.goBack === "function")
        return steamHistory.goBack();
    if (typeof steamHistory?.back === "function")
        return steamHistory.back();
    if (typeof steamHistory?.go === "function")
        return steamHistory.go(-1);
    return undefined;
};
const installNativeNewsHistoryRedirects = (unpatchers) => {
    try {
        const steamHistory = globalThis.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
        for (const methodName of ["push", "replace"]) {
            if (steamHistory?.[methodName]) {
                unpatchers.push(patchMethod(steamHistory, methodName, (_thisValue, original, args) => {
                    const target = historyPathFromArgs(args);
                    const state = historyStateFromArgs(args);
                    if (methodName === "push" && shouldReplaceDeckyNativeNewsPush(target, state) && typeof steamHistory.replace === "function") {
                        globalThis.__deckyNativeNewsOpenedWithReplaceAt = Date.now();
                        return steamHistory.replace(...args);
                    }
                    if (methodName === "replace" && shouldBackOutOfDeckyNativeNewsClose(steamHistory, target || currentRoutePath(), state)) {
                        const replacedAt = Number(globalThis.__deckyNativeNewsOpenedWithReplaceAt || 0);
                        // If our push->replace interception ran, closing the modal should keep using
                        // Steam's replace. If Steam opened via a path we did not intercept, use Back
                        // for the close action so the event entry is removed instead of replaced by a
                        // duplicate app-detail entry.
                        if (!replacedAt || Date.now() - replacedAt > 15000) {
                            return backSteamHistory(steamHistory) ?? original(...args);
                        }
                    }
                    try {
                        const path = String(target || "").toLowerCase();
                        if (path.includes("steamweb") && state && typeof state === "object" && typeof state.url === "string") {
                            const rewritten = rewriteSteamLinkToMatchedApp(state.url);
                            if (rewritten.rewrote) {
                                state.url = rewritten.url;
                                void frontendLog("nav", "steamweb router rewrite", {
                                    from: rewritten.fromAppId,
                                    to: rewritten.toAppId,
                                }).catch(() => undefined);
                            }
                        }
                    }
                    catch (_error) {
                        // Steam navigation must continue even if the redirect probe fails.
                    }
                    return original(...args);
                }));
            }
        }
    }
    catch (error) {
        warn("patch", "history patch skipped", error);
    }
    try {
        for (const methodName of ["pushState", "replaceState"]) {
            const original = window.history?.[methodName];
            if (typeof original !== "function")
                continue;
            const patched = function (...args) {
                const target = String(args[2] || "");
                const state = historyStateFromArgs(args);
                if (methodName === "pushState" && shouldReplaceDeckyNativeNewsPush(target, state)) {
                    globalThis.__deckyNativeNewsOpenedWithReplaceAt = Date.now();
                    return window.history.replaceState(args[0], args[1], args[2]);
                }
                if (methodName === "replaceState") {
                    const currentState = window.history?.state;
                    if (isDeckyNativeNewsRouteState(currentState) && !isDeckyNativeNewsRouteState(state)) {
                        const replacedAt = Number(globalThis.__deckyNativeNewsOpenedWithReplaceAt || 0);
                        if (!replacedAt || Date.now() - replacedAt > 15000) {
                            window.history.back();
                            return undefined;
                        }
                    }
                }
                try {
                    if (target.toLowerCase().includes("steamweb")) {
                        const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);
                        if (rewrote) {
                            return original.apply(this, [newState, args[1], args[2]]);
                        }
                    }
                }
                catch (_error) {
                    // Steam navigation must continue even if the redirect probe fails.
                }
                return original.apply(this, args);
            };
            window.history[methodName] = patched;
            unpatchers.push(() => {
                window.history[methodName] = original;
            });
        }
    }
    catch (error) {
        warn("patch", "window history redirect patch skipped", error);
    }
};
const installActivityRefreshedListener = (unpatchers) => {
    const activityRefreshedListener = () => {
        deckyNativeActivityCache().clear();
        deckyNativePartnerEventCache().clear();
        const appId = currentGameDetailAppId();
        void ensureMetadataCacheFn().then(() => {
            if (appId)
                void refreshDeckyNativeActivityForApp(appId);
        });
    };
    window.addEventListener("decky-metadata:activity-refreshed", activityRefreshedListener);
    unpatchers.push(() => window.removeEventListener("decky-metadata:activity-refreshed", activityRefreshedListener));
};
const installCommunityFeedPatch = (unpatchers) => {
    try {
        const httpClient = DFL.findModuleChild((module) => {
            if (!module || typeof module !== "object")
                return undefined;
            if (typeof module.g?.get === "function" && typeof module.g?.post === "function") {
                return module.g;
            }
            return undefined;
        });
        void frontendLog("community", "feed patch install", {
            httpClientFound: Boolean(httpClient),
            hasGet: typeof httpClient?.get === "function",
            hasPost: typeof httpClient?.post === "function",
        }).catch(() => undefined);
        const patchFeedMethod = (methodName) => {
            if (!httpClient?.[methodName])
                return;
            unpatchers.push(patchMethod(httpClient, methodName, (_thisValue, original, args) => {
                const url = String(args[0] || "");
                const activityAppId = activityAppIdFromUrl(url);
                if (activityAppId) {
                    return steamActivityPayloadForApp(activityAppId).then((payload) => {
                        if (payload)
                            return payload;
                        return original(...args);
                    });
                }
                const match = url.match(/library\/appcommunityfeed\/(\d+)/);
                if (match) {
                    const appId = Number(match[1]);
                    const overview = getOverview(appId);
                    // Only touch non-Steam shortcuts; real Steam games keep their native feed.
                    if (isNonSteamApp(overview)) {
                        return (async () => {
                            try {
                                await ensureMetadataCacheFn();
                            }
                            catch (err) {
                                void frontendLog("community", "metadata cache unavailable", {
                                    appId,
                                    err: String(err),
                                }).catch(() => undefined);
                                return original(...args);
                            }
                            const steamAppId = Number(metadataCache[String(appId)]?.steam_appid) || 0;
                            const steamUrl = rewriteCommunityFeedUrlForSteamApp(url, steamAppId);
                            const steamArgs = steamUrl ? [steamUrl, ...args.slice(1)] : null;
                            const page = requestedCommunityPage(url, args.slice(1));
                            const response = await resolveCommunityRequest({
                                isNonSteam: true,
                                appId,
                                page,
                                originalArgs: args,
                                rewrittenArgs: steamArgs,
                                nativeRequest: (requestArgs) => Promise.resolve(original(...requestArgs)),
                                fallbackRequest: getCommunityFallbackPage,
                                onFallbackError: (err) => {
                                    void frontendLog("community", "fallback RPC unavailable", {
                                        appId,
                                        steamAppId,
                                        page,
                                        err: String(err),
                                    }).catch(() => undefined);
                                },
                            });
                            const hasSyntheticItems = Array.isArray(response?.hub) &&
                                response.hub.some((item) => isDeckyCommunityId(item?.published_file_id));
                            void frontendLog("community", "feed selected", {
                                appId,
                                steamAppId,
                                page,
                                source: hasSyntheticItems
                                    ? response?.cached
                                        ? "metadata"
                                        : "steam-scrape"
                                    : "native",
                                hubLen: Array.isArray(response?.hub) ? response.hub.length : null,
                            }).catch(() => undefined);
                            return response;
                        })().catch((err) => {
                            void frontendLog("community", "feed fallback error", {
                                appId,
                                err: String(err),
                            }).catch(() => undefined);
                            throw err;
                        });
                    }
                }
                return original(...args);
            }));
        };
        patchFeedMethod("get");
        patchFeedMethod("post");
    }
    catch (error) {
        warn("patch", "community feed patch skipped", error);
    }
    try {
        const communityVoteModule = DFL.findModuleChild((module) => {
            if (!module || typeof module !== "object")
                return undefined;
            if (module.bJ && typeof module.dK === "function")
                return module;
            return undefined;
        });
        if (communityVoteModule?.dK) {
            unpatchers.push(patchMethod(communityVoteModule, "dK", (_thisValue, original, args) => {
                const ids = Array.isArray(args[0]) ? args[0] : [];
                if (ids.length && ids.every(isDeckyCommunityId)) {
                    const voteNone = communityVoteModule.bJ?.None ?? 0;
                    return Promise.resolve(new Map(ids.map((id) => [
                        id,
                        { vote: voteNone, bReported: false },
                    ])));
                }
                return original(...args);
            }));
        }
    }
    catch (error) {
        warn("patch", "community vote patch skipped", error);
    }
};

const firstUrlishArgIndex = (args, firstOnly = false) => {
    const limit = firstOnly ? Math.min(args.length, 1) : args.length;
    for (let index = 0; index < limit; index += 1) {
        const value = args[index];
        if (typeof value === "string")
            return index;
        if (typeof URL !== "undefined" && value instanceof URL)
            return index;
    }
    return -1;
};
const logSteamLinkNavigation = (kind, original, rewritten) => {
    void frontendLog("nav", "steam link", { kind, original, rewritten }).catch(() => undefined);
};
const installSteamNavigationRedirect = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__deckyNavRedirect) {
        unpatchers.push(() => undefined);
        return;
    }
    const redirectUnpatchers = [];
    globalState.__deckyNavRedirect = { installed: true };
    const patchUrlOpener = (target, methodName, firstOnly = false) => {
        if (typeof target?.[methodName] !== "function")
            return;
        const original = target[methodName];
        const patched = function deckySteamNavigationRedirect(...args) {
            try {
                const index = firstUrlishArgIndex(args, firstOnly);
                if (index < 0)
                    return original.apply(this, args);
                const originalUrl = String(args[index] || "");
                const targetInfo = steamLinkTarget(originalUrl);
                if (!targetInfo)
                    return original.apply(this, args);
                const rewritten = rewriteSteamLinkToMatchedApp(originalUrl);
                logSteamLinkNavigation(targetInfo.kind, originalUrl, rewritten.url);
                if (!rewritten.rewrote)
                    return original.apply(this, args);
                const nextArgs = [...args];
                nextArgs[index] = rewritten.url;
                return original.apply(this, nextArgs);
            }
            catch (_error) {
                return original.apply(this, args);
            }
        };
        target[methodName] = patched;
        redirectUnpatchers.push(() => {
            if (target?.[methodName] === patched) {
                target[methodName] = original;
            }
        });
    };
    const patchAppIdOpener = (target, methodName, argIndex = 0) => {
        if (typeof target?.[methodName] !== "function")
            return;
        const original = target[methodName];
        const patched = function deckySteamAppIdNavigationRedirect(...args) {
            try {
                const originalAppId = Number(args[argIndex]);
                const mapped = steamAppIdForApp(originalAppId);
                if (mapped > 0 && mapped !== originalAppId) {
                    const nextArgs = [...args];
                    nextArgs[argIndex] = mapped;
                    logSteamLinkNavigation("store", String(args[argIndex]), String(mapped));
                    return original.apply(this, nextArgs);
                }
                return original.apply(this, args);
            }
            catch (_error) {
                return original.apply(this, args);
            }
        };
        target[methodName] = patched;
        redirectUnpatchers.push(() => {
            if (target?.[methodName] === patched) {
                target[methodName] = original;
            }
        });
    };
    patchUrlOpener(DFL.Navigation, "NavigateToSteamWeb");
    patchUrlOpener(DFL.Navigation, "NavigateToExternalWeb");
    patchUrlOpener(window?.SteamClient?.System, "OpenInSystemBrowser");
    patchUrlOpener(window?.SteamClient?.Overlay, "OpenExternalBrowserURL");
    patchUrlOpener(window, "open", true);
    patchAppIdOpener(window?.SteamClient?.Apps, "ShowStore", 0);
    unpatchers.push(() => {
        redirectUnpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
        delete globalState.__deckyNavRedirect;
    });
};
const installMainWindowHistoryRedirect = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__deckyMainWindowHistoryRedirect) {
        unpatchers.push(() => undefined);
        return;
    }
    const redirectUnpatchers = [];
    let cancelled = false;
    let retryId;
    let attempts = 0;
    globalState.__deckyMainWindowHistoryRedirect = { installed: true };
    const clearRetry = () => {
        if (retryId !== undefined) {
            window.clearTimeout(retryId);
            retryId = undefined;
        }
    };
    const mainWindowHistory = () => window?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ??
        globalThis?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
    const patchHistoryMethod = (history, methodName) => {
        const unpatch = patchMethod(history, methodName, (_thisValue, original, args) => {
            try {
                const path = historyPathFromArgs(args);
                const state = historyStateFromArgs(args);
                if (String(path || "").toLowerCase().includes("steamweb") &&
                    state &&
                    typeof state === "object" &&
                    typeof state.url === "string") {
                    const rewritten = rewriteSteamLinkToMatchedApp(state.url);
                    if (rewritten.rewrote) {
                        state.url = rewritten.url;
                        void frontendLog("nav", "mainwindow steamweb rewrite", {
                            method: methodName,
                            from: rewritten.fromAppId,
                            to: rewritten.toAppId,
                        }).catch(() => undefined);
                    }
                }
            }
            catch (_error) {
                // Steam navigation must continue even if the redirect probe fails.
            }
            return original(...args);
        });
        const patched = history?.[methodName];
        redirectUnpatchers.push(() => {
            try {
                if (history?.[methodName] === patched) {
                    unpatch();
                }
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
    };
    const tryInstall = () => {
        if (cancelled)
            return;
        const history = mainWindowHistory();
        if (history && typeof history.push === "function" && typeof history.replace === "function") {
            clearRetry();
            patchHistoryMethod(history, "push");
            patchHistoryMethod(history, "replace");
            return;
        }
        attempts += 1;
        if (attempts < 30) {
            retryId = window.setTimeout(tryInstall, 500);
        }
    };
    tryInstall();
    unpatchers.push(() => {
        cancelled = true;
        clearRetry();
        redirectUnpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
        delete globalState.__deckyMainWindowHistoryRedirect;
    });
};

const NAVIGATION_TRACE_NOISE_PATTERN = /cached|registerfor|getlaunch|getgameaction|appdetails|appdata|appoverview|appachievement/i;
const NAVIGATION_TRACE_METHOD_PATTERN = /store|community|hub|forum|discuss|guide|workshop|market|navigate|openurl|executesteamurl|browser|web|overlay|showstore|link/i;
const NAVIGATION_TRACE_CLICK_PATTERN = /store|community|hub|discuss|guide|market|support/i;
const truncateTraceValue = (value, limit = 80) => {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 3))}...` : normalized;
};
const safeStringifyTrace = (value, max = 500) => {
    try {
        const seen = new WeakSet();
        const serialized = JSON.stringify(value, (_key, item) => {
            if (typeof item === "function")
                return "[fn]";
            if (typeof item === "bigint")
                return String(item);
            if (item && typeof item === "object") {
                if (seen.has(item))
                    return "[Circular]";
                seen.add(item);
            }
            return item;
        });
        return truncateTraceValue(serialized === undefined ? String(value) : serialized, max);
    }
    catch (_error) {
        try {
            return truncateTraceValue(String(value), max);
        }
        catch (_innerError) {
            return "[unserializable]";
        }
    }
};
const navigationTraceArg = (value) => {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string")
        return truncateTraceValue(value);
    if (value === null)
        return "null";
    if (typeof value === "boolean")
        return String(value);
    if (typeof value === "undefined")
        return "undefined";
    if (typeof value === "function")
        return "Function";
    if (typeof value === "bigint")
        return String(value);
    if (typeof value === "symbol")
        return "Symbol";
    return value?.constructor?.name || "Object";
};
const shouldTraceNavigationCall = (methodName, args) => {
    if (NAVIGATION_TRACE_NOISE_PATTERN.test(methodName))
        return false;
    if (NAVIGATION_TRACE_METHOD_PATTERN.test(methodName))
        return true;
    return args.some((arg) => typeof arg === "number" && steamAppIdForApp(arg) > 0);
};
const installClickTrace = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__deckyClickTrace) {
        unpatchers.push(() => undefined);
        return;
    }
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
        unpatchers.push(() => undefined);
        return;
    }
    globalState.__deckyClickTrace = { installed: true };
    const isActionableTraceElement = (element) => {
        const tag = element.tagName.toLowerCase();
        return (tag === "button" ||
            tag === "a" ||
            element.getAttribute("role") === "button" ||
            element.hasAttribute("onclick") ||
            element.hasAttribute("href"));
    };
    const actionableElement = (target) => {
        let current = target instanceof Element ? target : null;
        for (let depth = 0; current && depth < 6; depth += 1) {
            if (isActionableTraceElement(current))
                return current;
            current = current.parentElement;
        }
        return null;
    };
    const dataAttributes = (element) => {
        const attrs = {};
        for (const attr of Array.from(element.attributes || [])) {
            if (attr.name.startsWith("data-")) {
                attrs[attr.name] = truncateTraceValue(attr.value, 60);
            }
        }
        return attrs;
    };
    const handler = (event) => {
        try {
            const element = actionableElement(event.target);
            if (!element)
                return;
            const text = truncateTraceValue(element.textContent || "", 60);
            const ariaLabel = truncateTraceValue(element.getAttribute("aria-label") || "", 60);
            if (!NAVIGATION_TRACE_CLICK_PATTERN.test(`${text} ${ariaLabel}`))
                return;
            const href = element instanceof HTMLAnchorElement
                ? element.href
                : element.getAttribute("href") || undefined;
            const descriptor = {
                tag: element.tagName.toLowerCase(),
                text,
                href: href ? truncateTraceValue(href, 120) : undefined,
                role: element.getAttribute("role") || undefined,
                "aria-label": ariaLabel || undefined,
                data: dataAttributes(element),
            };
            void frontendLog("trace", "click", descriptor).catch(() => undefined);
        }
        catch (_error) {
            // Passive diagnostics must never affect click behavior.
        }
    };
    try {
        document.addEventListener("click", handler, true);
    }
    catch (_error) {
        delete globalState.__deckyClickTrace;
        unpatchers.push(() => undefined);
        return;
    }
    unpatchers.push(() => {
        try {
            document.removeEventListener("click", handler, true);
        }
        catch (_error) {
            // Best effort teardown.
        }
        delete globalState.__deckyClickTrace;
    });
};
const installNavigationTrace = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__deckyNavTrace) {
        unpatchers.push(() => undefined);
        return;
    }
    const traceUnpatchers = [];
    const seenTargets = new Set();
    globalState.__deckyNavTrace = { installed: true };
    const collectMethodNames = (obj) => {
        const names = new Set();
        let cur = obj;
        let depth = 0;
        while (cur && cur !== Object.prototype && depth < 6) {
            for (const name of Object.getOwnPropertyNames(cur)) {
                if (name === "constructor")
                    continue;
                try {
                    if (typeof obj[name] === "function") {
                        names.add(name);
                    }
                }
                catch (_error) {
                    // Some Steam getters throw outside their expected runtime path.
                }
            }
            cur = Object.getPrototypeOf(cur);
            depth += 1;
        }
        return [...names];
    };
    const patchTraceTarget = (target, objLabel) => {
        try {
            if (!target || seenTargets.has(target))
                return 0;
            seenTargets.add(target);
            let wrapped = 0;
            for (const name of collectMethodNames(target)) {
                const original = target[name];
                if (typeof original !== "function")
                    continue;
                const patched = function deckyNavigationTrace(...args) {
                    try {
                        if (shouldTraceNavigationCall(name, args)) {
                            void frontendLog("trace", `${objLabel}.${name}`, { args: args.map(navigationTraceArg) }).catch(() => undefined);
                        }
                    }
                    catch (_error) {
                        // Diagnostic tracing must never affect Steam navigation.
                    }
                    return original.apply(this, args);
                };
                try {
                    target[name] = patched;
                }
                catch (_error) {
                    continue;
                }
                wrapped += 1;
                traceUnpatchers.push(() => {
                    try {
                        if (target?.[name] === patched) {
                            target[name] = original;
                        }
                    }
                    catch (_error) {
                        // Best effort teardown.
                    }
                });
            }
            return wrapped;
        }
        catch (_error) {
            return 0;
        }
    };
    const counts = {
        "SteamClient.Apps": patchTraceTarget(window?.SteamClient?.Apps, "SteamClient.Apps"),
        Navigation: patchTraceTarget(DFL.Navigation, "Navigation"),
        Router: 0,
        "SteamClient.URL": patchTraceTarget(window?.SteamClient?.URL, "SteamClient.URL"),
        "SteamClient.System": patchTraceTarget(window?.SteamClient?.System, "SteamClient.System"),
        "SteamClient.Overlay": patchTraceTarget(window?.SteamClient?.Overlay, "SteamClient.Overlay"),
        MainWindowBrowserManager: patchTraceTarget(window?.MainWindowBrowserManager, "MainWindowBrowserManager"),
    };
    counts.Router += patchTraceTarget(window?.SteamClient?.Router, "SteamClient.Router");
    counts.Router += patchTraceTarget(globalState.Router, "Router");
    try {
        const history = window?.history;
        for (const methodName of ["pushState", "replaceState"]) {
            const original = history?.[methodName];
            if (typeof original !== "function")
                continue;
            const patched = function deckyHistoryTrace(...args) {
                try {
                    const url = String(args[2] ?? "");
                    void frontendLog("trace", "history", {
                        method: methodName,
                        url: truncateTraceValue(url, 120),
                    }).catch(() => undefined);
                    if (url.toLowerCase().includes("steamweb")) {
                        void frontendLog("trace", "history-state", {
                            method: methodName,
                            url: truncateTraceValue(url, 120),
                            state: safeStringifyTrace(args[0]),
                        }).catch(() => undefined);
                    }
                }
                catch (_error) {
                    // Diagnostic tracing must never affect Steam navigation.
                }
                return original.apply(this, args);
            };
            history[methodName] = patched;
            traceUnpatchers.push(() => {
                try {
                    if (history?.[methodName] === patched) {
                        history[methodName] = original;
                    }
                }
                catch (_error) {
                    // Best effort teardown.
                }
            });
        }
    }
    catch (_error) {
        // History tracing is diagnostic-only.
    }
    try {
        void frontendLog("trace", "nav trace installed", { counts }).catch(() => undefined);
    }
    catch (_error) {
        // Diagnostic tracing must never affect Steam navigation.
    }
    unpatchers.push(() => {
        traceUnpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
        delete globalState.__deckyNavTrace;
    });
};
const HISTORY_INSTANCE_TRACE_KEY_PATTERN = /window|instance|store|history|nav|main|browser|gamepad|overlay/i;
const safeTraceProperty = (obj, key) => {
    try {
        return obj?.[key];
    }
    catch (_error) {
        return undefined;
    }
};
const safeTraceOwnPropertyNames = (obj) => {
    try {
        return Object.getOwnPropertyNames(obj);
    }
    catch (_error) {
        return [];
    }
};
const isHistoryInstanceTraceTarget = (value) => {
    try {
        if (!value || typeof value !== "object")
            return false;
        if (typeof value.push !== "function" || typeof value.replace !== "function")
            return false;
        const location = safeTraceProperty(value, "location");
        const entries = safeTraceProperty(value, "entries");
        const length = safeTraceProperty(value, "length");
        return ((!!location && typeof location === "object") ||
            Array.isArray(entries) ||
            typeof length === "number");
    }
    catch (_error) {
        return false;
    }
};
const hasTraceableHistoryMethods = (value) => {
    try {
        return !!value && typeof value.push === "function" && typeof value.replace === "function";
    }
    catch (_error) {
        return false;
    }
};
const collectHistoryInstanceTraceTargets = () => {
    const globalState = globalThis;
    const windowState = typeof window !== "undefined" ? window : undefined;
    const roots = [
        { label: "Router", history: safeTraceProperty(globalState, "Router") },
        { label: "Router.WindowStore", history: safeTraceProperty(safeTraceProperty(globalState, "Router"), "WindowStore") },
        { label: "SteamUIStore", history: safeTraceProperty(windowState, "SteamUIStore") },
        { label: "App", history: safeTraceProperty(windowState, "App") },
    ];
    const instances = [];
    const seenNodes = new WeakSet();
    let scannedNodes = 0;
    const maxDepth = 4;
    const maxNodes = 400;
    const recordInstance = (label, history, requireShape = true) => {
        if (!history || typeof history !== "object")
            return;
        if (requireShape ? !isHistoryInstanceTraceTarget(history) : !hasTraceableHistoryMethods(history))
            return;
        instances.push({ label, history });
    };
    const queue = roots
        .filter(({ history }) => !!history && typeof history === "object")
        .map(({ label, history }) => ({ label, value: history, depth: 0 }));
    for (let index = 0; index < queue.length && scannedNodes < maxNodes; index += 1) {
        const { label, value, depth } = queue[index];
        if (!value || typeof value !== "object")
            continue;
        if (seenNodes.has(value))
            continue;
        seenNodes.add(value);
        scannedNodes += 1;
        recordInstance(label, value);
        recordInstance(`${label}.m_history`, safeTraceProperty(value, "m_history"), false);
        if (depth >= maxDepth)
            continue;
        for (const key of safeTraceOwnPropertyNames(value)) {
            if (scannedNodes + queue.length >= maxNodes * 2)
                break;
            if (!HISTORY_INSTANCE_TRACE_KEY_PATTERN.test(key))
                continue;
            const next = safeTraceProperty(value, key);
            if (!next || typeof next !== "object")
                continue;
            queue.push({ label: `${label}.${key}`, value: next, depth: depth + 1 });
        }
    }
    return instances;
};
const installHistoryInstanceTrace = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__deckyHistoryInstanceTrace) {
        unpatchers.push(() => undefined);
        return;
    }
    const traceUnpatchers = [];
    const wrappedHistories = new WeakSet();
    globalState.__deckyHistoryInstanceTrace = { installed: true };
    const instances = collectHistoryInstanceTraceTargets();
    try {
        void frontendLog("trace", "history instances", {
            labels: instances.map(({ label }) => label),
            count: instances.length,
        }).catch(() => undefined);
    }
    catch (_error) {
        // Passive diagnostics must never affect Steam navigation.
    }
    const shouldTraceHistoryInstanceCall = (path, state) => {
        if (String(path || "").toLowerCase().includes("steamweb"))
            return true;
        const url = typeof state?.url === "string" ? state.url : "";
        return !!url && !!steamLinkTarget(url);
    };
    for (const { label, history } of instances) {
        try {
            if (!history || typeof history !== "object" || wrappedHistories.has(history))
                continue;
            wrappedHistories.add(history);
            for (const methodName of ["push", "replace"]) {
                const original = history[methodName];
                if (typeof original !== "function")
                    continue;
                const patched = function deckyHistoryInstanceTrace(...args) {
                    try {
                        const path = historyPathFromArgs(args);
                        const state = historyStateFromArgs(args);
                        if (shouldTraceHistoryInstanceCall(path, state)) {
                            void frontendLog("trace", "history call", {
                                instance: label,
                                method: methodName,
                                path: truncateTraceValue(path, 120),
                                url: typeof state?.url === "string" ? truncateTraceValue(state.url, 160) : "",
                            }).catch(() => undefined);
                        }
                    }
                    catch (_error) {
                        // Diagnostic tracing must never affect Steam navigation.
                    }
                    return original.apply(this, args);
                };
                try {
                    history[methodName] = patched;
                }
                catch (_error) {
                    continue;
                }
                traceUnpatchers.push(() => {
                    try {
                        if (history?.[methodName] === patched) {
                            history[methodName] = original;
                        }
                    }
                    catch (_error) {
                        // Best effort teardown.
                    }
                });
            }
        }
        catch (_error) {
            // Keep scanning and patching other history instances.
        }
    }
    unpatchers.push(() => {
        traceUnpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
        delete globalState.__deckyHistoryInstanceTrace;
    });
};

// Stable keys for the entries we inject, so we can find and de-duplicate them.
const ENTRY_KEY = "decky-metadata-edit";
const ENTRY_KEYS = new Set([ENTRY_KEY]);
let contextMenuTraceEnabled = false;
const setContextMenuTraceEnabled = (enabled) => {
    contextMenuTraceEnabled = enabled;
};
const hasAppPropertiesHelper = (items) => {
    if (!Array.isArray(items) || items.length === 0)
        return false;
    return !!DFL.findInReactTree(items, (node) => node?.onSelected?.toString?.().includes("AppProperties"));
};
const traceMenu = (phase, ownerAppId, fallbackAppId, finalAppId, isGameMenu, hasAppProperties, hasLaunchSource, removedExisting, insertedOrSkipped, items) => {
    if (!contextMenuTraceEnabled)
        return;
    try {
        const snippets = (Array.isArray(items) ? items : [])
            .slice(0, 5)
            .map((node) => ({
            key: node?.key,
            text: typeof node?.props?.children === "string" ? node.props.children : undefined,
        }));
        frontendLog("trace", "context-menu", {
            phase,
            ownerAppId,
            fallbackAppId,
            finalAppId,
            isGameContextMenu: isGameMenu,
            hasAppProperties,
            hasLaunchSource,
            removedExisting,
            insertedOrSkipped,
            snippets,
        }).catch(() => undefined);
    }
    catch (_e) { }
};
/**
 * Resolve Steam's internal LibraryContextMenu class at runtime.
 *
 * The class is not exported, so we locate the webpack module that references
 * it, pick the member whose source mentions "navigator:", and read the type
 * back from a throwaway render.
 */
const resolveLibraryContextMenu = () => {
    const owningModule = DFL.findModuleByExport((member) => typeof member?.toString === "function" &&
        member.toString().includes("().LibraryContextMenu"));
    const menuComponent = Object.values(owningModule).find((member) => typeof member?.toString === "function" &&
        member.toString().includes("navigator:"));
    return DFL.fakeRenderComponent(menuComponent).type;
};
const LibraryContextMenu = resolveLibraryContextMenu();
/**
 * Work out which appid the menu is really for.
 *
 * Steam reuses context-menu instances, so the appid passed in can be stale.
 * Prefer a fresh appid carried on the owning React node; otherwise scan the
 * node tree for an `app.appid` (used by newer Steam clients).
 */
const resolveAppId = (nodes, fallbackAppId) => {
    const fresherNode = (nodes || []).find((node) => node?._owner?.pendingProps?.overview?.appid &&
        node._owner.pendingProps.overview.appid !== fallbackAppId);
    if (fresherNode) {
        return Number(fresherNode._owner.pendingProps.overview.appid);
    }
    const taggedNode = DFL.findInTree(nodes, (node) => node?.app?.appid, {
        walkable: ["props", "children"],
    });
    return Number(taggedNode?.app?.appid ?? fallbackAppId);
};
/**
 * True only for the per-game context menu. Its launch action's handler
 * references "launchSource"; menus like the screenshot menu do not, which
 * lets us ignore them.
 */
const isGameContextMenu = (items) => {
    if (!Array.isArray(items) || items.length === 0)
        return false;
    return !!DFL.findInReactTree(items, (node) => node?.props?.onSelected?.toString?.().includes("launchSource"));
};
/** Remove any previously injected entry so re-renders cannot stack copies. */
const removeOurEntry = (items) => {
    let removed = false;
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (ENTRY_KEYS.has(items[index]?.key)) {
            items.splice(index, 1);
            removed = true;
        }
    }
    return removed;
};
/** Insert our entry just above "Properties..." (or at the end) for shortcuts. */
const insertOurEntry = (items, appId) => {
    if (!isNonSteamApp(getOverview(appId)))
        return false;
    const propertiesIndex = items.findIndex((node) => DFL.findInReactTree(node, (x) => x?.onSelected?.toString?.().includes("AppProperties")));
    const insertAt = propertiesIndex >= 0 ? propertiesIndex : items.length;
    items.splice(insertAt, 0, SP_JSX.jsx(DFL.MenuItem, { onSelected: () => DFL.Navigation.Navigate(`/decky-metadata/${appId}`), children: "Decky metadata..." }, ENTRY_KEY));
    return true;
};
const syncOurEntry = (phase, items, ownerAppId, fallbackAppId) => {
    const removed = removeOurEntry(items);
    const isGameMenu = isGameContextMenu(items);
    const hasAppProps = hasAppPropertiesHelper(items);
    let inserted = "skipped";
    let finalAppId = 0;
    if (!isGameMenu) {
        inserted = "skipped-not-top-level";
    }
    else if (ownerAppId > 0) {
        finalAppId = ownerAppId;
        inserted = "owner-app-id";
    }
    else if (fallbackAppId > 0) {
        if (hasAppProps) {
            finalAppId = fallbackAppId;
            inserted = "fallback-app-id";
        }
        else {
            inserted = "skipped-incomplete-shape";
        }
    }
    else {
        inserted = "skipped-no-valid-appid";
    }
    if (finalAppId > 0) {
        const actuallyInserted = insertOurEntry(items, finalAppId);
        if (!actuallyInserted) {
            inserted = "skipped-not-non-steam";
        }
    }
    traceMenu(phase, ownerAppId, fallbackAppId, finalAppId, isGameMenu, hasAppProps, isGameMenu, removed, inserted, items);
};
/**
 * Patch the library context menu so non-Steam games gain a Decky Metadata entry.
 * @param LibraryContextMenuClass The resolved menu class.
 * @returns An object exposing unpatch() for plugin teardown.
 */
const contextMenuPatch = (LibraryContextMenuClass) => {
    if (!LibraryContextMenuClass || !hasSteamInternals()) {
        if (patchInstallStatus.contextMenu === "pending") {
            patchInstallStatus.contextMenu = "skipped-missing-internal";
            warn("patch", "context menu patch skipped", { status: patchInstallStatus.contextMenu });
        }
        return { unpatch: () => { } };
    }
    let innerPatch;
    let outerPatch;
    try {
        outerPatch = DFL.afterPatch(LibraryContextMenuClass.prototype, "render", (_renderArgs, menu) => {
            const ownerAppId = Number(menu?._owner?.pendingProps?.overview?.appid ?? 0);
            const fallbackAppId = resolveAppId(menu?.props?.children ?? [], 0);
            if (!innerPatch) {
                innerPatch = DFL.afterPatch(menu, "type", (_typeArgs, rendered) => {
                    // First render of the menu body.
                    DFL.afterPatch(rendered.type.prototype, "render", (_args, output) => {
                        const items = output?.props?.children?.[0];
                        try {
                            syncOurEntry("first-render", items, ownerAppId, fallbackAppId);
                        }
                        catch (_error) {
                            // Steam reshapes this tree often; skip on mismatch.
                        }
                        return output;
                    });
                    // Subsequent updates when Steam refreshes the app overview.
                    DFL.afterPatch(rendered.type.prototype, "shouldComponentUpdate", ([nextProps], shouldUpdate) => {
                        try {
                            if (shouldUpdate === true) {
                                syncOurEntry("should-update", nextProps.children, ownerAppId, fallbackAppId);
                            }
                            else {
                                removeOurEntry(nextProps.children);
                            }
                        }
                        catch (_error) {
                            // Not our menu; leave the decision untouched.
                        }
                        return shouldUpdate;
                    });
                    return rendered;
                });
            }
            else if (Array.isArray(menu?.props?.children)) {
                try {
                    syncOurEntry("outer-rerender", menu.props.children, ownerAppId, fallbackAppId);
                }
                catch (_error) {
                    // Ignore non-matching menus.
                }
            }
            return menu;
        });
        patchInstallStatus.contextMenu = "installed";
        info("patch", "context menu patch installed", { status: patchInstallStatus.contextMenu });
    }
    catch (error) {
        patchInstallStatus.contextMenu = "failed";
        warn("patch", "context menu patch failed", { status: patchInstallStatus.contextMenu }, error);
    }
    return {
        unpatch: () => {
            outerPatch?.unpatch();
            innerPatch?.unpatch();
        },
    };
};

// Safe React element-tree traversal, extracted for unit testing.
//
// HAZARD (learned on-device 2026-07-11): a traversal that follows arbitrary
// object-valued props will wander into MobX store instances (overview /
// details / appStore). Enumerating an observable's keys inside an observer
// render subscribes that render to every property touched — after which any
// store change re-renders, re-walks, re-subscribes, and the renderer wedges.
// This walker therefore descends ONLY into React elements and arrays via
// props.children, with a node budget as a backstop.
const isReactElement = (node) => !!node &&
    typeof node === "object" &&
    typeof node.$$typeof === "symbol" &&
    String(node.$$typeof).includes("react.");
const findChildElements = (root, predicate, out) => {
    const stack = [root];
    let budget = 500;
    while (stack.length && budget-- > 0 && out.length < 8) {
        const node = stack.pop();
        if (!node || typeof node !== "object")
            continue;
        if (Array.isArray(node)) {
            for (const child of node)
                stack.push(child);
            continue;
        }
        if (!isReactElement(node))
            continue;
        try {
            if (predicate(node)) {
                out.push(node);
                continue;
            }
        }
        catch (_error) {
            // Keep walking when a candidate's props are not inspectable.
        }
        const children = node.props?.children;
        if (children && typeof children === "object")
            stack.push(children);
    }
};
const isQuickLinksElement = (node) => {
    const props = node?.props;
    return (!!props &&
        typeof props === "object" &&
        "overview" in props &&
        "details" in props &&
        "workshopVisible" in props &&
        "marketPresence" in props);
};
const isInfoSectionBoundary = (node) => {
    const props = node?.props;
    return (!!props &&
        typeof props === "object" &&
        "overview" in props &&
        "details" in props &&
        typeof node.type === "function" &&
        !node.type.prototype?.isReactComponent &&
        !node.type.__dmQuickLinksWrapper);
};

const isNeverOnSteam = (appId) => {
    try {
        const metadata = metadataCache[String(appId)];
        if (!metadata)
            return false;
        return !(Number(metadata.steam_appid) > 0);
    }
    catch (_error) {
        return false;
    }
};
// The quick-links row (Store Page / Community Hub / Discussions / …) only
// renders because the BIsModOrShortcut spoof makes the app look like a real
// Steam title; for never-on-Steam games every link is dead. The row's element
// is not reachable from the route render tree — Steam's page host mounts the
// Game Info content through several function-component boundaries — so the
// suppression hooks the section wrapper class (the component that registers
// sections via parent.RegisterSection(name, el)): its render output holds the
// info-section content element, whose render in turn creates the links row.
const NullQuickLinks = () => null;
const quickLinksWrapperCache = new Map();
const installNeverOnSteamQuickLinksSuppression = (unpatchers) => {
    const maxAttempts = 5;
    let attempts = 0;
    let cancelled = false;
    let retryId;
    let suppressionUnpatch;
    const clearRetry = () => {
        if (retryId !== undefined) {
            window.clearTimeout(retryId);
            retryId = undefined;
        }
    };
    const findSectionClass = () => DFL.findModuleChild((module) => {
        if (typeof module !== "object")
            return undefined;
        for (const prop in module) {
            try {
                const candidate = module[prop];
                if (typeof candidate === "function" &&
                    candidate.prototype?.isReactComponent &&
                    typeof candidate.prototype.render === "function" &&
                    String(candidate.prototype.render).includes("RegisterSection")) {
                    return candidate;
                }
            }
            catch (_error) {
                continue;
            }
        }
        return undefined;
    });
    const warnFingerprintMiss = () => {
        const fields = { attempt: attempts, maxAttempts };
        warn("patch", "never-on-Steam quick-links section target not found", fields);
        void frontendLog("patch", "never-on-Steam quick-links section target not found", fields, "warning").catch(() => undefined);
    };
    const tryInstall = () => {
        retryId = undefined;
        if (cancelled || suppressionUnpatch)
            return;
        attempts += 1;
        const sectionClass = findSectionClass();
        if (!sectionClass?.prototype?.render) {
            warnFingerprintMiss();
            if (attempts < maxAttempts) {
                retryId = window.setTimeout(tryInstall, 500);
            }
            return;
        }
        suppressionUnpatch = safeAfterPatch(sectionClass.prototype, "render", function (_args, ret) {
            try {
                if (this?.props?.name !== "info")
                    return ret;
                const boundaries = [];
                findChildElements(ret, isInfoSectionBoundary, boundaries);
                for (const element of boundaries) {
                    if (!isNeverOnSteam(Number(element.props?.overview?.appid)))
                        continue;
                    const original = element.type;
                    let wrapper = quickLinksWrapperCache.get(original);
                    if (!wrapper) {
                        wrapper = (props) => {
                            const rendered = original(props);
                            try {
                                if (isNeverOnSteam(Number(props?.overview?.appid))) {
                                    const linkRows = [];
                                    findChildElements(rendered, isQuickLinksElement, linkRows);
                                    for (const row of linkRows)
                                        row.type = NullQuickLinks;
                                }
                            }
                            catch (_error) {
                                // Leave the native output untouched on shape changes.
                            }
                            return rendered;
                        };
                        wrapper.__dmQuickLinksWrapper = true;
                        quickLinksWrapperCache.set(original, wrapper);
                    }
                    element.type = wrapper;
                }
            }
            catch (_error) {
                // Steam's native render tree must remain usable if its shape changes.
            }
            return ret;
        }).unpatch;
    };
    unpatchers.push(() => {
        cancelled = true;
        clearRetry();
        suppressionUnpatch?.();
        suppressionUnpatch = undefined;
    });
    tryInstall();
};
const installRouterRenderPatches = (unpatchers, deps) => {
    const { ensureMetadataCache, applyMetadata, tryEnrichScreenshotsForApp, tryFetchMetadataForApp, refreshDeckyNativeActivityForApp, } = deps;
    GAME_DETAIL_ROUTES.forEach((route) => {
        const patch = routerHook.addPatch(route, (tree) => {
            const routeProps = DFL.findInReactTree(tree, (x) => x?.renderFunc);
            if (routeProps?.renderFunc) {
                const renderPatch = safeAfterPatch(routeProps, "renderFunc", (_args, ret) => {
                    const overview = ret?.props?.children?.props?.overview || overviewFromReactTree(ret);
                    const appId = Number(overview?.appid || appIdFromReactTree(ret) || currentGameDetailAppId());
                    const appOverview = overview || getOverview(appId);
                    if (appId && isNonSteamApp(appOverview)) {
                        const previousAppId = metadataState.lastObservedGameDetailAppId;
                        metadataState.lastObservedGameDetailAppId = appId;
                        if (metadataCache[String(appId)]) {
                            armRouteShield(appId, route, "route-render");
                            if (isBypassTraceEnabled()) {
                                void frontendLog("trace", "reentry shield armed", { appId, trigger: "route-render", path: route }).catch(() => undefined);
                            }
                        }
                        else {
                            if (isBypassTraceEnabled()) {
                                void frontendLog("trace", "reentry shield skip", { trigger: "route-render", path: route, appId, reason: "no-metadata-cache" }).catch(() => undefined);
                            }
                        }
                        void ensureMetadataCache().then(() => {
                            applyMetadata(appId);
                            void tryEnrichScreenshotsForApp(appId);
                            void tryFetchMetadataForApp(appId);
                        });
                        if (previousAppId !== appId) {
                            void refreshDeckyNativeActivityForApp(appId);
                        }
                        return ret;
                    }
                    return ret;
                });
                unpatchers.push(renderPatch.unpatch);
            }
            return tree;
        });
        unpatchers.push(() => routerHook.removePatch(route, patch));
    });
    GAME_ACTIVITY_ROUTES.forEach((route) => {
        const patch = routerHook.addPatch(route, (tree) => {
            const routeProps = DFL.findInReactTree(tree, (x) => x?.renderFunc);
            if (routeProps?.renderFunc) {
                const renderPatch = safeAfterPatch(routeProps, "renderFunc", (_args, ret) => {
                    const treeAppId = appIdFromReactTree(ret);
                    const appId = currentGameDetailAppId() || treeAppId;
                    const overview = overviewFromReactTree(ret) || getOverview(appId);
                    if (appId && isNonSteamApp(overview)) {
                        metadataState.lastObservedGameDetailAppId = appId;
                        void ensureMetadataCache().then(() => {
                            applyMetadata(appId);
                        });
                        void refreshDeckyNativeActivityForApp(appId);
                        return ret;
                    }
                    return ret;
                });
                unpatchers.push(renderPatch.unpatch);
            }
            return tree;
        });
        unpatchers.push(() => routerHook.removePatch(route, patch));
    });
};
const installGameDetailReentryShield = (unpatchers) => {
    const shieldUnpatchers = [];
    let cancelled = false;
    let retryId;
    let attempts = 0;
    const clearRetry = () => {
        if (retryId !== undefined) {
            window.clearTimeout(retryId);
            retryId = undefined;
        }
    };
    const mainWindowHistory = () => window?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ??
        globalThis?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
    const armShieldForPath = (path, trigger, history) => {
        try {
            const appId = gameDetailAppIdFromPath(path);
            const historySnapshot = history && Array.isArray(history.entries) ? {
                index: history.index,
                entriesLength: history.entries.length,
                destination: path
            } : undefined;
            if (appId <= 0) {
                if (isBypassTraceEnabled()) {
                    void frontendLog("trace", "reentry shield skip", { trigger, path, reason: "no-appid", historySnapshot }).catch(() => undefined);
                }
                return;
            }
            const overview = getOverview(appId);
            if (!isNonSteamApp(overview)) {
                if (isBypassTraceEnabled()) {
                    void frontendLog("trace", "reentry shield skip", { trigger, path, appId, reason: "not-nonsteam", historySnapshot }).catch(() => undefined);
                }
                return;
            }
            if (!metadataCache[String(appId)]) {
                if (isBypassTraceEnabled()) {
                    void frontendLog("trace", "reentry shield skip", { trigger, path, appId, reason: "no-metadata-cache", historySnapshot }).catch(() => undefined);
                }
                return;
            }
            armRouteShield(appId, path, trigger);
            if (isBypassTraceEnabled()) {
                void frontendLog("trace", "reentry shield armed", { appId, trigger, path, historySnapshot }).catch(() => undefined);
            }
        }
        catch (_error) {
            // Steam navigation must continue even if the shield probe fails.
        }
    };
    const destinationPath = (history, targetIndex) => {
        if (!Array.isArray(history?.entries) || !Number.isInteger(history?.index))
            return "";
        if (targetIndex < 0 || targetIndex >= history.entries.length)
            return "";
        const entry = history.entries[targetIndex];
        return String(entry?.pathname || entry?.location?.pathname || "");
    };
    const patchHistoryMethod = (history, methodName) => {
        const unpatch = patchMethod(history, methodName, (_thisValue, original, args) => {
            try {
                const index = Number(history?.index);
                const offset = methodName === "goBack" ? -1 : Number(args[0]);
                if (Number.isInteger(index) && Number.isFinite(offset)) {
                    armShieldForPath(destinationPath(history, index + offset), methodName, history);
                }
            }
            catch (_error) {
                // Fall through to native navigation.
            }
            return original(...args);
        });
        const patched = history?.[methodName];
        shieldUnpatchers.push(() => {
            try {
                if (history?.[methodName] === patched) {
                    unpatch();
                }
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
    };
    const listenToHistory = (history) => {
        try {
            const unlisten = history.listen((location) => {
                armShieldForPath(location?.pathname || "", "listen", history);
            });
            if (typeof unlisten === "function") {
                shieldUnpatchers.push(() => {
                    try {
                        unlisten();
                    }
                    catch (_error) {
                        // Best effort teardown.
                    }
                });
            }
        }
        catch (_error) {
            // Optional fallback only.
        }
    };
    const tryInstall = () => {
        if (cancelled)
            return;
        const history = mainWindowHistory();
        if (history &&
            (typeof history.goBack === "function" ||
                typeof history.go === "function" ||
                typeof history.listen === "function")) {
            clearRetry();
            if (typeof history.goBack === "function")
                patchHistoryMethod(history, "goBack");
            if (typeof history.go === "function")
                patchHistoryMethod(history, "go");
            if (typeof history.listen === "function")
                listenToHistory(history);
            return;
        }
        attempts += 1;
        if (attempts < 30) {
            retryId = window.setTimeout(tryInstall, 500);
        }
    };
    tryInstall();
    unpatchers.push(() => {
        cancelled = true;
        clearRetry();
        clearRouteShield();
        shieldUnpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (_error) {
                // Best effort teardown.
            }
        });
    });
};

const installSteamPatches = () => {
    configureActivityMetadataLoader(ensureMetadataCache);
    const unpatchers = [];
    let patchesCancelled = false;
    let installStarted = false;
    let attempts = 0;
    let retryId;
    const safeInstallStep = (label, run) => {
        try {
            run();
        }
        catch (error) {
            warn("patch", `install step failed: ${label}`, error);
        }
    };
    const install = () => {
        if (patchesCancelled || installStarted)
            return;
        installStarted = true;
        safeInstallStep("unmatchedAppLinksHider", () => installUnmatchedAppLinksHider(unpatchers));
        // Activity news use Steam's own AppActivityStore and native Activity renderer.
        safeInstallStep("nativeActivityStorePatch", () => installNativeActivityStorePatch(unpatchers));
        safeInstallStep("nativePartnerEventStorePatch", () => installNativePartnerEventStorePatch(unpatchers));
        installActivityRefreshedListener(unpatchers);
        safeInstallStep("steamNavigationRedirect", () => installSteamNavigationRedirect(unpatchers));
        safeInstallStep("mainWindowHistoryRedirect", () => installMainWindowHistoryRedirect(unpatchers));
        void getDebugLogging()
            .then((debugLoggingEnabled) => {
            if (patchesCancelled)
                return;
            setBypassTraceEnabled(debugLoggingEnabled);
            setContextMenuTraceEnabled(debugLoggingEnabled);
            if (!debugLoggingEnabled)
                return;
            safeInstallStep("navigationTrace", () => installNavigationTrace(unpatchers));
            safeInstallStep("historyInstanceTrace", () => installHistoryInstanceTrace(unpatchers));
            safeInstallStep("clickTrace", () => installClickTrace(unpatchers));
        })
            .catch((error) => {
            warn("patch", "debug logging setting load failed; diagnostic traces disabled", error);
        });
        installNativeNewsHistoryRedirects(unpatchers);
        installMetadataPatches(unpatchers);
        installCommunityFeedPatch(unpatchers);
        installRouterRenderPatches(unpatchers, {
            ensureMetadataCache,
            applyMetadata,
            tryEnrichScreenshotsForApp,
            tryFetchMetadataForApp,
            refreshDeckyNativeActivityForApp,
        });
        safeInstallStep("gameDetailReentryShield", () => installGameDetailReentryShield(unpatchers));
        safeInstallStep("neverOnSteamQuickLinksSuppression", () => installNeverOnSteamQuickLinksSuppression(unpatchers));
        void frontendLog("patch", "steam patches installed", {
            attempts,
            unpatcherCount: unpatchers.length,
        }, "info").catch(() => undefined);
    };
    const tick = () => {
        retryId = undefined;
        if (patchesCancelled)
            return;
        attempts += 1;
        if (steamPatchTargetsReady()) {
            try {
                install();
            }
            catch (error) {
                warn("patch", "installSteamPatches failed", error);
                void frontendLog("patch", "installSteamPatches failed", {
                    error: error instanceof Error ? error.stack || error.message : String(error),
                }, "error").catch(() => undefined);
            }
            return;
        }
        if (attempts >= 240) {
            void frontendLog("patch", "steam patches NOT installed", { attempts }, "warning").catch(() => undefined);
            return;
        }
        retryId = window.setTimeout(tick, 500);
    };
    if (steamPatchTargetsReady()) {
        install();
    }
    else {
        retryId = window.setTimeout(tick, 500);
    }
    return () => {
        patchesCancelled = true;
        if (retryId !== undefined) {
            window.clearTimeout(retryId);
            retryId = undefined;
        }
        setBypassTraceEnabled(false);
        setContextMenuTraceEnabled(false);
        unpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (error$1) {
                error("patch", "unpatch failed", error$1);
            }
        });
    };
};

// Shared semantic style tokens, aligned with beallio/SDH-Ludusavi.
const colors = {
    accent: "#1a9fff",
    success: "#4ade80",
    warning: "#f59e0b",
    error: "#f87171",
    textSecondary: "#cbd5e1"};
// Spacing scale - px (4-based), aligned with SDH-Ludusavi's px spacing.
const space = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12};
// Type scale - px, matching the reference (12 / 13 / 14 / 16 / 20).
const fontSize = {
    sm: 13,
    lg: 16,
    xl: 20,
};
const fontWeight = {
    bold: 700};
// Steam's UI face; Gaming Mode already uses it, set explicitly for parity/Desktop.
const fontFamily = '"Motiva Sans", Arial, sans-serif';
const statusColor = (kind) => ({
    active: colors.accent,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    idle: colors.textSecondary,
}[kind]);

const TITLE = "Decky Metadata";
const DURATION = 3000;
function notify(kind, heading, body) {
    const logo = kind === "success" ? (SP_JSX.jsx(FaCheckCircle, { color: colors.success })) : kind === "error" ? (SP_JSX.jsx(FaExclamationTriangle, { color: colors.error })) : (SP_JSX.jsx(FaExclamationTriangle, { color: colors.warning }));
    try {
        toaster.toast({ title: `${TITLE} · ${heading}`, body, duration: DURATION, logo });
    }
    catch {
        // The Decky toaster may be unavailable outside the runtime.
    }
}
const toastSuccess = (heading, body) => notify("success", heading, body);
const toastWarn = (heading, body) => notify("warning", heading, body);
const toastError = (heading, body) => notify("error", heading, body);

const FocusableButton = (props) => (SP_JSX.jsx(DFL.DialogButton, { focusable: true, ...props }));
const pageStyle = {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 120,
    minHeight: "100vh",
    boxSizing: "border-box",
    fontFamily,
};
const pageTitleStyle = {
    width: "100%",
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    paddingBottom: space.md,
    outline: "none",
    // Keep the title clear of the SteamOS top bar when the controller scrolls to it.
    scrollMarginTop: 90,
};
const toggleGridStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: space.md,
    width: "100%",
    minWidth: 0,
};
const qamPanelStyle = {
    width: "100%",
    fontFamily,
};
const rowStackStyle = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    gap: space.md,
};
const buttonRowStyle = {
    display: "flex",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    gap: space.sm,
    alignItems: "center",
    flexWrap: "wrap",
};
const spacedButtonRowStyle = {
    ...buttonRowStyle,
    marginTop: space.sm,
};
const actionButtonStackStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.sm,
    flex: "1 1 208px",
    minWidth: 0,
};
const fieldStyle = {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
};
const flexFieldStyle = {
    ...fieldStyle,
    flex: "1 1 224px",
};
const compactTextStyle = {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 1.35,
};
const inlineStatusBaseStyle = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    ...compactTextStyle,
};
const inlineStatusStyle = (kind) => ({
    ...inlineStatusBaseStyle,
    color: statusColor(kind),
});
const busySpinnerStyle = {
    width: "18px",
    height: "18px",
    color: colors.accent,
};
const buttonLabelStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    minWidth: 136,
};
const sectionHeadingStyle = {
    width: "100%",
    paddingTop: space.md,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.lg,
};
const diagnosticsGridStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: space.md,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
};
const diagnosticsRowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: space.xs,
    alignItems: "start",
    padding: `${space.xxs}px 0`,
    ...compactTextStyle,
};
const diagnosticsValueStyle = {
    minWidth: 0,
    overflowWrap: "anywhere",
    color: colors.textSecondary,
};
const BusySpinner = () => (SP_JSX.jsx(DFL.Spinner, { style: busySpinnerStyle }));
const ButtonLabel = ({ children, busy = false }) => (SP_JSX.jsxs("span", { style: buttonLabelStyle, children: [busy ? SP_JSX.jsx(BusySpinner, {}) : null, children] }));

const useNonSteamGames = () => {
    const [games, setGames] = SP_REACT.useState([]);
    const loadGames = SP_REACT.useCallback(async () => {
        const loadedGames = await allNonSteamGames();
        setGames(loadedGames);
        return loadedGames;
    }, []);
    SP_REACT.useEffect(() => {
        void loadGames();
    }, [loadGames]);
    return { games, loadGames };
};

// Version is fetched from the backend on mount; "" means not yet loaded.
const PLUGIN_VERSION = "";
const splitVersion = (version) => {
    const trimmed = String(version || "").trim();
    const separator = trimmed.indexOf("+");
    if (separator < 0) {
        return { base: trimmed, commit: null };
    }
    const base = trimmed.slice(0, separator).trim();
    const commit = trimmed.slice(separator + 1).trim();
    return { base, commit: commit || null };
};
const scanCompleteMessage = (progress) => {
    const total = Number(progress.total || 0);
    if (!total)
        return "Scan complete";
    const assigned = Number(progress.assigned || 0);
    const failed = Number(progress.failed || 0);
    return failed
        ? `Scan complete: ${assigned}/${total} saved, ${failed} not matched`
        : `Scan complete: ${assigned}/${total} saved`;
};
const scanCompleteStatusKind = (progress) => {
    const total = Number(progress.total || 0);
    const assigned = Number(progress.assigned || 0);
    const failed = Number(progress.failed || 0);
    return failed > 0 || (total > 0 && assigned < total) ? "warning" : "success";
};
const activityCompleteMessage = (progress) => {
    const total = Number(progress.total || 0);
    if (!total)
        return "Activity refresh complete";
    return `Activity refresh complete: ${Number(progress.assigned || 0)}/${total} updated`;
};
const epochToDate$1 = (value) => {
    if (!value)
        return "";
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime()))
        return "";
    return date.toISOString().slice(0, 10);
};
const Content = () => {
    const { games, loadGames } = useNonSteamGames();
    const [metadataCount, setMetadataCount] = SP_REACT.useState(0);
    const [missing, setMissing] = SP_REACT.useState(0);
    const [busy, setBusy] = SP_REACT.useState(false);
    const [scanMessage, setScanMessage] = SP_REACT.useState("");
    const [scanStatusKind, setScanStatusKind] = SP_REACT.useState("idle");
    const [activityBusy, setActivityBusy] = SP_REACT.useState(false);
    const [activityMessage, setActivityMessage] = SP_REACT.useState("");
    const [activityStatusKind, setActivityStatusKind] = SP_REACT.useState("idle");
    const [cacheBusy, setCacheBusy] = SP_REACT.useState(false);
    const [delistedStatus, setDelistedStatus] = SP_REACT.useState(null);
    const [delistedBusy, setDelistedBusy] = SP_REACT.useState(false);
    const [debugLogging, setDebugLoggingState] = SP_REACT.useState(false);
    const [pluginVersion, setPluginVersion] = SP_REACT.useState(PLUGIN_VERSION);
    const parsedPluginVersion = splitVersion(pluginVersion);
    const updateMissingCount = SP_REACT.useCallback((currentGames) => {
        void getMissingMetadataCount(currentGames)
            .then(setMissing)
            .catch((error) => warn("bridge", "missing metadata count load failed", error));
    }, []);
    const refresh = SP_REACT.useCallback(async () => {
        await refreshMetadataCache();
        const loadedGames = await loadGames();
        setMetadataCount(Object.keys(metadataCache).length);
        updateMissingCount(loadedGames);
    }, [loadGames, updateMissingCount]);
    SP_REACT.useEffect(() => {
        void refresh();
    }, [refresh]);
    const loadDelistedStatus = SP_REACT.useCallback(async () => {
        try {
            setDelistedStatus(await getDelistedIndexStatus());
        }
        catch (error) {
            warn("bridge", "delisted index status load failed", error);
        }
    }, []);
    SP_REACT.useEffect(() => {
        void loadDelistedStatus();
    }, [loadDelistedStatus]);
    SP_REACT.useEffect(() => {
        let cancelled = false;
        void getPluginVersion()
            .then((version) => {
            if (!cancelled && version) {
                setPluginVersion(version);
            }
        })
            .catch((error) => warn("bridge", "plugin version load failed", error));
        return () => {
            cancelled = true;
        };
    }, []);
    SP_REACT.useEffect(() => {
        let cancelled = false;
        void getDebugLogging()
            .then((enabled) => {
            if (!cancelled) {
                setDebugLoggingState(enabled);
                setVerboseLogging(enabled);
            }
        })
            .catch((error) => warn("bridge", "debug logging setting load failed", error));
        return () => {
            cancelled = true;
        };
    }, []);
    const saveDebugLogging = async (enabled) => {
        setDebugLoggingState(enabled);
        setVerboseLogging(enabled);
        try {
            const saved = await setDebugLogging(enabled);
            setDebugLoggingState(saved);
            setVerboseLogging(saved);
            info("bridge", "debug logging setting updated", saved);
        }
        catch (error) {
            warn("bridge", "debug logging setting update failed", error);
        }
    };
    const scanMissing = async () => {
        if (busy)
            return;
        setBusy(true);
        setScanMessage("");
        setScanStatusKind("active");
        try {
            await startScanMissing(games);
            const interval = window.setInterval(async () => {
                const progress = await getScanProgress();
                setScanStatusKind("active");
                setScanMessage(progress.current ||
                    progress.message ||
                    `${progress.completed}/${progress.total}`);
                if (!progress.running) {
                    window.clearInterval(interval);
                    await refresh();
                    setBusy(false);
                    setScanStatusKind(scanCompleteStatusKind(progress));
                    setScanMessage(scanCompleteMessage(progress));
                    toastSuccess("Scan", "Scan complete");
                }
            }, 800);
        }
        catch (error) {
            setBusy(false);
            setScanStatusKind("error");
            setScanMessage(String(error));
            toastError("Scan failed", String(error));
        }
    };
    const refreshActivities = async () => {
        if (activityBusy)
            return;
        setActivityBusy(true);
        setActivityStatusKind("active");
        setActivityMessage("Refreshing Activity...");
        try {
            await startRefreshSteamActivities(games);
            const interval = window.setInterval(async () => {
                const progress = await getActivityRefreshProgress();
                setActivityStatusKind("active");
                setActivityMessage(progress.current ||
                    progress.message ||
                    `${progress.completed}/${progress.total}`);
                if (!progress.running) {
                    window.clearInterval(interval);
                    await refreshMetadataCache();
                    setMetadataCount(Object.keys(metadataCache).length);
                    updateMissingCount(games);
                    setActivityBusy(false);
                    setActivityStatusKind("success");
                    setActivityMessage(activityCompleteMessage(progress));
                    window.dispatchEvent(new Event("decky-metadata:activity-refreshed"));
                    window.dispatchEvent(new Event("decky-metadata:updated"));
                    toastSuccess("Activity", activityCompleteMessage(progress));
                }
            }, 800);
        }
        catch (error) {
            setActivityBusy(false);
            setActivityStatusKind("error");
            setActivityMessage(String(error));
            toastError("Activity failed", String(error));
        }
    };
    const clearCache = async () => {
        if (cacheBusy || busy)
            return;
        setCacheBusy(true);
        try {
            await clearMetadataCache();
            await refreshMetadataCache();
            if (games.length) {
                void startScanMissing(games).catch((error) => {
                    warn("bridge", "metadata scan start after clear cache failed", error);
                });
            }
            setMetadataCount(Object.keys(metadataCache).length);
            updateMissingCount(games);
            toastSuccess("Cache", "Metadata cache cleared");
        }
        catch (error) {
            toastError("Cache clear failed", String(error));
        }
        finally {
            setCacheBusy(false);
        }
    };
    const refreshDelisted = async () => {
        if (delistedBusy)
            return;
        setDelistedBusy(true);
        try {
            const result = await refreshDelistedIndex();
            if (!result.ok) {
                throw new Error("Delisted index refresh failed");
            }
            toastSuccess("Delisted index", "Delisted index updated");
            await loadDelistedStatus();
        }
        catch (error) {
            warn("bridge", "delisted index refresh failed", error);
            toastError("Delisted index", "Delisted index refresh failed");
        }
        finally {
            setDelistedBusy(false);
        }
    };
    const delistedStatusText = delistedStatus?.count && delistedStatus.fetched_at
        ? `${delistedStatus.count} delisted apps · updated ${epochToDate$1(delistedStatus.fetched_at)}`
        : "Delisted index not downloaded yet";
    return (SP_JSX.jsxs("div", { style: qamPanelStyle, children: [SP_JSX.jsx(DFL.PanelSection, { children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: true, childrenLayout: "below", padding: "standard", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Detected non-Steam games", ":"] }), " ", games.length] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Metadata saved", ":"] }), " ", metadataCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Missing metadata", ":"] }), " ", missing] })] }) }) }) }), SP_JSX.jsxs(DFL.PanelSection, { children: [SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx("div", { style: compactTextStyle, children: "Refresh Activity re-fetches the Steam Activity feed for games that already have metadata. It does not find new matches or update store details — use Scan metadata for that." }), SP_JSX.jsxs("div", { style: spacedButtonRowStyle, children: [SP_JSX.jsxs("div", { style: actionButtonStackStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || !games.length, onClick: scanMissing, children: busy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Scanning..." })) : (SP_JSX.jsx(ButtonLabel, { children: "Scan metadata" })) }), busy || scanMessage ? (SP_JSX.jsx("div", { style: inlineStatusStyle(scanStatusKind), children: scanMessage || "Scanning..." })) : null] }), SP_JSX.jsxs("div", { style: actionButtonStackStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: activityBusy || busy || !games.length, onClick: refreshActivities, children: activityBusy ? "Refreshing Activity..." : "Refresh Activity" }), activityBusy || activityMessage ? (SP_JSX.jsx("div", { style: inlineStatusStyle(activityStatusKind), children: activityMessage || "Refreshing Activity..." })) : null] })] })] }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: "Metadata cache" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: "Clear cached Steam matches and metadata so games re-fetch and re-match." }), SP_JSX.jsx("div", { style: inlineStatusStyle("idle"), children: SP_JSX.jsx("span", { children: delistedStatusText }) }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: delistedBusy, onClick: refreshDelisted, children: delistedBusy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Refreshing..." })) : (SP_JSX.jsx(ButtonLabel, { children: "Refresh delisted index" })) }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: cacheBusy || busy, onClick: clearCache, children: "Clear cache" })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: "Diagnostics" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { highlightOnFocus: false, label: "Debug Logging", checked: debugLogging, onChange: (checked) => void saveDebugLogging(checked) }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: "Versions", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: true, childrenLayout: "below", padding: "standard", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: diagnosticsGridStyle, children: [SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: "Plugin" }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: parsedPluginVersion.base })] }), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: "Commit" }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: parsedPluginVersion.commit || "local" })] }), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: "Delisted index" }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: delistedStatusText })] }), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: "Metadata" }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: metadataCount })] })] }) }) }) })] }));
};

var StoreCategory;
(function (StoreCategory) {
    StoreCategory[StoreCategory["MultiPlayer"] = 1] = "MultiPlayer";
    StoreCategory[StoreCategory["SinglePlayer"] = 2] = "SinglePlayer";
    StoreCategory[StoreCategory["CoOp"] = 9] = "CoOp";
    StoreCategory[StoreCategory["MMO"] = 20] = "MMO";
    StoreCategory[StoreCategory["Achievements"] = 22] = "Achievements";
    StoreCategory[StoreCategory["SplitScreen"] = 24] = "SplitScreen";
    StoreCategory[StoreCategory["FullController"] = 28] = "FullController";
    StoreCategory[StoreCategory["OnlineMultiPlayer"] = 36] = "OnlineMultiPlayer";
    StoreCategory[StoreCategory["LocalMultiPlayer"] = 37] = "LocalMultiPlayer";
    StoreCategory[StoreCategory["OnlineCoOp"] = 38] = "OnlineCoOp";
    StoreCategory[StoreCategory["LocalCoOp"] = 392] = "LocalCoOp";
})(StoreCategory || (StoreCategory = {}));
const CATEGORY_LABELS = {
    [StoreCategory.SinglePlayer]: "Single-player",
    [StoreCategory.MultiPlayer]: "Multiplayer",
    [StoreCategory.CoOp]: "Co-op",
    [StoreCategory.OnlineMultiPlayer]: "Online multiplayer",
    [StoreCategory.OnlineCoOp]: "Online co-op",
    [StoreCategory.LocalMultiPlayer]: "Local multiplayer",
    [StoreCategory.LocalCoOp]: "Local co-op",
    [StoreCategory.SplitScreen]: "Split screen",
    [StoreCategory.FullController]: "Full controller support",
    [StoreCategory.MMO]: "MMO",
    [StoreCategory.Achievements]: "Achievements",
};

const parseSteamAppId = (input) => {
    const s = String(input || "").trim();
    if (!s)
        return 0;
    const match = (/^\d+$/.test(s) ? [s, s] : null) ||
        s.match(/(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i) ||
        s.match(/[?&]appid=(\d+)/i) ||
        s.match(/\bapp\/(\d+)\b/i);
    const parsed = Number(match?.[1] || 0);
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
        ? parsed
        : 0;
};
const metadataTemplate = (title) => ({
    title,
    id: title,
    source: "Manual",
    source_url: "",
    description: "",
    short_description: "",
    developers: [],
    publishers: [],
    release_date: null,
    rating: null,
    store_categories: [StoreCategory.SinglePlayer],
    genres: [],
    features: [],
    screenshots: [],
});
const personsToText = (people) => (people || []).map((person) => person.name).join(", ");
const textToPersons = (value) => value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, url: "" }));
const epochToDate = (value) => {
    if (!value)
        return "";
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime()))
        return "";
    return date.toISOString().slice(0, 10);
};
const dateToEpoch = (value) => {
    if (!value.trim())
        return null;
    const timestamp = Date.parse(`${value.trim()}T00:00:00Z`);
    if (Number.isNaN(timestamp))
        return null;
    return Math.floor(timestamp / 1000);
};
const parseRating = (value) => {
    if (!value.trim())
        return null;
    const number = Number(value);
    if (!Number.isFinite(number))
        return null;
    return Math.max(0, Math.min(100, Math.round(number)));
};

const MetadataPage = () => {
    const { appid } = DFL.useParams();
    const appId = Number(appid);
    const overview = getOverview(appId);
    const nonSteam = isNonSteamApp(overview);
    const [metadata, setMetadata] = SP_REACT.useState(metadataTemplate(appName(appId)));
    const [developerText, setDeveloperText] = SP_REACT.useState("");
    const [publisherText, setPublisherText] = SP_REACT.useState("");
    const [releaseText, setReleaseText] = SP_REACT.useState("");
    const [ratingText, setRatingText] = SP_REACT.useState("");
    const [query, setQuery] = SP_REACT.useState(appName(appId));
    const [results, setResults] = SP_REACT.useState([]);
    const [busy, setBusy] = SP_REACT.useState(false);
    const [steamAppIdText, setSteamAppIdText] = SP_REACT.useState("");
    const setFormMetadata = SP_REACT.useCallback((next) => {
        setMetadata(next);
        setDeveloperText(personsToText(next.developers));
        setPublisherText(personsToText(next.publishers));
        setReleaseText(epochToDate(next.release_date));
        setRatingText(next.rating == null ? "" : String(next.rating));
    }, []);
    const load = SP_REACT.useCallback(async () => {
        const saved = await getMetadata(appId);
        setFormMetadata(saved || metadataTemplate(appName(appId)));
        setSteamAppIdText(saved?.steam_appid ? String(saved.steam_appid) : "");
    }, [appId, setFormMetadata]);
    SP_REACT.useEffect(() => {
        void load();
    }, [load]);
    const normalizedMetadata = SP_REACT.useMemo(() => ({
        ...metadata,
        title: cleanTitle(metadata.title),
        developers: textToPersons(developerText),
        publishers: textToPersons(publisherText),
        release_date: dateToEpoch(releaseText),
        rating: parseRating(ratingText),
        store_categories: metadata.store_categories || [],
    }), [developerText, metadata, publisherText, ratingText, releaseText]);
    const saveCurrent = async () => {
        if (!nonSteam) {
            toastWarn("Not applicable", "This plugin only changes non-Steam games.");
            return;
        }
        if (busy)
            return;
        setBusy(true);
        try {
            const saved = await saveMetadata(appId, normalizedMetadata);
            metadataCache[String(appId)] = saved;
            applyMetadata(appId);
            toastSuccess("Saved", "Metadata saved");
        }
        catch (error) {
            toastError("Save failed", String(error));
        }
        finally {
            setBusy(false);
        }
    };
    const applySteamAppId = async () => {
        if (!nonSteam) {
            toastWarn("Not applicable", "This plugin only changes non-Steam games.");
            return;
        }
        setBusy(true);
        try {
            const parsed = parseSteamAppId(steamAppIdText);
            const next = {
                ...normalizedMetadata,
                steam_appid: parsed || null,
                steam_store_url: parsed
                    ? `https://store.steampowered.com/app/${parsed}/`
                    : "",
            };
            const saved = await saveMetadata(appId, next);
            metadataCache[String(appId)] = saved;
            setFormMetadata(saved);
            const enriched = await enrichSteamApp(appId);
            if (enriched) {
                metadataCache[String(appId)] = enriched;
                setFormMetadata(enriched);
                setSteamAppIdText(enriched.steam_appid ? String(enriched.steam_appid) : "");
            }
            else {
                setSteamAppIdText(saved.steam_appid ? String(saved.steam_appid) : "");
            }
            applyMetadata(appId);
            toastSuccess("Saved", "Metadata saved");
        }
        catch (error) {
            toastError("Save failed", String(error));
        }
        finally {
            setBusy(false);
        }
    };
    const search = async () => {
        setBusy(true);
        try {
            setResults(await searchMetadata(query, 8));
        }
        catch (error) {
            toastError("Save failed", String(error));
        }
        finally {
            setBusy(false);
        }
    };
    const applyResult = async (result) => {
        setBusy(true);
        try {
            const saved = await applyFetchedMetadata(appId, result.slug || result.url);
            if (!saved)
                return;
            metadataCache[String(appId)] = saved;
            applyMetadata(appId);
            setFormMetadata(saved);
            setSteamAppIdText(saved.steam_appid ? String(saved.steam_appid) : "");
            toastSuccess("Saved", "Metadata saved");
        }
        catch (error) {
            toastError("Fetch failed", String(error));
        }
        finally {
            setBusy(false);
        }
    };
    const removeCurrent = async () => {
        if (busy)
            return;
        setBusy(true);
        try {
            await removeMetadata(appId);
            delete metadataCache[String(appId)];
            setFormMetadata(metadataTemplate(appName(appId)));
            toastSuccess("Removed", "Metadata removed");
        }
        catch (error) {
            toastError("Remove failed", String(error));
        }
        finally {
            setBusy(false);
        }
    };
    const toggleCategory = (category, checked) => {
        setMetadata((prev) => {
            const next = new Set(prev.store_categories || []);
            if (checked)
                next.add(category);
            else
                next.delete(category);
            return { ...prev, store_categories: Array.from(next) };
        });
    };
    return (SP_JSX.jsx(DFL.ScrollPanel, { children: SP_JSX.jsxs("div", { style: pageStyle, children: [SP_JSX.jsx(DFL.Focusable, { onActivate: () => { }, style: pageTitleStyle, children: `${"Decky Metadata"} - ${appName(appId)}` }), SP_JSX.jsxs(DFL.PanelSection, { children: [!nonSteam ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: "This plugin only changes non-Steam games." }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveCurrent, children: "Save" }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: removeCurrent, children: "Remove metadata" }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => DFL.Navigation.NavigateBack(), children: "Done" })] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: "Search IGN metadata", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: query, onChange: (e) => setQuery(e.target.value), style: { ...fieldStyle, flex: "1 1 auto", minWidth: 220 } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy, onClick: search, children: busy ? "Searching..." : "Search" })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [busy ? (SP_JSX.jsx("div", { style: compactTextStyle, children: "Searching..." })) : null, !busy && !results.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: "No results yet." })) : null, results.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void applyResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsx("span", { style: compactTextStyle, children: result.description })] }) }, result.slug || result.url)))] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: "Source", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Title", childrenLayout: "below", children: SP_JSX.jsx(DFL.TextField, { value: metadata.title, onChange: (e) => setMetadata((prev) => ({ ...prev, title: e.target.value })), style: fieldStyle }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: "Description" }), SP_JSX.jsx(DFL.Focusable, { style: { width: "100%" }, children: SP_JSX.jsx("textarea", { value: metadata.description, onChange: (e) => setMetadata((prev) => ({
                                                ...prev,
                                                description: e.target.value,
                                                short_description: e.target.value,
                                            })), style: {
                                                width: "100%",
                                                minHeight: 144,
                                                boxSizing: "border-box",
                                                resize: "vertical",
                                                borderRadius: 4,
                                                padding: 10,
                                                color: "white",
                                                background: "rgba(0,0,0,0.28)",
                                                border: "1px solid rgba(255,255,255,0.18)",
                                            } }) })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Developers", childrenLayout: "below", children: SP_JSX.jsx(DFL.TextField, { value: developerText, onChange: (e) => setDeveloperText(e.target.value), style: fieldStyle }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Publishers", childrenLayout: "below", children: SP_JSX.jsx(DFL.TextField, { value: publisherText, onChange: (e) => setPublisherText(e.target.value), style: fieldStyle }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsxs("div", { style: { ...flexFieldStyle, minWidth: 128 }, children: [SP_JSX.jsx("label", { children: "Release date" }), SP_JSX.jsx(DFL.TextField, { value: releaseText, onChange: (e) => setReleaseText(e.target.value), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: { ...flexFieldStyle, minWidth: 112 }, children: [SP_JSX.jsx("label", { children: "Rating" }), SP_JSX.jsx(DFL.TextField, { value: ratingText, onChange: (e) => setRatingText(e.target.value), style: fieldStyle })] })] }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: "Steam info fields", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: toggleGridStyle, children: Object.entries(CATEGORY_LABELS).map(([category, label]) => (SP_JSX.jsx(DFL.ToggleField, { highlightOnFocus: false, bottomSeparator: "none", label: label, checked: (metadata.store_categories || []).includes(Number(category)), onChange: (checked) => toggleCategory(Number(category), checked) }, category))) }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Steam App ID", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: "Paste a Steam app ID, Store URL, Community URL, or SteamDB URL. Leave empty to clear the pinned Steam match." }), SP_JSX.jsxs("div", { style: { ...buttonRowStyle, flexWrap: "nowrap" }, children: [SP_JSX.jsx(DFL.TextField, { value: steamAppIdText, onChange: (e) => setSteamAppIdText(e.target.value), style: { ...fieldStyle, flex: "1 1 auto", minWidth: 120 } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy, onClick: applySteamAppId, children: "Apply Steam App ID" })] })] }) }) })] }) }));
};

const METADATA_ROUTE = "/decky-metadata/:appid";
var index = DFL.definePlugin(() => {
    void getDebugLogging()
        .then((enabled) => setVerboseLogging(enabled))
        .catch((error) => warn("bridge", "debug logging setting load failed", error));
    void refreshMetadataCache();
    let unpatchSteam;
    try {
        unpatchSteam = installSteamPatches();
    }
    catch (error) {
        warn("bridge", "installSteamPatches failed", error);
        void frontendLog("patch", "installSteamPatches failed", {
            error: error instanceof Error ? error.stack || error.message : String(error),
        }, "error").catch(() => undefined);
    }
    const stopMetadataBootstrap = startMetadataBootstrap();
    const menuPatch = contextMenuPatch(LibraryContextMenu);
    routerHook.addRoute(METADATA_ROUTE, () => SP_JSX.jsx(MetadataPage, {}), { exact: true });
    return {
        name: "Decky Metadata",
        titleView: SP_JSX.jsx("div", { className: DFL.staticClasses.Title, children: "Decky Metadata" }),
        content: SP_JSX.jsx(Content, {}),
        icon: SP_JSX.jsx(FaDatabase, {}),
        onDismount() {
            try {
                menuPatch?.unpatch?.();
            }
            catch (error$1) {
                error("patch", "context menu unpatch failed", error$1);
            }
            try {
                stopMetadataBootstrap?.();
            }
            catch (error$1) {
                error("patch", "metadata bootstrap stop failed", error$1);
            }
            try {
                unpatchSteam?.();
            }
            catch (error$1) {
                error("patch", "Steam unpatch failed", error$1);
            }
            try {
                routerHook.removeRoute(METADATA_ROUTE);
            }
            catch (error$1) {
                error("patch", "route remove failed", error$1);
            }
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
