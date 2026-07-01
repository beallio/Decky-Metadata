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
const clearMetadataCache = callable("clear_metadata_cache");
const frontendLog = callable("frontend_log");
const searchMetadata = callable("search_metadata");
const fetchMetadata = callable("fetch_metadata");
const autoFetchMetadata = callable("auto_fetch_metadata");
const enrichSteamApp = callable("enrich_steam_app");
const enrichCommunityMedia = callable("enrich_community_media");
const startScanMissing = callable("start_scan_missing");
const getScanProgress = callable("get_scan_progress");
const startRefreshSteamActivities = callable("start_refresh_steam_activities");
const getActivityRefreshProgress = callable("get_activity_refresh_progress");
const getLocalShortcuts = callable("get_local_shortcuts");
const getPlatformCapabilities = callable("get_platform_capabilities");
const getDebugLogging = callable("get_debug_logging");
const setDebugLogging = callable("set_debug_logging");
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
    clearMetadataCache: clearMetadataCache,
    clearXboxAssociations: clearXboxAssociations,
    enrichCommunityMedia: enrichCommunityMedia,
    enrichSteamApp: enrichSteamApp,
    fetchAchievements: fetchAchievements,
    fetchMetadata: fetchMetadata,
    frontendLog: frontendLog,
    getAchievementSettings: getAchievementSettings,
    getActivityRefreshProgress: getActivityRefreshProgress,
    getAllMetadata: getAllMetadata,
    getDebugLogging: getDebugLogging,
    getLocalShortcuts: getLocalShortcuts,
    getMetadata: getMetadata,
    getPlatformCapabilities: getPlatformCapabilities,
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
    setDebugLogging: setDebugLogging,
    setRetroAchievementsGameId: setRetroAchievementsGameId,
    setRetroAchievementsSettings: setRetroAchievementsSettings,
    setXboxSettings: setXboxSettings,
    setXboxTitleId: setXboxTitleId,
    startRefreshSteamActivities: startRefreshSteamActivities,
    startScanMissing: startScanMissing,
    syncTrueAchievementsProgress: syncTrueAchievementsProgress,
    testOpenXblCredentials: testOpenXblCredentials,
    testRetroAchievementsCredentials: testRetroAchievementsCredentials
});

