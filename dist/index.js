const manifest = {"name":"Playhub Metadata"};
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
function FaDatabase (props) {
  return GenIcon({"attr":{"viewBox":"0 0 448 512"},"child":[{"tag":"path","attr":{"d":"M448 73.143v45.714C448 159.143 347.667 192 224 192S0 159.143 0 118.857V73.143C0 32.857 100.333 0 224 0s224 32.857 224 73.143zM448 176v102.857C448 319.143 347.667 352 224 352S0 319.143 0 278.857V176c48.125 33.143 136.208 48.572 224 48.572S399.874 209.143 448 176zm0 160v102.857C448 479.143 347.667 512 224 512S0 479.143 0 438.857V336c48.125 33.143 136.208 48.572 224 48.572S399.874 369.143 448 336z"},"child":[]}]})(props);
}

const getAllMetadata = callable("get_all_metadata");
const getMetadata = callable("get_metadata");
const saveMetadata = callable("save_metadata");
const removeMetadata = callable("remove_metadata");
const searchMetadata = callable("search_metadata");
const fetchMetadata = callable("fetch_metadata");
const autoFetchMetadata = callable("auto_fetch_metadata");
const enrichCommunityMedia = callable("enrich_community_media");
const startScanMissing = callable("start_scan_missing");
const getScanProgress = callable("get_scan_progress");
const getLocalShortcuts = callable("get_local_shortcuts");
const getAchievementSettings = callable("get_achievement_settings");
const getXboxSettings = callable("get_xbox_settings");
const setXboxSettings = callable("set_xbox_settings");
const loginTrueAchievements = callable("login_trueachievements");
const testOpenXblCredentials = callable("test_openxbl_credentials");
const clearXboxAssociations = callable("clear_xbox_associations");
const setXboxTitleId = callable("set_xbox_title_id");
const setAchievementSource = callable("set_achievement_source");
const setAchievementCachePolicy = callable("set_achievement_cache_policy");
const resolveXboxFromShortcut = callable("resolve_xbox_from_shortcut");
const searchXboxTitles = callable("search_xbox_titles");
const getRetroAchievementsSettings = callable("get_retroachievements_settings");
const setRetroAchievementsSettings = callable("set_retroachievements_settings");
const testRetroAchievementsCredentials = callable("test_retroachievements_credentials");
const setRetroAchievementsGameId = callable("set_retroachievements_game_id");
const fetchAchievements = callable("fetch_achievements");
const syncTrueAchievementsProgress = callable("sync_trueachievements_progress");
const resolveRetroAchievementsFromPath = callable("resolve_retroachievements_from_path");
const searchRetroAchievementsGames = callable("search_retroachievements_games");

var backend = /*#__PURE__*/Object.freeze({
    __proto__: null,
    autoFetchMetadata: autoFetchMetadata,
    clearXboxAssociations: clearXboxAssociations,
    enrichCommunityMedia: enrichCommunityMedia,
    fetchAchievements: fetchAchievements,
    fetchMetadata: fetchMetadata,
    getAchievementSettings: getAchievementSettings,
    getAllMetadata: getAllMetadata,
    getLocalShortcuts: getLocalShortcuts,
    getMetadata: getMetadata,
    getRetroAchievementsSettings: getRetroAchievementsSettings,
    getScanProgress: getScanProgress,
    getXboxSettings: getXboxSettings,
    loginTrueAchievements: loginTrueAchievements,
    removeMetadata: removeMetadata,
    resolveRetroAchievementsFromPath: resolveRetroAchievementsFromPath,
    resolveXboxFromShortcut: resolveXboxFromShortcut,
    saveMetadata: saveMetadata,
    searchMetadata: searchMetadata,
    searchRetroAchievementsGames: searchRetroAchievementsGames,
    searchXboxTitles: searchXboxTitles,
    setAchievementCachePolicy: setAchievementCachePolicy,
    setAchievementSource: setAchievementSource,
    setRetroAchievementsGameId: setRetroAchievementsGameId,
    setRetroAchievementsSettings: setRetroAchievementsSettings,
    setXboxSettings: setXboxSettings,
    setXboxTitleId: setXboxTitleId,
    startScanMissing: startScanMissing,
    syncTrueAchievementsProgress: syncTrueAchievementsProgress,
    testOpenXblCredentials: testOpenXblCredentials,
    testRetroAchievementsCredentials: testRetroAchievementsCredentials
});

const STRINGS = {
    en: {
        pluginName: "Playhub Metadata",
        scanMissing: "Scan missing metadata",
        scanning: "Scanning...",
        detected: "Detected non-Steam games",
        saved: "Metadata saved",
        missing: "Missing metadata",
        openSelected: "Open selected game",
        editMetadata: "Playhub metadata...",
        searchTitle: "Search IGN metadata",
        search: "Search",
        searching: "Searching...",
        apply: "Apply",
        save: "Save",
        remove: "Remove metadata",
        done: "Done",
        title: "Title",
        description: "Description",
        developers: "Developers",
        publishers: "Publishers",
        releaseDate: "Release date",
        rating: "Rating",
        categories: "Steam info fields",
        community: "Community",
        communitySource: "Playhub Metadata",
        retroTitle: "Achievements",
        retroEnabled: "Enable achievements",
        retroUser: "RetroAchievements username",
        retroKey: "RetroAchievements API key",
        retroLogin: "Login",
        retroCreateAccount: "Open RetroAchievements",
        retroLoginHint: "Use your RetroAchievements web API key. You can find it in your RetroAchievements control panel.",
        retroLoginOk: "RetroAchievements login OK",
        retroLoginFailed: "RetroAchievements login failed",
        retroGameId: "RetroAchievements game ID",
        retroGameTest: "Test achievements",
        retroGameDetect: "Auto-detect achievements",
        retroGameSearch: "Search RetroAchievements",
        retroGameUse: "Use this game",
        retroGameSearchHint: "If auto-detect misses the game, search by title and pick the closest RetroAchievements entry.",
        retroGameNoMatches: "No RetroAchievements results yet.",
        retroGameOk: "Achievements loaded",
        retroGameFailed: "No achievements loaded. Check the RetroAchievements game ID.",
        retroDetectFailed: "No RetroAchievements match found from this game's shortcut path.",
        retroHint: "Paste the numeric RetroAchievements game ID from the game page URL. Leave empty to hide achievements for this game.",
        xboxTitle: "Xbox achievements / OpenXBL",
        xboxEnabled: "Enable Xbox achievements",
        xboxKey: "OpenXBL API key",
        xboxLogin: "Login",
        xboxOpenOpenXbl: "Open OpenXBL",
        xboxLoginHint: "",
        xboxProfile: "OpenXBL API key",
        xboxLoggedIn: "OpenXBL account connected",
        xboxLoginNeedsPassword: "Enter your OpenXBL API key, then press Login.",
        xboxLoginNeedsProfile: "Enter your OpenXBL API key, then press Login.",
        xboxClearAll: "Clear Xbox associations",
        xboxClearAllDone: "Xbox associations cleared",
        xboxSyncProgress: "Sync progress",
        xboxSyncAllProgress: "Sync progress",
        xboxSyncProgressOk: "OpenXBL progress synced",
        xboxSyncProgressFailed: "No OpenXBL progress found. Check the API key and Xbox match.",
        xboxLoginOk: "OpenXBL verified",
        xboxLoginFailed: "OpenXBL not verified",
        xboxBulkScan: "Scan Xbox achievements",
        xboxBulkScanning: "Scanning Xbox achievements",
        xboxBulkSearching: "searching OpenXBL match",
        xboxBulkApplying: "loading achievement list",
        xboxBulkAppliedOne: "achievements applied",
        xboxBulkSkippedOne: "skipped",
        xboxBulkDone: "Xbox scan complete",
        xboxBulkApplied: "applied",
        xboxBulkSkipped: "skipped",
        xboxBulkNothing: "No games without Xbox achievements to scan.",
        xboxSyncingProgress: "syncing progress",
        xboxConnectedAs: "Connected as",
        achievementCacheTitle: "Achievement cache",
        achievementCacheHint: "Choose when Playhub refreshes Xbox and RetroAchievements data.",
        achievementCache_hourly: "Hourly",
        achievementCache_daily: "Daily",
        achievementCache_weekly: "Weekly",
        achievementCache_pc_session: "PC session",
        achievementCache_manual: "Manually",
        achievementSourceTitle: "Achievement source",
        achievementSourceHint: "Auto keeps RetroAchievements for ROM/emulator shortcuts and uses OpenXBL only for likely Xbox/UWPHook shortcuts.",
        achievementSource_auto: "Auto",
        achievementSource_retroachievements: "RetroAchievements",
        achievementSource_xbox: "Xbox",
        achievementSource_disabled: "Disabled",
        xboxPerGameTitle: "Xbox achievements",
        xboxHint: "Playhub matches Xbox title IDs through OpenXBL. Use the selector if the automatic match is wrong.",
        xboxCurrentMatch: "Current Xbox title ID",
        xboxGameDetect: "Auto-detect with OpenXBL",
        xboxGameTest: "Test Xbox achievements",
        xboxClearMatch: "Clear Xbox match",
        xboxGameSearch: "Search Xbox titles",
        xboxGameSearchHint: "Search OpenXBL account history and Microsoft Store for the correct Xbox title.",
        xboxGameNoMatches: "No Xbox results yet.",
        xboxGameOk: "Xbox achievements loaded",
        xboxGameFailed: "No Xbox achievements loaded. Try scanning again or paste the Xbox title ID manually.",
        xboxDetectFailed: "No Xbox match found from this UWPHook shortcut.",
        none: "None",
        noResults: "No results yet.",
        source: "Source",
        fetchCurrent: "Fetch from IGN",
        removeToast: "Metadata removed",
        scanComplete: "Scan complete",
        notNonSteam: "This plugin only changes non-Steam games.",
    },
    it: {
        pluginName: "Playhub Metadata",
        scanMissing: "Scansiona metadata mancanti",
        scanning: "Scansione...",
        detected: "Giochi non Steam rilevati",
        saved: "Metadata salvati",
        missing: "Metadata mancanti",
        openSelected: "Apri gioco selezionato",
        editMetadata: "Playhub metadata...",
        searchTitle: "Cerca metadata IGN",
        search: "Cerca",
        searching: "Ricerca...",
        apply: "Applica",
        save: "Salva",
        remove: "Rimuovi metadata",
        done: "Fine",
        title: "Titolo",
        description: "Descrizione",
        developers: "Sviluppatori",
        publishers: "Publisher",
        releaseDate: "Data di uscita",
        rating: "Valutazione",
        categories: "Campi informazioni Steam",
        community: "Comunità",
        communitySource: "Playhub Metadata",
        retroTitle: "Obiettivi",
        retroEnabled: "Abilita obiettivi",
        retroUser: "Username RetroAchievements",
        retroKey: "API key RetroAchievements",
        retroLogin: "Login",
        retroCreateAccount: "Apri RetroAchievements",
        retroLoginHint: "Usa la tua web API key di RetroAchievements. La trovi nel pannello di controllo di RetroAchievements.",
        retroLoginOk: "Login RetroAchievements riuscito",
        retroLoginFailed: "Login RetroAchievements non riuscito",
        retroGameId: "ID gioco RetroAchievements",
        retroGameTest: "Testa obiettivi",
        retroGameDetect: "Rileva automaticamente",
        retroGameSearch: "Cerca su RetroAchievements",
        retroGameUse: "Usa questo gioco",
        retroGameSearchHint: "Se il rilevamento automatico sbaglia, cerca per titolo e scegli la voce RetroAchievements più vicina.",
        retroGameNoMatches: "Nessun risultato RetroAchievements per ora.",
        retroGameOk: "Obiettivi caricati",
        retroGameFailed: "Nessun obiettivo caricato. Controlla l'ID gioco RetroAchievements.",
        retroDetectFailed: "Nessun match RetroAchievements trovato dal percorso del collegamento.",
        retroHint: "Incolla l'ID numerico RetroAchievements dall'URL della pagina del gioco. Lascialo vuoto per nascondere gli obiettivi di questo gioco.",
        xboxTitle: "Obiettivi Xbox / OpenXBL",
        xboxEnabled: "Abilita obiettivi Xbox",
        xboxKey: "Chiave API OpenXBL",
        xboxLogin: "Login",
        xboxOpenOpenXbl: "Apri OpenXBL",
        xboxLoginHint: "",
        xboxProfile: "Chiave API OpenXBL",
        xboxLoggedIn: "Account OpenXBL collegato",
        xboxLoginNeedsPassword: "Inserisci la chiave API OpenXBL, poi premi Login.",
        xboxLoginNeedsProfile: "Inserisci la chiave API OpenXBL, poi premi Login.",
        xboxClearAll: "Cancella associazioni Xbox",
        xboxClearAllDone: "Associazioni Xbox cancellate",
        xboxSyncProgress: "Sincronizza progressi",
        xboxSyncAllProgress: "Sincronizza progressi",
        xboxSyncProgressOk: "Progressi OpenXBL sincronizzati",
        xboxSyncProgressFailed: "Nessun progresso OpenXBL trovato. Controlla chiave API e match Xbox.",
        xboxLoginOk: "OpenXBL verificato",
        xboxLoginFailed: "OpenXBL non verificato",
        xboxBulkScan: "Scansiona obiettivi Xbox",
        xboxBulkScanning: "Scansione obiettivi Xbox",
        xboxBulkSearching: "ricerca match OpenXBL",
        xboxBulkApplying: "caricamento lista obiettivi",
        xboxBulkAppliedOne: "obiettivi applicati",
        xboxBulkSkippedOne: "saltato",
        xboxBulkDone: "Scansione Xbox completata",
        xboxBulkApplied: "applicati",
        xboxBulkSkipped: "saltati",
        xboxBulkNothing: "Nessun gioco senza obiettivi Xbox da scansionare.",
        xboxSyncingProgress: "sincronizzazione progressi",
        xboxConnectedAs: "Connesso come",
        achievementCacheTitle: "Cache obiettivi",
        achievementCacheHint: "Scegli quando Playhub aggiorna i dati Xbox e RetroAchievements.",
        achievementCache_hourly: "Ogni ora",
        achievementCache_daily: "Ogni giorno",
        achievementCache_weekly: "Ogni settimana",
        achievementCache_pc_session: "Sessione PC",
        achievementCache_manual: "Manualmente",
        achievementSourceTitle: "Fonte obiettivi",
        achievementSourceHint: "Auto mantiene RetroAchievements per ROM/emulatori e usa OpenXBL solo per collegamenti probabilmente Xbox/UWPHook.",
        achievementSource_auto: "Auto",
        achievementSource_retroachievements: "RetroAchievements",
        achievementSource_xbox: "Xbox",
        achievementSource_disabled: "Disabilitati",
        xboxPerGameTitle: "Obiettivi Xbox",
        xboxHint: "Playhub abbina gli Xbox title ID tramite OpenXBL. Usa il selettore se il match automatico è sbagliato.",
        xboxCurrentMatch: "Xbox title ID attuale",
        xboxGameDetect: "Rileva con OpenXBL",
        xboxGameTest: "Testa obiettivi Xbox",
        xboxClearMatch: "Cancella match Xbox",
        xboxGameSearch: "Cerca titoli Xbox",
        xboxGameSearchHint: "Cerca nella cronologia OpenXBL e nel Microsoft Store il titolo Xbox corretto.",
        xboxGameNoMatches: "Nessun risultato Xbox per ora.",
        xboxGameOk: "Obiettivi Xbox caricati",
        xboxGameFailed: "Nessun obiettivo Xbox caricato. Riprova la scansione o incolla manualmente l'Xbox title ID.",
        xboxDetectFailed: "Nessun match Xbox trovato dal collegamento UWPHook.",
        none: "Nessuno",
        noResults: "Nessun risultato per ora.",
        source: "Fonte",
        fetchCurrent: "Scarica da IGN",
        removeToast: "Metadata rimossi",
        scanComplete: "Scansione completata",
        notNonSteam: "Questo plugin modifica solo i giochi non Steam.",
    },
};
const currentLang = () => {
    const raw = window?.SteamClient?.System?.GetCurrentLanguage?.() ||
        navigator.language ||
        "en";
    const code = String(raw).toLowerCase();
    if (code.startsWith("it"))
        return "it";
    return "en";
};
const t = (key) => STRINGS[currentLang()][key] ?? STRINGS.en[key];

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