const STRINGS = {
    en: {
        pluginName: "Playhub Metadata",
        scanMissing: "Scan metadata",
        refreshActivities: "Refresh Activity",
        refreshingActivities: "Refreshing Activity...",
        activityRefreshComplete: "Activity refresh complete",
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
        steamLinks: "Steam",
        steamStorePage: "Store Page",
        steamCommunityHub: "Community Hub",
        steamDiscussions: "Discussions",
        steamGuides: "Guides",
        steamAppIdLabel: "Steam App ID",
        steamAppIdDescription: "Paste a Steam app ID, Store URL, Community URL, or SteamDB URL. Leave empty to clear the pinned Steam match.",
        steamAppIdApply: "Apply Steam App ID",
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
        retroDetectNoCandidate: "No ROM path was detected from this Steam shortcut. Use manual RetroAchievements search or check the launch options.",
        retroDetectCandidateMissing: "The detected ROM path does not exist. Check the shortcut launch options or pick the game manually.",
        retroDetectUnsupportedExtension: "The detected path is not a supported ROM file. Use manual RetroAchievements search or check the shortcut target.",
        retroDetectHashNotFound: "No RetroAchievements game matched the detected ROM. Search manually and pick the closest entry.",
        retroDetectCredentialsMissing: "Add your RetroAchievements username and API key before auto-detecting achievements.",
        retroDetectApiError: "RetroAchievements lookup failed. Try again later or search manually.",
        retroDetectManualMapping: "This game already has a RetroAchievements game ID. Manual selection was kept.",
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
        xboxSyncProgressOk: "Progress synced",
        xboxSyncProgressFailed: "No progress found. Check the selected Xbox match.",
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
        cacheTitle: "Metadata cache",
        cacheHint: "Clear cached Steam matches and metadata so games re-fetch and re-match.",
        clearCache: "Clear cache",
        clearCacheDone: "Metadata cache cleared",
        diagnosticsTitle: "Diagnostics",
        diagnosticsShowPlatform: "Platform",
        diagnosticsHidePlatform: "Hide platform",
        diagnosticsYes: "Yes",
        diagnosticsNo: "No",
        platformLabel: "Platform",
        platformSteamOS: "SteamOS",
        platformSteamRoot: "Steam root",
        platformSupports: "Capabilities",
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
        backgroundSyncStarted: "Progress sync started",
        backgroundSyncFinished: "Progress sync finished",
        backgroundSyncUpdated: "updated",
        backgroundSyncSkipped: "skipped",
        backgroundSyncFailed: "Progress sync failed",
        notNonSteam: "This plugin only changes non-Steam games.",
        xboxAutoScanUnsupported: "Xbox automatic scanning is Windows-only because it depends on UWPHook/Xbox App shortcuts. Manual OpenXBL title mapping is still available.",
    },
    it: {
        pluginName: "Playhub Metadata",
        scanMissing: "Scansiona metadata",
        refreshActivities: "Aggiorna attività",
        refreshingActivities: "Aggiornamento attività...",
        activityRefreshComplete: "Aggiornamento attività completato",
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
        steamLinks: "Steam",
        steamStorePage: "Store Page",
        steamCommunityHub: "Community Hub",
        steamDiscussions: "Discussions",
        steamGuides: "Guides",
        steamAppIdLabel: "ID app Steam",
        steamAppIdDescription: "Incolla un ID app Steam, URL dello Store, URL Community o URL SteamDB. Lascia vuoto per cancellare il match Steam fissato.",
        steamAppIdApply: "Applica ID app Steam",
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
        retroDetectNoCandidate: "Nessun percorso ROM rilevato dal collegamento Steam. Usa la ricerca manuale RetroAchievements o controlla le opzioni di avvio.",
        retroDetectCandidateMissing: "Il percorso ROM rilevato non esiste. Controlla le opzioni di avvio o scegli il gioco manualmente.",
        retroDetectUnsupportedExtension: "Il percorso rilevato non e un file ROM supportato. Usa la ricerca manuale RetroAchievements o controlla il collegamento.",
        retroDetectHashNotFound: "Nessun gioco RetroAchievements corrisponde alla ROM rilevata. Cerca manualmente e scegli la voce piu vicina.",
        retroDetectCredentialsMissing: "Aggiungi username e API key RetroAchievements prima del rilevamento automatico.",
        retroDetectApiError: "Ricerca RetroAchievements non riuscita. Riprova piu tardi o cerca manualmente.",
        retroDetectManualMapping: "Questo gioco ha gia un ID RetroAchievements. La selezione manuale e stata mantenuta.",
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
        xboxSyncProgressOk: "Progressi sincronizzati",
        xboxSyncProgressFailed: "Nessun progresso trovato. Controlla il match Xbox selezionato.",
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
        cacheTitle: "Cache metadata",
        cacheHint: "Cancella i match Steam e i metadata salvati per farli scaricare e abbinare di nuovo.",
        clearCache: "Cancella cache",
        clearCacheDone: "Cache metadata cancellata",
        diagnosticsTitle: "Diagnostica",
        diagnosticsShowPlatform: "Piattaforma",
        diagnosticsHidePlatform: "Nascondi piattaforma",
        diagnosticsYes: "Sì",
        diagnosticsNo: "No",
        platformLabel: "Piattaforma",
        platformSteamOS: "SteamOS",
        platformSteamRoot: "Cartella Steam",
        platformSupports: "Funzionalità",
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
        backgroundSyncStarted: "Sincronizzazione progressi avviata",
        backgroundSyncFinished: "Sincronizzazione completata",
        backgroundSyncUpdated: "aggiornati",
        backgroundSyncSkipped: "saltati",
        backgroundSyncFailed: "Sincronizzazione progressi fallita",
        notNonSteam: "Questo plugin modifica solo i giochi non Steam.",
        xboxAutoScanUnsupported: "La scansione automatica Xbox è disponibile solo su Windows perché dipende dai collegamenti UWPHook/Xbox App. L'associazione manuale dei titoli OpenXBL è ancora disponibile.",
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

let verbose = false;
const setVerboseLogging = (enabled) => {
    verbose = !!enabled;
};
const prefix = (area) => `[Playhub Metadata][${area}]`;
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

const patchInstallStatus = {
    achievements: "pending",
    activity: "pending",
    partnerEvents: "pending",
    contextMenu: "pending",
    router: "pending"
};
const hasSteamInternals = () => !!globalThis.SteamClient && typeof appStore !== "undefined" && !!appStore && typeof appDetailsStore !== "undefined" && !!appDetailsStore;
const hasAchievementProgressCache = () => typeof appAchievementProgressCache !== "undefined" && !!appAchievementProgressCache;
const hasActivityStore = () => !!globalThis.appActivityStore;
const metadataCache = {};
const achievementsCache = {};
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
let lastObservedGameDetailAppId = 0;
let backgroundAchievementSyncTimer;
let backgroundAchievementSyncRunning = false;
const BACKGROUND_SYNC_CHECK_MS = 60 * 1000;
const BACKGROUND_SYNC_INITIAL_DELAY_MS = 20 * 1000;
const BACKGROUND_SYNC_LOCAL_PREFIX = "playhub-metadata:bg-achievement-sync:last";
const BACKGROUND_SYNC_SESSION_KEY = "playhub-metadata:bg-achievement-sync:pc-session";
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
    const location = steamRouter?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
    const windowLocation = globalThis.window?.location;
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
            warn("bridge", "metadata bootstrap failed", error);
        }
        attempts += 1;
        if (!cancelled && attempts < 24) {
            window.setTimeout(tick, 500);
        }
    };
    void tick();
    const stopAchievementSync = startBackgroundAchievementSync();
    return () => {
        cancelled = true;
        stopAchievementSync?.();
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
const PLAYHUB_COMMUNITY_YOUTUBE_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_IGN_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_RAWG_ICON = "data:image/png;base64,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";
const playhubCommunityProviderIcon = (source) => {
    const cleanSource = String(source || "").trim().toLowerCase();
    if (cleanSource.includes("youtube"))
        return PLAYHUB_COMMUNITY_YOUTUBE_ICON;
    if (cleanSource.includes("rawg"))
        return PLAYHUB_COMMUNITY_RAWG_ICON;
    return PLAYHUB_COMMUNITY_IGN_ICON;
};
const playhubCommunityCreator = (source, avatar) => ({
    steamid: "76561197960287930",
    name: source || "Playhub Metadata",
    avatar,
    avatar_url: avatar,
    avatar_medium: avatar,
    avatar_full: avatar,
    avatarFullURL: avatar,
});
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
    // Keep Steam news out of the Community tab. News belongs to Activity, while
    // Community should stay screenshots/videos/community-style media only.
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
    const providerIconUrl = playhubCommunityProviderIcon(item.source);
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
            avatar: providerIconUrl,
            avatar_url: providerIconUrl,
            creator_avatar_url: providerIconUrl,
            author_avatar_url: providerIconUrl,
            owner_avatar_url: providerIconUrl,
            creator: playhubCommunityCreator("YouTube", providerIconUrl),
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
        avatar: providerIconUrl,
        avatar_url: providerIconUrl,
        creator_avatar_url: providerIconUrl,
        author_avatar_url: providerIconUrl,
        owner_avatar_url: providerIconUrl,
        creator: playhubCommunityCreator(item.source || "IGN", providerIconUrl),
        time_created: Math.floor(Date.now() / 1000) - index * 60,
        votes_up: 0,
        votes_down: 0,
        num_comments_public: 0,
    };
});
const playhubActivityId = (appId, index, date) => `playhub-activity-${appId}-${date || 0}-${index}`;
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
    const eventType = normalizePlayhubSteamActivityType(news.event_type || news.type);
    const eventTags = playhubSteamActivityTypeTags(eventType);
    const eventLabel = playhubSteamActivityTypeLabel(eventType);
    const rawBody = steamNewsRawBodyForModal(news.raw_body || news.body || news.summary || "");
    const summary = eventType === 12 ? "" : cleanSteamNewsDisplayText(news.summary || news.title || "");
    const title = cleanSteamNewsDisplayText(news.title || metadata.title || "Steam news");
    const url = news.url || metadata.steam_store_url || "";
    const id = playhubActivityId(appId, index, date);
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
    await ensureMetadataCache();
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
const PLAYHUB_SUPPORTED_STEAM_ACTIVITY_TYPES = new Set([12, 13, 14, 15, 23, 24, 25, 28, 35]);
const PLAYHUB_STEAM_ACTIVITY_TYPE_LABELS = {
    12: "Aggiornamento minore / Note della patch",
    13: "Aggiornamento standard",
    14: "Aggiornamento importante",
    15: "Pubblicazione contenuti scaricabili",
    23: "Evento: bottino",
    24: "Evento: vantaggi",
    25: "Evento: sfida",
    28: "Notizie",
    35: "Evento nel gioco",
};
const PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS = {
    12: ["patchnotes", "update", "playhub_metadata"],
    13: ["update", "playhub_metadata"],
    14: ["majorupdate", "update", "playhub_metadata"],
    15: ["dlc", "release", "playhub_metadata"],
    23: ["loot", "event", "playhub_metadata"],
    24: ["perks", "event", "playhub_metadata"],
    25: ["challenge", "event", "playhub_metadata"],
    28: ["news", "playhub_metadata"],
    35: ["ingame", "event", "playhub_metadata"],
};
const normalizePlayhubSteamActivityType = (value) => {
    const type = Number(value || 0) || STEAM_PARTNER_EVENT_TYPE_NEWS;
    return PLAYHUB_SUPPORTED_STEAM_ACTIVITY_TYPES.has(type) ? type : STEAM_PARTNER_EVENT_TYPE_NEWS;
};
const playhubSteamActivityTypeLabel = (type) => PLAYHUB_STEAM_ACTIVITY_TYPE_LABELS[type] || "Notizie";
const playhubSteamActivityTypeTags = (type) => PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS[type] || PLAYHUB_STEAM_ACTIVITY_TYPE_TAGS[28];
const PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY = "__playhubNativeActivityCache";
const PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY = "__playhubNativePartnerEvents";
const PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY = "__playhubNativePartnerEventStore";
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
const playhubNativeActivityCache = () => {
    const host = globalThis;
    if (!host[PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY])
        host[PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY] = new Map();
    return host[PLAYHUB_NATIVE_ACTIVITY_WINDOW_KEY];
};
const playhubNativePartnerEventCache = () => {
    const host = globalThis;
    if (!host[PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY])
        host[PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY] = new Map();
    return host[PLAYHUB_NATIVE_PARTNER_EVENTS_WINDOW_KEY];
};
const uniqueNonEmptyStrings = (values) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
const playhubNativePartnerEventKeys = (event) => {
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
const playhubNativePartnerEventStore = () => globalThis[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY] || null;
const collectNativePartnerEventStores = () => {
    const host = globalThis;
    const stores = [];
    const add = (candidate) => {
        if (!candidate || typeof candidate !== "object")
            return;
        const looksLikeStore = typeof candidate.GetClanEventModel === "function" ||
            typeof candidate.GetClanEventFromAnnouncementGID === "function" ||
            typeof candidate.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
            candidate.m_mapExistingEvents?.set;
        if (looksLikeStore && !stores.includes(candidate))
            stores.push(candidate);
    };
    // Steam currently exposes multiple PartnerEvent stores. The Activity cards can
    // render from our custom event object, but the modal uses the native
    // window.partnerEventStore (`r(57016).IB`). Earlier builds sometimes patched the
    // base/summary store instead, which made the modal open but stay blurred/empty.
    add(host.partnerEventStore);
    add(host.g_PartnerEventStore);
    add(host.g_PartnerEventSummaryStore);
    add(host[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY]);
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
        host[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY] = stores[0];
    return stores;
};
const registerPlayhubNativePartnerEventInSteamStore = (event, partnerStore) => {
    const store = partnerStore || playhubNativePartnerEventStore();
    if (!store || !event)
        return;
    const keys = playhubNativePartnerEventKeys(event);
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
const rememberPlayhubNativePartnerEvent = (event) => {
    const cache = playhubNativePartnerEventCache();
    playhubNativePartnerEventKeys(event).forEach((key) => cache.set(String(key), event));
    const stores = collectNativePartnerEventStores();
    if (stores.length)
        stores.forEach((store) => registerPlayhubNativePartnerEventInSteamStore(event, store));
    else
        registerPlayhubNativePartnerEventInSteamStore(event);
};
const clonePlayhubNativePartnerEventForRoute = (event, requestedKey) => {
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
const playhubNativePartnerEventForGid = (value, cloneForRoute = false) => {
    const raw = String(value || "").trim();
    const gid = numericSteamNewsGid(raw);
    const cache = playhubNativePartnerEventCache();
    const event = (raw && cache.get(raw)) || (gid && (cache.get(String(gid)) || cache.get(`old_announce_${gid}`))) || null;
    return cloneForRoute ? clonePlayhubNativePartnerEventForRoute(event, raw || gid) : event;
};
const makePlayhubNativePartnerEvent = (appId, steamAppId, item, index) => {
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
    const type = normalizePlayhubSteamActivityType(item.event_type || item.type);
    const isPatchNote = type === 12;
    const eventLabel = playhubSteamActivityTypeLabel(type);
    const eventTags = playhubSteamActivityTypeTags(type);
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
        __playhubNativePartnerEvent: true,
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
    rememberPlayhubNativePartnerEvent(partnerEvent);
    return partnerEvent;
};
const makePlayhubNativeActivityEvent = (appId, metadata, item, index) => {
    const steamAppId = Number(metadata.steam_appid || item.appid || appId) || appId;
    const partnerEvent = makePlayhubNativePartnerEvent(appId, steamAppId, item, index);
    const date = Number(partnerEvent.postTime || 0) || Math.floor(Date.now() / 1000) - index * 60;
    const gid = numericSteamNewsGid(partnerEvent.GID || item.url) || String(date);
    const actor = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
    return {
        __playhubNativeActivityEvent: true,
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
const makePlayhubNativeActivity = (appId, metadata) => {
    const items = steamActivityNewsItemsFromMetadata(appId, metadata)
        .filter((item) => numericSteamNewsGid(item.gid || item.news_id || item.announcement_gid || item.id || item.url));
    if (!items.length)
        return null;
    const events = items
        .map((item, index) => makePlayhubNativeActivityEvent(appId, metadata, item, index))
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
        __playhubNativeActivity: true,
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
const getPlayhubNativeActivityForApp = (appId) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    const cached = playhubNativeActivityCache().get(appId);
    if (cached)
        return cached;
    const metadata = metadataCache[String(appId)];
    if (!metadata)
        return null;
    const native = makePlayhubNativeActivity(appId, metadata);
    if (native)
        playhubNativeActivityCache().set(appId, native);
    return native;
};
const refreshPlayhubNativeActivityForApp = async (appId, store) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    await ensureMetadataCache();
    let metadata = metadataCache[String(appId)];
    if (!metadata)
        return null;
    const native = metadata ? makePlayhubNativeActivity(appId, metadata) : null;
    if (!native)
        return null;
    playhubNativeActivityCache().set(appId, native);
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
        if (!store || store.__playhubNativeActivityPatched)
            return !!store?.__playhubNativeActivityPatched;
        try {
            store.__playhubNativeActivityPatched = true;
            unpatchers.push(patchMethod(store, "GetAppActivity", (_thisValue, original, args) => {
                const appId = Number(args[0]);
                const native = getPlayhubNativeActivityForApp(appId);
                if (native)
                    return native;
                if (appId && isNonSteamApp(getOverview(appId))) {
                    void refreshPlayhubNativeActivityForApp(appId, store);
                }
                return original(...args);
            }));
            for (const methodName of ["RequestRestoreActivity", "RestoreActivity", "FetchLatestActivity", "FetchLatestActivityFromServer", "FetchActivityHistory"]) {
                if (typeof store[methodName] !== "function")
                    continue;
                unpatchers.push(patchMethod(store, methodName, (_thisValue, original, args) => {
                    const appId = Number(args[0]);
                    const native = getPlayhubNativeActivityForApp(appId);
                    if (native)
                        return methodName.includes("History") || methodName.includes("Server") || methodName.includes("Restore") ? Promise.resolve(native) : undefined;
                    if (appId && isNonSteamApp(getOverview(appId))) {
                        void refreshPlayhubNativeActivityForApp(appId, store);
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
        globalThis[PLAYHUB_NATIVE_PARTNER_STORE_WINDOW_KEY] = partnerStore;
        for (const event of playhubNativePartnerEventCache().values())
            registerPlayhubNativePartnerEventInSteamStore(event, partnerStore);
        if (partnerStore.__playhubNativePartnerEventsPatched || patchedStores.has(partnerStore))
            return true;
        partnerStore.__playhubNativePartnerEventsPatched = true;
        patchedStores.add(partnerStore);
        const maybePatch = (methodName, handler) => {
            if (typeof partnerStore[methodName] !== "function")
                return;
            unpatchers.push(patchMethod(partnerStore, methodName, (_thisValue, original, args) => handler(original, args)));
        };
        maybePatch("GetClanEventFromAnnouncementGID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], false);
            return event || original(...args);
        });
        maybePatch("BHasClanAnnouncementGID", (original, args) => {
            if (playhubNativePartnerEventForGid(args[0]))
                return true;
            return original(...args);
        });
        maybePatch("GetClanEventGIDFromAnnouncementGID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], false);
            return event?.GID || original(...args);
        });
        maybePatch("GetClanEventModel", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], true);
            return event || original(...args);
        });
        maybePatch("BHasClanEventModel", (original, args) => {
            if (playhubNativePartnerEventForGid(args[0]))
                return true;
            return original(...args);
        });
        maybePatch("GetClanEventGIDs", (original, args) => {
            const originalResult = original(...args) || [];
            const accountId = args[0]?.GetAccountID?.();
            const playhubGids = Array.from(playhubNativePartnerEventCache().values())
                .filter((event) => !accountId || event?.clanSteamID?.GetAccountID?.() === accountId)
                .map((event) => event?.GID)
                .filter(Boolean);
            return Array.from(new Set([...originalResult, ...playhubGids]));
        });
        maybePatch("GetClanEventGIDsForApp", (original, args) => {
            const appId = Number(args[0]);
            const originalResult = original(...args) || [];
            const playhubGids = Array.from(playhubNativePartnerEventCache().values())
                .filter((event) => Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId)
                .map((event) => event?.GID)
                .filter(Boolean);
            return Array.from(new Set([...originalResult, ...playhubGids]));
        });
        maybePatch("GetRankedClanEvents", (original, args) => {
            const originalResult = original(...args) || [];
            const clanAccountId = args[0]?.GetAccountID?.();
            const appId = Number(args[1] || 0);
            const playhubEvents = Array.from(playhubNativePartnerEventCache().values()).filter((event) => {
                const clanMatches = !clanAccountId || event?.clanSteamID?.GetAccountID?.() === clanAccountId;
                const appMatches = !appId || Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId;
                return clanMatches && appMatches;
            });
            return Array.from(new Map([...originalResult, ...playhubEvents].map((event) => [String(event?.GID || event?.AnnouncementGID), event])).values());
        });
        maybePatch("LoadPartnerEventFromAnnoucementGID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], false);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventFromAnnoucementGIDAndClanSteamID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[1] || args[0], false);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventFromClanEventGID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], true);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventFromClanEventGIDAndClanSteamID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[1] || args[0], true);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadPartnerEventGeneric", (original, args) => {
            // Real Steam signature is (clanSteamID, appid, eventGID, announcementGID, ...).
            const requestKey = args.find((arg) => playhubNativePartnerEventForGid(arg));
            const event = playhubNativePartnerEventForGid(requestKey, !!args[2]);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadHiddenPartnerEvent", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], true);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadHiddenPartnerEventByAnnouncementGID", (original, args) => {
            const event = playhubNativePartnerEventForGid(args[0], false);
            if (event)
                return Promise.resolve(event);
            return original(...args);
        });
        maybePatch("LoadAdjacentPartnerEvents", (original, args) => {
            const requestedId = args[0];
            const appId = Number(args[2] || 0);
            const direct = playhubNativePartnerEventForGid(requestedId, true);
            if (direct)
                return Promise.resolve([direct]);
            const appEvents = Array.from(playhubNativePartnerEventCache().values()).filter((event) => {
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
                const event = playhubNativePartnerEventForGid(gid, true);
                if (event)
                    hits.push(event);
                else
                    missingEventGids.push(gid);
            });
            announcementGids.forEach((gid) => {
                const event = playhubNativePartnerEventForGid(gid, false);
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
            const event = playhubNativePartnerEventForGid(args[1] || args[0]);
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
    if (lastObservedGameDetailAppId)
        return lastObservedGameDetailAppId;
    const titleAppId = appIdFromVisibleMetadataTitle();
    if (titleAppId)
        return titleAppId;
    const domAppId = appIdFromDom();
    if (domAppId && (metadataCache[String(domAppId)] || isNonSteamAppWithoutPatchedMethod(getOverview(domAppId))))
        return domAppId;
    return domAppId || 0;
};
const isTransparentColor = (value) => {
    const color = String(value || "").trim().toLowerCase();
    return !color || color === "transparent" || color === "rgba(0, 0, 0, 0)" || color === "rgba(0,0,0,0)";
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
const textOf = (element) => String(element?.textContent || "").replace(/\s+/g, " ").trim();
const isPlayhubActivityNewsElement = (element) => !!(element instanceof HTMLElement && element.closest("#playhub-activity-news-root, #playhub-activity-news-overlay, [data-playhub-activity-news='1']"));
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
const knownDetailsTabLabels = ["Attività", "Activity", "I tuoi articoli", "Your Stuff", "Comunità", "Community", "Informazioni sul gioco", "Game Info"];
const normalizedTabText = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("it-IT");
const canonicalDetailsTabLabel = (label) => {
    const normalized = normalizedTabText(label);
    if (normalized === normalizedTabText("Activity"))
        return "Attività";
    if (normalized === normalizedTabText("Your Stuff"))
        return "I tuoi articoli";
    if (normalized === normalizedTabText("Community"))
        return "Comunità";
    if (normalized === normalizedTabText("Game Info"))
        return "Informazioni sul gioco";
    return label;
};
const detailsTabLabelFromText = (value) => {
    const text = normalizedTabText(value);
    if (!text)
        return "";
    for (const label of knownDetailsTabLabels) {
        if (text === normalizedTabText(label))
            return canonicalDetailsTabLabel(label);
    }
    // Steam sometimes wraps the label with focus helpers / counters. Accept a
    // short containing text, but avoid the full tab row because it contains every
    // label and would otherwise always resolve to Activity.
    for (const label of knownDetailsTabLabels) {
        const wanted = normalizedTabText(label);
        if (text.includes(wanted) && text.length <= wanted.length + 28)
            return canonicalDetailsTabLabel(label);
    }
    return "";
};
const detailsTabLabelFromElement = (element) => {
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
        const directLabel = detailsTabLabelFromText(textOf(current));
        if (directLabel)
            return directLabel;
        const ariaLabel = detailsTabLabelFromText(current.getAttribute("aria-label") || current.getAttribute("title") || "");
        if (ariaLabel)
            return ariaLabel;
        current = current.parentElement;
    }
    return "";
};
const tabCandidateText = (element) => {
    const text = textOf(element);
    // Steam sometimes puts helper text/counters inside focus wrappers. We only need
    // short visible labels for geometry grouping, not the localized wording.
    if (text.length > 96)
        return "";
    return text;
};
const elementDepth = (element) => {
    let depth = 0;
    let current = element?.parentElement || null;
    while (current && current !== document.body) {
        depth += 1;
        current = current.parentElement;
    }
    return depth;
};
const uniqueVisibleElements = (elements) => {
    const out = [];
    for (const element of elements) {
        if (!(element instanceof HTMLElement) || !visibleElement(element))
            continue;
        if (out.some((existing) => existing === element))
            continue;
        out.push(element);
    }
    return out;
};
const tabLikeElement = (element) => {
    if (isPlayhubActivityNewsElement(element))
        return false;
    const rect = element.getBoundingClientRect();
    const text = tabCandidateText(element);
    if (!text)
        return false;
    if (rect.width < 34 || rect.width > Math.min(420, window.innerWidth * 0.45))
        return false;
    if (rect.height < 18 || rect.height > 82)
        return false;
    if (rect.top < window.innerHeight * 0.18 || rect.top > window.innerHeight * 0.58)
        return false;
    if (rect.left < 0 || rect.right > window.innerWidth + 8)
        return false;
    // Avoid the big Play button / header stats row. The details tab strip is below
    // the hero/header controls and is usually centered around the page content.
    if (rect.top < 220 && window.innerHeight > 850)
        return false;
    return true;
};
const dedupeNestedTabCandidates = (elements) => {
    const sorted = elements.slice().sort((a, b) => elementDepth(b) - elementDepth(a));
    const kept = [];
    for (const element of sorted) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const duplicate = kept.some((other) => {
            const otherRect = other.getBoundingClientRect();
            const otherCenterX = otherRect.left + otherRect.width / 2;
            const otherCenterY = otherRect.top + otherRect.height / 2;
            return Math.abs(centerX - otherCenterX) < 18 && Math.abs(centerY - otherCenterY) < 14;
        });
        if (!duplicate)
            kept.push(element);
    }
    return kept;
};
const groupTabCandidatesByRow = (elements) => {
    const rows = [];
    const sorted = elements.slice().sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.top - br.top || ar.left - br.left;
    });
    for (const element of sorted) {
        const rect = element.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const row = rows.find((candidate) => {
            const firstRect = candidate[0].getBoundingClientRect();
            const firstCenterY = firstRect.top + firstRect.height / 2;
            return Math.abs(centerY - firstCenterY) <= 18;
        });
        if (row)
            row.push(element);
        else
            rows.push([element]);
    }
    return rows
        .map((row) => row.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left))
        .filter((row) => row.length >= 3);
};
const scoreTabRow = (row) => {
    const rects = row.map((element) => element.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const width = right - left;
    const height = bottom - top;
    const selectedBonus = row.some((element) => elementLooksSelected(element)) ? 500 : 0;
    const countBonus = Math.min(row.length, 6) * 60;
    const contentWidthBonus = width > window.innerWidth * 0.22 && width < window.innerWidth * 0.78 ? 120 : 0;
    const compactBonus = height < 92 ? 120 : 0;
    const verticalPreference = Math.max(0, 160 - Math.abs(top - window.innerHeight * 0.31));
    return selectedBonus + countBonus + contentWidthBonus + compactBonus + verticalPreference;
};
const findDetailsTabCandidates = () => {
    const roleTabs = uniqueVisibleElements(deepQuerySelectorAll("[role='tab']"));
    const roleRows = groupTabCandidatesByRow(dedupeNestedTabCandidates(roleTabs.filter(tabLikeElement)));
    if (roleRows.length)
        return roleRows.sort((a, b) => scoreTabRow(b) - scoreTabRow(a))[0];
    const raw = uniqueVisibleElements(deepQuerySelectorAll("button, [role='button'], [tabindex], a, div, span")).filter(tabLikeElement);
    const rows = groupTabCandidatesByRow(dedupeNestedTabCandidates(raw));
    if (!rows.length)
        return [];
    return rows.sort((a, b) => scoreTabRow(b) - scoreTabRow(a))[0];
};
const detailsTabIndexFromPoint = (x, y) => {
    const tabs = findDetailsTabCandidates();
    return tabs.findIndex((tab) => {
        const rect = tab.getBoundingClientRect();
        return x >= rect.left - 10 && x <= rect.right + 10 && y >= rect.top - 10 && y <= rect.bottom + 10;
    });
};
const detailsTabIndexFromElement = (element) => {
    if (!element)
        return -1;
    const tabs = findDetailsTabCandidates();
    return tabs.findIndex((tab) => tab === element || tab.contains(element) || element.contains(tab));
};
const elementLooksSelected = (element) => {
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
        const ariaSelected = current.getAttribute("aria-selected") || current.getAttribute("aria-current");
        if (ariaSelected === "true" || ariaSelected === "page")
            return true;
        const className = String(current.className || "").toLowerCase();
        if (/(active|selected|current)/.test(className))
            return true;
        const style = window.getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        const radius = Math.max(parseFloat(style.borderTopLeftRadius || "0") || 0, parseFloat(style.borderTopRightRadius || "0") || 0, parseFloat(style.borderBottomLeftRadius || "0") || 0, parseFloat(style.borderBottomRightRadius || "0") || 0);
        if (rect.width >= 48 && rect.height >= 24 && radius >= 8 && !isTransparentColor(style.backgroundColor)) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
};
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
    if (!metadata?.community_enriched_at || (!metadata?.steam_news_enriched_at && !(metadata?.steam_news || []).length)) {
        await tryEnrichCommunityMediaForApp(appId);
        metadata = metadataCache[String(appId)];
    }
    const hub = metadata ? steamCommunityItemsFromMetadata(appId, metadata) : [];
    return hub.length ? { hub } : null;
};
const achievementSortTimestamp = (item) => Number(item?.rtUnlocked || 0);
const achievementDisplayName = (item) => String(item?.strName || item?.name || "");
const sortAchievementsForMyAchievements = (items) => items.slice().sort((a, b) => {
    const achievedDiff = Number(Boolean(b?.bAchieved)) - Number(Boolean(a?.bAchieved));
    if (achievedDiff)
        return achievedDiff;
    const dateDiff = achievementSortTimestamp(b) - achievementSortTimestamp(a);
    if (dateDiff)
        return dateDiff;
    return achievementDisplayName(a).localeCompare(achievementDisplayName(b));
});
const orderedAchievementRecord = (record) => {
    const out = {};
    sortAchievementsForMyAchievements(Object.values(record || {})).forEach((item) => {
        const key = String(item?.strID || item?.strName || "");
        if (key)
            out[key] = item;
    });
    return out;
};
const sortedAchievementPayloadForNative = (payload) => {
    const userData = payload.user?.data;
    const sortedAchieved = orderedAchievementRecord(userData?.achieved);
    const sortedHidden = orderedAchievementRecord(userData?.hidden);
    const sortedUnachieved = orderedAchievementRecord(userData?.unachieved);
    const achievedList = Object.values(sortedAchieved);
    const hiddenList = Object.values(sortedHidden);
    const unachievedList = Object.values(sortedUnachieved);
    return {
        ...payload,
        user: payload.user
            ? {
                ...payload.user,
                data: {
                    achieved: sortedAchieved,
                    hidden: sortedHidden,
                    unachieved: sortedUnachieved,
                },
            }
            : payload.user,
        steam: payload.steam
            ? {
                ...payload.steam,
                vecHighlight: sortAchievementsForMyAchievements([
                    ...(payload.steam.vecHighlight || []),
                    ...achievedList,
                ]).filter((item, index, list) => list.findIndex((candidate) => candidate.strID === item.strID) === index).slice(0, Math.max(3, Math.min(12, achievedList.length || 3))),
                vecAchievedHidden: sortAchievementsForMyAchievements(hiddenList),
                vecUnachieved: sortAchievementsForMyAchievements(unachievedList),
            }
            : payload.steam,
    };
};
const backgroundPolicyIntervalMs = (policy) => {
    switch (policy) {
        case "hourly":
            return 60 * 60 * 1000;
        case "daily":
            return 24 * 60 * 60 * 1000;
        case "weekly":
            return 7 * 24 * 60 * 60 * 1000;
        default:
            return 0;
    }
};
const backgroundSyncLastKey = (policy) => `${BACKGROUND_SYNC_LOCAL_PREFIX}:${policy}`;
const backgroundAchievementSyncIsDue = (policy) => {
    if (policy === "manual")
        return false;
    if (policy === "pc_session") {
        try {
            return sessionStorage.getItem(BACKGROUND_SYNC_SESSION_KEY) !== "done";
        }
        catch (_error) {
            return true;
        }
    }
    const interval = backgroundPolicyIntervalMs(policy);
    if (!interval)
        return false;
    try {
        const last = Number(localStorage.getItem(backgroundSyncLastKey(policy)) || 0);
        return !last || Date.now() - last >= interval;
    }
    catch (_error) {
        return true;
    }
};
const markBackgroundAchievementSyncDone = (policy) => {
    try {
        if (policy === "pc_session")
            sessionStorage.setItem(BACKGROUND_SYNC_SESSION_KEY, "done");
        else
            localStorage.setItem(backgroundSyncLastKey(policy), String(Date.now()));
    }
    catch (_error) {
        // Storage can be unavailable in some embedded Steam contexts.
    }
};
const scheduledAchievementTargets = async (settings) => {
    const games = await allNonSteamGames();
    const targets = [];
    const sources = settings.achievement_sources || {};
    const raIds = settings.retroachievements?.game_ids || {};
    const xboxIds = settings.xbox?.title_ids || {};
    for (const game of games) {
        const key = String(game.appid);
        const source = sources[key] || "auto";
        if (source === "disabled")
            continue;
        const hasXbox = Boolean(xboxIds[key]);
        const hasRa = Boolean(raIds[key]);
        if ((source === "xbox" || (source === "auto" && hasXbox)) && hasXbox && isUwphookGameOption(game)) {
            targets.push({ appid: game.appid, name: game.name, provider: "xbox" });
            continue;
        }
        if ((source === "retroachievements" || (source === "auto" && !hasXbox && hasRa)) && hasRa) {
            targets.push({ appid: game.appid, name: game.name, provider: "retroachievements" });
        }
    }
    return targets;
};
const runBackgroundAchievementSync = async (reason = "scheduled") => {
    if (backgroundAchievementSyncRunning)
        return;
    backgroundAchievementSyncRunning = true;
    let policy = "daily";
    let updated = 0;
    let skipped = 0;
    try {
        const settings = await refreshRaSettings();
        policy = settings?.achievement_cache?.policy || "daily";
        if (!backgroundAchievementSyncIsDue(policy))
            return;
        const targets = await scheduledAchievementTargets(settings);
        toaster.toast({
            title: t("pluginName"),
            body: `${t("backgroundSyncStarted")}: ${targets.length}`,
        });
        for (const target of targets) {
            try {
                const payload = target.provider === "xbox"
                    ? ((await syncTrueAchievementsProgress(target.appid)) || (await fetchAchievements(target.appid)))
                    : await fetchAchievements(target.appid);
                if (payload?.steam?.nTotal) {
                    applyAchievementPayload(target.appid, payload);
                    updated += 1;
                }
                else {
                    skipped += 1;
                }
            }
            catch (error) {
                skipped += 1;
                warn("achievements", "background achievement sync failed", target.name, error);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
        markBackgroundAchievementSyncDone(policy);
        toaster.toast({
            title: t("pluginName"),
            body: `${t("backgroundSyncFinished")}: ${updated} ${t("backgroundSyncUpdated")}, ${skipped} ${t("backgroundSyncSkipped")}`,
        });
    }
    catch (error) {
        toaster.toast({ title: t("pluginName"), body: `${t("backgroundSyncFailed")}: ${String(error)}` });
    }
    finally {
        backgroundAchievementSyncRunning = false;
    }
};
const startBackgroundAchievementSync = () => {
    if (backgroundAchievementSyncTimer)
        window.clearInterval(backgroundAchievementSyncTimer);
    const run = () => void runBackgroundAchievementSync("timer");
    const initial = window.setTimeout(run, BACKGROUND_SYNC_INITIAL_DELAY_MS);
    backgroundAchievementSyncTimer = window.setInterval(run, BACKGROUND_SYNC_CHECK_MS);
    return () => {
        window.clearTimeout(initial);
        if (backgroundAchievementSyncTimer)
            window.clearInterval(backgroundAchievementSyncTimer);
        backgroundAchievementSyncTimer = undefined;
    };
};
const applyAchievementPayload = (appId, payload) => {
    if (!payload?.steam?.nTotal)
        return;
    const sortedPayload = sortedAchievementPayloadForNative(payload);
    clearAchievementStoreMapsForApp(appId);
    achievementsCache[String(appId)] = sortedPayload;
    if (steamAchievementStoreRef)
        primeAchievementStore(steamAchievementStoreRef, appId, sortedPayload);
    const appData = appDetailsStore?.GetAppData?.(appId);
    if (appData?.details) {
        appData.details.achievements = sortedPayload.steam;
        appData.bLoadingAchievments = false;
    }
    try {
        appDetailsCache?.SetCachedDataForApp?.(appId, "achievements", 2, sortedPayload.steam);
    }
    catch (_error) {
        // Best effort, same cache route used by Steam.
    }
    try {
        if (appAchievementProgressCache?.m_achievementProgress) {
            appAchievementProgressCache.m_achievementProgress.mapCache.set(appId, {
                all_unlocked: sortedPayload.progress.achieved === sortedPayload.progress.total,
                appid: appId,
                cache_time: Date.now(),
                percentage: sortedPayload.progress.percentage,
                total: sortedPayload.progress.total,
                unlocked: sortedPayload.progress.achieved,
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
        warn("achievements", "failed to clear achievement store maps", error);
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
        warn("achievements", "failed to flush stale achievement cache", error);
    }
};
const primeAchievementStore = (store, appId, payload) => {
    if (!payload)
        return;
    const sortedPayload = sortedAchievementPayloadForNative(payload);
    try {
        const keys = [appId, String(appId)];
        for (const key of keys) {
            if (sortedPayload.global) {
                store?.m_mapGlobalAchievements?.set?.(key, sortedPayload.global);
                store?.m_mapGlobalAchievementPercentages?.set?.(key, sortedPayload.global);
                store?.m_mapAchievementPercentages?.set?.(key, sortedPayload.global);
            }
            if (sortedPayload.user) {
                store?.m_mapMyAchievements?.set?.(key, sortedPayload.user);
                store?.m_mapAchievements?.set?.(key, sortedPayload.user);
            }
        }
    }
    catch (error) {
        warn("achievements", "failed to prime achievement store", error);
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
        warn("bridge", "screenshot enrichment failed", error);
    }
    finally {
        loadingScreenshots.delete(appId);
    }
};
const tryEnrichCommunityMediaForApp = async (appId) => {
    await ensureMetadataCache();
    const metadata = metadataCache[String(appId)];
    const enrichedRecently = metadata?.community_enriched_at &&
        metadata?.steam_news_enriched_at &&
        Date.now() / 1000 - Number(metadata.community_enriched_at) < 7 * 24 * 60 * 60 &&
        Date.now() / 1000 - Number(metadata.steam_news_enriched_at) < 6 * 60 * 60;
    if (!metadata || enrichedRecently || loadingCommunityMedia.has(appId)) {
        return;
    }
    loadingCommunityMedia.add(appId);
    try {
        const enriched = await enrichCommunityMedia(appId, metadata.title || appName(appId), metadata.source_url || "");
        if (enriched) {
            metadataCache[String(appId)] = enriched;
            applyMetadata(appId);
            void refreshPlayhubNativeActivityForApp(appId);
            window.dispatchEvent(new Event("playhub-metadata:updated"));
        }
    }
    catch (error) {
        warn("bridge", "community media enrichment failed", error);
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
    const capabilities = await getPlatformCapabilities();
    const isXboxAutoDetect = !hasXboxMatch && (source === "xbox" || source === "auto");
    if (isXboxAutoDetect && !capabilities?.supports_xbox_uwphook_auto && !settings?.retroachievements?.enabled) {
        return null;
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
                const resolvedPayload = await resolveRetroAchievementsFromPath(appId, launchPath, appName(appId));
                if (resolvedPayload?.steam) {
                    payload = resolvedPayload;
                }
            }
        }
        if (payload)
            applyAchievementPayload(appId, payload);
        return payload || achievementsCache[String(appId)] || null;
    }
    catch (error$1) {
        error("achievements", "achievements fetch failed", error$1);
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
const PLAYHUB_HIDE_APP_LINKS_CLASS = "playhub-hide-applinks";
const PLAYHUB_HIDE_APP_LINKS_STYLE_ID = "playhub-hide-applinks-style";
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
        .map((selector) => `body.${PLAYHUB_HIDE_APP_LINKS_CLASS} ${selector}`);
    if (!selectors.length) {
        return "/* playhub: AppDetails GameInfoQuickLinks class unresolved; no fallback rule. */";
    }
    const targetSelector = selectors.join(",\n");
    return `
${targetSelector} {
  display: none !important;
}
`;
};
const appLinksDomClassPresent = (className) => {
    const trimmed = className.trim();
    if (!trimmed)
        return false;
    try {
        const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(trimmed)
            : trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return !!document.querySelector(`.${escaped}`);
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
const logUnmatchedAppLinksDecision = (decision, resolvedLinkRowClasses, lastSignature) => {
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
                ? appLinksDomClassPresent(resolvedLinkRowClasses[0])
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
    if (globalState.__playhubAppLinksHider) {
        unpatchers.push(() => undefined);
        return;
    }
    if (typeof document === "undefined" || !document.body || !document.head) {
        unpatchers.push(() => undefined);
        return;
    }
    globalState.__playhubAppLinksHider = { installed: true };
    const existingStyle = document.getElementById(PLAYHUB_HIDE_APP_LINKS_STYLE_ID);
    const style = existingStyle || document.createElement("style");
    if (!existingStyle) {
        style.id = PLAYHUB_HIDE_APP_LINKS_STYLE_ID;
        document.head.appendChild(style);
    }
    let resolvedQuickLinksClasses = [];
    let appliedQuickLinksClasses = "";
    let lastDecisionLogSignature = "";
    const updateStyle = () => {
        if (resolvedQuickLinksClasses.length === 0) {
            resolvedQuickLinksClasses = resolveAppDetailsQuickLinksClasses();
        }
        const nextAppliedQuickLinksClasses = resolvedQuickLinksClasses.join(" ");
        if (style.textContent && nextAppliedQuickLinksClasses === appliedQuickLinksClasses)
            return;
        style.textContent = buildUnmatchedAppLinksHiderStyle(resolvedQuickLinksClasses);
        appliedQuickLinksClasses = nextAppliedQuickLinksClasses;
    };
    const update = () => {
        try {
            updateStyle();
            const decision = shouldHideUnmatchedAppLinks();
            lastDecisionLogSignature = logUnmatchedAppLinksDecision(decision, resolvedQuickLinksClasses, lastDecisionLogSignature);
            document.body?.classList.toggle(PLAYHUB_HIDE_APP_LINKS_CLASS, decision);
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
            document.body?.classList.remove(PLAYHUB_HIDE_APP_LINKS_CLASS);
            style.remove();
        }
        catch (_error) {
            // Best effort teardown.
        }
        delete globalState.__playhubAppLinksHider;
    });
};
const installSteamNavigationRedirect = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__playhubNavRedirect) {
        unpatchers.push(() => undefined);
        return;
    }
    const redirectUnpatchers = [];
    globalState.__playhubNavRedirect = { installed: true };
    const patchUrlOpener = (target, methodName, firstOnly = false) => {
        if (typeof target?.[methodName] !== "function")
            return;
        const original = target[methodName];
        const patched = function playhubSteamNavigationRedirect(...args) {
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
        const patched = function playhubSteamAppIdNavigationRedirect(...args) {
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
        delete globalState.__playhubNavRedirect;
    });
};
const installMainWindowHistoryRedirect = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__playhubMainWindowHistoryRedirect) {
        unpatchers.push(() => undefined);
        return;
    }
    const redirectUnpatchers = [];
    let cancelled = false;
    let retryId;
    let attempts = 0;
    globalState.__playhubMainWindowHistoryRedirect = { installed: true };
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
        delete globalState.__playhubMainWindowHistoryRedirect;
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
    if (globalState.__playhubClickTrace) {
        unpatchers.push(() => undefined);
        return;
    }
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
        unpatchers.push(() => undefined);
        return;
    }
    globalState.__playhubClickTrace = { installed: true };
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
        delete globalState.__playhubClickTrace;
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
        delete globalState.__playhubClickTrace;
    });
};
const installNavigationTrace = (unpatchers) => {
    const globalState = globalThis;
    if (globalState.__playhubNavTrace) {
        unpatchers.push(() => undefined);
        return;
    }
    const traceUnpatchers = [];
    const seenTargets = new Set();
    globalState.__playhubNavTrace = { installed: true };
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
                const patched = function playhubNavigationTrace(...args) {
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
            const patched = function playhubHistoryTrace(...args) {
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
                        const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);
                        if (rewrote) {
                            void frontendLog("nav", "steamweb rewrite", { method: methodName }).catch(() => undefined);
                            return original.apply(this, [newState, args[1], args[2]]);
                        }
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
        delete globalState.__playhubNavTrace;
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
    if (globalState.__playhubHistoryInstanceTrace) {
        unpatchers.push(() => undefined);
        return;
    }
    const traceUnpatchers = [];
    const wrappedHistories = new WeakSet();
    globalState.__playhubHistoryInstanceTrace = { installed: true };
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
                const patched = function playhubHistoryInstanceTrace(...args) {
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
        delete globalState.__playhubHistoryInstanceTrace;
    });
};
let achievementStorePatchInstalled = false;
const tryInstallAchievementStorePatch = (unpatchers) => {
    if (achievementStorePatchInstalled)
        return true;
    if (!hasAchievementProgressCache()) {
        if (patchInstallStatus.achievements === "pending") {
            patchInstallStatus.achievements = "skipped-missing-internal";
            warn("patch", "achievement UI patch skipped", { status: patchInstallStatus.achievements });
        }
        return true;
    }
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
                    .catch((error$1) => {
                    error("achievements", "LoadMyAchievements failed", error$1);
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
        patchInstallStatus.achievements = "installed";
        info("patch", "achievement store patch installed", { status: patchInstallStatus.achievements });
        return true;
    }
    catch (error) {
        patchInstallStatus.achievements = "failed";
        warn("patch", "achievement store patch failed", { status: patchInstallStatus.achievements }, error);
        return true;
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
const isPlayhubNativeNewsRouteState = (state) => {
    const eventToShow = state?.event_to_show;
    if (!eventToShow)
        return false;
    const eventId = eventToShow.eventid || eventToShow.gidPartnerEvent || eventToShow.gid || eventToShow.GID;
    return !!eventId && !!playhubNativePartnerEventForGid(eventId);
};
const playhubNativeNewsRouteAppId = (state, fallbackPath = "") => {
    const eventToShow = state?.event_to_show || {};
    const appId = Number(eventToShow.appid || gameDetailAppIdFromPath(fallbackPath));
    return Number.isFinite(appId) && appId > 0 ? appId : 0;
};
const shouldReplacePlayhubNativeNewsPush = (targetPath, state) => {
    if (!isPlayhubNativeNewsRouteState(state))
        return false;
    const targetAppId = playhubNativeNewsRouteAppId(state, targetPath);
    const currentAppId = gameDetailAppIdFromPath(currentRoutePath());
    // Steam's native Activity click normally pushes the same game-detail route with
    // only `event_to_show` added. Its close handler then replaces the current route
    // to remove `event_to_show`, leaving a duplicate game-detail entry behind. That
    // is why Andrea had to press B/Esc once for every news he had opened. For
    // Playhub native news, make that event navigation replace the current game route
    // instead of pushing a new history entry. The modal still opens natively, but
    // closing it returns to the original route without polluting the back stack.
    return !!targetAppId && (!currentAppId || currentAppId === targetAppId);
};
const currentSteamHistoryState = (steamHistory) => {
    const location = steamHistory?.location || globalThis.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
    return location?.state || null;
};
const shouldBackOutOfPlayhubNativeNewsClose = (steamHistory, targetPath, nextState) => {
    const currentState = currentSteamHistoryState(steamHistory);
    if (!isPlayhubNativeNewsRouteState(currentState))
        return false;
    if (isPlayhubNativeNewsRouteState(nextState))
        return false;
    const currentAppId = playhubNativeNewsRouteAppId(currentState, currentRoutePath());
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
const installSteamPatches = () => {
    const unpatchers = [];
    installAchievementImageCoverPatch(unpatchers);
    installUnmatchedAppLinksHider(unpatchers);
    // Activity news now use Steam's own AppActivityStore and native Activity
    // renderer. Do not mount Playhub overlay/DOM UI here: those paths are kept in
    // source only as old fallbacks, but the integration attempt for this build is
    // intentionally native-only.
    installNativeActivityStorePatch(unpatchers);
    installNativePartnerEventStorePatch(unpatchers);
    const activityRefreshedListener = () => {
        playhubNativeActivityCache().clear();
        playhubNativePartnerEventCache().clear();
        const appId = currentGameDetailAppId();
        void ensureMetadataCache().then(() => {
            if (appId)
                void refreshPlayhubNativeActivityForApp(appId);
        });
    };
    window.addEventListener("playhub-metadata:activity-refreshed", activityRefreshedListener);
    unpatchers.push(() => window.removeEventListener("playhub-metadata:activity-refreshed", activityRefreshedListener));
    void flushTrueAchievementsNativeCache();
    window.setTimeout(() => void flushTrueAchievementsNativeCache(), 2500);
    const overviewProto = appStore?.allApps?.[0]?.__proto__;
    const detailsProto = appDetailsStore?.__proto__;
    if (!hasSteamInternals() || !overviewProto || !detailsProto) {
        let cancelled = false;
        let delayedUnpatch = null;
        let retryId;
        const retry = () => {
            if (cancelled)
                return;
            if (hasSteamInternals()) {
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
    installSteamNavigationRedirect(unpatchers);
    installMainWindowHistoryRedirect(unpatchers);
    installNavigationTrace(unpatchers);
    installHistoryInstanceTrace(unpatchers);
    installClickTrace(unpatchers);
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
    try {
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
                        const target = historyPathFromArgs(args);
                        const redirected = redirectAchievementTarget(target);
                        if (redirected)
                            return original(redirected);
                        const state = historyStateFromArgs(args);
                        if (methodName === "push" && shouldReplacePlayhubNativeNewsPush(target, state) && typeof steamHistory.replace === "function") {
                            globalThis.__playhubNativeNewsOpenedWithReplaceAt = Date.now();
                            return steamHistory.replace(...args);
                        }
                        if (methodName === "replace" && shouldBackOutOfPlayhubNativeNewsClose(steamHistory, target || currentRoutePath(), state)) {
                            const replacedAt = Number(globalThis.__playhubNativeNewsOpenedWithReplaceAt || 0);
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
            warn("patch", "history achievement redirect patch skipped", error);
        }
        try {
            for (const methodName of ["pushState", "replaceState"]) {
                const original = window.history?.[methodName];
                if (typeof original !== "function")
                    continue;
                const patched = function (...args) {
                    const target = String(args[2] || "");
                    const redirected = redirectAchievementTarget(target || args[0]);
                    if (redirected) {
                        args[2] = redirected;
                    }
                    const state = historyStateFromArgs(args);
                    if (methodName === "pushState" && shouldReplacePlayhubNativeNewsPush(target, state)) {
                        globalThis.__playhubNativeNewsOpenedWithReplaceAt = Date.now();
                        return window.history.replaceState(args[0], args[1], args[2]);
                    }
                    if (methodName === "replaceState") {
                        const currentState = window.history?.state;
                        if (isPlayhubNativeNewsRouteState(currentState) && !isPlayhubNativeNewsRouteState(state)) {
                            const replacedAt = Number(globalThis.__playhubNativeNewsOpenedWithReplaceAt || 0);
                            if (!replacedAt || Date.now() - replacedAt > 15000) {
                                window.history.back();
                                return undefined;
                            }
                        }
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
        const clickDetailsTabTracker = (event) => {
            const target = event.target;
            detailsTabLabelFromElement(target);
            Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
                ? detailsTabIndexFromPoint(event.clientX, event.clientY)
                : -1;
            detailsTabIndexFromElement(target);
        };
        document.addEventListener("click", clickDetailsTabTracker, true);
        unpatchers.push(() => document.removeEventListener("click", clickDetailsTabTracker, true));
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
        patchInstallStatus.router = "installed";
        info("patch", "router patch installed", { status: patchInstallStatus.router });
    }
    catch (error) {
        patchInstallStatus.router = "failed";
        warn("patch", "router patch failed", { status: patchInstallStatus.router }, error);
    }
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
                // Keep Steam's first-run detail bootstrap intact. Returning Playhub data
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
                if (appId && isNonSteamApp(overview))
                    ensureDetailsOverviewSafeFields(appId);
                if (appId && isNonSteamApp(overview) && shouldShowAchievements(appId)) {
                    ret.add("achievements");
                    void loadAchievementsForApp(appId);
                }
                if (appId && isNonSteamApp(overview) && metadataCache[String(appId)]) {
                    lastObservedGameDetailAppId = appId;
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
    try {
        const httpClient = DFL.findModuleChild((module) => {
            if (!module || typeof module !== "object")
                return undefined;
            if (typeof module.g?.get === "function" && typeof module.g?.post === "function") {
                return module.g;
            }
            return undefined;
        });
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
                    return communityPayloadForApp(appId).then((payload) => {
                        if (payload)
                            return payload;
                        return original(...args);
                    });
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
        warn("patch", "community vote patch skipped", error);
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
                    const overview = ret?.props?.children?.props?.overview || overviewFromReactTree(ret);
                    const appId = Number(overview?.appid || appIdFromReactTree(ret) || currentGameDetailAppId());
                    const appOverview = overview || getOverview(appId);
                    if (appId && isNonSteamApp(appOverview)) {
                        lastObservedGameDetailAppId = appId;
                        bypassBypass = 11;
                        void ensureMetadataCache().then(() => {
                            applyMetadata(appId);
                            void tryEnrichScreenshotsForApp(appId);
                            void tryFetchMetadataForApp(appId);
                        });
                        void loadAchievementsForApp(appId);
                        void refreshPlayhubNativeActivityForApp(appId);
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
                const renderPatch = DFL.afterPatch(routeProps, "renderFunc", (_args, ret) => {
                    const treeAppId = appIdFromReactTree(ret);
                    const appId = currentGameDetailAppId() || treeAppId;
                    const overview = overviewFromReactTree(ret) || getOverview(appId);
                    if (appId && isNonSteamApp(overview)) {
                        lastObservedGameDetailAppId = appId;
                        void ensureMetadataCache().then(() => {
                            applyMetadata(appId);
                        });
                        void refreshPlayhubNativeActivityForApp(appId);
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
    return () => {
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

const retroResolutionMessageKey = (reason) => {
    switch (reason) {
        case "no_candidate_path":
            return "retroDetectNoCandidate";
        case "candidate_missing":
            return "retroDetectCandidateMissing";
        case "unsupported_extension":
            return "retroDetectUnsupportedExtension";
        case "hash_not_found":
            return "retroDetectHashNotFound";
        case "api_credentials_missing":
            return "retroDetectCredentialsMissing";
        case "api_error":
            return "retroDetectApiError";
        case "manual_mapping_exists":
            return "retroDetectManualMapping";
        default:
            return "retroDetectFailed";
    }
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
const actionButtonStackStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "0.35rem",
    flex: "1 1 13rem",
    minWidth: 0,
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
const diagnosticsGridStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "0.35rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
};
const diagnosticsRowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "0.75rem",
    alignItems: "start",
    ...compactTextStyle,
};
const diagnosticsValueStyle = {
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "right",
};
const platformSupportKeys = [
    "supports_metadata",
    "supports_steam_activity",
    "supports_retroachievements",
    "supports_retroachievements_auto",
    "supports_xbox_manual",
    "supports_xbox_uwphook_auto",
    "supports_xbox_app_scan",
    "supports_loopback_icons",
    "supports_localhost_icon_proxy",
];
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
    const [activityBusy, setActivityBusy] = SP_REACT.useState(false);
    const [activityMessage, setActivityMessage] = SP_REACT.useState("");
    const [cacheBusy, setCacheBusy] = SP_REACT.useState(false);
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
    const [platformCapabilities, setPlatformCapabilities] = SP_REACT.useState();
    const [showPlatformDiagnostics, setShowPlatformDiagnostics] = SP_REACT.useState(false);
    const [debugLogging, setDebugLoggingState] = SP_REACT.useState(false);
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
        void getPlatformCapabilities()
            .then((capabilities) => {
            if (!cancelled) {
                setPlatformCapabilities(capabilities);
                info("bridge", "platform capabilities loaded", capabilities);
            }
        })
            .catch((error) => warn("bridge", "platform capabilities load failed", error));
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
    const refreshActivities = async () => {
        if (activityBusy)
            return;
        setActivityBusy(true);
        setActivityMessage(t("refreshingActivities"));
        try {
            await startRefreshSteamActivities(games);
            const interval = window.setInterval(async () => {
                const progress = await getActivityRefreshProgress();
                setActivityMessage(progress.current ||
                    progress.message ||
                    `${progress.completed}/${progress.total}`);
                if (!progress.running) {
                    window.clearInterval(interval);
                    await refreshMetadataCache();
                    setMetadataCount(Object.keys(metadataCache).length);
                    setActivityBusy(false);
                    window.dispatchEvent(new Event("playhub-metadata:activity-refreshed"));
                    window.dispatchEvent(new Event("playhub-metadata:updated"));
                    toaster.toast({ title: t("pluginName"), body: t("activityRefreshComplete") });
                }
            }, 800);
        }
        catch (error) {
            setActivityBusy(false);
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
            toaster.toast({ title: t("pluginName"), body: t("clearCacheDone") });
        }
        catch (error) {
            toaster.toast({ title: t("pluginName"), body: String(error) });
        }
        finally {
            setCacheBusy(false);
        }
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
    return (SP_JSX.jsxs(DFL.PanelSection, { children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: [t("detected"), ":"] }), " ", games.length] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: [t("saved"), ":"] }), " ", metadataCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: [t("missing"), ":"] }), " ", missing] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: spacedButtonRowStyle, children: [SP_JSX.jsxs("div", { style: actionButtonStackStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || !games.length, onClick: scanMissing, children: busy ? t("scanning") : t("scanMissing") }), busy || scanMessage ? (SP_JSX.jsx("div", { style: inlineStatusStyle, children: scanMessage || t("scanning") })) : null] }), SP_JSX.jsxs("div", { style: actionButtonStackStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: activityBusy || busy || !games.length, onClick: refreshActivities, children: activityBusy ? t("refreshingActivities") : t("refreshActivities") }), activityBusy || activityMessage ? (SP_JSX.jsx("div", { style: inlineStatusStyle, children: activityMessage || t("refreshingActivities") })) : null] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("retroTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: t("retroEnabled"), checked: ra.enabled, onChange: (checked) => void saveRaSettings({ enabled: checked }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroLoginHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("retroUser") }), SP_JSX.jsx(DFL.TextField, { value: ra.username, onChange: (e) => setRa((prev) => ({ ...prev, username: e.target.value })), onBlur: () => void saveRaSettings({ username: ra.username }), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("retroKey") }), SP_JSX.jsx(DFL.TextField, { value: ra.api_key, onChange: (e) => setRa((prev) => ({ ...prev, api_key: e.target.value })), onBlur: () => void saveRaSettings({ api_key: ra.api_key }), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: spacedButtonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: testRaLogin, children: t("retroLogin") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: openRetroAchievements, children: t("retroCreateAccount") })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("xboxTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: t("xboxEnabled"), checked: xbox.enabled, onChange: (checked) => void saveXboxSettings({ enabled: checked }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("xboxProfile") }), SP_JSX.jsx(DFL.TextField, { value: xbox.api_key, onChange: (e) => setXbox((prev) => ({ ...prev, api_key: e.target.value })), onBlur: () => void saveXboxSettings({ api_key: xbox.api_key }), style: fieldStyle }), xbox.ta_logged_in ? (SP_JSX.jsx("div", { style: compactTextStyle, children: xbox.gamertag ? `${t("xboxLoggedIn")}: ${xbox.gamertag}` : t("xboxLoggedIn") })) : null] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: testXboxLogin, children: t("xboxLogin") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: openOpenXbl, children: t("xboxOpenOpenXbl") }), platformCapabilities?.supports_xbox_uwphook_auto ? (SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || xboxBulkBusy || !games.length, onClick: bulkApplyXboxAchievements, children: xboxBulkBusy ? t("xboxBulkScanning") : t("xboxBulkScan") })) : (SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxAutoScanUnsupported") })), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || xboxBulkBusy || !games.length || !xbox.api_key.trim(), onClick: syncMatchedTrueAchievementsProgress, children: t("xboxSyncAllProgress") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy || xboxBulkBusy || !games.length, onClick: clearAllXboxMatches, children: t("xboxClearAll") }), xboxBulkBusy || xboxBulkMessage ? (SP_JSX.jsxs("div", { style: inlineStatusStyle, children: [xboxBulkBusy ? SP_JSX.jsx(DFL.Spinner, {}) : null, SP_JSX.jsx("span", { children: xboxBulkMessage })] })) : null] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("achievementCacheTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("achievementCacheHint") }), SP_JSX.jsx("div", { style: buttonRowStyle, children: achievementCachePolicies.map((policy) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void saveAchievementCachePolicy(policy), style: {
                                    opacity: achievementCachePolicy === policy ? 1 : 0.72,
                                    fontWeight: achievementCachePolicy === policy ? 700 : 400,
                                }, children: t(`achievementCache_${policy}`) }, policy))) })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("cacheTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("cacheHint") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: cacheBusy || busy, onClick: clearCache, children: t("clearCache") })] }) }), platformCapabilities ? (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: t("diagnosticsTitle") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx(DFL.ToggleField, { label: "Debug Logging", checked: debugLogging, onChange: (checked) => void saveDebugLogging(checked) }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => setShowPlatformDiagnostics((visible) => !visible), children: showPlatformDiagnostics
                                        ? t("diagnosticsHidePlatform")
                                        : t("diagnosticsShowPlatform") }), showPlatformDiagnostics ? (SP_JSX.jsxs("div", { style: diagnosticsGridStyle, children: [SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: t("platformLabel") }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: platformCapabilities.platform })] }), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: t("platformSteamOS") }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: platformCapabilities.is_steamos
                                                        ? t("diagnosticsYes")
                                                        : t("diagnosticsNo") })] }), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: t("platformSteamRoot") }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: platformCapabilities.steam_root || t("none") })] }), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: t("platformSupports") }), SP_JSX.jsx("span", {})] }), platformSupportKeys.map((key) => (SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: key }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: platformCapabilities[key]
                                                        ? t("diagnosticsYes")
                                                        : t("diagnosticsNo") })] }, key))), SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: "Patch Status" }), SP_JSX.jsx("span", {})] }), Object.entries(patchInstallStatus).map(([patchName, status]) => (SP_JSX.jsxs("div", { style: diagnosticsRowStyle, children: [SP_JSX.jsx("span", { children: patchName }), SP_JSX.jsx("span", { style: diagnosticsValueStyle, children: status })] }, patchName)))] })) : null] }) })] })) : null] }));
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
    const [steamAppIdText, setSteamAppIdText] = SP_REACT.useState("");
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
        setSteamAppIdText(saved?.steam_appid ? String(saved.steam_appid) : "");
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
    const applySteamAppId = async () => {
        if (!nonSteam) {
            toaster.toast({ title: t("pluginName"), body: t("notNonSteam") });
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
            toaster.toast({ title: t("pluginName"), body: t("saved") });
        }
        catch (error) {
            toaster.toast({ title: t("pluginName"), body: String(error) });
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
        const achievementPayload = payload?.steam ? payload : null;
        applyAchievementPayload(appId, achievementPayload);
        if (payload?.steam?.nTotal) {
            setRaGameId(String(payload.game_id));
            await saveAchievementSource("retroachievements");
            await refreshRaSettings();
        }
        toaster.toast({
            title: t("pluginName"),
            body: payload?.steam?.nTotal
                ? `${t("retroGameOk")}: ${payload.steam.nAchieved}/${payload.steam.nTotal}`
                : t(retroResolutionMessageKey(payload?.reason)),
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
        const caps = await getPlatformCapabilities();
        if (!caps?.supports_xbox_uwphook_auto)
            return;
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
    return (SP_JSX.jsx(DFL.ScrollPanel, { children: SP_JSX.jsxs("div", { style: pageStyle, children: [SP_JSX.jsxs(DFL.PanelSection, { title: `${t("pluginName")} - ${appName(appId)}`, children: [!nonSteam ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("notNonSteam") }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveCurrent, children: t("save") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: removeCurrent, children: t("remove") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => DFL.Navigation.NavigateBack(), children: t("done") })] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("searchTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: query, onChange: (e) => setQuery(e.target.value), style: { ...flexFieldStyle, minWidth: "10rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy, onClick: search, children: busy ? t("searching") : t("search") })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [busy ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("searching") })) : null, !busy && !results.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("noResults") })) : null, results.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void applyResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsx("span", { style: compactTextStyle, children: result.description })] }) }, result.slug || result.url)))] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("source"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("title") }), SP_JSX.jsx(DFL.TextField, { value: metadata.title, onChange: (e) => setMetadata((prev) => ({ ...prev, title: e.target.value })), style: fieldStyle })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("label", { children: t("description") }), SP_JSX.jsx(DFL.Focusable, { style: { width: "100%" }, children: SP_JSX.jsx("textarea", { value: metadata.description, onChange: (e) => setMetadata((prev) => ({
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
                                    }, children: t(`achievementSource_${source}`) }, source))) }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: t("steamAppIdLabel"), children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("steamAppIdDescription") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: steamAppIdText, onChange: (e) => setSteamAppIdText(e.target.value), style: { ...flexFieldStyle, minWidth: "18rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: busy, onClick: applySteamAppId, children: t("steamAppIdApply") })] })] }) }) }), SP_JSX.jsxs(DFL.PanelSection, { title: t("retroTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: raGameId, onChange: (e) => setRaGameId(e.target.value), style: { ...flexFieldStyle, minWidth: "8rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveRaGameId, children: t("save") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: autoDetectAchievements, children: t("retroGameDetect") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: testAchievements, children: t("retroGameTest") })] }) }), raSettings && !raSettings.enabled ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: compactTextStyle, children: [t("retroEnabled"), ": Off"] }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroGameSearchHint") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: raQuery, onChange: (e) => setRaQuery(e.target.value), style: { ...flexFieldStyle, minWidth: "10rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: raSearching, onClick: searchAchievements, children: raSearching ? t("searching") : t("retroGameSearch") })] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [raSearching ? SP_JSX.jsx(DFL.Spinner, {}) : null, !raSearching && !raResults.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("retroGameNoMatches") })) : null, raResults.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void useAchievementResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsxs("span", { style: compactTextStyle, children: [result.console ? `${result.console} - ` : "", Math.round(result.score * 100), "% match"] })] }) }, result.id)))] }) })] }), SP_JSX.jsxs(DFL.PanelSection, { title: t("xboxPerGameTitle"), children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxHint") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxCurrentMatch") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: xboxTitleId, onChange: (e) => setXboxTitleIdState(e.target.value), style: { ...flexFieldStyle, minWidth: "18rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: saveXboxMatchManual, children: t("save") })] }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: autoDetectXboxAchievements, children: t("xboxGameDetect") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: !xboxTitleId, onClick: syncXboxProgress, children: t("xboxSyncProgress") }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: clearXboxMatch, children: t("xboxClearMatch") })] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxGameSearchHint") }), SP_JSX.jsxs("div", { style: buttonRowStyle, children: [SP_JSX.jsx(DFL.TextField, { value: xboxQuery, onChange: (e) => setXboxQuery(e.target.value), style: { ...flexFieldStyle, minWidth: "10rem" } }), SP_JSX.jsx(FocusableButton, { className: "DialogButton", disabled: xboxSearching, onClick: searchXbox, children: xboxSearching ? t("searching") : t("xboxGameSearch") })] })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: resultsStackStyle, children: [xboxSearching ? SP_JSX.jsx(DFL.Spinner, {}) : null, !xboxSearching && !xboxResults.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: t("xboxGameNoMatches") })) : null, xboxResults.map((result) => (SP_JSX.jsx(FocusableButton, { className: "DialogButton", onClick: () => void useXboxResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsxs("span", { style: compactTextStyle, children: [Math.round(result.score * 100), "% match", result.unlocked != null && result.total != null
                                                            ? ` - ${result.unlocked}/${result.total}`
                                                            : "", result.gamerscore != null ? ` - ${result.gamerscore}G` : "", ` - ${result.source || "TrueAchievements"} - ${result.id}`] })] }) }, result.id)))] }) })] })] }) }));
};

// Stable keys for the entries we inject, so we can find and de-duplicate them.
const ENTRY_KEY = "playhub-metadata-edit";
const ENTRY_KEYS = new Set([ENTRY_KEY]);
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
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (ENTRY_KEYS.has(items[index]?.key))
            items.splice(index, 1);
    }
};
/** Insert our entry just above "Properties..." (or at the end) for shortcuts. */
const insertOurEntry = (items, appId) => {
    if (!isNonSteamApp(getOverview(appId)))
        return;
    const propertiesIndex = items.findIndex((node) => DFL.findInReactTree(node, (x) => x?.onSelected?.toString?.().includes("AppProperties")));
    const insertAt = propertiesIndex >= 0 ? propertiesIndex : items.length;
    items.splice(insertAt, 0, SP_JSX.jsx(DFL.MenuItem, { onSelected: () => DFL.Navigation.Navigate(`/playhub-metadata/${appId}`), children: t("editMetadata") }, ENTRY_KEY));
};
/** De-duplicate, then (re)insert the entry against the best-known appid. */
const syncOurEntry = (items, appId) => {
    removeOurEntry(items);
    insertOurEntry(items, resolveAppId(items, appId));
};
/**
 * Patch the library context menu so non-Steam games gain a Playhub entry.
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
            const appId = ownerAppId || resolveAppId(menu?.props?.children ?? [], 0);
            if (!innerPatch) {
                innerPatch = DFL.afterPatch(menu, "type", (_typeArgs, rendered) => {
                    // First render of the menu body.
                    DFL.afterPatch(rendered.type.prototype, "render", (_args, output) => {
                        const items = output?.props?.children?.[0];
                        if (isGameContextMenu(items)) {
                            try {
                                syncOurEntry(items, appId);
                            }
                            catch (_error) {
                                // Steam reshapes this tree often; skip on mismatch.
                            }
                        }
                        return output;
                    });
                    // Subsequent updates when Steam refreshes the app overview.
                    DFL.afterPatch(rendered.type.prototype, "shouldComponentUpdate", ([nextProps], shouldUpdate) => {
                        try {
                            removeOurEntry(nextProps.children);
                            if (shouldUpdate === true) {
                                syncOurEntry(nextProps.children, appId);
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
                    syncOurEntry(menu.props.children, appId);
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

const METADATA_ROUTE = "/playhub-metadata/:appid";
var index = DFL.definePlugin(() => {
    void getDebugLogging()
        .then((enabled) => setVerboseLogging(enabled))
        .catch((error) => warn("bridge", "debug logging setting load failed", error));
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
                routerHook.removeRoute(PLAYHUB_ACHIEVEMENTS_ROUTE);
            }
            catch (error$1) {
                error("patch", "route remove failed", error$1);
            }
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