const metadataCache = {};
const achievementsCache = {};
const NON_STEAM_APP_TYPE = 1073741824;
const GAME_DETAIL_ROUTES = [
    "/library/app/:appid",
    "/library/details/:appid",
    "/library/:collection/app/:appid",
];
const PLAYHUB_ACHIEVEMENTS_ROUTE = "/playhub-metadata/achievements/:appid";
let achievementSettingsCache = null;
let bypassCounter = 0;
let bypassBypass = 0;
let metadataLoaded = false;
let metadataLoadPromise = null;
const loadingMetadata = new Set();
const loadingAchievements = new Set();
const loadingScreenshots = new Set();
const loadingCommunityMedia = new Set();
let steamAchievementStoreRef = null;
const shouldShowAchievements = (appId) => {
    const key = String(appId);
    if (achievementsCache[key]?.steam?.nTotal)
        return true;
    if (achievementSettingsCache?.retroachievements?.game_ids?.[key])
        return true;
    if (achievementSettingsCache?.xbox?.title_ids?.[key])
        return true;
    const source = achievementSettingsCache?.achievement_sources?.[key] ?? "auto";
    if (source === "disabled")
        return false;
    if (source === "xbox")
        return !!achievementSettingsCache?.xbox?.enabled;
    if (source === "retroachievements")
        return !!achievementSettingsCache?.retroachievements?.enabled;
    // Auto mode must be allowed to show the section before a title id exists,
    // otherwise Xbox/UWPHook auto-detection never gets a chance to run. The backend
    // still refuses non-UWPHook Xbox calls and avoids RetroAchievements network
    // calls unless a RA id/hash was resolved.
    return !!achievementSettingsCache?.xbox?.enabled || !!achievementSettingsCache?.retroachievements?.enabled;
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
    const steamRouter = globalThis.Router ?? globalThis.window?.Router;
    return (steamRouter?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location
        ?.pathname ||
        globalThis.window?.location?.pathname ||
        "");
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
const appName = (appId) => {
    const overview = getOverview(appId);
    return cleanTitle(overview?.display_name ||
        overview?.localized_name ||
        overview?.name ||
        `App ${appId}`);
};
const refreshMetadataCache = async () => {
    const all = await getAllMetadata();
    Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
    Object.assign(metadataCache, all || {});
    metadataLoaded = true;
    Object.keys(metadataCache).forEach((key) => applyMetadata(Number(key)));
};
const ensureMetadataCache = async () => {
    if (metadataLoaded)
        return;
    if (!metadataLoadPromise) {
        metadataLoadPromise = refreshMetadataCache().finally(() => {
            metadataLoadPromise = null;
        });
    }
    await metadataLoadPromise;
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
            console.warn("[Playhub Metadata] metadata bootstrap failed", error);
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
const refreshRaSettings = async () => {
    achievementSettingsCache = await getAchievementSettings();
    return achievementSettingsCache;
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
            appData.details.bCommunityMarketPresence = true;
        }
    }
    try {
        appDetailsCache?.SetCachedDataForApp?.(appId, "descriptions", 1, appData.descriptionsData);
        appDetailsCache?.SetCachedDataForApp?.(appId, "associations", 1, appData.associationData);
        if (screenshots.length) {
            appDetailsCache?.SetCachedDataForApp?.(appId, "screenshots", 1, appData.screenshots);
        }
    }
    catch (_error) {
        // Cache writes can fail if the page has not finished creating app data.
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
const playhubCommunityId = (appId, index) => `90909${String(appId).padStart(10, "0")}${String(index).padStart(2, "0")}`;
const isPlayhubCommunityId = (value) => typeof value === "string" && value.startsWith("90909");
const interleavedCommunityMedia = (metadata) => {
    const ign = (metadata.screenshots || [])
        .filter((image) => image?.url)
        .map((image) => ({ kind: "image", source: "IGN", image }));
    const videos = (metadata.community_videos || [])
        .filter((video) => video?.id)
        .slice(0, 10)
        .map((video) => ({ kind: "video", source: "YouTube", video }));
    const webImages = (metadata.community_images || [])
        .filter((image) => image?.url)
        .slice(0, 10)
        .map((image) => ({ kind: "image", source: "RAWG", image }));
    const buckets = [ign, videos, webImages];
    const mixed = [];
    let index = 0;
    while (buckets.some((bucket) => index < bucket.length)) {
        for (const bucket of buckets) {
            const item = bucket[index];
            if (item)
                mixed.push(item);
        }
        index += 1;
    }
    return mixed;
};
const steamCommunityItemsFromMetadata = (appId, metadata) => interleavedCommunityMedia(metadata).map((item, index) => {
    if (item.kind === "video") {
        const video = item.video;
        return {
            appid: appId,
            consumer_appid: appId,
            published_file_id: playhubCommunityId(appId, index),
            publishedfileid: playhubCommunityId(appId, index),
            type: 4,
            title: video.title || `${metadata.title} video`,
            description: video.title || metadata.title || "",
            preview_image_url: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            full_image_url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
            youtube_video_id: video.id,
            image_width: 1280,
            image_height: 720,
            spoiler_tag: false,
            content_descriptorids: [],
            reactions: [],
            creator: {
                steamid: "76561197960287930",
                name: "YouTube",
                avatar: "",
            },
            time_created: Math.floor(Date.now() / 1000) - index * 60,
            votes_up: 0,
            votes_down: 0,
            num_comments_public: 0,
        };
    }
    const image = item.image;
    return {
        appid: appId,
        consumer_appid: appId,
        published_file_id: playhubCommunityId(appId, index),
        publishedfileid: playhubCommunityId(appId, index),
        type: 5,
        title: image.caption ||
            `${metadata.title || "Screenshot"}${item.source ? ` (${item.source})` : ""}`,
        description: image.caption || metadata.title || "",
        preview_image_url: image.url,
        full_image_url: image.url,
        image_width: image.width || 1280,
        image_height: image.height || 720,
        spoiler_tag: false,
        content_descriptorids: [],
        reactions: [],
        creator: {
            steamid: "76561197960287930",
            name: "Playhub Metadata",
            avatar: "",
        },
        time_created: Math.floor(Date.now() / 1000) - index * 60,
        votes_up: 0,
        votes_down: 0,
        num_comments_public: 0,
    };
});
const communityPayloadForApp = async (appId) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    await ensureMetadataCache();
    let metadata = metadataCache[String(appId)];
    if (!metadata)
        return null;
    if (!metadata.screenshots?.length) {
        await tryEnrichScreenshotsForApp(appId);
        metadata = metadataCache[String(appId)];
    }
    if (!metadata?.community_enriched_at) {
        await tryEnrichCommunityMediaForApp(appId);
        metadata = metadataCache[String(appId)];
    }
    const hub = metadata ? steamCommunityItemsFromMetadata(appId, metadata) : [];
    return hub.length ? { hub } : null;
};
const applyAchievementPayload = (appId, payload) => {
    if (!payload?.steam?.nTotal)
        return;
    clearAchievementStoreMapsForApp(appId);
    achievementsCache[String(appId)] = payload;
    if (steamAchievementStoreRef)
        primeAchievementStore(steamAchievementStoreRef, appId, payload);
    const appData = appDetailsStore?.GetAppData?.(appId);
    if (appData?.details) {
        appData.details.achievements = payload.steam;
        appData.bLoadingAchievments = false;
    }
    try {
        appDetailsCache?.SetCachedDataForApp?.(appId, "achievements", 2, payload.steam);
    }
    catch (_error) {
        // Best effort, same cache route used by Steam.
    }
    try {
        if (appAchievementProgressCache?.m_achievementProgress) {
            appAchievementProgressCache.m_achievementProgress.mapCache.set(appId, {
                all_unlocked: payload.progress.achieved === payload.progress.total,
                appid: appId,
                cache_time: Date.now(),
                percentage: payload.progress.percentage,
                total: payload.progress.total,
                unlocked: payload.progress.achieved,
            });
            appAchievementProgressCache.SaveCacheFile?.();
        }
    }
    catch (_error) {
        // Progress cache is optional across Steam client versions.
    }
    try {
        appDetailsStore?.GetAchievements?.(appId);
    }
    catch (_error) {
        // Touching the getter nudges Steam into re-reading the cached achievement data.
    }
    window.dispatchEvent(new Event("playhub-metadata:achievements-updated"));
};
const emptySteamAchievementsPayload = () => ({
    nAchieved: 0,
    nTotal: 0,
    vecAchievedHidden: [],
    vecHighlight: [],
    vecUnachieved: [],
});
const clearAchievementStoreMapsForApp = (appId) => {
    const keys = [appId, String(appId)];
    const store = steamAchievementStoreRef;
    if (!store)
        return;
    try {
        for (const key of keys) {
            for (const mapName of [
                "m_mapMyAchievements",
                "m_mapAchievements",
                "m_mapGlobalAchievements",
                "m_mapGlobalAchievementPercentages",
                "m_mapAchievementPercentages",
            ]) {
                const map = store?.[mapName];
                map?.delete?.(key);
                if (map?.set && (mapName.includes("Global") || mapName.includes("Percent"))) {
                    map.set(key, { loading: false, data: {} });
                }
                if (map?.set && (mapName === "m_mapMyAchievements" || mapName === "m_mapAchievements")) {
                    map.set(key, emptyAchievementUserPayload());
                }
            }
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] failed to clear achievement store maps", error);
    }
};
const clearAchievementsForApp = (appId) => {
    const key = String(appId);
    delete achievementsCache[key];
    const empty = emptySteamAchievementsPayload();
    clearAchievementStoreMapsForApp(appId);
    try {
        const appData = appDetailsStore?.GetAppData?.(appId);
        if (appData?.details) {
            appData.details.achievements = empty;
            appData.bLoadingAchievments = false;
        }
    }
    catch (_error) {
        // Best effort.
    }
    try {
        appDetailsCache?.SetCachedDataForApp?.(appId, "achievements", 2, empty);
    }
    catch (_error) {
        // Best effort.
    }
    try {
        appAchievementProgressCache?.m_achievementProgress?.mapCache?.delete?.(appId);
        appAchievementProgressCache?.m_achievementProgress?.mapCache?.delete?.(String(appId));
        appAchievementProgressCache?.SaveCacheFile?.();
    }
    catch (_error) {
        // Best effort.
    }
    window.dispatchEvent(new Event("playhub-metadata:achievements-updated"));
};
const clearAchievementsForApps = (appIds) => {
    for (const appId of appIds) {
        if (Number.isFinite(appId) && appId > 0)
            clearAchievementsForApp(appId);
    }
};
const isUwphookGameOption = (game) => {
    const text = `${game?.exe || ""} ${game?.start_dir || ""} ${game?.launch_options || ""} ${game?.shortcut_path || ""} ${game?.name || ""}`.toLowerCase().replace(/\\/g, "/");
    return text.includes("uwphook.exe") || text.includes("/uwphook/uwphook.exe") || text.includes("briano/uwphook");
};
const flushTrueAchievementsNativeCache = async () => {
    try {
        const settings = achievementSettingsCache ?? (await refreshRaSettings());
        const ids = settings?.xbox?.title_ids || {};
        Object.keys(ids).forEach((key) => {
            const appId = Number(key);
            if (appId)
                clearAchievementsForApp(appId);
        });
    }
    catch (error) {
        console.warn("[Playhub Metadata] failed to flush stale achievement cache", error);
    }
};
const primeAchievementStore = (store, appId, payload) => {
    if (!payload)
        return;
    try {
        const keys = [appId, String(appId)];
        for (const key of keys) {
            if (payload.global) {
                store?.m_mapGlobalAchievements?.set?.(key, payload.global);
                store?.m_mapGlobalAchievementPercentages?.set?.(key, payload.global);
                store?.m_mapAchievementPercentages?.set?.(key, payload.global);
            }
            if (payload.user) {
                store?.m_mapMyAchievements?.set?.(key, payload.user);
                store?.m_mapAchievements?.set?.(key, payload.user);
            }
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] failed to prime achievement store", error);
    }
};
const emptyAchievementUserPayload = () => ({
    loading: false,
    data: {
        achieved: {},
        hidden: {},
        unachieved: {},
    },
});
const tryFetchMetadataForApp = async (appId) => {
    await ensureMetadataCache();
    if (metadataCache[String(appId)] || loadingMetadata.has(appId))
        return;
    const overview = getOverview(appId);
    if (!isNonSteamApp(overview))
        return;
    loadingMetadata.add(appId);
    try {
        const metadata = await autoFetchMetadata(appId, appName(appId));
        if (metadata) {
            metadataCache[String(appId)] = metadata;
            applyMetadata(appId);
            window.dispatchEvent(new Event("playhub-metadata:updated"));
        }
    }
    finally {
        loadingMetadata.delete(appId);
    }
};
const tryEnrichScreenshotsForApp = async (appId) => {
    await ensureMetadataCache();
    const metadata = metadataCache[String(appId)];
    if (!metadata ||
        metadata.screenshots?.length ||
        loadingScreenshots.has(appId) ||
        String(metadata.source || "").toUpperCase() !== "IGN") {
        return;
    }
    const source = metadata.source_url || String(metadata.id || "");
    if (!source)
        return;
    loadingScreenshots.add(appId);
    try {
        const refreshed = await fetchMetadata(source);
        if (refreshed?.screenshots?.length) {
            const saved = await saveMetadata(appId, {
                ...metadata,
                screenshots: refreshed.screenshots,
            });
            metadataCache[String(appId)] = saved;
            applyMetadata(appId);
            window.dispatchEvent(new Event("playhub-metadata:updated"));
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] screenshot enrichment failed", error);
    }
    finally {
        loadingScreenshots.delete(appId);
    }
};
const tryEnrichCommunityMediaForApp = async (appId) => {
    await ensureMetadataCache();
    const metadata = metadataCache[String(appId)];
    const enrichedRecently = metadata?.community_enriched_at &&
        Date.now() / 1000 - Number(metadata.community_enriched_at) < 7 * 24 * 60 * 60;
    if (!metadata || enrichedRecently || loadingCommunityMedia.has(appId)) {
        return;
    }
    loadingCommunityMedia.add(appId);
    try {
        const enriched = await enrichCommunityMedia(appId, metadata.title || appName(appId), metadata.source_url || "");
        if (enriched) {
            metadataCache[String(appId)] = enriched;
            applyMetadata(appId);
            window.dispatchEvent(new Event("playhub-metadata:updated"));
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] community media enrichment failed", error);
    }
    finally {
        loadingCommunityMedia.delete(appId);
    }
};
const getAppDetails = async (appId) => new Promise((resolve) => {
    let timeoutId;
    try {
        const { unregister } = SteamClient.Apps.RegisterForAppDetails(appId, (details) => {
            window.clearTimeout(timeoutId);
            unregister();
            resolve(details);
        });
        timeoutId = window.setTimeout(() => {
            unregister();
            resolve(null);
        }, 1000);
    }
    catch (_error) {
        window.clearTimeout(timeoutId);
        resolve(null);
    }
});
const loadAchievementsForApp = async (appId) => {
    if (achievementsCache[String(appId)] || loadingAchievements.has(appId)) {
        return achievementsCache[String(appId)];
    }
    const overview = getOverview(appId);
    if (!isNonSteamApp(overview))
        return null;
    const settings = achievementSettingsCache ?? (await refreshRaSettings());
    const hasAnyProvider = !!settings?.retroachievements?.enabled || !!settings?.xbox?.enabled;
    if (!hasAnyProvider)
        return null;
    const appKey = String(appId);
    const source = settings?.achievement_sources?.[appKey] ?? "auto";
    const hasXboxMatch = !!settings?.xbox?.title_ids?.[appKey];
    const shouldClearStaleXbox = hasXboxMatch || source === "xbox";
    if (shouldClearStaleXbox) {
        // Steam can keep old native achievement data around even after the plugin
        // data folders are deleted. Clear the native cache before loading TA data
        // so old OpenXBL payloads cannot leak into the page.
        clearAchievementsForApp(appId);
    }
    loadingAchievements.add(appId);
    try {
        let payload = await fetchAchievements(appId);
        if (!payload && shouldClearStaleXbox) {
            clearAchievementsForApp(appId);
            return null;
        }
        if (!payload) {
            const details = await getAppDetails(appId);
            const launchPath = `${details?.strShortcutExe || ""} ${details?.strShortcutLaunchOptions || ""}`;
            if (launchPath.trim()) {
                payload = await resolveRetroAchievementsFromPath(appId, launchPath, appName(appId));
            }
        }
        if (payload)
            applyAchievementPayload(appId, payload);
        return payload || achievementsCache[String(appId)] || null;
    }
    catch (error) {
        console.error("[Playhub Metadata] achievements fetch failed", error);
        return achievementsCache[String(appId)] || null;
    }
    finally {
        loadingAchievements.delete(appId);
    }
};
const patchMethod = (target, methodName, replacement) => {
    if (!target?.[methodName])
        return () => undefined;
    const original = target[methodName];
    target[methodName] = function patchedMethod(...args) {
        return replacement(this, original.bind(this), args);
    };
    return () => {
        target[methodName] = original;
    };
};
let achievementStorePatchInstalled = false;
const tryInstallAchievementStorePatch = (unpatchers) => {
    if (achievementStorePatchInstalled)
        return true;
    try {
        const achievementsStore = DFL.findModuleChild((module) => {
            if (!module || typeof module !== "object")
                return undefined;
            for (const prop in module) {
                const candidate = module[prop];
                if (candidate?.m_mapMyAchievements || candidate?.m_mapGlobalAchievements)
                    return candidate;
            }
            return undefined;
        });
        if (!achievementsStore)
            return false;
        steamAchievementStoreRef = achievementsStore;
        const proto = achievementsStore.__proto__ ?? achievementsStore;
        if (achievementsStore?.LoadMyAchievements || proto?.LoadMyAchievements) {
            unpatchers.push(patchMethod(proto, "LoadMyAchievements", (thisValue, original, args) => {
                const appId = Number(args[0]);
                if (!isNonSteamApp(getOverview(appId))) {
                    return original(...args);
                }
                const cached = achievementsCache[String(appId)];
                if (cached) {
                    primeAchievementStore(thisValue, appId, cached);
                    return Promise.resolve(cached.user ?? emptyAchievementUserPayload());
                }
                return loadAchievementsForApp(appId)
                    .then((payload) => {
                    primeAchievementStore(thisValue, appId, payload);
                    return payload?.user ?? emptyAchievementUserPayload();
                })
                    .catch((error) => {
                    console.error("[Playhub Metadata] LoadMyAchievements failed", error);
                    return emptyAchievementUserPayload();
                });
            }));
        }
        for (const methodName of [
            "LoadGlobalAchievements",
            "LoadGlobalAchievementPercentages",
            "LoadAchievementPercentages",
        ]) {
            if (!(achievementsStore?.[methodName] || proto?.[methodName]))
                continue;
            unpatchers.push(patchMethod(proto, methodName, (thisValue, original, args) => {
                const appId = Number(args[0]);
                if (!isNonSteamApp(getOverview(appId))) {
                    return original(...args);
                }
                const cached = achievementsCache[String(appId)];
                if (cached) {
                    primeAchievementStore(thisValue, appId, cached);
                    return Promise.resolve(cached.global ?? { loading: false, data: {} });
                }
                return loadAchievementsForApp(appId).then((payload) => {
                    primeAchievementStore(thisValue, appId, payload);
                    return payload?.global ?? { loading: false, data: {} };
                });
            }));
        }
        achievementStorePatchInstalled = true;
        return true;
    }
    catch (error) {
        console.warn("[Playhub Metadata] achievement store patch skipped", error);
        return false;
    }
};
const routeAchievementAppId = () => achievementAppIdFromPath(currentRoutePath());
const achievementAppIdFromPath = (path) => {
    const match = String(path || "").match(/\/library\/(?:app|details|[^/]+\/app)\/(\d+)\/achievements(?:[/?#].*)?/)
        || String(path || "").match(/\/playhub-metadata\/achievements\/(\d+)(?:[/?#].*)?/);
    return Number(match?.[1] || 0);
};
const playhubAchievementsPath = (appId) => `/playhub-metadata/achievements/${appId}`;
const achievementDate = (value) => {
    if (!value)
        return "";
    try {
        return new Date(value * 1000).toLocaleDateString();
    }
    catch (_error) {
        return "";
    }
};
const allAchievementsFromPayload = (payload) => {
    const data = payload?.user?.data;
    if (!data)
        return [];
    return [
        ...Object.values(data.achieved || {}),
        ...Object.values(data.unachieved || {}),
        ...Object.values(data.hidden || {}),
    ];
};
const achievementImageUrl = (achievement) => {
    const candidates = [
        achievement.playhubImage,
        achievement.strImageURL,
        achievement.strImageUrl,
        achievement.strImage,
        achievement.strIconURL,
        achievement.strIcon,
        achievement.iconUrl,
        achievement.imageUrl,
    ].filter(Boolean);
    return candidates[0] || "";
};
const imageElement = (achievement, size = 96) => {
    const src = achievementImageUrl(achievement);
    const wrapperStyle = {
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.08)",
        flex: "0 0 auto",
        overflow: "hidden",
    };
    const imgStyle = {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        objectPosition: "center center",
        display: "block",
    };
    return SP_REACT.createElement("div", { className: "playhub-achievement-art", style: wrapperStyle }, src ? SP_REACT.createElement("img", { src, style: imgStyle, referrerPolicy: "no-referrer" }) : null);
};
const XBOX_IMAGE_URL_RE = /(trueachievements|imagestore|xboxlive|xboxservices|microsoft|akamaized|store-images|dlassets)/i;
const isLikelyAchievementArtBox = (element) => {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 18 || rect.height < 18)
        return false;
    // Steam can render achievement art into square tiles, wide cards, or small
    // strips depending on the page. Keep this bounded so large metadata artwork
    // is not touched, but do not require a square ratio.
    return rect.width <= 520 && rect.height <= 360;
};
const fixNativeAchievementImageStretch = (root = document) => {
    try {
        root.querySelectorAll?.("img").forEach((node) => {
            const img = node;
            const src = img.currentSrc || img.src || img.srcset || img.getAttribute("src") || img.getAttribute("srcset") || "";
            const parent = img.parentElement;
            const achievementArtTarget = isLikelyAchievementArtBox(img) || (!!parent && isLikelyAchievementArtBox(parent));
            if (!XBOX_IMAGE_URL_RE.test(src) || !achievementArtTarget)
                return;
            if (parent) {
                parent.style.setProperty("overflow", "hidden", "important");
                if (!parent.style.position)
                    parent.style.setProperty("position", "relative", "important");
                parent.style.setProperty("background-color", "rgba(0,0,0,0.18)", "important");
            }
            img.style.setProperty("object-fit", "contain", "important");
            img.style.setProperty("object-position", "center center", "important");
            img.style.setProperty("width", "100%", "important");
            img.style.setProperty("height", "100%", "important");
            img.style.setProperty("max-width", "none", "important");
            img.style.setProperty("max-height", "none", "important");
            img.style.setProperty("display", "block", "important");
        });
        root.querySelectorAll?.("*").forEach((node) => {
            const el = node;
            const bg = el.style?.backgroundImage || "";
            if (!bg || !XBOX_IMAGE_URL_RE.test(bg) || !isLikelyAchievementArtBox(el))
                return;
            el.style.setProperty("background-size", "contain", "important");
            el.style.setProperty("background-position", "center center", "important");
            el.style.setProperty("background-repeat", "no-repeat", "important");
            el.style.setProperty("background-color", "rgba(0,0,0,0.18)", "important");
        });
    }
    catch (_error) {
        // Best effort: Steam changes this DOM often.
    }
};
const installAchievementImageCoverPatch = (unpatchers) => {
    const style = document.createElement("style");
    style.id = "playhub-achievement-cover-style";
    style.textContent = `
    .playhub-achievement-art {
      background-size: contain !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
    }
    .playhub-achievement-art > img {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      object-position: center center !important;
      display: block !important;
    }
    [style*="trueachievements"][style*="background-image"],
    [style*="imagestore"][style*="background-image"],
    [style*="xboxlive"][style*="background-image"],
    [style*="xboxservices"][style*="background-image"],
    [style*="store-images"][style*="background-image"],
    [style*="dlassets"][style*="background-image"],
    [style*="akamaized"][style*="background-image"] {
      background-size: contain !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
    }
    img[src*="trueachievements"],
    img[src*="imagestore"],
    img[src*="xboxlive"],
    img[src*="xboxservices"],
    img[src*="store-images"],
    img[src*="dlassets"],
    img[src*="akamaized"] {
      object-fit: contain !important;
      object-position: center center !important;
    }
  `;
    document.head.appendChild(style);
    unpatchers.push(() => style.remove());
    const run = () => fixNativeAchievementImageStretch(document);
    run();
    const interval = window.setInterval(run, 750);
    unpatchers.push(() => window.clearInterval(interval));
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof Element)
                    fixNativeAchievementImageStretch(node);
            });
        }
        run();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style", "class"] });
    unpatchers.push(() => observer.disconnect());
    window.addEventListener("playhub-metadata:achievements-updated", run);
    unpatchers.push(() => window.removeEventListener("playhub-metadata:achievements-updated", run));
};
const PlayhubAchievementsPage = ({ appId }) => {
    const [payload, setPayload] = SP_REACT.useState(achievementsCache[String(appId)] || null);
    const [loading, setLoading] = SP_REACT.useState(!achievementsCache[String(appId)]);
    SP_REACT.useEffect(() => {
        let cancelled = false;
        setLoading(!achievementsCache[String(appId)]);
        loadAchievementsForApp(appId).then((next) => {
            if (!cancelled) {
                setPayload(next || achievementsCache[String(appId)] || null);
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [appId]);
    const achievements = allAchievementsFromPayload(payload)
        .slice()
        .sort((a, b) => (b.rtUnlocked || 0) - (a.rtUnlocked || 0));
    const unlocked = achievements.filter((item) => item.bAchieved).length;
    const total = achievements.length || payload?.progress?.total || 0;
    const percent = total ? Math.round((unlocked / total) * 100) : 0;
    const title = payload?.title || appName(appId);
    const provider = payload?.provider === "xbox" ? "Xbox" : "RetroAchievements";
    const content = loading
        ? SP_REACT.createElement("div", { style: { padding: 24 } }, SP_REACT.createElement(DFL.Spinner, null))
        : !achievements.length
            ? SP_REACT.createElement("div", { style: { opacity: 0.72, padding: 24 } }, "No achievements loaded for this game.")
            : SP_REACT.createElement("div", {
                style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                    gap: 16,
                },
            }, achievements.map((achievement) => SP_REACT.createElement("div", {
                key: achievement.strID,
                style: {
                    display: "flex",
                    gap: 16,
                    padding: 16,
                    borderRadius: 12,
                    background: achievement.bAchieved
                        ? "rgba(255,255,255,0.10)"
                        : "rgba(255,255,255,0.055)",
                    opacity: achievement.bAchieved ? 1 : 0.68,
                },
            }, imageElement(achievement, 96), SP_REACT.createElement("div", { style: { minWidth: 0 } }, SP_REACT.createElement("div", { style: { fontWeight: 700, fontSize: 18, marginBottom: 6 } }, achievement.strName || "Secret achievement"), SP_REACT.createElement("div", { style: { opacity: 0.76, lineHeight: 1.35 } }, achievement.strDescription || ""), achievement.bAchieved
                ? SP_REACT.createElement("div", { style: { opacity: 0.65, marginTop: 12 } }, achievementDate(achievement.rtUnlocked)
                    ? `Unlocked on ${achievementDate(achievement.rtUnlocked)}`
                    : "Unlocked")
                : SP_REACT.createElement("div", { style: { opacity: 0.58, marginTop: 12 } }, achievement.bHidden ? "Hidden" : "Locked")))));
    return SP_REACT.createElement("div", { style: { padding: 32, paddingBottom: 120, minHeight: "100vh", boxSizing: "border-box", overflowY: "auto" } }, SP_REACT.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 22 } }, SP_REACT.createElement(DFL.DialogButton, { focusable: true, onClick: () => DFL.Navigation.NavigateBack(), style: { width: "auto" } }, "Back"), SP_REACT.createElement("div", null, SP_REACT.createElement("div", { style: { fontSize: 32, fontWeight: 800 } }, "Achievements"), SP_REACT.createElement("div", { style: { opacity: 0.72, marginTop: 4 } }, `${title} · ${provider} · ${unlocked}/${total} (${percent}%)`))), SP_REACT.createElement("div", { style: { height: 8, borderRadius: 999, background: "rgba(255,255,255,0.16)", overflow: "hidden", marginBottom: 24 } }, SP_REACT.createElement("div", {
        style: {
            width: `${Math.max(0, Math.min(100, percent))}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #a67cff, #ff2d6f)",
        },
    })), content);
};
const PlayhubAchievementsRoute = () => {
    const appId = routeAchievementAppId();
    return SP_REACT.createElement(PlayhubAchievementsPage, { appId });
};
const installSteamPatches = () => {
    const unpatchers = [];
    installAchievementImageCoverPatch(unpatchers);
    void flushTrueAchievementsNativeCache();
    window.setTimeout(() => void flushTrueAchievementsNativeCache(), 2500);
    const overviewProto = appStore?.allApps?.[0]?.__proto__;
    const detailsProto = appDetailsStore?.__proto__;
    if (!overviewProto || !detailsProto) {
        let cancelled = false;
        let delayedUnpatch = null;
        let retryId;
        const retry = () => {
            if (cancelled)
                return;
            const ready = appStore?.allApps?.[0]?.__proto__ && appDetailsStore?.__proto__;
            if (ready) {
                delayedUnpatch = installSteamPatches();
                return;
            }
            retryId = window.setTimeout(retry, 500);
        };
        retry();
        return () => {
            cancelled = true;
            if (retryId)
                window.clearTimeout(retryId);
            delayedUnpatch?.();
        };
    }
    const redirectAchievementTarget = (target) => {
        const raw = String(target || "");
        if (raw.includes("/playhub-metadata/achievements/"))
            return "";
        const appId = achievementAppIdFromPath(raw);
        if (appId && isNonSteamApp(getOverview(appId)) && shouldShowAchievements(appId)) {
            return playhubAchievementsPath(appId);
        }
        return "";
    };
    if (DFL.Navigation?.Navigate) {
        unpatchers.push(patchMethod(DFL.Navigation, "Navigate", (_thisValue, original, args) => {
            const redirected = redirectAchievementTarget(args[0]);
            if (redirected)
                return original(redirected);
            return original(...args);
        }));
    }
    try {
        const steamHistory = globalThis.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
        for (const methodName of ["push", "replace"]) {
            if (steamHistory?.[methodName]) {
                unpatchers.push(patchMethod(steamHistory, methodName, (_thisValue, original, args) => {
                    const target = typeof args[0] === "string" ? args[0] : args[0]?.pathname;
                    const redirected = redirectAchievementTarget(target);
                    if (redirected)
                        return original(redirected);
                    return original(...args);
                }));
            }
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] history achievement redirect patch skipped", error);
    }
    try {
        for (const methodName of ["pushState", "replaceState"]) {
            const original = window.history?.[methodName];
            if (typeof original !== "function")
                continue;
            const patched = function (...args) {
                const redirected = redirectAchievementTarget(args[2] || args[0]);
                if (redirected) {
                    args[2] = redirected;
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
        console.warn("[Playhub Metadata] window history redirect patch skipped", error);
    }
    const clickAchievementRedirect = (event) => {
        try {
            const target = event.target;
            const anchor = target?.closest?.("a[href]");
            const redirected = redirectAchievementTarget(anchor?.getAttribute?.("href") || anchor?.href || "");
            if (redirected) {
                event.preventDefault();
                event.stopPropagation();
                DFL.Navigation?.Navigate?.(redirected);
            }
        }
        catch (_error) {
            // Best effort only.
        }
    };
    document.addEventListener("click", clickAchievementRedirect, true);
    unpatchers.push(() => document.removeEventListener("click", clickAchievementRedirect, true));
    const routeGuard = () => {
        const path = currentRoutePath();
        const redirected = redirectAchievementTarget(path);
        if (redirected) {
            try {
                DFL.Navigation?.Navigate?.(redirected);
            }
            catch (_error) {
                // If the router is mid-transition, the route patch below will still catch.
            }
        }
    };
    const routeGuardTimer = window.setInterval(routeGuard, 250);
    unpatchers.push(() => window.clearInterval(routeGuardTimer));
    unpatchers.push(patchMethod(detailsProto, "GetDescriptions", (_thisValue, original, args) => {
        const appId = Number(args[0]);
        const overview = getOverview(appId);
        if (isNonSteamApp(overview)) {
            const metadata = metadataCache[String(appId)];
            if (metadata) {
                applyMetadata(appId);
                return appDetailsStore?.GetAppData?.(appId)?.descriptionsData;
            }
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
        return original(...args);
    }));
    unpatchers.push(patchMethod(detailsProto, "GetAssociations", (_thisValue, original, args) => {
        const appId = Number(args[0]);
        const overview = getOverview(appId);
        if (isNonSteamApp(overview) && metadataCache[String(appId)]) {
            applyMetadata(appId);
        }
        return original(...args);
    }));
    unpatchers.push(patchMethod(detailsProto, "GetAchievements", (_thisValue, original, args) => {
        const appId = Number(args[0]);
        if (isNonSteamApp(getOverview(appId))) {
            const payload = achievementsCache[String(appId)];
            if (payload?.steam)
                return payload.steam;
            void loadAchievementsForApp(appId);
        }
        return original(...args);
    }));
    unpatchers.push(patchMethod(overviewProto, "BHasStoreCategory", (thisValue, original, args) => {
        if (isNonSteamApp(thisValue)) {
            const category = Number(args[0]);
            const metadata = metadataCache[String(thisValue.appid)];
            if (metadata?.store_categories?.includes(category))
                return true;
            if (category === StoreCategory.Achievements &&
                shouldShowAchievements(Number(thisValue.appid))) {
                return true;
            }
        }
        return original(...args);
    }));
    if (overviewProto?.BIsModOrShortcut) {
        unpatchers.push(DFL.afterPatch(overviewProto, "BIsModOrShortcut", function (_args, ret) {
            if (!isNonSteamAppWithoutPatchedMethod(this) || ret !== true)
                return ret;
            if (bypassBypass > 0) {
                bypassBypass -= 1;
                return false;
            }
            const path = currentRoutePath();
            if (path === "/library/home")
                return false;
            if (bypassCounter > 0)
                bypassCounter -= 1;
            return bypassCounter === -1 || bypassCounter > 0;
        }).unpatch);
    }
    if (detailsProto?.BHasRecentlyLaunched) {
        unpatchers.push(DFL.afterPatch(detailsProto, "BHasRecentlyLaunched", (_args, ret) => {
            bypassCounter = 4;
            return ret;
        }).unpatch);
    }
    ["GetGameID", "GetPrimaryAppID"].forEach((methodName) => {
        if (!overviewProto?.[methodName])
            return;
        unpatchers.push(patchMethod(overviewProto, methodName, (_thisValue, original, args) => {
            bypassCounter = -1;
            const ret = original(...args);
            bypassCounter = 0;
            return ret;
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
        unpatchers.push(DFL.afterPatch(overviewProto, "GetPerClientData", (_args, ret) => {
            bypassCounter = 4;
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
            unpatchers.push(DFL.afterPatch(appDetailsSections.prototype, "GetSections", function (_args, ret) {
                const overview = this?.props?.overview;
                const appId = Number(overview?.appid);
                if (appId && isNonSteamApp(overview) && shouldShowAchievements(appId)) {
                    ret.add("achievements");
                    void loadAchievementsForApp(appId);
                }
                if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
                    if (metadataCache[String(appId)]?.screenshots?.length) {
                        ret.add("screenshots");
                    }
                    else {
                        void tryEnrichScreenshotsForApp(appId);
                    }
                    ret.add("community");
                }
                return ret;
            }).unpatch);
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] app details sections patch skipped", error);
    }
    try {
        const httpClient = DFL.findModuleChild((module) => {
            if (!module || typeof module !== "object")
                return undefined;
            if (typeof module.g?.get === "function" && typeof module.g?.post === "function") {
                return module.g;
            }
            return undefined;
        });
        if (httpClient?.get) {
            unpatchers.push(patchMethod(httpClient, "get", (_thisValue, original, args) => {
                const url = String(args[0] || "");
                const match = url.match(/library\/appcommunityfeed\/(\d+)/);
                if (match) {
                    const appId = Number(match[1]);
                    return communityPayloadForApp(appId).then((payload) => {
                        if (payload)
                            return payload;
                        return original(...args);
                    });
                }
                return original(...args);
            }));
        }
    }
    catch (error) {
        console.warn("[Playhub Metadata] community feed patch skipped", error);
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
                if (ids.length && ids.every(isPlayhubCommunityId)) {
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
        console.warn("[Playhub Metadata] community vote patch skipped", error);
    }
    tryInstallAchievementStorePatch(unpatchers);
    let achievementPatchAttempts = 0;
    const achievementPatchTimer = window.setInterval(() => {
        achievementPatchAttempts += 1;
        if (tryInstallAchievementStorePatch(unpatchers) || achievementPatchAttempts >= 30) {
            window.clearInterval(achievementPatchTimer);
        }
    }, 1000);
    unpatchers.push(() => window.clearInterval(achievementPatchTimer));
    // Do not routerHook.addPatch Steam's native achievement routes. In recent
    // Decky dev builds that can crash RouterHook.processList before our custom
    // page renders. Redirect navigation/history/clicks instead and let the
    // native route fall back safely if Steam opens it by another internal path.
    GAME_DETAIL_ROUTES.forEach((route) => {
        const patch = routerHook.addPatch(route, (tree) => {
            const routeProps = DFL.findInReactTree(tree, (x) => x?.renderFunc);
            if (routeProps?.renderFunc) {
                const renderPatch = DFL.afterPatch(routeProps, "renderFunc", (_args, ret) => {
                    const overview = ret?.props?.children?.props?.overview;
                    const appId = Number(overview?.appid);
                    if (appId && isNonSteamApp(overview)) {
                        bypassBypass = 11;
                        void ensureMetadataCache().then(() => {
                            applyMetadata(appId);
                            void tryEnrichScreenshotsForApp(appId);
                            void tryFetchMetadataForApp(appId);
                        });
                        void loadAchievementsForApp(appId);
                    }
                    return ret;
                });
                unpatchers.push(renderPatch.unpatch);
            }
            return tree;
        });
        unpatchers.push(() => routerHook.removePatch(route, patch));
    });
    return () => {
        unpatchers.splice(0).reverse().forEach((unpatch) => {
            try {
                unpatch();
            }
            catch (error) {
                console.error("[Playhub Metadata] unpatch failed", error);
            }
        });
    };
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

const FocusableButton = (props) => (SP_JSX.jsx(DFL.DialogButton, { focusable: true, ...props }));
const pageStyle = {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 120,
    minHeight: "100vh",
    boxSizing: "border-box",
};
const rowStackStyle = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    gap: "0.65rem",
};
const buttonRowStyle = {
    display: "flex",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap",
};
const spacedButtonRowStyle = {
    ...buttonRowStyle,
    marginTop: "0.35rem",
};
const resultsStackStyle = {
    ...rowStackStyle,
    marginTop: "1.25rem",
};
const fieldStyle = {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
};
const flexFieldStyle = {
    ...fieldStyle,
    flex: "1 1 14rem",
};
const compactTextStyle = {
    opacity: 0.72,
    fontSize: "0.82rem",
    lineHeight: 1.35,
};
const inlineStatusStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    ...compactTextStyle,
};
const sectionHeadingStyle = {
    width: "100%",
    paddingTop: "0.75rem",
    fontWeight: 700,
    fontSize: "0.95rem",
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
    community_images: [],
    community_videos: [],
    community_enriched_at: 0,
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
const achievementCachePolicies = [
    "hourly",
    "daily",
    "weekly",
    "pc_session",
    "manual",
];
const useNonSteamGames = () => {
    const [games, setGames] = SP_REACT.useState([]);
    const loadGames = SP_REACT.useCallback(async () => {
        setGames(await allNonSteamGames());
    }, []);
    SP_REACT.useEffect(() => {
        void loadGames();
    }, [loadGames]);
    return { games, loadGames };
};
const Content = () => {
    const { games, loadGames } = useNonSteamGames();
    const [metadataCount, setMetadataCount] = SP_REACT.useState(0);
    const [busy, setBusy] = SP_REACT.useState(false);
    const [scanMessage, setScanMessage] = SP_REACT.useState("");
    const [xboxBulkBusy, setXboxBulkBusy] = SP_REACT.useState(false);
    const [xboxBulkMessage, setXboxBulkMessage] = SP_REACT.useState("");
    const [ra, setRa] = SP_REACT.useState({
        enabled: false,
        username: "",
        api_key: "",
        game_ids: {},
    });
    const [xbox, setXbox] = SP_REACT.useState({
        enabled: false,
        api_key: "",
        xuid: "",
        gamertag: "",
        ta_logged_in: false,
        title_ids: {},
    });
    const [achievementCachePolicy, setAchievementCachePolicyState] = SP_REACT.useState("daily");
    const missing = Math.max(games.length - metadataCount, 0);
    const refresh = SP_REACT.useCallback(async () => {
        await refreshMetadataCache();
        await loadGames();
        setMetadataCount(Object.keys(metadataCache).length);
        const achievementSettings = await getAchievementSettings();
        setRa(achievementSettings.retroachievements);
        setXbox(achievementSettings.xbox);
        setAchievementCachePolicyState(achievementSettings.achievement_cache?.policy || "daily");
    }, [loadGames]);
    SP_REACT.useEffect(() => {
        void refresh();
    }, [refresh]);
    const scanMissing = async () => {
        if (busy)
            return;
        setBusy(true);
        setScanMessage("");
        try {
            await startScanMissing(games);
            const interval = window.setInterval(async () => {
                const progress = await getScanProgress();
                setScanMessage(progress.current ||
                    progress.message ||
                    `${progress.completed}/${progress.total}`);
                if (!progress.running) {
                    window.clearInterval(interval);
                    await refresh();
                    setBusy(false);
                    toaster.toast({ title: t("pluginName"), body: t("scanComplete") });
                }
            }, 800);
        }
        catch (error) {
            setBusy(false);
            toaster.toast({ title: t("pluginName"), body: String(error) });
        }
    };
    const saveRaSettings = async (next) => {
        const merged = { ...ra, ...next };
        setRa(merged);
        const saved = await setRetroAchievementsSettings(merged.enabled, merged.username, merged.api_key);
        setRa(saved);
        await refreshRaSettings();
    };
    const testRaLogin = async () => {
        const saved = await setRetroAchievementsSettings(true, ra.username, ra.api_key);
        setRa(saved);
        await refreshRaSettings();
        const result = await testRetroAchievementsCredentials(saved.username, saved.api_key);
        toaster.toast({
            title: t("pluginName"),
            body: result.ok ? t("retroLoginOk") : result.message || t("retroLoginFailed"),
        });
    };
    const saveXboxSettings = async (next) => {
        const merged = { ...xbox, ...next };
        setXbox(merged);
        const saved = await setXboxSettings(merged.enabled, merged.api_key || "");
        setXbox(saved);
        await refreshRaSettings();
    };
    const saveAchievementCachePolicy = async (policy) => {
        setAchievementCachePolicyState(policy);
        const saved = await setAchievementCachePolicy(policy);
        setAchievementCachePolicyState(saved.policy || policy);
        clearAchievementsForApps(games.map((game) => game.appid));
        await refreshRaSettings();
    };
    const testXboxLogin = async () => {
        if (!xbox.api_key.trim()) {
            const saved = await setXboxSettings(true, xbox.api_key || "");
            setXbox(saved);
            await refreshRaSettings();
            toaster.toast({ title: t("pluginName"), body: t("xboxLoginNeedsProfile") });
            return;
        }
        const result = await testOpenXblCredentials(xbox.api_key || "");
        const refreshed = await getAchievementSettings();
        setXbox(refreshed.xbox);
        await refreshRaSettings();
        toaster.toast({ title: t("pluginName"), body: result.ok ? t("xboxLoginOk") : result.message || t("xboxLoginFailed") });
    };
    const openExternalUrl = (url) => {
        try {
            const steamClient = window?.SteamClient;
            if (steamClient?.System?.OpenInSystemBrowser) {
                steamClient.System.OpenInSystemBrowser(url);
                return;
            }
            if (steamClient?.Overlay?.OpenExternalBrowserURL) {
                steamClient.Overlay.OpenExternalBrowserURL(url);
                return;
            }
        }
        catch (_error) {
            // Fall back to the browser below.
        }
        window.open(url, "_blank", "noopener,noreferrer");
    };
    const openRetroAchievements = () => openExternalUrl("https://retroachievements.org/");
    const openOpenXbl = () => openExternalUrl("https://xbl.io/");
    const clearAllXboxMatches = async () => {
        if (xboxBulkBusy || busy)
            return;
        setXboxBulkBusy(true);
        try {
            const saved = await clearXboxAssociations();
            setXbox(saved);
            clearAchievementsForApps(games.map((game) => game.appid));
            await refreshRaSettings();
            setXboxBulkMessage(t("xboxClearAllDone"));
            toaster.toast({ title: t("pluginName"), body: t("xboxClearAllDone") });
        }
        finally {
            setXboxBulkBusy(false);
        }
    };
    const bulkApplyXboxAchievements = async () => {
        if (xboxBulkBusy || busy)
            return;
        if (!xbox.enabled) {
            toaster.toast({ title: t("pluginName"), body: t("xboxLoginFailed") });
            return;
        }
        const targets = games.filter((game) => isUwphookGameOption(game) && !xbox.title_ids[String(game.appid)]);
        if (!targets.length) {
            toaster.toast({ title: t("pluginName"), body: t("xboxBulkNothing") });
            return;
        }
        setXboxBulkBusy(true);
        setXboxBulkMessage(`${t("xboxBulkScanning")}: 0/${targets.length}`);
        let assigned = 0;
        let skipped = 0;
        try {
            for (let index = 0; index < targets.length; index += 1) {
                const game = targets[index];
                const prefix = `${index + 1}/${targets.length} - ${game.name}`;
                setXboxBulkMessage(`${prefix}: ${t("xboxBulkSearching")}`);
                try {
                    const results = await searchXboxTitles(game.name, 5, game.appid, false);
                    const best = results.find((item) => item.total == null || item.total > 0) || results[0];
                    if (!best || best.score < 0.82) {
                        skipped += 1;
                        setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
                        continue;
                    }
                    setXboxBulkMessage(`${prefix}: ${t("xboxBulkApplying")}`);
                    await setXboxTitleId(game.appid, best.id);
                    await setAchievementSource(game.appid, "xbox");
                    clearAchievementsForApp(game.appid);
                    const payload = await fetchAchievements(game.appid);
                    if (payload?.steam?.nTotal) {
                        applyAchievementPayload(game.appid, payload);
                        assigned += 1;
                        setXboxBulkMessage(`${prefix}: ${t("xboxBulkAppliedOne")}`);
                    }
                    else {
                        skipped += 1;
                        setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
                    }
                }
                catch (_error) {
                    skipped += 1;
                    setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
                }
            }
            const refreshed = await getAchievementSettings();
            setXbox(refreshed.xbox);
            await refreshRaSettings();
            setXboxBulkMessage(`${t("xboxBulkDone")}: ${assigned} ${t("xboxBulkApplied")}, ${skipped} ${t("xboxBulkSkipped")}`);
            toaster.toast({
                title: t("pluginName"),
                body: `${t("xboxBulkDone")}: ${assigned} ${t("xboxBulkApplied")}, ${skipped} ${t("xboxBulkSkipped")}`,
            });
        }
        finally {
            setXboxBulkBusy(false);
        }
    };
    const syncMatchedTrueAchievementsProgress = async () => {
        if (xboxBulkBusy || busy)
            return;
        if (!xbox.enabled || !xbox.api_key.trim()) {
            toaster.toast({ title: t("pluginName"), body: t("xboxSyncProgressFailed") });
            return;
        }
        const targets = games.filter((game) => isUwphookGameOption(game) && !!xbox.title_ids[String(game.appid)]);
        if (!targets.length) {
            toaster.toast({ title: t("pluginName"), body: t("xboxBulkNothing") });
            return;
        }
        setXboxBulkBusy(true);
        let synced = 0;
        let skipped = 0;
        try {
            for (let index = 0; index < targets.length; index += 1) {
                const game = targets[index];
                const prefix = `${index + 1}/${targets.length} - ${game.name}`;
                setXboxBulkMessage(`${prefix}: ${t("xboxSyncingProgress")}`);
                try {
                    const payload = await syncTrueAchievementsProgress(game.appid);
                    if (payload?.steam?.nTotal) {
                        applyAchievementPayload(game.appid, payload);
                        synced += 1;
                        setXboxBulkMessage(`${prefix}: ${t("xboxBulkAppliedOne")}`);
                    }
                    else {
                        skipped += 1;
                        setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
                    }
                }
                catch (_error) {
                    skipped += 1;
                    setXboxBulkMessage(`${prefix}: ${t("xboxBulkSkippedOne")}`);
                }
            }
            await refreshRaSettings();
            setXboxBulkMessage(`${t("xboxSyncProgressOk")}: ${synced}, ${t("xboxBulkSkipped")}: ${skipped}`);
            toaster.toast({ title: t("pluginName"), body: `${t("xboxSyncProgressOk")}: ${synced}` });
        }
        finally {
            setXboxBulkBusy(false);
        }
    };
    return (SP_JSX.jsxs(DFL.PanelSection, { children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: [t("detected"), ":"] }), " ", games.length] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: [t("saved"), ":"] }), " ", metadataCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: [t("missing"), ":"] }), " ", missing] }), busy || scanMessage ? (SP_JSX.jsxs("div", { style: inlineStatusStyle, children: [busy ? SP_JSX.jsx(DFL.Spinner, {}) : null, SP_JSX.jsx("span", { children: scanMessage || t("scanning") })] })) : null] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: spacedButtonRowStyle, children: SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || !games.length, onClick: scanMissing, children: busy ? t("scanning") : t("scanMissing") }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("retroTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: t("retroEnabled"), checked: ra.enabled, onChange: (checked) => void saveRaSettings({ enabled: checked }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroLoginHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("retroUser") }), SP_JSX.jsx(DFL.TextField, { value: ra.username, onChange: (e) => setRa((prev) => ({ ...prev, username: e.target.value })), onBlur: () => void saveRaSettings({ username: ra.username }), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("retroKey") }), SP_JSX.jsx(DFL.TextField, { value: ra.api_key, onChange: (e) => setRa((prev) => ({ ...prev, api_key: e.target.value })), onBlur: () => void saveRaSettings({ api_key: ra.api_key }), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: spacedButtonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: testRaLogin, children: t("retroLogin") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: openRetroAchievements, children: t("retroCreateAccount") })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("xboxTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: t("xboxEnabled"), checked: xbox.enabled, onChange: (checked) => void saveXboxSettings({ enabled: checked }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("xboxProfile") }), SP_JSX.jsx(DFL.TextField, { value: xbox.api_key, onChange: (e) => setXbox((prev) => ({ ...prev, api_key: e.target.value })), onBlur: () => void saveXboxSettings({ api_key: xbox.api_key }), style: fieldStyle }), xbox.ta_logged_in ? (SP_JSX.jsx("div", { style: compactTextStyle, children: xbox.gamertag ? `${t("xboxLoggedIn")}: ${xbox.gamertag}` : t("xboxLoggedIn") })) : null] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: testXboxLogin, children: t("xboxLogin") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: openOpenXbl, children: t("xboxOpenOpenXbl") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || xboxBulkBusy || !games.length, onClick: bulkApplyXboxAchievements, children: xboxBulkBusy ? t("xboxBulkScanning") : t("xboxBulkScan") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || xboxBulkBusy || !games.length || !xbox.api_key.trim(), onClick: syncMatchedTrueAchievementsProgress, children: t("xboxSyncAllProgress") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || xboxBulkBusy || !games.length, onClick: clearAllXboxMatches, children: t("xboxClearAll") }), xboxBulkBusy || xboxBulkMessage ? (SP_JSX.jsxs("div", { style: inlineStatusStyle, children: [xboxBulkBusy ? SP_JSX.jsx(DFL.Spinner, {}) : null, SP_JSX.jsx("span", { children: xboxBulkMessage })] })) : null] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("achievementCacheTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("achievementCacheHint") }), SP_JSX.jsx("div", { style: buttonRowStyle, children: achievementCachePolicies.map((policy) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void saveAchievementCachePolicy(policy), style: {
                                    opacity: achievementCachePolicy === policy ? 1 : 0.72,
                                    fontWeight: achievementCachePolicy === policy ? 700 : 400,
                                }, children: t(`achievementCache_${policy}`) }, policy))) })] }) })] }));
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
    const [raSettings, setRaSettings] = SP_REACT.useState(null);
    const [raGameId, setRaGameId] = SP_REACT.useState("");
    const [raQuery, setRaQuery] = SP_REACT.useState(appName(appId));
    const [raResults, setRaResults] = SP_REACT.useState([]);
    const [raSearching, setRaSearching] = SP_REACT.useState(false);
    const [achievementSource, setAchievementSourceState] = SP_REACT.useState("auto");
    const [xboxTitleId, setXboxTitleIdState] = SP_REACT.useState("");
    const [xboxQuery, setXboxQuery] = SP_REACT.useState(appName(appId));
    const [xboxResults, setXboxResults] = SP_REACT.useState([]);
    const [xboxSearching, setXboxSearching] = SP_REACT.useState(false);
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
        const settings = await getAchievementSettings();
        setRaSettings(settings.retroachievements);
        setRaGameId(settings.retroachievements.game_ids[String(appId)]?.toString() || "");
        setAchievementSourceState(settings.achievement_sources[String(appId)] || "auto");
        setXboxTitleIdState(settings.xbox.title_ids[String(appId)] || "");
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
            toaster.toast({ title: t("pluginName"), body: t("notNonSteam") });
            return;
        }
        const saved = await saveMetadata(appId, normalizedMetadata);
        metadataCache[String(appId)] = saved;
        applyMetadata(appId);
        toaster.toast({ title: t("pluginName"), body: t("saved") });
    };
    const search = async () => {
        setBusy(true);
        try {
            setResults(await searchMetadata(query, 8));
        }
        catch (error) {
            toaster.toast({ title: t("pluginName"), body: String(error) });
        }
        finally {
            setBusy(false);
        }
    };
    const applyResult = async (result) => {
        setBusy(true);
        try {
            const fetched = await fetchMetadata(result.slug || result.url);
            if (!fetched)
                return;
            const saved = await saveMetadata(appId, fetched);
            metadataCache[String(appId)] = saved;
            applyMetadata(appId);
            setFormMetadata(saved);
            toaster.toast({ title: t("pluginName"), body: t("saved") });
        }
        finally {
            setBusy(false);
        }
    };
    const removeCurrent = async () => {
        await removeMetadata(appId);
        delete metadataCache[String(appId)];
        setFormMetadata(metadataTemplate(appName(appId)));
        toaster.toast({ title: t("pluginName"), body: t("removeToast") });
    };
    const saveAchievementSource = async (source) => {
        await setAchievementSource(appId, source);
        setAchievementSourceState(source);
        await refreshRaSettings();
    };
    const saveRaGameId = async () => {
        const parsed = Number.parseInt(raGameId, 10);
        const ids = await setRetroAchievementsGameId(appId, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        if (Number.isFinite(parsed) && parsed > 0) {
            await saveAchievementSource("retroachievements");
        }
        setRaSettings((prev) => (prev ? { ...prev, game_ids: ids } : prev));
        toaster.toast({ title: t("pluginName"), body: t("saved") });
    };
    const testAchievements = async () => {
        const parsed = Number.parseInt(raGameId, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toaster.toast({ title: t("pluginName"), body: t("retroGameFailed") });
            return;
        }
        await setRetroAchievementsGameId(appId, parsed);
        await saveAchievementSource("retroachievements");
        await refreshRaSettings();
        const payload = await fetchAchievements(appId);
        applyAchievementPayload(appId, payload);
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("retroGameFailed"),
        });
    };
    const autoDetectAchievements = async () => {
        const details = await getAppDetails(appId);
        const launchPath = `${details?.strShortcutExe || ""} ${details?.strShortcutLaunchOptions || ""}`;
        if (!launchPath.trim()) {
            toaster.toast({ title: t("pluginName"), body: t("retroDetectFailed") });
            return;
        }
        const payload = await resolveRetroAchievementsFromPath(appId, launchPath, appName(appId));
        applyAchievementPayload(appId, payload);
        if (payload?.steam?.nTotal) {
            setRaGameId(String(payload.game_id));
            await saveAchievementSource("retroachievements");
            await refreshRaSettings();
        }
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("retroDetectFailed"),
        });
    };
    const searchAchievements = async () => {
        setRaSearching(true);
        try {
            setRaResults(await searchRetroAchievementsGames(raQuery || appName(appId), 8, appId));
        }
        catch (error) {
            toaster.toast({ title: t("pluginName"), body: String(error) });
        }
        finally {
            setRaSearching(false);
        }
    };
    const useAchievementResult = async (result) => {
        setRaGameId(String(result.id));
        const ids = await setRetroAchievementsGameId(appId, result.id);
        await saveAchievementSource("retroachievements");
        setRaSettings((prev) => (prev ? { ...prev, game_ids: ids } : prev));
        await refreshRaSettings();
        const payload = await fetchAchievements(appId);
        applyAchievementPayload(appId, payload);
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("saved"),
        });
    };
    const saveXboxMatchManual = async () => {
        const manual = xboxTitleId.trim();
        if (!manual) {
            await clearXboxMatch();
            return;
        }
        const currentSettings = await getAchievementSettings();
        await setXboxSettings(true, currentSettings.xbox.api_key || "");
        const ids = await setXboxTitleId(appId, manual);
        const nextId = ids[String(appId)] || manual;
        setXboxTitleIdState(nextId);
        await saveAchievementSource("xbox");
        await refreshRaSettings();
        const payload = await fetchAchievements(appId);
        applyAchievementPayload(appId, payload);
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("xboxGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("xboxGameFailed"),
        });
    };
    const autoDetectXboxAchievements = async () => {
        const currentSettings = await getAchievementSettings();
        await setXboxSettings(true, currentSettings.xbox.api_key || "");
        const details = await getAppDetails(appId);
        const launchPath = `${details?.strShortcutExe || ""} ${details?.strShortcutLaunchOptions || ""}`;
        const payload = await resolveXboxFromShortcut(appId, appName(appId), launchPath);
        applyAchievementPayload(appId, payload);
        if (payload?.steam?.nTotal) {
            await saveAchievementSource("xbox");
            const settings = await getAchievementSettings();
            setXboxTitleIdState(settings.xbox.title_ids[String(appId)] || "");
            await refreshRaSettings();
        }
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("xboxGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("xboxDetectFailed"),
        });
    };
    const clearXboxMatch = async () => {
        const ids = await setXboxTitleId(appId, null);
        setXboxTitleIdState(ids[String(appId)] || "");
        clearAchievementsForApp(appId);
        if (achievementSource === "xbox") {
            await saveAchievementSource("auto");
        }
        await refreshRaSettings();
        toaster.toast({ title: t("pluginName"), body: t("saved") });
    };
    const searchXbox = async () => {
        setXboxSearching(true);
        try {
            const results = await searchXboxTitles(xboxQuery || appName(appId), 12, appId, true);
            setXboxResults(results);
        }
        catch (error) {
            toaster.toast({ title: t("pluginName"), body: String(error) });
        }
        finally {
            setXboxSearching(false);
        }
    };
    const useXboxResult = async (result) => {
        const currentSettings = await getAchievementSettings();
        await setXboxSettings(true, currentSettings.xbox.api_key || "");
        const ids = await setXboxTitleId(appId, result.id);
        setXboxTitleIdState(ids[String(appId)] || result.id);
        await saveAchievementSource("xbox");
        await refreshRaSettings();
        const payload = await fetchAchievements(appId);
        applyAchievementPayload(appId, payload);
        if (!payload?.steam?.nTotal) {
            const cleared = await setXboxTitleId(appId, null);
            setXboxTitleIdState(cleared[String(appId)] || "");
            await saveAchievementSource("auto");
        }
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("xboxGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("xboxGameFailed"),
        });
    };
    const syncXboxProgress = async () => {
        const payload = await syncTrueAchievementsProgress(appId);
        applyAchievementPayload(appId, payload);
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("xboxSyncProgressOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t("xboxSyncProgressFailed"),
        });
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
    return (SP_JSX.jsx(DFL.ScrollPanel, { children: SP_JSX.jsxs("div", { style: pageStyle, children: [SP_JSX.jsxs(DFL.PanelSection, { title: `${t("pluginName")} - ${appName(appId)}`, children: [!nonSteam ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("notNonSteam") }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveCurrent, children: t("save") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: removeCurrent, children: t("remove") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => DFL.Navigation.NavigateBack(), children: t("done") })] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("searchTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: query, onChange: (e) => setQuery(e.target.value), style: { ...flexFieldStyle, minWidth: "10rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy, onClick: search, children: busy ? t("searching") : t("search") })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [busy ? SP_JSX.jsx(DFL.Spinner, {}) : null, !busy && !results.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("noResults") })) : null, results.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void applyResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsx("span", { style: compactTextStyle, children: result.description })] }) }, result.slug || result.url)))] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("source"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("title") }), SP_JSX.jsx(DFL.TextField, { value: metadata.title, onChange: (e) => setMetadata((prev) => ({ ...prev, title: e.target.value })), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("description") }), SP_JSX.jsx(DFL.Focusable, { style: { width: "100%" }, children: SP_JSX.jsx("textarea", { value: metadata.description, onChange: (e) => setMetadata((prev) => ({
                                                ...prev,
                                                description: e.target.value,
                                                short_description: e.target.value,
                                            })), style: {
                                                width: "100%",
                                                minHeight: "9rem",
                                                boxSizing: "border-box",
                                                resize: "vertical",
                                                borderRadius: 4,
                                                padding: 10,
                                                color: "white",
                                                background: "rgba(0,0,0,0.28)",
                                                border: "1px solid rgba(255,255,255,0.18)",
                                            } }) })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("developers") }), SP_JSX.jsx(DFL.TextField, { value: developerText, onChange: (e) => setDeveloperText(e.target.value), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("publishers") }), SP_JSX.jsx(DFL.TextField, { value: publisherText, onChange: (e) => setPublisherText(e.target.value), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsxs("div", { style: { ...flexFieldStyle, minWidth: "8rem" }, children: [SP_JSX.jsx("label", { children: t("releaseDate") }), SP_JSX.jsx(DFL.TextField, { value: releaseText, onChange: (e) => setReleaseText(e.target.value), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: { ...flexFieldStyle, minWidth: "7rem" }, children: [SP_JSX.jsx("label", { children: t("rating") }), SP_JSX.jsx(DFL.TextField, { value: ratingText, onChange: (e) => setRatingText(e.target.value), style: fieldStyle })] })] }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: t("categories"), children: Object.entries(CATEGORY_LABELS).map(([category, label]) => (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: label, checked: (metadata.store_categories || []).includes(Number(category)), onChange: (checked) => toggleCategory(Number(category), checked) }) }, category))) }), SP_JSX.jsxs(DFL.PanelSection, { title: t("achievementSourceTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("achievementSourceHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: buttonRowStyle, children: ["auto", "retroachievements", "xbox", "disabled"].map((source) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void saveAchievementSource(source), style: {
                                        opacity: achievementSource === source ? 1 : 0.72,
                                        fontWeight: achievementSource === source ? 700 : 400,
                                    }, children: t(`achievementSource_${source}`) }, source))) }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("retroTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: raGameId, onChange: (e) => setRaGameId(e.target.value), style: { ...flexFieldStyle, minWidth: "8rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveRaGameId, children: t("save") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: autoDetectAchievements, children: t("retroGameDetect") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: testAchievements, children: t("retroGameTest") })] }) }), raSettings && !raSettings.enabled ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: compactTextStyle, children: [t("retroEnabled"), ": Off"] }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroGameSearchHint") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: raQuery, onChange: (e) => setRaQuery(e.target.value), style: { ...flexFieldStyle, minWidth: "10rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: raSearching, onClick: searchAchievements, children: raSearching ? t("searching") : t("retroGameSearch") })] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [raSearching ? SP_JSX.jsx(DFL.Spinner, {}) : null, !raSearching && !raResults.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroGameNoMatches") })) : null, raResults.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void useAchievementResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsxs("span", { style: compactTextStyle, children: [result.console ? `${result.console} - ` : "", Math.round(result.score * 100), "% match"] })] }) }, result.id)))] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("xboxPerGameTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxCurrentMatch") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: xboxTitleId, onChange: (e) => setXboxTitleIdState(e.target.value), style: { ...flexFieldStyle, minWidth: "18rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveXboxMatchManual, children: t("save") })] }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: autoDetectXboxAchievements, children: t("xboxGameDetect") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: !xboxTitleId, onClick: syncXboxProgress, children: t("xboxSyncProgress") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: clearXboxMatch, children: t("xboxClearMatch") })] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxGameSearchHint") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: xboxQuery, onChange: (e) => setXboxQuery(e.target.value), style: { ...flexFieldStyle, minWidth: "10rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: xboxSearching, onClick: searchXbox, children: xboxSearching ? t("searching") : t("xboxGameSearch") })] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: resultsStackStyle, children: [xboxSearching ? SP_JSX.jsx(DFL.Spinner, {}) : null, !xboxSearching && !xboxResults.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxGameNoMatches") })) : null, xboxResults.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void useXboxResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsxs("span", { style: compactTextStyle, children: [Math.round(result.score * 100), "% match", result.unlocked != null && result.total != null
                                                            ? ` - ${result.unlocked}/${result.total}`
                                                            : "", result.gamerscore != null ? ` - ${result.gamerscore}G` : "", ` - ${result.source || "TrueAchievements"} - ${result.id}`] })] }) }, result.id)))] }) })] })] }) }));
};

const ENTRY_KEY = "playhub-metadata-edit";
const resolveLibraryContextMenu = () => {
    const owningModule = DFL.findModuleByExport((member) => typeof member?.toString === "function" &&
        member.toString().includes("().LibraryContextMenu"));
    const menuComponent = Object.values(owningModule).find((member) => typeof member?.toString === "function" &&
        member.toString().includes("navigator:"));
    return DFL.fakeRenderComponent(menuComponent).type;
};
const LibraryContextMenu = resolveLibraryContextMenu();
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
const isGameContextMenu = (items) => {
    if (!Array.isArray(items) || items.length === 0)
        return false;
    return !!DFL.findInReactTree(items, (node) => node?.props?.onSelected?.toString?.().includes("launchSource"));
};
const removeOurEntry = (items) => {
    const existingIndex = items.findIndex((node) => node?.key === ENTRY_KEY);
    if (existingIndex !== -1)
        items.splice(existingIndex, 1);
};
const insertOurEntry = (items, appId) => {
    if (!isNonSteamApp(getOverview(appId)))
        return;
    const propertiesIndex = items.findIndex((node) => DFL.findInReactTree(node, (x) => x?.onSelected?.toString?.().includes("AppProperties")));
    const insertAt = propertiesIndex >= 0 ? propertiesIndex : items.length;
    items.splice(insertAt, 0, SP_JSX.jsx(DFL.MenuItem, { onSelected: () => DFL.Navigation.Navigate(`/playhub-metadata/${appId}`), children: t("editMetadata") }, ENTRY_KEY));
};
const syncOurEntry = (items, appId) => {
    removeOurEntry(items);
    insertOurEntry(items, resolveAppId(items, appId));
};
const contextMenuPatch = (LibraryContextMenuClass) => {
    let innerPatch;
    const outerPatch = DFL.afterPatch(LibraryContextMenuClass.prototype, "render", (_renderArgs, menu) => {
        const ownerAppId = Number(menu?._owner?.pendingProps?.overview?.appid ?? 0);
        const appId = ownerAppId || resolveAppId(menu?.props?.children ?? [], 0);
        if (!innerPatch) {
            innerPatch = DFL.afterPatch(menu, "type", (_typeArgs, rendered) => {
                DFL.afterPatch(rendered.type.prototype, "render", (_args, output) => {
                    const items = output?.props?.children?.[0];
                    if (isGameContextMenu(items)) {
                        try {
                            syncOurEntry(items, appId);
                        }
                        catch (_error) {
                        }
                    }
                    return output;
                });
                DFL.afterPatch(rendered.type.prototype, "shouldComponentUpdate", ([nextProps], shouldUpdate) => {
                    try {
                        removeOurEntry(nextProps.children);
                        if (shouldUpdate === true) {
                            syncOurEntry(nextProps.children, appId);
                        }
                    }
                    catch (_error) {
                    }
                    return shouldUpdate;
                });
                return rendered;
            });
        }
        else if (Array.isArray(menu?.props?.children)) {
            try {
                syncOurEntry(menu.props.children, appId);
            }
            catch (_error) {
            }
        }
        return menu;
    });
    return {
        unpatch: () => {
            outerPatch?.unpatch();
            innerPatch?.unpatch();
        },
    };
};

const METADATA_ROUTE = "/playhub-metadata/:appid";
var index = DFL.definePlugin(() => {
    void refreshMetadataCache();
    void refreshRaSettings();
    const unpatchSteam = installSteamPatches();
    const stopMetadataBootstrap = startMetadataBootstrap();
    const menuPatch = contextMenuPatch(LibraryContextMenu);
    routerHook.addRoute(METADATA_ROUTE, () => SP_JSX.jsx(MetadataPage, {}), { exact: true });
    routerHook.addRoute(PLAYHUB_ACHIEVEMENTS_ROUTE, () => SP_JSX.jsx(PlayhubAchievementsRoute, {}), { exact: true });
    return {
        name: t("pluginName"),
        titleView: SP_JSX.jsx("div", { className: DFL.staticClasses.Title, children: t("pluginName") }),
        content: SP_JSX.jsx(Content, {}),
        icon: SP_JSX.jsx(FaDatabase, {}),
        onDismount() {
            try {
                menuPatch?.unpatch?.();
            }
            catch (error) {
                console.error("[Playhub Metadata] context menu unpatch failed", error);
            }
            try {
                stopMetadataBootstrap?.();
            }
            catch (error) {
                console.error("[Playhub Metadata] metadata bootstrap stop failed", error);
            }
            try {
                unpatchSteam?.();
            }
            catch (error) {
                console.error("[Playhub Metadata] Steam unpatch failed", error);
            }
            try {
                routerHook.removeRoute(METADATA_ROUTE);
                routerHook.removeRoute(PLAYHUB_ACHIEVEMENTS_ROUTE);
            }
            catch (error) {
                console.error("[Playhub Metadata] route remove failed", error);
            }
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
