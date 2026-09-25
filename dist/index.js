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
function FaTags (props) {
  return GenIcon({"attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M345 39.1L472.8 168.4c52.4 53 52.4 138.2 0 191.2L360.8 472.9c-9.3 9.4-24.5 9.5-33.9 .2s-9.5-24.5-.2-33.9L438.6 325.9c33.9-34.3 33.9-89.4 0-123.7L310.9 72.9c-9.3-9.4-9.2-24.6 .2-33.9s24.6-9.2 33.9 .2zM0 229.5L0 80C0 53.5 21.5 32 48 32l149.5 0c17 0 33.3 6.7 45.3 18.7l168 168c25 25 25 65.5 0 90.5L277.3 442.7c-25 25-65.5 25-90.5 0l-168-168C6.7 262.7 0 246.5 0 229.5zM144 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"},"child":[]}]})(props);
}

const getAllMetadata = callable("get_all_metadata");
const getMetadata = callable("get_metadata");
const saveMetadata = callable("save_metadata");
const removeMetadata = callable("remove_metadata");
const clearMetadataCache = callable("clear_metadata_cache");
const getShortcutNameManagement = callable("get_shortcut_name_management");
const saveShortcutNameState = callable("save_shortcut_name_state");
const clearShortcutNameState = callable("clear_shortcut_name_state");
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
const getSystemVersions = callable("get_system_versions");
const getPluginLogs = callable("get_plugin_logs");
const getDebugLogging = callable("get_debug_logging");
const setDebugLogging = callable("set_debug_logging");
const getCompatibilityDefault = callable("get_compatibility_default");
const setCompatibilityDefault = callable("set_compatibility_default");
const getCompatibilityDefaultScope = callable("get_compatibility_default_scope");
const setCompatibilityDefaultScope = callable("set_compatibility_default_scope");
const checkForPluginUpdate = callable("check_for_plugin_update");
const revalidatePluginUpdate = callable("revalidate_plugin_update");
const recordUpdateInstallRequested = callable("record_update_install_requested");
const confirmUpdateInstallHandoff = callable("confirm_update_install_handoff");
const clearPendingUpdateInstall = callable("clear_pending_update_install");
const getUpdateCheckContext = callable("get_update_check_context");
const getUpdateSettings = callable("get_update_settings");
const setUpdateChannel = callable("set_update_channel");
const setAutomaticUpdateChecks = callable("set_automatic_update_checks");
const getTrailerSettings = callable("get_trailer_settings");
const setTrailerSettings = callable("set_trailer_settings");
const evalInBigPicture = callable("eval_in_big_picture");

var backend = /*#__PURE__*/Object.freeze({
    __proto__: null,
    applyFetchedMetadata: applyFetchedMetadata,
    autoFetchMetadata: autoFetchMetadata,
    checkForPluginUpdate: checkForPluginUpdate,
    clearMetadataCache: clearMetadataCache,
    clearPendingUpdateInstall: clearPendingUpdateInstall,
    clearShortcutNameState: clearShortcutNameState,
    confirmUpdateInstallHandoff: confirmUpdateInstallHandoff,
    enrichSteamApp: enrichSteamApp,
    evalInBigPicture: evalInBigPicture,
    fetchMetadata: fetchMetadata,
    frontendLog: frontendLog,
    getActivityRefreshProgress: getActivityRefreshProgress,
    getAllMetadata: getAllMetadata,
    getCommunityFallbackPage: getCommunityFallbackPage,
    getCompatibilityDefault: getCompatibilityDefault,
    getCompatibilityDefaultScope: getCompatibilityDefaultScope,
    getDebugLogging: getDebugLogging,
    getDelistedIndexStatus: getDelistedIndexStatus,
    getLocalShortcuts: getLocalShortcuts,
    getMetadata: getMetadata,
    getMissingMetadataCount: getMissingMetadataCount,
    getPluginLogs: getPluginLogs,
    getPluginVersion: getPluginVersion,
    getScanProgress: getScanProgress,
    getShortcutNameManagement: getShortcutNameManagement,
    getSystemVersions: getSystemVersions,
    getTrailerSettings: getTrailerSettings,
    getUpdateCheckContext: getUpdateCheckContext,
    getUpdateSettings: getUpdateSettings,
    recordUpdateInstallRequested: recordUpdateInstallRequested,
    refreshDelistedIndex: refreshDelistedIndex,
    refreshSteamActivityForApp: refreshSteamActivityForApp,
    removeMetadata: removeMetadata,
    revalidatePluginUpdate: revalidatePluginUpdate,
    saveMetadata: saveMetadata,
    saveShortcutNameState: saveShortcutNameState,
    searchMetadata: searchMetadata,
    setAutomaticUpdateChecks: setAutomaticUpdateChecks,
    setCompatibilityDefault: setCompatibilityDefault,
    setCompatibilityDefaultScope: setCompatibilityDefaultScope,
    setDebugLogging: setDebugLogging,
    setTrailerSettings: setTrailerSettings,
    setUpdateChannel: setUpdateChannel,
    startRefreshSteamActivities: startRefreshSteamActivities,
    startScanMissing: startScanMissing
});

// Shared semantic style tokens, aligned with beallio/SDH-Ludusavi.
const colors = {
    accent: "#1a9fff",
    success: "#4ade80",
    warning: "#f59e0b",
    error: "#f87171",
    textSecondary: "#cbd5e1"};
// Spacing scale - px (4-based), aligned with SDH-Ludusavi's px spacing.
const space = {
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
const fieldStyle = {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
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
const BusySpinner = () => (SP_JSX.jsx(DFL.Spinner, { style: busySpinnerStyle }));
const ButtonLabel = ({ children, busy = false }) => (SP_JSX.jsxs("span", { style: buttonLabelStyle, children: [busy ? SP_JSX.jsx(BusySpinner, {}) : null, children] }));

function DelistedIndexSection({ countText, dateText, busy, onRefresh, }) {
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Delisted Steam games", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: inlineStatusStyle("idle"), children: countText }) }), dateText ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: inlineStatusStyle("idle"), children: dateText }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "standard", disabled: busy, onClick: onRefresh, children: busy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Refreshing..." })) : ("Refresh delisted games") }) })] }));
}

const qualityOptions = [
    { data: "auto", label: "Auto — match display" },
    { data: 720, label: "720p" },
    { data: 1080, label: "1080p" },
    { data: 1440, label: "1440p" },
    { data: 2160, label: "2160p" },
];
function GameTrailersSection({ state, onEnabledChange, onAudioChange, onQualityChange, onQualityMenuWillOpen, onQualityControlRef, }) {
    const disabled = !state.settingsLoaded || state.busy;
    const display = state.displayWidth && state.displayHeight
        ? `${state.displayWidth} × ${state.displayHeight} pixels`
        : "Unavailable";
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Game trailers", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Enabled", description: "Show a Steam trailer on native game pages and shortcuts with a saved Steam match.", checked: state.settings.enabled, disabled: disabled, onChange: onEnabledChange }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Trailer audio", description: "New trailers start muted, then use this setting when playback is ready.", checked: state.settings.audioEnabled, disabled: disabled, onChange: onAudioChange }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { ref: onQualityControlRef, children: SP_JSX.jsx(DFL.DropdownItem, { label: "Video quality", layout: "below", childrenContainerWidth: "max", rgOptions: qualityOptions, selectedOption: state.settings.quality, disabled: disabled, onMenuWillOpen: onQualityMenuWillOpen, onChange: (option) => { void onQualityChange(option.data); }, renderButtonValue: () => (SP_JSX.jsx("span", { style: { whiteSpace: "normal" }, children: qualityOptions.find((option) => option.data === state.settings.quality)?.label })) }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Big Picture display", description: state.status, padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsxs("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: [display, " \u00B7 target ", state.targetHeight, "p"] }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "standard", children: [SP_JSX.jsx("div", { style: { fontSize: "13px", lineHeight: "1.4", color: "#cbd5e1" }, children: "Steam artwork stays visible until a playable trailer is ready. Trailers stream from Steam and are not saved for offline playback." }), state.settingsError && (SP_JSX.jsx("div", { style: inlineStatusStyle("error"), children: state.settingsError }))] }) })] }));
}

function LogsSection({ logsBusy, debugLogging, debugLoggingBusy, onViewLogs, onToggleDebugLogging, }) {
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Logs", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "none", disabled: logsBusy, onClick: onViewLogs, children: logsBusy ? "Loading..." : "View Logs" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Debug Logging", description: "Enables verbose logging for troubleshooting.", bottomSeparator: "standard", checked: debugLogging, disabled: debugLoggingBusy, onChange: onToggleDebugLogging }) })] }));
}

const compatibilityDefaultOptions = [
    { data: null, label: "Automatic — use matched Steam status" },
    { data: 3, label: "Verified" },
    { data: 2, label: "Playable" },
    { data: 1, label: "Unsupported" },
    { data: 0, label: "Unknown" },
];
const compatibilityDefaultScopeOptions = [
    { data: "steam", label: "Steam-matched games" },
    { data: "no-steam", label: "Saved games without a Steam ID" },
    { data: "metadata", label: "All games with saved metadata" },
    { data: "all", label: "All non-Steam games" },
];
const scopeDescription = (scope) => ({
    steam: "Applies to saved records with a valid Steam App ID.",
    "no-steam": "Applies to saved records without a Steam ID, including manual and provider records.",
    metadata: "Applies to every saved metadata record, with or without a Steam ID.",
    all: "Applies to every native non-Steam shortcut, including shortcuts without a record.",
}[scope]);
function MetadataSection({ detectedCount, savedCount, missingCount, scanBusy, scanMessage, scanStatusKind, cacheBusy, compatibilityDefault, compatibilityDefaultLoaded, compatibilityDefaultBusy, compatibilityDefaultError, compatibilityDefaultScope, compatibilityDefaultScopeBusy, onRefreshMetadata, onClearCache, onCompatibilityDefaultChange, onCompatibilityDefaultScopeChange, onCompatibilityDefaultMenuWillOpen, onCompatibilityDefaultControlRef, onCompatibilityDefaultScopeControlRef, }) {
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Metadata", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: false, preferredFocus: true, childrenLayout: "below", padding: "standard", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Detected non-Steam games", ":"] }), " ", detectedCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Metadata saved", ":"] }), " ", savedCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Missing metadata", ":"] }), " ", missingCount] })] }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { ref: onCompatibilityDefaultControlRef, children: SP_JSX.jsx(DFL.DropdownItem, { label: "Default compatibility status", layout: "below", childrenContainerWidth: "max", rgOptions: compatibilityDefaultOptions, selectedOption: compatibilityDefault, disabled: !compatibilityDefaultLoaded || compatibilityDefaultBusy || compatibilityDefaultScopeBusy, onMenuWillOpen: () => {
                            onCompatibilityDefaultMenuWillOpen("category");
                        }, onChange: (option) => onCompatibilityDefaultChange(option.data) }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { ref: onCompatibilityDefaultScopeControlRef, children: SP_JSX.jsx(DFL.DropdownItem, { label: "Apply default to", layout: "below", childrenContainerWidth: "max", bottomSeparator: "none", rgOptions: compatibilityDefaultScopeOptions, selectedOption: compatibilityDefaultScope, disabled: !compatibilityDefaultLoaded ||
                            compatibilityDefaultBusy ||
                            compatibilityDefaultScopeBusy ||
                            compatibilityDefault === null, onMenuWillOpen: () => onCompatibilityDefaultMenuWillOpen("scope"), onChange: (option) => onCompatibilityDefaultScopeChange(option.data), renderButtonValue: () => (SP_JSX.jsx("span", { style: { whiteSpace: "normal" }, children: compatibilityDefaultScopeOptions.find((option) => option.data === compatibilityDefaultScope)?.label })) }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "standard", children: [SP_JSX.jsx("div", { style: compactTextStyle, children: `${scopeDescription(compatibilityDefaultScope)} Per-game choices take priority.` }), SP_JSX.jsx("div", { style: compactTextStyle, children: "Follow Valve is a per-game choice. Manual and default categories are your choices, not Valve certification." }), compatibilityDefaultError ? (SP_JSX.jsx("div", { style: inlineStatusStyle("error"), children: compatibilityDefaultError })) : null] }) }), SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "none", disabled: scanBusy || detectedCount === 0, onClick: onRefreshMetadata, children: scanBusy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Refreshing..." })) : ("Refresh metadata") }), scanBusy || scanMessage ? (SP_JSX.jsx("div", { style: inlineStatusStyle(scanStatusKind), children: scanMessage || "Refreshing metadata..." })) : null] }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "none", children: SP_JSX.jsx("div", { style: compactTextStyle, children: "Find and save metadata for detected non-Steam games that do not have a match yet." }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: "Metadata cache" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "none", disabled: cacheBusy || scanBusy, onClick: onClearCache, children: cacheBusy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Clearing..." })) : ("Clear cache") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "standard", children: SP_JSX.jsx("div", { style: { ...compactTextStyle, paddingBottom: space.md }, children: "Clear saved matches and metadata so games can be matched again." }) }) })] }));
}

function PluginLogModal({ logs, closeModal }) {
    return (SP_JSX.jsx(DFL.ConfirmModal, { bAlertDialog: true, strTitle: "Plugin Logs", strOKButtonText: "OK", onOK: closeModal, onCancel: closeModal, onEscKeypress: closeModal, closeModal: closeModal, children: SP_JSX.jsx("div", { style: {
                maxHeight: "60vh",
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                padding: "10px",
                borderRadius: "4px",
                userSelect: "text",
            }, children: logs || "No recent logs" }) }));
}

// Must equal plugin.json "name" (Decky's find_plugin_folder identity). Space,
// not hyphen — asset filenames stay hyphenated, this is the plugin identity.
const EXPECTED_PLUGIN_NAME = "Decky Metadata";
const INSTALL_TYPE_UPDATE = 2;
const INSTALL_TYPE_DOWNGRADE = 3;
function isDeckyInstallerAvailable() {
    return (typeof window !== "undefined" &&
        typeof window.DeckyBackend === "object" &&
        window.DeckyBackend !== null &&
        (typeof window.DeckyBackend.callable === "function" ||
            typeof window.DeckyBackend.call === "function"));
}
async function invokeDeckyInstaller(url, version, sha256, installType, traceId) {
    const start = performance.now();
    const backend = window.DeckyBackend;
    if (!backend) {
        throw new Error("Decky Loader backend is not available in this environment.");
    }
    const shaPrefix = sha256.slice(0, 8);
    const logHandoff = (api) => {
        const elapsed = Math.round(performance.now() - start);
        const message = `handoff_start: trace_id=${traceId || "none"}, version=${version}, ` +
            `sha256_prefix=${shaPrefix}, installer_api=${api}, elapsed_ms=${elapsed}`;
        void frontendLog("update", message, null, "info").catch(() => { });
    };
    if (typeof backend.callable === "function") {
        logHandoff("callable");
        const install = backend.callable("utilities/install_plugin");
        return await install(url, EXPECTED_PLUGIN_NAME, version, sha256, installType);
    }
    if (typeof backend.call === "function") {
        logHandoff("call");
        return await backend.call("utilities/install_plugin", url, EXPECTED_PLUGIN_NAME, version, sha256, installType);
    }
    throw new Error("Decky Loader backend has no compatible RPC interface.");
}

const initialUpdateState = {
    phase: "hydrating",
    candidate: null,
    checkResult: null,
    errorMessage: null,
    installedReleasePublishedAt: null,
    installedOverride: null,
    pendingInstallVersion: null,
};
function updateReducer(state, action) {
    switch (action.type) {
        case "HYDRATION_COMPLETE":
            if (action.pendingInstall) {
                return {
                    ...state,
                    phase: "installed",
                    installedReleasePublishedAt: action.installedReleasePublishedAt,
                    installedOverride: action.pendingInstall,
                    pendingInstallVersion: action.pendingInstall.version,
                    candidate: null,
                    errorMessage: null,
                    checkResult: { status: "current", checked_at: new Date().toISOString(), channel: action.pendingInstall.channel }
                };
            }
            return {
                ...state,
                phase: "idle",
                installedReleasePublishedAt: action.installedReleasePublishedAt,
            };
        case "CHECK_START":
            return {
                ...state,
                phase: "checking",
                errorMessage: null,
            };
        case "CHECK_TIMEOUT":
            return {
                ...state,
                phase: "failed",
                errorMessage: action.message,
                checkResult: {
                    status: "failed",
                    checked_at: new Date().toISOString(),
                    message: action.message
                }
            };
        case "CHECK_FAILED":
            return {
                ...state,
                phase: "failed",
                errorMessage: action.message,
                checkResult: action.result || {
                    status: "failed",
                    checked_at: new Date().toISOString(),
                    message: action.message
                }
            };
        case "CHECK_SUCCESS_CURRENT":
            return {
                ...state,
                phase: "idle",
                candidate: null,
                checkResult: action.result,
            };
        case "CHECK_SUCCESS_AVAILABLE":
            return {
                ...state,
                phase: "available",
                candidate: action.candidate,
                checkResult: action.result,
            };
        case "INSTALL_START":
            return {
                ...state,
                phase: "installing",
                errorMessage: null,
            };
        case "INSTALL_HANDOFF_PENDING":
            return {
                ...state,
                phase: "handoff_pending",
            };
        case "INSTALL_SUCCESS":
            return {
                ...state,
                phase: "installed",
                candidate: null,
                errorMessage: null,
                installedOverride: {
                    version: action.version,
                    channel: action.channel,
                    preInstallVersion: action.preInstallVersion,
                },
                pendingInstallVersion: action.version,
                checkResult: {
                    status: "current",
                    checked_at: new Date().toISOString(),
                    channel: action.channel
                }
            };
        case "INSTALL_FAILED":
            return {
                ...state,
                phase: "failed",
                errorMessage: action.message,
                installedOverride: null,
                pendingInstallVersion: null,
            };
        case "CLEAR_INSTALLED_OVERRIDE":
            return {
                ...state,
                installedOverride: null,
                pendingInstallVersion: null,
                phase: state.phase === "installed" ? "idle" : state.phase,
            };
        default:
            return state;
    }
}

function logUpdate(traceId, stage, details) {
    const detailsStr = details
        ? Object.entries(details)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : "";
    const prefix = traceId ? `trace_id=${traceId}` : "trace_id=none";
    const message = `${stage}: ${prefix}${detailsStr ? ", " + detailsStr : ""}`;
    try {
        void frontendLog("update", message, null, "info").catch(() => { });
    }
    catch (_) { }
}
function generateUpdateTraceId() {
    return "tr-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}
const UPDATE_CHECK_UI_TIMEOUT_MS = 120000;
function usePluginUpdateController({ currentVersion, updateChannel, automaticUpdateChecks, settingsLoaded, onInstallVersionConfirmed }) {
    const [state, dispatch] = SP_REACT.useReducer(updateReducer, initialUpdateState);
    const hasChecked = SP_REACT.useRef(false);
    const inFlightCheck = SP_REACT.useRef(null);
    const hydratedPendingInstallVersion = SP_REACT.useRef(null);
    const activeCheckId = SP_REACT.useRef(0);
    const checkTimeoutRef = SP_REACT.useRef(null);
    const skipInitialCheck = SP_REACT.useRef(false);
    const automaticCheckToggleHydrated = SP_REACT.useRef(false);
    const latestChannel = SP_REACT.useRef(updateChannel);
    if (latestChannel.current !== updateChannel) {
        latestChannel.current = updateChannel;
        activeCheckId.current += 1;
        inFlightCheck.current = null;
    }
    const isHydrated = state.phase !== "hydrating";
    const effectiveCurrentVersion = state.installedOverride?.version ?? currentVersion;
    const clearCheckTimeout = SP_REACT.useCallback(() => {
        if (checkTimeoutRef.current !== null) {
            clearTimeout(checkTimeoutRef.current);
            checkTimeoutRef.current = null;
        }
    }, []);
    const finishCheck = SP_REACT.useCallback((checkId) => {
        if (checkId === activeCheckId.current) {
            inFlightCheck.current = null;
            clearCheckTimeout();
        }
    }, [clearCheckTimeout]);
    const checkForUpdates = SP_REACT.useCallback(async (opts) => {
        if (!effectiveCurrentVersion || effectiveCurrentVersion === "Loading...") {
            return;
        }
        if (opts.source === "automatic" && !settingsLoaded) {
            return;
        }
        if (opts.source === "automatic" && (state.installedOverride || state.pendingInstallVersion)) {
            logUpdate(null, "automatic_check_suppressed_pending_install");
            return;
        }
        const checkChannel = updateChannel;
        if (inFlightCheck.current && latestChannel.current === checkChannel) {
            logUpdate(null, "check_reuse", { channel: updateChannel, elapsed_ms: 0 });
            return inFlightCheck.current;
        }
        if (latestChannel.current !== checkChannel) {
            activeCheckId.current += 1;
            inFlightCheck.current = null;
            clearCheckTimeout();
            latestChannel.current = checkChannel;
        }
        activeCheckId.current += 1;
        const checkId = activeCheckId.current;
        const promise = (async () => {
            const checkStart = performance.now();
            dispatch({ type: "CHECK_START" });
            logUpdate(null, "check_start", { channel: updateChannel });
            clearCheckTimeout();
            checkTimeoutRef.current = setTimeout(() => {
                if (activeCheckId.current === checkId) {
                    activeCheckId.current += 1;
                    inFlightCheck.current = null;
                    dispatch({ type: "CHECK_TIMEOUT", message: "Update check interrupted. Check again." });
                    logUpdate(null, "check_timeout", { checkId });
                }
            }, UPDATE_CHECK_UI_TIMEOUT_MS);
            try {
                const res = await checkForPluginUpdate(effectiveCurrentVersion, opts.force);
                if (activeCheckId.current !== checkId ||
                    latestChannel.current !== checkChannel ||
                    (res.status !== "failed" && res.channel !== checkChannel)) {
                    return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
                }
                const elapsed_ms = Math.round(performance.now() - checkStart);
                if (res.status === "failed") {
                    logUpdate(null, "check_failed", { message: res.message || "unknown", elapsed_ms });
                    dispatch({ type: "CHECK_FAILED", message: res.message || "Failed to check for updates", result: res });
                    if (opts.notify && opts.force) {
                        toaster.toast({
                            title: "Update Check Failed",
                            body: res.message || "Failed to check for updates",
                            duration: 3000
                        });
                    }
                }
                else if (res.status === "available") {
                    const candidateVersion = res.candidate?.version;
                    const isStale = (state.installedOverride && candidateVersion === state.installedOverride.version) ||
                        candidateVersion === state.pendingInstallVersion ||
                        candidateVersion === effectiveCurrentVersion;
                    if (isStale) {
                        logUpdate(null, "check_success", { status: "current", stale_coerced: true, elapsed_ms });
                        dispatch({ type: "CHECK_SUCCESS_CURRENT", result: { status: "current", checked_at: res.checked_at, channel: updateChannel } });
                    }
                    else {
                        logUpdate(null, "check_success", { status: "available", version: candidateVersion, elapsed_ms });
                        dispatch({ type: "CHECK_SUCCESS_AVAILABLE", result: res, candidate: res.candidate });
                    }
                }
                else {
                    logUpdate(null, "check_success", { status: "current", elapsed_ms });
                    dispatch({ type: "CHECK_SUCCESS_CURRENT", result: res });
                }
                return res;
            }
            catch (err) {
                if (activeCheckId.current !== checkId ||
                    latestChannel.current !== checkChannel) {
                    return { status: "failed", message: "stale", checked_at: new Date().toISOString() };
                }
                const elapsed_ms = Math.round(performance.now() - checkStart);
                const msg = err instanceof Error ? err.message : String(err);
                logUpdate(null, "check_failed", { message: msg, elapsed_ms });
                dispatch({ type: "CHECK_FAILED", message: msg });
                if (opts.notify && opts.force) {
                    toaster.toast({
                        title: "Update Check Failed",
                        body: msg,
                        duration: 3000
                    });
                }
                return {
                    status: "failed",
                    checked_at: new Date().toISOString(),
                    message: msg
                };
            }
            finally {
                finishCheck(checkId);
            }
        })();
        inFlightCheck.current = promise;
        return promise;
    }, [updateChannel, settingsLoaded, state.installedOverride, state.pendingInstallVersion, effectiveCurrentVersion, clearCheckTimeout, finishCheck]);
    const checkNow = SP_REACT.useCallback(async () => {
        await checkForUpdates({ force: true, notify: true, source: "manual" });
    }, [checkForUpdates]);
    const handleHandoffSuccess = SP_REACT.useCallback(async (version, channel, traceId, handoffStart) => {
        activeCheckId.current += 1;
        clearCheckTimeout();
        inFlightCheck.current = null;
        dispatch({ type: "INSTALL_SUCCESS", version, channel, preInstallVersion: currentVersion });
        try {
            const confirmRes = await confirmUpdateInstallHandoff(version);
            if ("status" in confirmRes && (confirmRes.status === "failed" || confirmRes.status === "skipped")) {
                throw new Error(confirmRes.message || "Failed to confirm handoff");
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logUpdate(traceId, "handoff_confirm_failed", { message: msg });
        }
        logUpdate(traceId, "handoff_resolved", { status: "success", elapsed_ms: Math.round(performance.now() - handoffStart) });
        onInstallVersionConfirmed?.(version);
        toaster.toast({
            title: "Installation Initiated",
            body: `Requested installation of v${version} via Decky Loader.`,
            duration: 3000
        });
    }, [currentVersion, onInstallVersionConfirmed, clearCheckTimeout]);
    SP_REACT.useEffect(() => {
        if (!state.installedOverride)
            return;
        if (currentVersion &&
            currentVersion !== "Loading..." &&
            (currentVersion !== state.installedOverride.preInstallVersion ||
                currentVersion === state.installedOverride.version)) {
            dispatch({ type: "CLEAR_INSTALLED_OVERRIDE" });
        }
    }, [currentVersion, state.installedOverride]);
    SP_REACT.useEffect(() => {
        return () => {
            clearCheckTimeout();
        };
    }, [clearCheckTimeout]);
    SP_REACT.useEffect(() => {
        if (latestChannel.current !== updateChannel) {
            latestChannel.current = updateChannel;
            activeCheckId.current += 1;
            inFlightCheck.current = null;
            clearCheckTimeout();
        }
    }, [updateChannel, clearCheckTimeout]);
    SP_REACT.useEffect(() => {
        let active = true;
        async function loadCache() {
            try {
                const result = await getUpdateCheckContext();
                if (!active)
                    return;
                if (result && !("status" in result && (result.status === "failed" || result.status === "skipped"))) {
                    const ctx = result;
                    const pendingInstall = ctx.pending_update_install;
                    if (pendingInstall?.version &&
                        ctx.effective_installed_version === pendingInstall.version &&
                        hydratedPendingInstallVersion.current !== pendingInstall.version) {
                        const pendingChannel = pendingInstall.channel === "development" ? "development" : "stable";
                        hydratedPendingInstallVersion.current = pendingInstall.version;
                        activeCheckId.current += 1;
                        clearCheckTimeout();
                        inFlightCheck.current = null;
                        dispatch({
                            type: "HYDRATION_COMPLETE",
                            installedReleasePublishedAt: ctx.installed_release_published_at || null,
                            pendingInstall: {
                                version: pendingInstall.version,
                                channel: pendingChannel,
                                preInstallVersion: ctx.installed_version ?? currentVersion
                            }
                        });
                        onInstallVersionConfirmed?.(pendingInstall.version);
                        skipInitialCheck.current = true;
                    }
                    else {
                        dispatch({
                            type: "HYDRATION_COMPLETE",
                            installedReleasePublishedAt: ctx.installed_release_published_at || null,
                        });
                    }
                    if (settingsLoaded &&
                        ctx.last_checked_at &&
                        ctx.last_checked_channel === updateChannel) {
                        const hasPending = !!ctx.pending_update_install &&
                            ctx.effective_installed_version === ctx.pending_update_install.version;
                        if (ctx.last_available_tag && !hasPending) {
                            void checkForUpdates({ force: false, notify: false, source: "automatic" });
                        }
                    }
                }
                else {
                    dispatch({ type: "HYDRATION_COMPLETE", installedReleasePublishedAt: null });
                }
            }
            catch (err) {
                if (active) {
                    dispatch({ type: "HYDRATION_COMPLETE", installedReleasePublishedAt: null });
                }
            }
        }
        void loadCache();
        return () => {
            active = false;
        };
    }, [currentVersion, onInstallVersionConfirmed, updateChannel, settingsLoaded, checkForUpdates, clearCheckTimeout]);
    SP_REACT.useEffect(() => {
        if (!isHydrated || !settingsLoaded) {
            return;
        }
        if (!currentVersion || currentVersion === "Loading...") {
            return;
        }
        const isFirstMount = !hasChecked.current;
        hasChecked.current = true;
        if (isFirstMount) {
            if (skipInitialCheck.current) {
                logUpdate(null, "initial_check_skipped_hydration");
                return;
            }
            if (automaticUpdateChecks) {
                void checkForUpdates({ force: false, notify: false, source: "automatic" });
            }
        }
        else {
            void checkForUpdates({ force: true, notify: false, source: "automatic" });
        }
    }, [updateChannel, currentVersion, isHydrated, settingsLoaded, automaticUpdateChecks, checkForUpdates]);
    SP_REACT.useEffect(() => {
        if (!isHydrated || !settingsLoaded) {
            return;
        }
        if (!automaticCheckToggleHydrated.current) {
            automaticCheckToggleHydrated.current = true;
            return;
        }
        if (!automaticUpdateChecks || !currentVersion || currentVersion === "Loading...") {
            return;
        }
        void checkForUpdates({ force: false, notify: false, source: "automatic" });
    }, [automaticUpdateChecks, currentVersion, isHydrated, settingsLoaded, checkForUpdates]);
    const install = SP_REACT.useCallback(async (targetCandidate) => {
        if (state.phase === "installing" || state.phase === "handoff_pending")
            return;
        dispatch({ type: "INSTALL_START" });
        const updateTraceId = generateUpdateTraceId();
        logUpdate(updateTraceId, "install_clicked", { version: targetCandidate.version });
        try {
            const revalStart = performance.now();
            logUpdate(updateTraceId, "revalidate_start", { tag: targetCandidate.tag });
            const revalRes = await revalidatePluginUpdate(targetCandidate);
            const revalElapsed = Math.round(performance.now() - revalStart);
            if (("status" in revalRes && revalRes.status === "failed") ||
                !("version" in revalRes)) {
                const msg = "message" in revalRes ? revalRes.message : "unknown";
                logUpdate(updateTraceId, "revalidate_failed", { message: msg, elapsed_ms: revalElapsed });
                throw new Error(msg || "Revalidation failed");
            }
            logUpdate(updateTraceId, "revalidate_success", { version: revalRes.version, elapsed_ms: revalElapsed });
            const installType = targetCandidate.action === "downgrade_to_stable"
                ? INSTALL_TYPE_DOWNGRADE
                : INSTALL_TYPE_UPDATE;
            const payload = { ...revalRes, updateTraceId };
            const recordStart = performance.now();
            logUpdate(updateTraceId, "record_install_start", { version: revalRes.version });
            const recordRes = await recordUpdateInstallRequested(payload);
            if ("status" in recordRes && (recordRes.status === "failed" || recordRes.status === "skipped")) {
                throw new Error(recordRes.message || "Failed to record install request");
            }
            logUpdate(updateTraceId, "record_install_success", { version: revalRes.version, elapsed_ms: Math.round(performance.now() - recordStart) });
            activeCheckId.current += 1;
            clearCheckTimeout();
            inFlightCheck.current = null;
            dispatch({ type: "INSTALL_SUCCESS", version: revalRes.version, channel: revalRes.channel, preInstallVersion: currentVersion });
            const handoffStart = performance.now();
            logUpdate(updateTraceId, "handoff_start", {
                version: revalRes.version,
                sha256_prefix: revalRes.sha256 ? revalRes.sha256.slice(0, 8) : "none"
            });
            let handoffTimerFired = false;
            const handoffTimer = new Promise((resolve) => {
                setTimeout(() => {
                    handoffTimerFired = true;
                    resolve();
                }, 3000);
            });
            const installerPromise = invokeDeckyInstaller(revalRes.artifact_url, revalRes.version, revalRes.sha256, installType, updateTraceId);
            await Promise.race([installerPromise, handoffTimer]);
            if (handoffTimerFired) {
                logUpdate(updateTraceId, "handoff_pending", { status: "installer_handoff_pending", elapsed_ms: Math.round(performance.now() - handoffStart) });
                dispatch({ type: "INSTALL_HANDOFF_PENDING" });
                void (async () => {
                    try {
                        await installerPromise;
                        await handleHandoffSuccess(revalRes.version, revalRes.channel, updateTraceId, handoffStart);
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        logUpdate(updateTraceId, "handoff_rejected", { message: msg, elapsed_ms: Math.round(performance.now() - handoffStart) });
                        try {
                            const clearRes = await clearPendingUpdateInstall(revalRes.version);
                            if ("status" in clearRes && (clearRes.status === "failed" || clearRes.status === "skipped")) {
                                throw new Error(clearRes.message || "Failed to clear pending install");
                            }
                        }
                        catch (clearErr) {
                            const clearMsg = clearErr instanceof Error ? clearErr.message : String(clearErr);
                            logUpdate(updateTraceId, "pending_clear_failed", { message: clearMsg });
                        }
                        void checkForUpdates({ force: false, notify: false, source: "automatic" });
                        dispatch({ type: "INSTALL_FAILED", message: msg });
                        toaster.toast({
                            title: "Installation Failed",
                            body: msg,
                            duration: 4000
                        });
                    }
                })();
            }
            else {
                await installerPromise;
                await handleHandoffSuccess(revalRes.version, revalRes.channel, updateTraceId, handoffStart);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            try {
                const clearRes = await clearPendingUpdateInstall(targetCandidate.version);
                if ("status" in clearRes && (clearRes.status === "failed" || clearRes.status === "skipped")) {
                    throw new Error(clearRes.message || "Failed to clear pending install");
                }
            }
            catch (clearErr) {
                const clearMsg = clearErr instanceof Error ? clearErr.message : String(clearErr);
                logUpdate(updateTraceId, "pending_clear_failed", { message: clearMsg });
            }
            void checkForUpdates({ force: false, notify: false, source: "automatic" });
            dispatch({ type: "INSTALL_FAILED", message: msg });
            toaster.toast({
                title: "Installation Failed",
                body: msg,
                duration: 4000
            });
        }
    }, [state.phase, handleHandoffSuccess, checkForUpdates, currentVersion, clearCheckTimeout]);
    return {
        effectiveCurrentVersion,
        candidate: state.candidate,
        checkResult: state.checkResult,
        errorMessage: state.errorMessage,
        isChecking: state.phase === "checking",
        isInstalling: state.phase === "installing",
        isHandoffPending: state.phase === "handoff_pending",
        installedReleasePublishedAt: state.installedReleasePublishedAt,
        checkNow,
        install,
    };
}

// THIS FILE IS AUTO GENERATED
function FaExclamationTriangle (props) {
  return GenIcon({"attr":{"viewBox":"0 0 576 512"},"child":[{"tag":"path","attr":{"d":"M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"},"child":[]}]})(props);
}function FaCheckCircle (props) {
  return GenIcon({"attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"},"child":[]}]})(props);
}

// THIS FILE IS AUTO GENERATED
function IoMdRefresh (props) {
  return GenIcon({"attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M256 388c-72.597 0-132-59.405-132-132 0-72.601 59.403-132 132-132 36.3 0 69.299 15.4 92.406 39.601L278 234h154V80l-51.698 51.702C348.406 99.798 304.406 80 256 80c-96.797 0-176 79.203-176 176s78.094 176 176 176c81.045 0 148.287-54.134 169.401-128H378.85c-18.745 49.561-67.138 84-122.85 84z"},"child":[]}]})(props);
}

const buttonRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minHeight: "20px",
    lineHeight: "20px",
};
const spinnerSlotStyle = {
    width: "16px",
    height: "16px",
    flex: "0 0 16px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};
function PluginUpdateSection({ currentVersion, updateChannel, automaticUpdateChecks, settingsLoaded, onToggleUpdateChannel, onToggleAutomaticUpdateChecks, onInstallVersionConfirmed }) {
    const { effectiveCurrentVersion, candidate, checkResult, errorMessage: errorMsg, isChecking, isInstalling, isHandoffPending, installedReleasePublishedAt, checkNow, install: handleInstall, } = usePluginUpdateController({
        currentVersion,
        updateChannel,
        automaticUpdateChecks,
        settingsLoaded,
        onInstallVersionConfirmed,
    });
    const handleToggleChannel = (checked) => {
        if (checked) {
            DFL.showModal(SP_JSX.jsx(DFL.ConfirmModal, { strTitle: "Enable Development Releases?", onOK: () => onToggleUpdateChannel(true), children: SP_JSX.jsx("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: "Includes prerelease builds intended for testing. These builds may contain regressions." }) }));
        }
        else {
            onToggleUpdateChannel(false);
        }
    };
    const handleInstallClick = (targetCandidate) => {
        if (targetCandidate.action === "downgrade_to_stable") {
            DFL.showModal(SP_JSX.jsx(DFL.ConfirmModal, { strTitle: "Revert to Stable?", onOK: () => handleInstall(targetCandidate), children: SP_JSX.jsxs("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: ["Are you sure you want to revert to stable v", targetCandidate.version, "? This is a downgrade and could result in data loss or configuration issues."] }) }));
        }
        else {
            void handleInstall(targetCandidate);
        }
    };
    const isLocalBuild = effectiveCurrentVersion.includes("+");
    const isDeckyAvailable = isDeckyInstallerAvailable();
    const canInstallCandidate = isDeckyAvailable && (!isLocalBuild || candidate?.channel === "stable");
    const getActionText = (c) => {
        switch (c.action) {
            case "move_to_stable":
                return `Move to Stable v${c.version}`;
            case "downgrade_to_stable":
                return `Revert to Stable v${c.version}`;
            default:
                if (c.channel === "development") {
                    return `Install development build v${c.version}`;
                }
                return `Update to v${c.version}`;
        }
    };
    const getStatusContent = () => {
        if (isChecking) {
            return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx(DFL.Spinner, { size: "small", style: { color: "#1a9fff" } }), SP_JSX.jsx("span", { children: "Checking..." })] }));
        }
        if (errorMsg) {
            return (SP_JSX.jsx("span", { style: { color: "#f87171" }, children: errorMsg.includes("interrupted")
                    ? `Check interrupted after ${UPDATE_CHECK_UI_TIMEOUT_MS / 1000} seconds`
                    : "Failed to check" }));
        }
        if (checkResult?.status === "current") {
            return SP_JSX.jsx("span", { style: { color: "#4ade80" }, children: "Up to date" });
        }
        if (checkResult?.status === "available") {
            return (SP_JSX.jsx("span", { style: { color: "#60a5fa" }, children: candidate?.channel === "development" && effectiveCurrentVersion.includes("dev") && !installedReleasePublishedAt
                    ? "Latest available development build"
                    : "Update available" }));
        }
        return SP_JSX.jsx("span", { children: "Never checked" });
    };
    const lastCheckedText = checkResult?.checked_at
        ? `Last checked: ${new Date(checkResult.checked_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`
        : undefined;
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Updates", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Installed Version", padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsxs("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: [effectiveCurrentVersion, " ", isLocalBuild ? "(Local Build)" : ""] }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Receive development releases", description: "Includes prerelease builds intended for testing. These builds may contain regressions.", checked: updateChannel === "development", onChange: handleToggleChannel }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Automatically check for updates", description: "Checks in the background while the plugin is loaded.", checked: automaticUpdateChecks, onChange: onToggleAutomaticUpdateChecks }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Status", description: lastCheckedText, padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsx("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }, children: getStatusContent() }) }) }), errorMsg && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { display: "flex", gap: "8px", color: "#f87171", padding: "10px 15px", fontSize: "13px" }, children: [SP_JSX.jsx("span", { style: { flexShrink: 0, marginTop: "2px", display: "inline-flex" }, children: SP_JSX.jsx(FaExclamationTriangle, {}) }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx("div", { children: errorMsg }), checkResult?.status === "failed" && checkResult.retry_after && (SP_JSX.jsxs("div", { children: ["Try again after ", new Date(checkResult.retry_after).toLocaleString()] }))] })] }) })), candidate && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Candidate", padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsxs("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: [SP_JSX.jsxs("div", { children: ["New version: v", candidate.version, " (", candidate.channel, ")"] }), candidate.action === "downgrade_to_stable" && (SP_JSX.jsx("div", { style: { color: "#f87171", fontSize: "12px", marginTop: "4px" }, children: "Warning: Reverting to stable is a downgrade." }))] }) }) })), candidate && canInstallCandidate && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => handleInstallClick(candidate), disabled: isChecking || isInstalling, children: SP_JSX.jsx("div", { style: buttonRowStyle, children: isInstalling ? (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx("div", { style: spinnerSlotStyle, children: SP_JSX.jsx(DFL.Spinner, { size: "small", style: { color: "#1a9fff" } }) }), SP_JSX.jsx("span", { children: isHandoffPending ? "Waiting for Decky..." : "Preparing..." })] })) : (SP_JSX.jsx("span", { children: getActionText(candidate) })) }) }) })), candidate && !canInstallCandidate && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: true, padding: "standard", children: SP_JSX.jsx("div", { style: { color: "#f87171", fontSize: "13px", marginBottom: "8px" }, children: isLocalBuild && candidate.channel !== "stable"
                            ? "Local builds can only self-update to a stable release. Install this development release manually from GitHub Releases."
                            : "Automatic installation is unavailable in this Decky environment. Install this release manually from GitHub Releases." }) }) })), candidate && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => DFL.Navigation.NavigateToExternalWeb(candidate.release_url), children: "View Release Notes" }) })), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => checkNow(), disabled: isChecking || isInstalling, children: SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }, children: [isChecking ? (SP_JSX.jsx(DFL.Spinner, { style: { width: "16px", height: "16px", color: "#1a9fff" } })) : (SP_JSX.jsx(IoMdRefresh, {})), SP_JSX.jsx("span", { children: "Check now" })] }) }) })] }));
}

const STEAM_DECK_CONTROLLER_TYPE = 4;
const LEGION_GO_S_CONTROLLER_TYPE$1 = 102;
const AFFLICTED_CONTROLLER_TYPES = new Set([
    LEGION_GO_S_CONTROLLER_TYPE$1,
]);
const validControllerIndex$1 = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0;
const validControllerType = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0;
const readControllerStore = (internals) => {
    try {
        const boundary = internals ?? globalThis;
        const upper = boundary.ControllerStore;
        if (upper && typeof upper.GetControllers === "function")
            return upper;
        const lower = boundary.controllerStore;
        if (lower && typeof lower.GetControllers === "function")
            return lower;
        return null;
    }
    catch (_error) {
        return null;
    }
};
const extractControllers = (store) => {
    try {
        if (!store)
            return null;
        const getControllers = store.GetControllers;
        if (typeof getControllers !== "function")
            return null;
        const value = getControllers.call(store);
        return Array.isArray(value) ? value : null;
    }
    catch (_error) {
        return null;
    }
};
const extractControllerType = (record) => {
    try {
        if (record === null || typeof record !== "object")
            return null;
        const value = record.eControllerType;
        return validControllerType(value) ? value : null;
    }
    catch (_error) {
        return null;
    }
};
const extractControllerIndex = (record) => {
    try {
        if (record === null || typeof record !== "object")
            return null;
        const value = record.nControllerIndex;
        return validControllerIndex$1(value) ? value : null;
    }
    catch (_error) {
        return null;
    }
};
const readControllerTypeAtIndex = (controllerIndex, rawControllers) => {
    for (const record of rawControllers) {
        const index = extractControllerIndex(record);
        if (index === null || index !== controllerIndex)
            continue;
        return extractControllerType(record);
    }
    return null;
};
const controllerTypeForIndex = (controllerIndex, internals) => {
    try {
        if (!validControllerIndex$1(controllerIndex))
            return null;
        const controllers = extractControllers(readControllerStore(internals));
        if (!controllers)
            return null;
        return readControllerTypeAtIndex(controllerIndex, controllers);
    }
    catch (_error) {
        return null;
    }
};
const getConnectedControllerTypes = (internals) => {
    try {
        const controllers = extractControllers(readControllerStore(internals));
        if (!controllers)
            return [];
        const values = new Set();
        for (const record of controllers) {
            const type = extractControllerType(record);
            if (type === null)
                continue;
            values.add(type);
        }
        return Array.from(values).sort((left, right) => left - right);
    }
    catch (_error) {
        return [];
    }
};
const sourceFilterForControllerType = (controllerType, requestedFilter) => {
    if (!requestedFilter)
        return false;
    if (controllerType === null)
        return requestedFilter;
    return !AFFLICTED_CONTROLLER_TYPES.has(controllerType) && requestedFilter;
};
const KNOWN_CONTROLLER_TYPES = new Map([
    [STEAM_DECK_CONTROLLER_TYPE, "Steam Deck"],
    [LEGION_GO_S_CONTROLLER_TYPE$1, "Legion Go S"],
]);
const formatConnectedControllerTypes = (types) => {
    if (!Array.isArray(types))
        return "Unknown";
    const sorted = Array.from(new Set(types.filter(validControllerType)))
        .sort((left, right) => left - right);
    if (sorted.length === 0)
        return "Unknown";
    const labels = [];
    for (const type of sorted) {
        const label = KNOWN_CONTROLLER_TYPES.get(type);
        labels.push(label === undefined ? `Type ${type}` : `${label} (${type})`);
    }
    return labels.join(", ");
};

function VersionsSection({ pluginVersion, deckyVersion, steamosVersion, controllerTypes, }) {
    return (SP_JSX.jsx(DFL.PanelSection, { title: "Versions", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: true, childrenLayout: "below", padding: "standard", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: compactTextStyle, children: [SP_JSX.jsxs("div", { children: ["Decky Metadata: ", pluginVersion.trim() || "Unknown"] }), SP_JSX.jsxs("div", { children: ["Decky: ", deckyVersion.trim() || "Unknown"] }), SP_JSX.jsxs("div", { children: ["SteamOS: ", steamosVersion.trim() || "Unknown"] }), SP_JSX.jsxs("div", { children: ["Controller Types: ", formatConnectedControllerTypes(controllerTypes)] })] }) }) }) }));
}

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

const PLAYHUB_COMMUNITY_IGN_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAErpJREFUeJztnfl/E2Uex/dvkbK70nKI5T4FQQ6XSwQWBQERRVkRd1FxEUHkUBZc0UU8UEFEURABRVwvDkGuFSFN0jPpkaZpmzZtrjZn90mnhtJkZp65mpLv5/t6/8CrTOY5Zt4zzzPzzPP8wXRbHwDI8oeM5wCADAIBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASNNDBbDmj4i3traJh23ugoxnEmQBPVSA2p27JM5+Fp4vjmU8kyAL6KECtFis0gLEQyFz3/yM5xPc6vREAQpHjGuLxaUFYFG+5LGMZxXc6vREAZwvbZE9+1m4P9iX8axmN5b+g+2Lljk3bHZtf71m86sVj6+0DhmT8VzpS08RoGz2/LL7HxD+7f3+Rx4BwtVOYfvie6ZV/u1pU06eERmr3/Nh1OORwH/xkvZUCkeOdzy3tuHAQd/ps0FTQWuZPVTlCDmqdafyqdXy+emV61izLnj1WjwSSa321pJS146d5jzd2p/OjVsjtXVdYKk0HjxUOPwuo0+8zAtgf3BJ4NffWM3a5i8W/hJ2VPMIwKJw2Fi2vaXfoLZYLFReUf38i7pr0PDJZ9J5YN0V1TsvmTKTnfQs55zl1R6JKpLMku2vD7Xa7LL7ibjdVf9Yo0sN1+7YKZZKLBAoX/yooadfJgVgfnt/Ot0W72juW4eMZn+05I9I/kU27IseEXYVqqgU/tJiLSqb9VcdM2mQAJVPPBX87Tp/SfUKaQFqNr0SD6e56otF42eHC3r31VjDEgKwiLe2Fo2bbNxJmDEBHM+9EPX6kuWMNjYKfy9fupz/ANRs3ib8ynvqzI2/xmLuPXsL/thPl3zqLgBr6QWvF/CXUd+QEKBm63YVQjYd+5o1mbTUsLQALNhN0rjzMBMC5OQ1HjrSpZC+Mz8L/1v3xlsKav/rk8Kv3O/v7fJfgavXrINGas+tjgIU/Kl/w8cH49EofwF1DzEB7IuXxSMqM5a8DKlDVoDkxdEIulsAc+5A/8XLqYWsf3uPsAE7p/mrnrV8hF85Vj+f+r+sL6H97qmXAEV3TWIdO/6iGRRpBWBmhqudqvfJ+srFd09VXcOyArAw7oTsVgHY2R+8bkpbQseza4Vt2JVbSd3HC26/g/2qdNrstP8fcTdoOTZ6CWCbtzDq8Sgol2GRVgDXqzs07pb15SCAHL37Bi5dESuhfdEyYTOll6KiMRPb1bpTbINIbV3h8HEZFMC+8OGYP6CoUMZFWgFay2za92xf8DAEkMJz+Eux4oXKKzresPTKjYfDiuq9bM6Dwv5ZL0JsmxZrEbv5ZESAsplzY36/ohIZGqkCFI29R5c9h2zlrCkFAdLD6l2sbE3Hvjb3GyRslhgEoTAqn/x7Ryq9cl3bXhN7jtF48FD3C2AdPCpSV6+0RIZGqgASh0bxzv+5HgKkoXDk+JjPl7Zg9bvfNXV6kGy5Y1i4poa/xln3q3TG3M5pVa5Ylfb9JYvypcu7WYDAlV/5y9I9kSpA/bsfyP4q7OQ6KFGv15o/AgJ0xXf6bNpS1e9+L/URcuGwsS1FxXzV7SubNS81uYrHV7bFYqnbs4uxud/gbhPAte3fPKXoWiiPx3vqjPvDj+re3F375lu6Uzp9jtIChmtc7CLV8PGnPPmv37MXAtwE692mbZY0HT9hEnmJaOk/2P/LJZmjUu2UeMRZs+mVtL9ybX+9ewRgGscCCjq+rJdcu3NXyZSZBo1o0lLAVpudbcauHZGGRo6SxIon/kVRBrJcgOC166nlCVVUSV+MC/48gPUNxKqjxWwRxk1I0PzfH9IcnWCLReE9Wp0AEpnvGvF43a53LAOGGH0gVBdQEMDEPUo3+U6Tk2wWwDZ3QVt7Sz1YYGYV7dywqXzp46XT77cMGCr/81659e+8n6Z+T59ltwjZn5v7DCyZMsO+6BHHmhfce/b6L16OBYPs5zWbXtX3/EgVoGj0BM5nWeyaWnbffEMPgfYCJgVgd6fW4hKectkfeoQ/A9ksQMnkGSWTpqt7OibAnOncgmo8dKTg9gEq95aTVzR2Ytl9yobKqRCg4YDMT4RgbeuiUXcbWv+6FPCGAO3vNHiKFqqoZPdwzgxkswBisCaybf6iksnTeTZmndp4KMRqoW7X22Ldhpt2PnIcuwIVjb2HZ2NZFAuQkxdtlH/py25Hhg5y1LGAnQUwJcYdpn+k0SWq123kzECWC1DQu2/pjLnOjVs8h79k7ZBQlUM4m9vaR7pyDl22zVngeO4Fni2t+SNYEh37j0YjrtrA1WtNX33j2rHTvuBhFa/DlArA2ng850flilVG17xeBewiALuyJI+gRMR8fs7BiNkoQK9cdoF3f7g/eM0Ua5Ga3STa1KxxrE5nCvoMbLEWSiTHlGgtKWUqsvOP8x6tVACJF97J8J3+WeMQYh1RKgDDve9j2TKycO/dz5OBrBKgdNr9niPHIm43TwUJEXbWCB92aSUnz//LRf50Y4GA99SZikdXSJ+LSgXg6SaK9UPYxZUlZwT17+wpX/Jo2mesKgQw9x3EdYhjMZ5WblYJoO4Tp9biUu3PAZuOn1CRNAv7wqV6CcC6+2LvoW8UtrRMTLmy2fPVFYEz2Klc+pfZ2gVgVL/4Mk+K/nMXiAmgNgKXrqh/vJP4IGaf6qSln9kpEqBk6kzZ5FzbXhNLy2gB2hJv3PxdXlSpE4DdTFoKi3hSlJ29BgJ0RPPJ79S9B615ZbuWdHUUoPKJp+STe3BJBgVg4b9wUQcBbutje2AxT3LhKof0pQ0C3Aj3RweUpli1+vk2bR8Z6ihA9Xr5hoHE08/uEYBFYaf3D6oFYHh/PMWTnPOlzRCAN1zb/s2fHLu9xlvlH8lJh44CuLbK34usg0dlXADbvIW6CFA4egJP/ccCAYmhKxDgpuB83i9QOn1OLBDUmKKOAtRs2SabnMSp0H0CzF+kiwAm7t5Xw/5PIYB8uLbvVJqifdEy2Qcv0qFnE+iFDbLJFU+8N5sEMOflc330E4+XTJ0JAaSiYd8Bda+Hqv7+nJYZpnQUoOLRFbLJSUx1disKYOLTvi3R+b4MAUSj+cRJLVNZaZnXQEcBiifcK5tc3Zu7s0wAdtmSnc5eiIplT2S5AOpaI/6Ll1V/tJ7EvXe/iqTbbj4bNApgysmTXtiGRdjlEnvae6sK0D7vC0+64WqnMI1N1gpgHTrG+eLLwQIL13Foj5biEssdw3RIvVdus5JJtcLOmrqduyRa5GoEuK0PT9nF3j2b+w1mp6ZGHGvWyWZAdwEYzd9xzemd+j1GVgmQpGj0hMqV//AcPirdQ4rU1hYO020K7II/9fdfkBoOFPP7vT/8VL12A//Hh0oF4Pl2lkmiy1DttJRMnSWbASMEKBw5Pi458FGIWDBoHXrT0K/sFOCmqhl+l/3BJdXrNjZ+8nng6rWo19tRFz4/51DQyhVP1+7cxdNFNvcblBwQylojLYVFnqNf1Wz5V/nS5UXjpqg47ZQKYJv3kOzhZMHukwbVdqYEYNS/9wFP2Rs//bzzr7JfgFQsA4YUT5rGrhk8Gzs3bhG6Fp4vjvJ0lC13DmcngXXQKF2GHCv+IKZXLs8kIvFwmLX4jajbDApgzr0z4qqVTb0tHu88Ji+bBSh/eDnr+Fvu4PgCWIT6t/d0fsTpO3tO9dokBbcPYH21qtXKlnVQ8Ulk2k+ZUyPa7E2dpEQ7GRSAwdMDYRG48mvy8pTNApTee59QgLCr1n/xMruEu7a9VrH8ycKhHB8A5OQ1Hf0qtS4SU0JwfGqUWN9q8TLnS1vYAWbahMorhHnJq9cqm71MhQCWO0fEgi0850EsEKxa9Yy+dZ5ZAdhpHSww85S94rEnhZ9kswAM/4U0M/xE6t3WfKmT2NxnoP+8aHc2VFlVdNckFelGvb7kNIycqJsWpWE/1zRSQnh/OFU0eoJeFZ5hAdpXAOF5LxmucQnPvrNcgNKZc9NWh//8BbEGPbvAy441jzY2sj2LJVr/9ntpf+Vcv0lp/tUJYOk/JMozjdTvwTo53p9OV65YxZrRGis84wIwmr/9nqfUNVu3m7JeAJP4mheeI8dS+6nFd0/lnCGdNTPSTvfpXP9y2mWGQ/YKdmNRmnnVUyM6nl3LU4ouwUxgrbXA5f/5zp73nTmnAmHFQeno3P82QoDExHgcjcBYS0vRmIk8Xxjf2gKwNnGkoSFtwTxfHu98H7AOG6NsIYlotMv3JYlJEUU+Dyibu0BF5rVMjuvlezfU/SEsqmCcACbh6QVHJGYQk2svRZu9t7YAjIrH/iZWTv+lK8kpha1Dx/DUWue4Mb9ITl7DgYNiqdS99a66nGsRgPU3eJYc7eaIer2dl3Y0SAB2s2WtfF0yzO6Ht7wAJsm3JKxPnJjH6rb2BTLkxtJ0ieTdPGgSffiQ6G9wT1SmowAMdq2NuNPf/TIVjZ8dVlRAdQIwHM/8U5cM1+54IxsEYFdoib5R8tPp5LRWnCF83WfuP1hsg5DNbhk4XHW2tS+RVDJpulgLMCORXFPHaAESj0T1WBC2dFrXmSxuTQHa53wWWyvAsWadsI2yRSXicWHi0dJZ89L+P9NJ46RDuiySVzx+SshRraBchoX/wqUuDx4MFEA4LtoWAw/876qhk4h191CIxLznJ75NLaf794UVFEwszo5NmU34VXW6F5At1kLZWdS7RwCGJX+E7+fz/EUzItKuZ2qoAAxFQ3RTQ+lkxkrJxFigXrm1r/+ny4WBNdOF/6197Q3+2mk6erzjKKY8Sms++Z1F+Xowqch+aqNgpficPOeGTUo7OTpG5crVaQr4L5mVbDQKwNqfkdo6dRmu2/2e0WdjZgbDmRITbS/tPL1e1OcT7nT2hx7hryDnho75NnxnzyX/GI9EnetfNvXWZ6kV1seQXttdgQDtsG5x01ffqDgbNIZDZI14VsC0K0olQ6MAJmHuAuVLZTZ9862WifU5yZgApvZrQ8NHB5K3gsLhiQ8D2GWbv9WYfAkQ/r2FzUzQfdrxhv2fSORBqQACJVNner44Kq2WXhGpq7M9sFiqgJLfMGgXgFE6Y46iGWMbDhxU/eBOEZkUoONUmDy96cRJdtInv5MKlVdwVlNizHP7+Gf28+C164k9GNBhKujdt/Gzw2J5UCeAgHXwaMczz/vOnjfIhKinybV1u+zSgAV/7Nd46IjYTnQRoL2wozxHj8vmOVJXX7F8ZbedfpkXQKB4/JTiCR1fJzZ/81+eo5s8MIWjJyTeBhg84ThLwv3+Pt/5C4Fff+sMu5Br37k5L7901ryqp5+t3bnLc/hL7/c/+s/9og7vD6fY2Vyz+VXb3IWKLqJlsx9wf/CRP6WArMGmYzWWTJ7h3rM3zXPheNx/4VLVqmdUDFfRQk8RoDPVa9fzCNANPSRgFL1yWd+DXVPYTTuxVtCUmea+Kj/z0EhPFMCSP0K6WyaETXyWWQA46YkCMIK/pVlctXPEgsHUCTYAUEoPFUB2xvOGj0XnmgSAnx4qgLnf4JhfaqV1I76mBQTpoQIA0D1AAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAEAaCABIAwEAaSAAIA0EAKSBAIA0EACQBgIA0kAAQBoIAEgDAQBpIAAgDQQApIEAgDQQAJAGAgDSQABAGggASAMBAGkgACANBACkgQCANBAAkAYCANJAAECa/wNL4ZWiPylAFAAAAABJRU5ErkJggg==";
const PLAYHUB_COMMUNITY_RAWG_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrFhUAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAGlQTFRFAAAABAQElJSU////9vb23NzcxcXFubm5s7OzZWVlEBAQCAgIjIyM/Pz86enpy8vLHh4e1tbWe3t7m5ub+fn5U1NTWVlZSEhIgYGBqampbW1t4+PjJSUlLCwsNjY2Ozs78PDwGBgY8/Pz0uSjuQAACCBJREFUeJztnXtbEzkUxk8oUJuWy4gWEBB3v/93WlYWlVsLYqcUKLPJgKurpT15cqZvMs37h/LocHL6ay4ntzOKFlwK7QBaCQDaAbQSALQDaCUAaAfQSgDQDqCVAKAdQCsBQDuAVgKAdgCtBADtAFoJANoBtBIAtANoJQBoB9BKANAOoJUAoB1AKwFAO4BWAoB2AK0EAO0AWgkA2gG0EgC0A2glAGgH0EoA0A6glQCgHUArAUA7gFYCgHYArQQA7QBaCYDv7xeqEHHk/zapqMLwxML8TSwJ1SJlZP/ILQKi9kDG7KxSvQ0UnaGAHzrXeflDe6hHt/bjz6cC+DcBkgFgZRBoysu/jeHOXS5kd6oCagK/a131LGGqsjIEDcCosXZZVrPKCggZgGkKWV8vXVv7lREIGQBl1NfNUb6+fF5dIwgawLNMTdg6qwpBDADM2KBapxVFRjEAyEYmSFAP1dSBGACQ2uybT9+4q8S2v4nqAXzX5qWdJMgOCVEBoHEZE4i2hagAqGJ1qLTsLCEmAJqaV5sXwnFhTACeNJY1Fx+At6eLXQOy/ptTSXvRATAxQfezpD1/E3NuAkbbn+Q6wigB7JwsOICsuBSzFSUAncuNhXECoOXVU6F4MEoAZiwsCqFOIEoAmZkdj4VC4igBmDZAq0L94PwA6Cn7HOV+iKPGMp1ACDWg3BFqjtwgSC2RzQ/A7uTHlLqlr2M7rE2rIpOKvXd6/CXND8B44g5X+W/2j03V6LuVK9MG5ghglr9b124f6N2x0+MvaJ41YLofhSp2zrX9mdUUdC4zKQwFQNkO2oOOopzdF7z9wnxwarH+JuQAGG92T1WLBSDr0/KIVfCMYv1NyDSB4vm40Z7D1zq5X3VTKAB+6PU9ezgcC+wXhgfAIbDa+8h98mWFBsB+o2+4AcGbM//5UGgALILmAzMq3BSYEIUHwKjBjYsFFoaCBPDhmAugjqOAVYMZDNW1BtA685hsbQHsM8P8mgJQxR8XvAnRTU37AFUwO4Ga1gALgPdgXQGUkYC4zclKAPxNJAAJAOuxBMDFZgLAe6ymAEwkyFzqqSkAou4jb1GotgDY02H/MwJBAti+YO6X1xOAKj4c82rA8qh+AOwe4f4Vc2dg79h/fzg4AHpA6wVzf3D3pI4bI6o14p6Yqd3OkN0gpOLDZc4hoPPsglXwjDL9TUgCMC1g45G7O9z6xip4Rpn+JkRrAK3lGXNnbLl1xXtwepn+JgT7ANVa+caMgVSrU7MTIrYCdC/ZZ8WkDkzP85DUS0FLeTbE9OdL7dzhrFz7a2ynxKZmRdlc6VHZs7G1dcZ/doqCaAIHt+p2UKZLcPhSYzsqO71uP/+vy2FRgYmQVQhnhZ1lc+5IHI+xihKAGQO3jhb5vkBG/Y2eUKqlKAGoYqMnZsvfBKAJCMUAVlECyL7ditmKEoC+kbMVHYBslNP7I7kL9NEBMB1A55OgtegAZLK35+MDoO9GC5tEpZTILYmfFBWAp1sii5xFJrsZtfMFTqREK6NCOr9kHACe1gkau3+TeH7RGACY6b+9TCibPue7YgBQRn+HJ8Ld/7MiAdB87MnX/lJRAJDZBJusGAC8/VJhZuUYANDW+YIDkE6h97PmuC8wYduHuRMkuQDyq+ZXAyZsenB3wvSwopy6NEcA5hP8iiDr8wjoJkmcBZks7N4g70CkbvY7104uOQgMgFeCIbD3saJGgASgite8L9bUk+1PFb1mAbw93h0yM6bY4wCRh8ITagAR936c6TAl8mVMELYJEO2ecc8EFI8uTrGFPiFy2GPmzVFKJnXWb3b9TfgdkeFmjdFUTTgIB0DLvLxBpJcqiQXQAEw/sMY9GFTJQIAGwL8pTrTRq2AcQAMwH2lnwE8eVsMaQOyAuDwdK04AD0AVr1a4KfTu7sRfOYUHYOLhS+7KwMER6zEXhQCAnTSG1IrUq/1+mPQ34Q/gcDBirgvIng6xCgIAHbA/lsg9oZ8VAgD7Fil2ae+OZUeCEAC0B/SKPdM5OIp1e3xaE1B7/INPQvcE/iva34TInaHmAzMg1rf3tWsCVp0he5NAdlocCgDi3hgnfS93UJjCAaB2b5qsYICEF8dCAUC095W7QCyUV/5J4QDgJ5Ol/Y9yI2EwAFThkFNacLs8GACk3v/DLVE/5nWsAQ7x8EqMN0ZmVlvVvGemjojzTVMMn9e4LxcQjAWCArD0mv2qGbFGEBQAbgYpTTR8YBU6WyEBMNNil3WByG6PszJI2KziXMV2fZ6XRGWbveKVrcqsDgYGgN8G9PJVZLfHeUN384GdRmMscn48MACqWGPuEqmisS2xPhoSAJtJRu0wc6OYoLFzXcNcYvyzg9TsSwTEQQEope/YX+rWeTE1Nw9H4QGgP88d3rRUu4ySJhzs8l+e0/1crz7AymldQCCVRnAA2gO1yn3REulX5+YXvPqB0ACUAxv//Gz7ftjOvfqB0ACUBLgHJkws0P3sOQ6EBqB87yD7uIAh8P4v5rMvFej36/Yqd4d3bMUlufr+LXuPYOek7bVE7F0DFBsAe8x2Ggh8Xzs5xybAb6zlG/e42vZbF/BuAuzpiMPExS2+84sGq7/1GbgSALQDaCUAaAfQSgDQDqCVAKAdQCsBQDuAVgKAdgCtBADtAFoJANoBtBIAtANoJQBoB9BKANAOoJUAoB1AKwFAO4BWAoB2AK0EAO0AWgkA2gG0EgC0A2glAGgH0EoA0A6glQCgHUArAUA7gFYCgHYArQQA7QBaCQDaAbQSALQDaC08gH8B8MCNH1oGk2wAAAAASUVORK5CYII=";
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
const COMPATIBILITY_RUNTIME_KEY = "__deckyMetadataCompatibilityRuntime";
const newCompatibilityMetadataState = () => ({
    bypassCounter: 0,
    metadataLoaded: false,
    metadataLoadPromise: null,
    metadataRequestOwners: new Map(),
    screenshotRequestOwners: new Map(),
    loadingMetadata: new Set(),
    loadingScreenshots: new Set(),
    appliedMetadataRef: {},
    compatibilityBaselines: {},
    deferredCompatibilityUpdates: new Map(),
    deferredEditorCompatibilityPublications: new Set(),
    compatibilityDefault: null,
    compatibilityDefaultLoaded: false,
    compatibilityDefaultScope: "all",
    compatibilityDefaultGeneration: 0,
    compatibilityLifecycleGeneration: 0,
    compatibilityDefaultLoadPromise: null,
    compatibilityRevision: 0,
    metadataMatchRevision: 0,
    lastObservedGameDetailAppId: 0,
    routeShield: null,
});
/**
 * Decky loads a new module bundle during an in-place plugin import, while a
 * mounted route can still hold callbacks from the retiring bundle. Keep the
 * mutable compatibility runtime on SteamUI's global host for that handoff.
 * A lifecycle change makes old asynchronous work inert; the shared object
 * ensures a surviving editor observes the current cache, policy, and revision.
 */
const compatibilityRuntime = () => {
    const host = globalThis;
    const existing = host[COMPATIBILITY_RUNTIME_KEY];
    if (existing &&
        typeof existing === "object" &&
        existing.metadataCache &&
        existing.metadataState &&
        existing.revisionListeners instanceof Set) {
        const state = existing.metadataState;
        // Older bundles do not have the reload-owned maps. Keep their public Set
        // fields for callbacks that still hold the retiring import, but make this
        // import's authoritative guards and compatibility queues shared.
        if (!(state.metadataRequestOwners instanceof Map)) {
            state.metadataRequestOwners = new Map();
        }
        if (!(state.screenshotRequestOwners instanceof Map)) {
            state.screenshotRequestOwners = new Map();
        }
        if (!(state.deferredCompatibilityUpdates instanceof Map)) {
            state.deferredCompatibilityUpdates = new Map();
        }
        if (!(state.deferredEditorCompatibilityPublications instanceof Set)) {
            state.deferredEditorCompatibilityPublications = new Set();
        }
        if (typeof state.metadataMatchRevision !== "number")
            state.metadataMatchRevision = 0;
        if (!(existing.matchRevisionListeners instanceof Set)) {
            existing.matchRevisionListeners = new Set();
        }
        return existing;
    }
    const runtime = {
        metadataCache: {},
        metadataState: newCompatibilityMetadataState(),
        revisionListeners: new Set(),
        matchRevisionListeners: new Set(),
    };
    host[COMPATIBILITY_RUNTIME_KEY] = runtime;
    return runtime;
};
const runtime$1 = compatibilityRuntime();
const metadataCache = runtime$1.metadataCache;
const metadataState = runtime$1.metadataState;
const metadataMatchRevisionSnapshot = () => metadataState.metadataMatchRevision;
const subscribeMetadataMatchChanges = (listener) => {
    metadataMatchRevisionListeners.add(listener);
    return () => metadataMatchRevisionListeners.delete(listener);
};
const normalizedSavedSteamAppId = (value) => {
    if (typeof value !== "number" && !(typeof value === "string" && /^\d{1,10}$/.test(value)))
        return null;
    const appId = Number(value);
    return Number.isSafeInteger(appId) && appId > 0 && appId < 0x80000000 ? appId : null;
};
const notifyMetadataMatchChanged = (appId) => {
    const revision = ++metadataState.metadataMatchRevision;
    metadataMatchRevisionListeners.forEach((listener) => {
        try {
            listener(appId, revision);
        }
        catch { /* A trailer update cannot block metadata. */ }
    });
    return revision;
};
const setMetadataCacheEntry = (appId, value) => {
    const key = String(appId);
    const previousMatch = normalizedSavedSteamAppId(metadataCache[key]?.steam_appid);
    metadataCache[key] = value;
    const nextMatch = normalizedSavedSteamAppId(value?.steam_appid);
    if (previousMatch !== nextMatch)
        notifyMetadataMatchChanged(appId);
};
const removeMetadataCacheEntry = (appId) => {
    const key = String(appId);
    const previousMatch = normalizedSavedSteamAppId(metadataCache[key]?.steam_appid);
    delete metadataCache[key];
    if (previousMatch !== null)
        notifyMetadataMatchChanged(appId);
};
const replaceMetadataCacheEntries = (records) => {
    const previous = new Map(Object.entries(metadataCache).map(([key, value]) => [key, normalizedSavedSteamAppId(value?.steam_appid)]));
    Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
    Object.assign(metadataCache, records || {});
    const appIds = new Set([...previous.keys(), ...Object.keys(records || {})]);
    for (const key of appIds) {
        const previousMatch = previous.get(key) ?? null;
        const nextMatch = normalizedSavedSteamAppId(metadataCache[key]?.steam_appid);
        if (previousMatch !== nextMatch) {
            const appId = Number(key);
            if (Number.isInteger(appId) && appId > 0)
                notifyMetadataMatchChanged(appId);
        }
    }
};
const compatibilityRevisionListeners = runtime$1.revisionListeners;
const metadataMatchRevisionListeners = runtime$1.matchRevisionListeners;
const compatibilityRevisionSnapshot = () => metadataState.compatibilityRevision;
const compatibilityDefaultSnapshot = () => metadataState.compatibilityDefault;
const compatibilityDefaultLoadedSnapshot = () => metadataState.compatibilityDefaultLoaded;
const compatibilityDefaultScopeSnapshot = () => metadataState.compatibilityDefaultScope;
const compatibilityLifecycleSnapshot = () => metadataState.compatibilityLifecycleGeneration;
const isCompatibilityLifecycleCurrent = (generation) => generation === metadataState.compatibilityLifecycleGeneration;
const subscribeCompatibilityRevision = (listener) => {
    compatibilityRevisionListeners.add(listener);
    return () => {
        compatibilityRevisionListeners.delete(listener);
    };
};
const notifyCompatibilityRevision = () => {
    const revision = ++metadataState.compatibilityRevision;
    compatibilityRevisionListeners.forEach((listener) => {
        try {
            listener();
        }
        catch {
            // One failed card update must not block other compatibility indicators.
        }
    });
    return revision;
};
/**
 * Trademark, registered, and copyright marks appear in official Steam store
 * names but not in persisted metadata titles, which are already stripped.
 * Every title comparison must erase them, so `cleanTitle` and
 * `normalizedTabText` share this one definition instead of drifting apart.
 */
const TRADEMARK_MARKS = /[\u2122\u00ae\u00a9]/g;
const cleanTitle = (value) => String(value || "")
    .replace(TRADEMARK_MARKS, "")
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
    const browserLocation = windowLocation?.location;
    return [
        location?.pathname,
        location?.search,
        location?.hash,
        windowLocation?.pathname,
        windowLocation?.search,
        windowLocation?.hash,
        windowLocation?.href,
        browserLocation?.pathname,
        browserLocation?.search,
        browserLocation?.hash,
        browserLocation?.href,
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
/**
 * Require Steam's native shortcut identity for operations that write back to
 * an overview. Cached metadata alone must never make an official app eligible.
 */
const isNativeNonSteamShortcut = (overview) => {
    if (!isNonSteamApp(overview))
        return false;
    if (Number(overview?.app_type) === NON_STEAM_APP_TYPE)
        return true;
    try {
        return overview?.BIsShortcut?.() === true;
    }
    catch (_error) {
        return false;
    }
};
const getOverview = (appId) => {
    try {
        return appStore?.GetAppOverviewByAppID?.(appId) ?? null;
    }
    catch (_error) {
        return null;
    }
};
/**
 * Resolve an overview by its own AppID without passing through plugin patches.
 * This is required for writes: GetAppOverviewByAppID intentionally aliases a
 * matched Steam AppID to its shortcut on the rich-details path.
 */
const getNativeOverview = (appId) => {
    const nativeAppId = Number(appId);
    if (!Number.isFinite(nativeAppId) || nativeAppId <= 0)
        return null;
    try {
        const allApps = appStore?.allApps;
        const entries = Array.isArray(allApps)
            ? allApps
            : allApps && typeof allApps === "object"
                ? Object.values(allApps)
                : [];
        return entries.find((overview) => Number(overview?.appid) === nativeAppId) ?? null;
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
/**
 * True only when a joined Steam route context identifies this exact app's
 * Library detail page.  `currentRoutePath` joins pathname, search, hash, and
 * href tokens, while `gameDetailAppIdFromPath` deliberately accepts broader
 * discovery hints.  Identity spoofing needs this stricter boundary: a query,
 * a sidebar item, or a different app must not turn a shortcut into a native
 * app for unrelated Steam consumers.
 */
const isCurrentGameDetailRoute = (routeContext, appId) => {
    if (!Number.isSafeInteger(appId) || appId <= 0)
        return false;
    const tokens = String(routeContext || "").trim().split(/\s+/);
    // `currentRoutePath` currently contributes at most eleven values. Keep this
    // hot-path parser bounded even if a malformed host object appends noise.
    // Every authoritative route token must agree. A stale detail path must not
    // override a current Home, controller, or other-app path during navigation.
    let foundCurrentDetail = false;
    for (let index = 0; index < Math.min(tokens.length, 12); index += 1) {
        const token = tokens[index];
        if (!token)
            continue;
        let pathname = token;
        try {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token))
                pathname = new URL(token).pathname;
            else if (!token.startsWith("/"))
                continue;
            pathname = decodeURIComponent(pathname).split(/[?#]/, 1)[0];
        }
        catch (_error) {
            continue;
        }
        if (/^\/(?:routes\/)?(?:library\/home|controllerconfig)(?:\/|$)/i.test(pathname) ||
            /^\/(?:routes\/)?library\/collections(?:\/|$)/i.test(pathname) ||
            /^\/(?:routes\/)?app\/\d+\/controllerconfigurator(?:\/|$)/i.test(pathname)) {
            return false;
        }
        const match = pathname.match(/^\/(?:routes\/)?library\/(?:(?:app|details)\/(\d+)|[^/?#\s]+\/app\/(\d+))(?:\/[^?#\s]*)?$/i);
        if (!match)
            return false;
        const routeAppId = Number(match[1] || match[2]);
        if (!Number.isSafeInteger(routeAppId) || routeAppId !== appId)
            return false;
        foundCurrentDetail = true;
    }
    return foundCurrentDetail;
};
/**
 * The metadata editor is a separate route, but Steam keeps the selected
 * game's Game Info tree mounted beneath it. For that exact app only, render
 * identity must stay matched while the editor saves a changed packed value.
 * This is intentionally separate from Game Info deferral: entering the editor
 * still releases any held compatibility update.
 */
const isCurrentMetadataEditorRoute = (routeContext, appId) => {
    if (!Number.isSafeInteger(appId) || appId <= 0)
        return false;
    const tokens = String(routeContext || "").trim().split(/\s+/);
    let foundCurrentEditor = false;
    for (let index = 0; index < Math.min(tokens.length, 12); index += 1) {
        const token = tokens[index];
        if (!token)
            continue;
        let pathname = token;
        try {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token))
                pathname = new URL(token).pathname;
            else if (!token.startsWith("/"))
                continue;
            pathname = decodeURIComponent(pathname).split(/[?#]/, 1)[0];
        }
        catch (_error) {
            continue;
        }
        const match = pathname.match(/^\/(?:routes\/)?decky-metadata\/(\d+)\/?$/i);
        if (!match)
            return false;
        const routeAppId = Number(match[1]);
        if (!Number.isSafeInteger(routeAppId) || routeAppId !== appId)
            return false;
        foundCurrentEditor = true;
    }
    return foundCurrentEditor;
};
/**
 * Render identity has one more valid route than compatibility deferral. The
 * exact plugin editor is part of its selected app's still-mounted detail tree;
 * ordinary Game Info protection remains limited to `isCurrentGameInfoRoute`.
 */
const isCurrentMatchedRenderRoute = (routeContext, appId) => isCurrentGameDetailRoute(routeContext, appId) || isCurrentMetadataEditorRoute(routeContext, appId);
/**
 * True only for the exact Game Info tab of this app. Other detail tabs share
 * the app route, but leaving Game Info must release a held compatibility
 * update instead of treating the whole app page as protected.
 */
const isCurrentGameInfoRoute = (routeContext, appId) => {
    if (!isCurrentGameDetailRoute(routeContext, appId))
        return false;
    return String(routeContext || "").split(/\s+/).some((token) => /(?:\/tab\/|[?&#](?:tab|section)=)gameinfo(?:[/?#&\s]|$)/i.test(token));
};
/**
 * A history listener can confirm an exact Game Info return before Steam's
 * window and browser route tokens leave the metadata editor.  Let that short
 * re-entry shield cover only this app and only when the current tokens contain
 * no explicit destination that conflicts with it.  Generic route templates
 * and a shield for another app cannot recover a stale route.
 */
const canRecoverStaleGameDetailRoute = (routeContext, appId) => {
    const shield = metadataState.routeShield;
    if (!shield || shield.appId !== appId)
        return false;
    if (!isCurrentGameDetailRoute(shield.path, appId))
        return false;
    for (const token of String(routeContext || "").trim().split(/\s+/)) {
        if (!token)
            continue;
        let pathname = token;
        try {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token))
                pathname = new URL(token).pathname;
            else if (!token.startsWith("/"))
                continue;
            pathname = decodeURIComponent(pathname).split(/[?#]/, 1)[0];
        }
        catch (_error) {
            continue;
        }
        if (/^\/(?:routes\/)?(?:library\/home|controllerconfig)(?:\/|$)/i.test(pathname) ||
            /^\/(?:routes\/)?library\/collections(?:\/|$)/i.test(pathname) ||
            /^\/(?:routes\/)?app\/\d+\/controllerconfigurator(?:\/|$)/i.test(pathname)) {
            return false;
        }
        const routeAppId = gameDetailAppIdFromPath(pathname);
        if (routeAppId && routeAppId !== appId)
            return false;
    }
    return true;
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
const normalizedTabText = (value) => String(value || "")
    .replace(TRADEMARK_MARKS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
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

let ensureMetadataCacheFn = async () => undefined;
let applyMetadataFn = () => false;
const configureActivityMetadataLoader = (ensureMetadataCache, applyMetadata) => {
    ensureMetadataCacheFn = ensureMetadataCache;
    applyMetadataFn = applyMetadata;
};
const activityRefreshGate = createActivityRefreshGate();
const maybeRefreshSteamNewsForApp = (appId) => {
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return;
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
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            if (!refreshed)
                return;
            const newsKey = (metadata) => JSON.stringify((metadata?.steam_news || []).map((item) => [item.id, item.gid, item.title, item.date]));
            const changed = newsKey(previous) !== newsKey(refreshed);
            const compatibilityChanged = previous?.deck_compat_override !== refreshed.deck_compat_override ||
                previous?.deck_compat_category !== refreshed.deck_compat_category;
            setMetadataCacheEntry(appId, refreshed);
            if (compatibilityChanged) {
                applyMetadataFn(appId);
                notifyCompatibilityRevision();
            }
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
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return null;
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    void maybeRefreshSteamNewsForApp(appId);
    await ensureMetadataCacheFn();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return null;
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
const clearDeckyNativeActivityForApp = (appId, store) => {
    if (!appId)
        return;
    const cache = globalThis[DECKY_NATIVE_ACTIVITY_WINDOW_KEY];
    if (cache?.has(appId))
        cache.delete(appId);
    const appActivityStore = store || globalThis.appActivityStore;
    try {
        const activities = appActivityStore?.m_mapAppActivity;
        const stored = activities?.get?.(appId);
        if (stored?.__deckyNativeActivity)
            activities.delete?.(appId);
    }
    catch (_error) {
        // A changed Steam store shape can still fall back to the cleared cache.
    }
};
const getDeckyNativeActivityForApp = (appId) => {
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    void maybeRefreshSteamNewsForApp(appId);
    const metadata = metadataCache[String(appId)];
    if (!metadata || !metadata.steam_news?.length) {
        clearDeckyNativeActivityForApp(appId);
        return null;
    }
    const cached = deckyNativeActivityCache().get(appId);
    if (cached)
        return cached;
    const native = makeDeckyNativeActivity(appId, metadata);
    if (native)
        deckyNativeActivityCache().set(appId, native);
    return native;
};
const refreshDeckyNativeActivityForApp = async (appId, store) => {
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return null;
    const overview = getOverview(appId);
    if (!appId || !isNonSteamApp(overview))
        return null;
    await ensureMetadataCacheFn();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return null;
    const metadata = metadataCache[String(appId)];
    if (!metadata) {
        clearDeckyNativeActivityForApp(appId, store);
        return null;
    }
    const native = makeDeckyNativeActivity(appId, metadata);
    if (!native) {
        clearDeckyNativeActivityForApp(appId, store);
        return null;
    }
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

// Pure decision logic for the BIsModOrShortcut afterPatch. Extracted so the
// precedence rules are unit-testable: the 2026-07-11 launch regression was an
// ordering bug here (the render shield consumed before the in-call truth
// window), which only surfaced on-device.
const decideBIsModOrShortcut = (input) => {
    const { isPatchedNonSteam, originalRet, bypassCounter, hasCache, isCurrentMatchedRenderRoute, canRecoverStaleRoute = false, consumeShield, } = input;
    if (!isPatchedNonSteam) {
        return { finalRet: originalRet, reason: "not-nonsteam", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    if (originalRet !== true) {
        return { finalRet: originalRet, reason: "original-not-shortcut", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    // In-call truth must outrank the render shield and route-scoped spoofing:
    // Steam's launch path derives the shortcut gameid via GetGameID /
    // GetPrimaryAppID, and spoofing inside those calls makes RunGame receive a
    // plain-appid gameid the client silently drops. The shield must not be
    // consulted here at all — its hit budget belongs to render checks.
    if (bypassCounter === -1) {
        return { finalRet: originalRet, reason: "in-call-truth", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    // Only matched games (in metadataCache) are intentionally spoofed as
    // real Steam apps so their Game Info renders. For any OTHER non-Steam
    // shortcut (Heroic, Ludusavi, unmatched emulator entries), spoofing them
    // as real never-played apps makes Steam tag them "New to Library". Return
    // the native value so they keep their true shortcut status. Placed after
    // the in-call-truth check so nothing outranks bypassCounter === -1.
    if (!hasCache) {
        return { finalRet: originalRet, reason: "not-matched", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    // Steam's Library Home, artwork resolvers, collections, controller pages,
    // and sidebars share this overview prototype. Only the current matched
    // shortcut's Library detail page (or its exact still-mounted metadata
    // editor route) needs to appear native. A history listener can provide one
    // narrow exception: its exact, matching destination may bridge stale editor
    // tokens while the native Game Info tree re-enters.
    if (isCurrentMatchedRenderRoute || canRecoverStaleRoute) {
        const shieldHit = consumeShield();
        if (shieldHit) {
            return { finalRet: false, reason: "render-shield", shieldConsulted: true, shieldHit: true, nextBypassCounter: bypassCounter };
        }
    }
    if (!isCurrentMatchedRenderRoute) {
        return { finalRet: originalRet, reason: "outside-current-detail", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
    }
    // GetPerClientData and BHasRecentlyLaunched arm a short truth window for
    // native callers outside this render path. It must not turn the current
    // matched Game Info/editor render back into a shortcut when the optional
    // shield has expired under a render flood. Keep the window intact for its
    // intended native caller; only withInCallTruth (-1 above) outranks render.
    if (bypassCounter > 0) {
        return {
            finalRet: false,
            reason: "render-route-truth-window",
            shieldConsulted: true,
            shieldHit: false,
            nextBypassCounter: bypassCounter,
        };
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

const matchedSteamAppId = (metadata) => {
    const raw = metadata?.steam_appid;
    if (typeof raw === "boolean" || raw === null || raw === undefined)
        return null;
    const steamAppId = typeof raw === "string" ? Number(raw.trim()) : raw;
    return typeof steamAppId === "number" && Number.isSafeInteger(steamAppId) && steamAppId > 0
        ? steamAppId
        : null;
};
const hasMatchedSteamAppId = (metadata) => matchedSteamAppId(metadata) !== null;
/**
 * Reapply Decky's matched-game fields to a native app-data replacement.
 *
 * Steam rebuilds appData.details when another cache category arrives. The
 * replacement must be populated before GetAppData returns it to SteamUI;
 * otherwise observers can render the transient shortcut-only details and stay
 * there until a later navigation.
 */
const reassertMatchedAppData = (appData, metadata, screenshots) => {
    const details = appData?.details;
    if (!details)
        return false;
    const description = metadata.description || metadata.short_description || "";
    const descriptionsData = {
        strFullDescription: description,
        strSnippet: description,
    };
    const associationData = {
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
    appData.descriptionsData = descriptionsData;
    appData.associationData = associationData;
    details.strFullDescription = description;
    details.strSnippet = description;
    details.rgDevelopers = associationData.rgDevelopers;
    details.rgPublishers = associationData.rgPublishers;
    details.rgFranchises = associationData.rgFranchises;
    // A matched shortcut can inherit Steam screenshot metadata without becoming
    // the real Steam application. Never advertise the shortcut appid as a
    // Community Market target; the quick-link policy independently removes any
    // stale native descriptor that SteamUI may already have rendered.
    if (hasMatchedSteamAppId(metadata)) {
        details.bCommunityMarketPresence = false;
    }
    if (screenshots.length) {
        details.nScreenshots = screenshots.length;
        details.vecScreenShots = screenshots;
    }
    return true;
};

let bypassTraceEnabled = false;
const bypassArmTraceAt = {};
const bIsModTraceAt = {};
const traceBIsModDecision = (appId, path, originalRet, finalRet, reason, shieldState, bypassCounterBefore, bypassCounterAfter, hasCache, isCurrentMatchedRenderRoute) => {
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
        isCurrentMatchedRenderRoute,
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
        const metadataSteamAppId = matchedSteamAppId(metadata);
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
const isCompatibilityCategory$1 = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;
/** Whether this record inherits a numeric global default for the selected scope. */
const isCompatibilityDefaultEligible = (metadata, scope) => scope === "all"
    || (scope === "metadata" && metadata !== undefined)
    || (scope === "steam" && hasMatchedSteamAppId(metadata))
    || (scope === "no-steam" && metadata !== undefined && !hasMatchedSteamAppId(metadata));
const effectiveCompatibilityCategory = (metadata, globalDefault = metadataState.compatibilityDefault, scope = metadataState.compatibilityDefaultScope) => {
    if (isCompatibilityCategory$1(metadata?.deck_compat_override)) {
        return metadata.deck_compat_override;
    }
    if (metadata?.deck_compat_override === "valve") {
        return isCompatibilityCategory$1(metadata.deck_compat_category)
            ? metadata.deck_compat_category
            : null;
    }
    if (isCompatibilityCategory$1(globalDefault) && isCompatibilityDefaultEligible(metadata, scope)) {
        return globalDefault;
    }
    if (isCompatibilityCategory$1(metadata?.deck_compat_category)) {
        return metadata.deck_compat_category;
    }
    return null;
};
const packedCompatibilityValue = (overview) => {
    const packed = Number(overview?.steam_hw_compat_category_packed);
    return Number.isFinite(packed) ? packed : 0;
};
const restoreCompatibilityBaseline = (appId, overview = getNativeOverview(appId)) => {
    const key = String(appId);
    if (!isNativeNonSteamShortcut(overview) ||
        !Object.prototype.hasOwnProperty.call(metadataState.compatibilityBaselines, key)) {
        return false;
    }
    try {
        const packed = packedCompatibilityValue(overview);
        overview.steam_hw_compat_category_packed =
            (packed & -16) | metadataState.compatibilityBaselines[key];
        delete metadataState.compatibilityBaselines[key];
        return true;
    }
    catch (_error) {
        return false;
    }
};
const restoreAllCompatibilityBaselines = () => {
    const overviews = new Map();
    try {
        Array.from(appStore?.allApps || []).forEach((overview) => {
            if (isNativeNonSteamShortcut(overview))
                overviews.set(Number(overview.appid), overview);
        });
    }
    catch {
        // A changed store leaves untouched baselines for a later native update.
    }
    Object.keys(metadataState.compatibilityBaselines).forEach((key) => {
        restoreCompatibilityBaseline(Number(key), overviews.get(Number(key)));
    });
};
/** Publish a compatibility revision without disturbing Steam navigation state. */
const refreshCompatibilitySurfaces = () => {
    return notifyCompatibilityRevision();
};
const applyCompatibilityCategory = (appId, overview, category) => {
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
        const nextPacked = (previousPacked & -16) | category | (category << 2);
        if (nextPacked === previousPacked)
            return false;
        overview.steam_hw_compat_category_packed = nextPacked;
        return packedCompatibilityValue(overview) === nextPacked;
    }
    catch {
        // Steam objects are not always writable during early bootstrap.
        return false;
    }
};
const desiredCompatibilityNibble = (appId, heldNibble, category) => {
    if (category === null) {
        const baseline = metadataState.compatibilityBaselines[String(appId)];
        return Number.isInteger(baseline) && baseline >= 0 && baseline <= 0xf
            ? baseline
            : heldNibble;
    }
    return category | (category << 2);
};
/**
 * Hold only the exact selected Game Info tab. QAM and context-menu overlays do
 * not change this main-window route, while another tab, page, game, or the
 * metadata editor does.
 */
const deferActiveCompatibilityUpdate = (appId, heldNibble, category) => {
    const existing = metadataState.deferredCompatibilityUpdates.get(appId);
    const held = existing?.heldNibble ?? heldNibble;
    if (desiredCompatibilityNibble(appId, held, category) === held) {
        // Repeated edits can return to the already visible state. There is then no
        // stale mutation to replay after the user leaves Game Info.
        metadataState.deferredCompatibilityUpdates.delete(appId);
        return false;
    }
    if (!existing)
        metadataState.deferredCompatibilityUpdates.set(appId, { appId, heldNibble: held });
    return true;
};
/**
 * Apply only compatibility data to an exact native overview object. Steam can
 * replace this non-observable object between callers, so the app-store getter
 * uses this same helper before it returns a replacement to SteamUI.
 */
const applyCompatibilityToOverview = (appId, overview, routeContext = currentRoutePath()) => {
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
        const held = metadataState.deferredCompatibilityUpdates.get(appId)?.heldNibble ?? heldNibble;
        deferActiveCompatibilityUpdate(appId, held, category);
        const heldPacked = (packed & -16) | held;
        if (heldPacked === packed)
            return false;
        try {
            // Reload adoption can find a replacement native object after the old
            // hook lifetime ended. Restore only the held view state in place: the
            // pending policy still waits for Game Info to exit, and this active
            // object must not be republished under a new identity.
            overview.steam_hw_compat_category_packed = heldPacked;
        }
        catch {
            // Steam can replace this private object while the active view is held.
        }
        return false;
    }
    metadataState.deferredCompatibilityUpdates.delete(appId);
    return applyCompatibilityCategory(appId, overview, category);
};
const RETAINED_COMPATIBILITY_BASELINES_KEY = "__deckyMetadataRetainedCompatibilityBaselines";
const retainCompatibilityBaselinesForReload = () => {
    const baselines = metadataState.compatibilityBaselines;
    if (Object.keys(baselines).length === 0 &&
        metadataState.deferredCompatibilityUpdates.size === 0 &&
        metadataState.deferredEditorCompatibilityPublications.size === 0)
        return;
    globalThis[RETAINED_COMPATIBILITY_BASELINES_KEY] = {
        baselines: { ...baselines },
        deferred: Array.from(metadataState.deferredCompatibilityUpdates.values()),
        editorPublications: Array.from(metadataState.deferredEditorCompatibilityPublications),
    };
};
const discardRetainedCompatibilityState = () => {
    delete globalThis[RETAINED_COMPATIBILITY_BASELINES_KEY];
};
const resumeRetainedCompatibilityBaselines = () => {
    const host = globalThis;
    const retained = host[RETAINED_COMPATIBILITY_BASELINES_KEY];
    if (!retained || typeof retained !== "object")
        return;
    const state = retained;
    // Accept the bare baseline record written by the preceding plugin version so
    // an in-place import from that version remains safe.
    const baselines = state.baselines && typeof state.baselines === "object"
        ? state.baselines
        : retained;
    Object.entries(baselines).forEach(([appId, value]) => {
        if (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xf) {
            metadataState.compatibilityBaselines[appId] = Number(value);
        }
    });
    if (Array.isArray(state.deferred)) {
        state.deferred.forEach(({ appId, heldNibble }) => {
            if (Number.isSafeInteger(appId) &&
                Number(appId) > 0 &&
                Number.isInteger(heldNibble) &&
                Number(heldNibble) >= 0 &&
                Number(heldNibble) <= 0xf) {
                metadataState.deferredCompatibilityUpdates.set(Number(appId), {
                    appId: Number(appId),
                    heldNibble: Number(heldNibble),
                });
            }
        });
    }
    if (Array.isArray(state.editorPublications)) {
        state.editorPublications.forEach((appId) => {
            if (Number.isSafeInteger(appId) && Number(appId) > 0) {
                metadataState.deferredEditorCompatibilityPublications.add(Number(appId));
            }
        });
    }
    discardRetainedCompatibilityState();
};
const createCompatibilityReplacement = (overview) => {
    const prototype = Object.getPrototypeOf(overview);
    const NativeOverview = overview?.constructor;
    if (!prototype || typeof NativeOverview !== "function")
        return null;
    try {
        // Publish through Steam's observable native map with a fresh native
        // instance. Constructor-owned state must stay on that instance, while
        // copied fields retain the exact shortcut identity and packed policy.
        const replacement = new NativeOverview();
        if (!replacement || Object.getPrototypeOf(replacement) !== prototype)
            return null;
        if (typeof overview.BHasObservables === "function" &&
            typeof replacement.BHasObservables === "function" &&
            overview.BHasObservables() !== replacement.BHasObservables()) {
            return null;
        }
        Object.keys(overview).forEach((key) => {
            if (key !== "LOG_CHANGE")
                replacement[key] = overview[key];
        });
        replacement.RestorePreservedState?.(overview.GetPreservedState?.());
        return replacement;
    }
    catch {
        // A changed native constructor leaves the current map entry untouched.
        return null;
    }
};
/**
 * Steam's compatibility collections observe m_mapApps, not the plugin's
 * revision listeners. Publish only after a completed linear write batch.
 */
const publishCompatibilityReplacements = (updates) => {
    let published = false;
    try {
        const overviews = appStore?.m_mapApps;
        if (!overviews || typeof overviews.get !== "function" || typeof overviews.set !== "function")
            return false;
        for (const { appId, overview } of updates) {
            // Never publish a stale entry, an alias, or an official Steam overview.
            if (overviews.get(appId) !== overview || !isNativeNonSteamShortcut(overview))
                continue;
            const replacement = createCompatibilityReplacement(overview);
            if (!replacement)
                continue;
            // Another plugin can decorate the observable map setter and retain the
            // native setter as `originalSet`. This replacement already copies every
            // current native field, so re-entering a foreign decorator can replay
            // its side effects against a live Game Info tree during plugin reload.
            // Publish through the preserved native setter when it is explicitly
            // available; it still emits the map replacement Steam filters observe.
            const nativeSet = overviews.originalSet;
            if (typeof nativeSet === "function" && nativeSet !== overviews.set) {
                nativeSet.call(overviews, appId, replacement);
            }
            else {
                overviews.set(appId, replacement);
            }
            published = true;
        }
    }
    catch {
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
const publishDeferredEditorCompatibility = (appId) => {
    if (!metadataState.deferredEditorCompatibilityPublications.has(appId))
        return false;
    const overview = getNativeOverview(appId);
    if (!overview || !isNativeNonSteamShortcut(overview)) {
        // A deleted shortcut or an official alias must never be recreated.
        metadataState.deferredEditorCompatibilityPublications.delete(appId);
        return false;
    }
    if (!publishCompatibilityReplacements([{ appId, overview }]))
        return false;
    metadataState.deferredEditorCompatibilityPublications.delete(appId);
    return true;
};
/**
 * Recompute pending work after the main Game Info view exits. A history
 * callback supplies its new location directly, because the joined route
 * snapshot can still include the old Game Info path during navigation.
 */
const flushDeferredCompatibilityPublications = (routeContext = currentRoutePath()) => {
    const publications = [];
    let changed = false;
    for (const { appId } of Array.from(metadataState.deferredCompatibilityUpdates.values())) {
        if (isCurrentGameInfoRoute(routeContext, appId))
            continue;
        const metadata = metadataCache[String(appId)];
        // An inheriting shortcut cannot safely resolve until its persisted global
        // default has loaded. Explicit and Follow Valve choices are independent.
        if (!metadataState.compatibilityDefaultLoaded &&
            !isCompatibilityCategory$1(metadata?.deck_compat_override) &&
            metadata?.deck_compat_override !== "valve") {
            continue;
        }
        metadataState.deferredCompatibilityUpdates.delete(appId);
        const overview = getNativeOverview(appId);
        if (applyCompatibilityToOverview(appId, overview, routeContext)) {
            changed = true;
            publications.push({ appId, overview });
        }
    }
    publishCompatibilityReplacements(publications);
    if (changed)
        notifyCompatibilityRevision();
    return changed;
};
const nativeShortcutOverviewsById = () => {
    const overviews = new Map();
    try {
        Array.from(appStore?.allApps || []).forEach((overview) => {
            const appId = Number(overview?.appid);
            if (Number.isFinite(appId) && appId > 0 && isNativeNonSteamShortcut(overview)) {
                overviews.set(appId, overview);
            }
        });
    }
    catch {
        // Steam can replace its app list during bootstrap. The next bounded pass retries.
    }
    return overviews;
};
/** Apply the confirmed global policy in one linear pass over native shortcuts. */
const applyCompatibilityDefault = () => {
    let changed = false;
    const publications = [];
    let overviews = [];
    try {
        overviews = Array.from(appStore?.allApps || []);
    }
    catch {
        return false;
    }
    overviews.forEach((overview) => {
        const appId = Number(overview?.appid);
        if (!Number.isFinite(appId) || appId <= 0)
            return;
        if (applyCompatibilityToOverview(appId, overview)) {
            changed = true;
            publications.push({ appId, overview });
        }
    });
    publishCompatibilityReplacements(publications);
    return changed;
};
/** Commit only a backend-confirmed setting, and invalidate older loads first. */
const setConfirmedCompatibilityDefault = (category, lifecycleGeneration = metadataState.compatibilityLifecycleGeneration) => {
    if (lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) {
        return metadataState.compatibilityDefault;
    }
    const changedPolicy = metadataState.compatibilityDefault !== category || !metadataState.compatibilityDefaultLoaded;
    metadataState.compatibilityDefaultGeneration += 1;
    metadataState.compatibilityDefault = category;
    metadataState.compatibilityDefaultLoaded = true;
    const compatibilityChanged = applyCompatibilityDefault();
    if (changedPolicy || compatibilityChanged)
        notifyCompatibilityRevision();
    return category;
};
/** Commit only a backend-confirmed scope, using the same one-pass policy path. */
const setConfirmedCompatibilityDefaultScope = (scope, lifecycleGeneration = metadataState.compatibilityLifecycleGeneration) => {
    if (lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) {
        return metadataState.compatibilityDefaultScope;
    }
    const changedPolicy = metadataState.compatibilityDefaultScope !== scope;
    metadataState.compatibilityDefaultGeneration += 1;
    metadataState.compatibilityDefaultScope = scope;
    const compatibilityChanged = applyCompatibilityDefault();
    if (changedPolicy || compatibilityChanged)
        notifyCompatibilityRevision();
    return scope;
};
/** Start a new plugin lifetime and make unfinished work from the old one inert. */
const beginCompatibilityLifecycle = () => {
    metadataState.compatibilityLifecycleGeneration += 1;
    metadataState.compatibilityDefaultGeneration += 1;
    // This object survives an in-place import so a retained editor and new QAM
    // controls share one current runtime. Clear pending work from the retiring
    // lifetime, while retaining its current cache until the startup refresh
    // supplies an authoritative replacement.
    metadataState.metadataLoadPromise = null;
    metadataState.metadataRequestOwners.clear();
    metadataState.screenshotRequestOwners.clear();
    metadataState.loadingMetadata.clear();
    metadataState.loadingScreenshots.clear();
    metadataState.appliedMetadataRef = {};
    metadataState.compatibilityDefault = null;
    metadataState.compatibilityDefaultLoaded = false;
    metadataState.compatibilityDefaultScope = "all";
    metadataState.compatibilityDefaultLoadPromise = null;
    metadataState.deferredCompatibilityUpdates.clear();
    metadataState.deferredEditorCompatibilityPublications.clear();
    resumeRetainedCompatibilityBaselines();
    return metadataState.compatibilityLifecycleGeneration;
};
/** Load the shared setting once. A failed load remains an error, not Automatic. */
const ensureCompatibilityDefault = async () => {
    if (metadataState.compatibilityDefaultLoaded)
        return metadataState.compatibilityDefault;
    if (!metadataState.compatibilityDefaultLoadPromise) {
        const requestGeneration = metadataState.compatibilityDefaultGeneration;
        const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
        // Both values are one policy. Publishing the category before the scope
        // would briefly apply the wrong policy to unmatched shortcuts, so they
        // load together and only then satisfy compatibilityDefaultLoaded.
        const request = Promise.all([
            getCompatibilityDefault(),
            getCompatibilityDefaultScope(),
        ]).then(([value, scope]) => {
            const category = isCompatibilityCategory$1(value) ? value : null;
            if (scope !== "steam" && scope !== "no-steam" && scope !== "metadata" && scope !== "all") {
                throw new Error("invalid compatibility default scope response");
            }
            if (requestGeneration !== metadataState.compatibilityDefaultGeneration ||
                lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration) {
                return metadataState.compatibilityDefault;
            }
            metadataState.compatibilityDefault = category;
            metadataState.compatibilityDefaultScope = scope;
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
const cancelCompatibilityDefaultLoad = () => {
    metadataState.compatibilityDefaultGeneration += 1;
    metadataState.compatibilityLifecycleGeneration += 1;
    metadataState.metadataRequestOwners.clear();
    metadataState.screenshotRequestOwners.clear();
    metadataState.loadingMetadata.clear();
    metadataState.loadingScreenshots.clear();
    metadataState.deferredCompatibilityUpdates.clear();
    metadataState.deferredEditorCompatibilityPublications.clear();
};
/**
 * Steam sends AppOverview protobufs to appInfoStore before it creates and
 * publishes a replacement native object. Patch that input, rather than a
 * getter after publication, so the native object starts with the effective
 * category even though this field is non-observable.
 */
const applyCompatibilityToIncomingOverview = (overview) => {
    const appId = Number(overview?.appid?.());
    if (!Number.isFinite(appId) || appId <= 0)
        return false;
    const current = getNativeOverview(appId);
    const isIncomingShortcut = Number(overview?.app_type?.()) === NON_STEAM_APP_TYPE;
    if (!isIncomingShortcut && !isNativeNonSteamShortcut(current))
        return false;
    const category = effectiveCompatibilityCategory(metadataCache[String(appId)], metadataState.compatibilityDefault);
    const packed = Number(overview?.steam_hw_compat_category_packed?.());
    if (!Number.isFinite(packed) || typeof overview?.set_steam_hw_compat_category_packed !== "function") {
        return false;
    }
    if (isCurrentGameInfoRoute(currentRoutePath(), appId)) {
        const heldNibble = current ? packedCompatibilityValue(current) & 0xf : packed & 0xf;
        // Keep the retained Game Info value stable even if the latest policy
        // collapses the queued update and removes its map entry.
        const held = metadataState.deferredCompatibilityUpdates.get(appId)?.heldNibble ?? heldNibble;
        deferActiveCompatibilityUpdate(appId, held, category);
        // An unchanged effective policy does not need a deferred exit flush, but
        // Steam can still send a replacement with its native low nibble. Preserve
        // the currently held Game Info state on that incoming object either way.
        const heldPacked = (packed & -16) | held;
        if (heldPacked === packed)
            return false;
        try {
            overview.set_steam_hw_compat_category_packed(heldPacked);
            return Number(overview.steam_hw_compat_category_packed()) === heldPacked;
        }
        catch {
            return false;
        }
    }
    metadataState.deferredCompatibilityUpdates.delete(appId);
    if (category === null)
        return false;
    const key = String(appId);
    if (!Object.prototype.hasOwnProperty.call(metadataState.compatibilityBaselines, key)) {
        metadataState.compatibilityBaselines[key] = current
            ? packedCompatibilityValue(current) & 0xf
            : packed & 0xf;
    }
    const nextPacked = (packed & -16) | category | (category << 2);
    if (nextPacked === packed)
        return false;
    try {
        overview.set_steam_hw_compat_category_packed(nextPacked);
        return Number(overview.steam_hw_compat_category_packed()) === nextPacked;
    }
    catch {
        return false;
    }
};
const refreshMetadataCache = async () => {
    const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
    const wasLoaded = metadataState.metadataLoaded;
    const all = await getAllMetadata();
    if (lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration)
        return;
    const previousMetadata = { ...metadataCache };
    const affectedAppIds = new Set([
        ...Object.keys(previousMetadata),
        ...Object.keys(all || {}),
        // A restoration can fail while Steam is replacing an overview. Keep each
        // retained baseline in this one entry-based batch so a later refresh can
        // restore it without reverting to one whole-library scan per shortcut.
        ...Object.keys(metadataState.compatibilityBaselines),
    ]);
    const policyChanged = [...affectedAppIds].some((key) => effectiveCompatibilityCategory(previousMetadata[key], metadataState.compatibilityDefault) !==
        effectiveCompatibilityCategory((all || {})[key], metadataState.compatibilityDefault));
    replaceMetadataCacheEntries(all || {});
    metadataState.metadataLoaded = true;
    const compatibilityChanged = applyMetadataBatch(affectedAppIds);
    // A first successful load must wake mounted cards even if Steam has not made
    // its overview writable yet. Later no-op refreshes stay quiet.
    if (compatibilityChanged || policyChanged || !wasLoaded)
        notifyCompatibilityRevision();
};
const ensureMetadataCache = async () => {
    if (metadataState.metadataLoaded)
        return;
    if (!metadataState.metadataLoadPromise) {
        const request = refreshMetadataCache();
        const loadPromise = request.finally(() => {
            if (metadataState.metadataLoadPromise === loadPromise) {
                metadataState.metadataLoadPromise = null;
            }
        });
        metadataState.metadataLoadPromise = loadPromise;
    }
    await metadataState.metadataLoadPromise;
};
const startMetadataBootstrap = () => {
    let cancelled = false;
    let attempts = 0;
    const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
    const tick = async () => {
        if (cancelled || lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration)
            return;
        try {
            await ensureMetadataCache();
            if (cancelled || lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration)
                return;
            try {
                await ensureCompatibilityDefault();
            }
            catch (error) {
                // Metadata can still apply Valve/explicit choices while the setting is
                // unavailable. The QAM keeps the load as an error and cannot save it.
                warn("bridge", "compatibility default bootstrap failed", error);
            }
            if (cancelled || lifecycleGeneration !== metadataState.compatibilityLifecycleGeneration)
                return;
            const metadataChanged = applyMetadataBatch(Object.keys(metadataCache));
            const compatibilityChanged = applyCompatibilityDefault();
            if (metadataChanged || compatibilityChanged)
                notifyCompatibilityRevision();
        }
        catch (error) {
            warn("bridge", "metadata bootstrap failed", error);
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
const applyMetadataToOverview = (appId, overview) => {
    if (!isNativeNonSteamShortcut(overview))
        return false;
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
            overview.m_setStoreCategories = new Set();
        }
        metadata.store_categories?.forEach((category) => {
            overview.m_setStoreCategories.add(Number(category));
        });
    }
    catch {
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
    }
    catch (_error) {
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
    return compatibilityChanged;
};
/** Apply metadata records through one native-app lookup, never one full scan per record. */
const applyMetadataBatch = (appIds) => {
    const overviews = nativeShortcutOverviewsById();
    let compatibilityChanged = false;
    const publications = [];
    for (const appIdValue of appIds) {
        const appId = Number(appIdValue);
        if (!Number.isFinite(appId) || appId <= 0)
            continue;
        const overview = overviews.get(appId);
        if (overview && applyMetadataToOverview(appId, overview)) {
            compatibilityChanged = true;
            publications.push({ appId, overview });
        }
    }
    publishCompatibilityReplacements(publications);
    return compatibilityChanged;
};
const applyMetadata = (appId, options = {}) => {
    const overview = getNativeOverview(appId);
    const compatibilityChanged = applyMetadataToOverview(appId, overview);
    if (compatibilityChanged && overview) {
        if (options.publishCompatibility === false) {
            metadataState.deferredEditorCompatibilityPublications.add(appId);
        }
        else {
            publishCompatibilityReplacements([{ appId, overview }]);
        }
    }
    return compatibilityChanged;
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
    const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
    await ensureMetadataCache();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return;
    if (metadataCache[String(appId)] || metadataState.metadataRequestOwners.has(appId))
        return;
    const overview = getOverview(appId);
    if (!isNonSteamApp(overview))
        return;
    const request = { lifecycleGeneration };
    metadataState.metadataRequestOwners.set(appId, request);
    metadataState.loadingMetadata.add(appId);
    try {
        const metadata = await autoFetchMetadata(appId, appName(appId));
        if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
            return;
        if (metadata) {
            setMetadataCacheEntry(appId, metadata);
            applyMetadata(appId);
            notifyCompatibilityRevision();
        }
    }
    finally {
        if (metadataState.metadataRequestOwners.get(appId) === request) {
            metadataState.metadataRequestOwners.delete(appId);
            metadataState.loadingMetadata.delete(appId);
        }
    }
};
const tryEnrichScreenshotsForApp = async (appId) => {
    const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
    await ensureMetadataCache();
    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
        return;
    const metadata = metadataCache[String(appId)];
    if (!metadata ||
        metadata.screenshots?.length ||
        metadataState.screenshotRequestOwners.has(appId) ||
        String(metadata.source || "").toUpperCase() !== "IGN") {
        return;
    }
    const source = metadata.source_url || String(metadata.id || "");
    if (!source)
        return;
    const request = { lifecycleGeneration };
    metadataState.screenshotRequestOwners.set(appId, request);
    metadataState.loadingScreenshots.add(appId);
    try {
        const refreshed = await fetchMetadata(source);
        if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
            return;
        if (refreshed?.screenshots?.length) {
            const saved = await saveMetadata(appId, {
                ...metadata,
                screenshots: refreshed.screenshots,
            });
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            setMetadataCacheEntry(appId, saved);
            applyMetadata(appId);
            notifyCompatibilityRevision();
        }
    }
    catch (error) {
        warn("bridge", "screenshot enrichment failed", error);
    }
    finally {
        if (metadataState.screenshotRequestOwners.get(appId) === request) {
            metadataState.screenshotRequestOwners.delete(appId);
            metadataState.loadingScreenshots.delete(appId);
        }
    }
};
const installMetadataPatches = (unpatchers) => {
    const overviewProto = appStore?.allApps?.[0]?.__proto__;
    const detailsProto = appDetailsStore?.__proto__;
    const infoStore = globalThis.appInfoStore;
    if (!overviewProto || !detailsProto)
        return;
    let incomingCompatibilityChanged = false;
    let updateOverviewPatched = false;
    let fallbackRevisionQueued = false;
    const publishFallbackCompatibilityRevision = () => {
        if (fallbackRevisionQueued)
            return;
        fallbackRevisionQueued = true;
        queueMicrotask(() => {
            fallbackRevisionQueued = false;
            if (!incomingCompatibilityChanged)
                return;
            incomingCompatibilityChanged = false;
            notifyCompatibilityRevision();
        });
    };
    if (infoStore?.OnAppOverviewChange) {
        unpatchers.push(patchMethod(infoStore, "OnAppOverviewChange", (_thisValue, original, args) => {
            const incoming = Array.isArray(args[0]) ? args[0] : [];
            incomingCompatibilityChanged = incoming.reduce((changed, overview) => applyCompatibilityToIncomingOverview(overview) || changed, incomingCompatibilityChanged);
            const result = original(...args);
            // Some Steam builds expose UpdateAppOverview as a read-only native
            // method. Publish once in a microtask after this input batch instead
            // of allowing that optional lifecycle hook to abort every Steam patch.
            if (!updateOverviewPatched && incomingCompatibilityChanged) {
                publishFallbackCompatibilityRevision();
            }
            return result;
        }));
    }
    if (appStore?.UpdateAppOverview) {
        try {
            unpatchers.push(patchMethod(appStore, "UpdateAppOverview", (_thisValue, original, args) => {
                incomingCompatibilityChanged = false;
                const result = original(...args);
                if (incomingCompatibilityChanged)
                    notifyCompatibilityRevision();
                return result;
            }));
            updateOverviewPatched = true;
        }
        catch (error) {
            warn("bridge", "UpdateAppOverview patch unavailable; using input-batch revision", error);
        }
    }
    // GetAppData is the narrowest durable boundary around native details
    // replacements. Populate a new matched-shortcut details object before any
    // SteamUI caller can observe the transient shortcut-only version. The
    // identity guard keeps ordinary reads and renders allocation-free.
    if (detailsProto?.GetAppData) {
        const observedDetails = new Map();
        unpatchers.push(patchMethod(detailsProto, "GetAppData", (_thisValue, original, args) => {
            const appId = Number(args[0]);
            const appData = original(...args);
            const details = appData?.details;
            if (!Number.isFinite(appId) || appId <= 0 || !details) {
                if (Number.isFinite(appId))
                    observedDetails.delete(appId);
                return appData;
            }
            if (observedDetails.get(appId) === details)
                return appData;
            observedDetails.set(appId, details);
            const metadata = metadataCache[String(appId)];
            const overview = getOverview(appId);
            if (hasMatchedSteamAppId(metadata) && isNonSteamAppWithoutPatchedMethod(overview)) {
                reassertMatchedAppData(appData, metadata, steamScreenshotsFromMetadata(appId, metadata));
            }
            return appData;
        }));
    }
    if (appStore?.GetAppOverviewByAppID) {
        unpatchers.push(patchMethod(appStore, "GetAppOverviewByAppID", (_thisValue, original, args) => {
            const requestedAppId = Number(args[0]);
            const result = original(...args);
            if (!Number.isFinite(requestedAppId) || requestedAppId <= 0) {
                return result;
            }
            if (result)
                return result;
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
    if (appStore?.GetIconURLForApp) {
        unpatchers.push(patchMethod(appStore, "GetIconURLForApp", (_thisValue, original, args) => {
            const overview = args[0];
            if (overview?.icon_data !== undefined ||
                !isNonSteamAppWithoutPatchedMethod(overview) ||
                !metadataCache[String(overview.appid)]) {
                return original(...args);
            }
            // Steam requests a shortcut's icon only while it has native shortcut
            // identity. The menu can first render over Game Info before its route
            // changes to AppRunning; do not let that render-only spoof skip hydration.
            return withInCallTruth(metadataState, () => original(...args));
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
                const lifecycleGeneration = metadataState.compatibilityLifecycleGeneration;
                void ensureMetadataCache().then(() => {
                    if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                        return;
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
            traceBIsModDecision(appId, path, ret, decision.finalRet, decision.reason, shieldState, bypassCounterBefore, metadataState.bypassCounter, hasCache, isCurrentMatchedRender);
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

const POLL_INTERVAL_MS$1 = 100;
const POLL_TIMEOUT_MS = 3000;
const positiveAppId = (value) => {
    const appId = Number(value);
    return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : null;
};
/** Read Steam's native shortcut name without going through the metadata alias or title cleaner. */
const nativeShortcutName = (appId) => {
    if (!positiveAppId(appId))
        return null;
    const overview = getNativeOverview(appId);
    if (!overview || !isNativeNonSteamShortcut(overview))
        return null;
    return typeof overview.display_name === "string" ? overview.display_name : null;
};
/** True only when Steam exposes the native shortcut rename method. */
const hasShortcutNameApi = () => typeof steamInternals().SteamClient?.Apps?.SetShortcutName === "function";
const classifyShortcutNameState = (currentName, state) => {
    if (!state)
        return "unmanaged";
    if (currentName === state.applied_name)
        return "managed";
    if (currentName === state.original_name)
        return "restored";
    return "diverged";
};
/**
 * Request one native rename and wait for Steam's own overview to report it.
 * SetShortcutName returns undefined, so it is never proof of success.
 */
const setShortcutNameAndWait = (appId, expectedCurrent, target) => {
    const normalizedAppId = positiveAppId(appId);
    const expected = typeof expectedCurrent === "string" ? expectedCurrent : "";
    const requested = typeof target === "string" ? target : "";
    if (!normalizedAppId)
        return Promise.reject(new Error("invalid shortcut app ID"));
    if (!requested.trim())
        return Promise.reject(new Error("shortcut name target is empty"));
    const current = nativeShortcutName(normalizedAppId);
    if (current === null)
        return Promise.reject(new Error("native shortcut is unavailable"));
    if (current !== expected)
        return Promise.reject(new Error("shortcut name changed before rename"));
    const apps = steamInternals().SteamClient?.Apps;
    if (!apps || typeof apps.SetShortcutName !== "function") {
        return Promise.reject(new Error("Steam shortcut name API is unavailable"));
    }
    try {
        apps.SetShortcutName.call(apps, normalizedAppId, requested);
    }
    catch (error) {
        return Promise.reject(new Error(`Steam shortcut name API failed: ${String(error)}`));
    }
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const finish = (callback) => {
            clearInterval(interval);
            callback();
        };
        const poll = () => {
            if (nativeShortcutName(normalizedAppId) === requested) {
                finish(() => resolve(requested));
                return;
            }
            if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
                finish(() => reject(new Error("Steam shortcut name update timeout")));
            }
        };
        const interval = setInterval(poll, POLL_INTERVAL_MS$1);
        poll();
    });
};

const TITLE = "Decky Metadata";
const DURATION = 3000;
const toastLogoStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
};
function notify(kind, heading, body) {
    const logo = (SP_JSX.jsx("span", { style: toastLogoStyle, children: kind === "success" ? (SP_JSX.jsx(FaCheckCircle, { color: colors.success, size: 28 })) : kind === "error" ? (SP_JSX.jsx(FaExclamationTriangle, { color: colors.error, size: 28 })) : (SP_JSX.jsx(FaExclamationTriangle, { color: colors.warning, size: 28 })) }));
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

const steamUiWindow = () => {
    const candidates = [globalThis];
    try {
        const currentWindow = globalThis;
        candidates.push(currentWindow.parent, currentWindow.top);
    }
    catch {
        // A cross-origin frame can still use its own Decky module bridge.
    }
    return candidates.find((candidate) => candidate?.webpackChunksteamui || typeof candidate?.DFL?.findModuleChild === "function") ?? globalThis;
};
const steamUiDocuments = () => {
    // SharedJSContext does not own Big Picture's DOM. Resolve the same SteamUI
    // host bridge for every consumer so cards and Game Info inspect one ordered,
    // deduplicated set of real browser documents.
    const contexts = new Set([globalThis, steamUiWindow()]);
    try {
        const currentWindow = globalThis;
        contexts.add(currentWindow.parent);
        contexts.add(currentWindow.top);
    }
    catch {
        // A cross-origin parent can still leave the SteamUI/webpack bridge usable.
    }
    const documents = new Set();
    try {
        for (const context of contexts) {
            const windowStore = context?.SteamUIStore?.m_WindowStore;
            const browserWindows = [
                windowStore?.MainWindowInstance?.m_BrowserWindow,
                windowStore?.GamepadUIMainWindowInstance?.m_BrowserWindow,
            ];
            for (const browserWindow of browserWindows) {
                const document = browserWindow?.document;
                if (typeof document?.querySelector === "function")
                    documents.add(document);
            }
        }
    }
    catch {
        // Continue with context documents when a Steam private field changes.
    }
    for (const context of contexts) {
        const document = context?.document;
        if (typeof document?.querySelector === "function")
            documents.add(document);
    }
    return Array.from(documents);
};
/** Find an element in Steam's real browser documents, not only Decky's global. */
const findSteamUiDocumentMatch = (finder) => {
    for (const document of steamUiDocuments()) {
        try {
            const match = finder(document);
            if (match !== undefined)
                return match;
        }
        catch {
            // Private DOM access is optional. Try the next known SteamUI document.
        }
    }
    return undefined;
};

const DECK_DISPLAY = 1;
const HOME_INDICATOR_KEY = "decky-metadata-compatibility-home";
const GRID_INDICATOR_KEY = "decky-metadata-compatibility-grid";
const steamUiCardDocument = () => {
    return findSteamUiDocumentMatch((document) => document.querySelector("[data-id]") ? document : undefined);
};
/**
 * Decky's module finder sees the observer/memo export, not LibraryItemBox's
 * renderer source. Query only webpack factory text, then load its one match.
 * This never walks React or MobX state.
 */
const findSteamModulesBySource = (fragments) => {
    const chunks = steamUiWindow().webpackChunksteamui;
    if (!chunks?.push)
        return [];
    let webpackRequire;
    try {
        chunks.push([[Symbol("decky-metadata-library-compatibility")], {}, (requireFn) => {
                webpackRequire = requireFn;
            }]);
        const moduleIds = Object.keys(webpackRequire?.m ?? {}).filter((id) => {
            const factory = webpackRequire.m[id];
            const source = typeof factory === "function" ? factory.toString() : "";
            return fragments.every((fragment) => source.includes(fragment));
        });
        return moduleIds.flatMap((moduleId) => {
            try {
                return [webpackRequire(moduleId)];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return [];
    }
};
const findSteamModuleBySource = (fragments) => {
    const candidates = findSteamModulesBySource(fragments);
    return candidates.length === 1 ? candidates[0] : undefined;
};
const findLiveModuleChild = (predicate) => {
    const liveFinder = steamUiWindow().DFL?.findModuleChild;
    return typeof liveFinder === "function" ? liveFinder(predicate) : DFL.findModuleChild(predicate);
};
const findOneSourceExport = (modules, predicate) => {
    const matches = modules.filter(predicate);
    return matches.length === 1 ? matches[0] : undefined;
};
/**
 * Return a category only when a rendered card is the exact native shortcut
 * and Steam has a positive status to display. Category 0 is Steam's native
 * no-status state, so it deliberately does not fabricate an Unknown badge.
 */
const resolveLibraryCompatibilityIndicator = ({ renderedAppId, overview, metadata, globalDefault, globalScope, isNativeNonSteamShortcut: isNativeShortcut, }) => {
    if (Number(overview?.appid) !== Number(renderedAppId) || !isNativeShortcut(overview))
        return null;
    const category = effectiveCompatibilityCategory(metadata, globalDefault, globalScope);
    return category === null || category === 0 ? null : category;
};
const childrenOf = (element) => {
    const children = element.props.children;
    return Array.isArray(children) ? children : [children];
};
const hasIndicator = (children, indicator, key) => children.some((child) => SP_REACT.isValidElement(child) && (child.type === indicator || child.key === key));
function decorateCarouselCompatibility(output, indicator, className, overview) {
    if (!SP_REACT.isValidElement(output))
        return output;
    const children = childrenOf(output);
    if (hasIndicator(children, indicator, HOME_INDICATOR_KEY))
        return output;
    // Steam's GameCapsule places compatibility after its in-library marker. A
    // shortcut suppresses that native slot with `false`; replace only that
    // confirmed placeholder. If Steam changes the shape, insert our indicator
    // without discarding another child.
    const nativeCompatibilitySlot = children[2];
    const remainingChildren = nativeCompatibilitySlot === false
        ? children.slice(3)
        : children.slice(2);
    const decorated = SP_REACT.cloneElement(output, {
        children: [
            ...children.slice(0, 2),
            SP_REACT.createElement(indicator, { key: HOME_INDICATOR_KEY, display: DECK_DISPLAY, overview, className }),
            ...remainingChildren,
        ],
    });
    // `isValidElement` proves T is this React element while preserving callers' concrete type.
    return decorated;
}
const decorateGridIconRow = (node, indicator, iconRowClassName, indicatorClassName, overview) => {
    if (!SP_REACT.isValidElement(node))
        return node;
    if (node.props.className === iconRowClassName) {
        const children = childrenOf(node);
        if (hasIndicator(children, indicator, GRID_INDICATOR_KEY))
            return node;
        return SP_REACT.cloneElement(node, {
            children: [
                ...children,
                SP_REACT.createElement(indicator, {
                    key: GRID_INDICATOR_KEY,
                    display: DECK_DISPLAY,
                    overview,
                    className: indicatorClassName,
                }),
            ],
        });
    }
    const originalChildren = node.props.children;
    if (originalChildren === undefined)
        return node;
    const children = childrenOf(node);
    const decoratedChildren = children.map((child) => decorateGridIconRow(child, indicator, iconRowClassName, indicatorClassName, overview));
    if (decoratedChildren.every((child, index) => child === children[index]))
        return node;
    return SP_REACT.cloneElement(node, {
        children: Array.isArray(originalChildren) ? decoratedChildren : decoratedChildren[0],
    });
};
function decorateGridCompatibility(output, indicator, iconRowClassName, indicatorClassName, overview) {
    const decorated = decorateGridIconRow(output, indicator, iconRowClassName, indicatorClassName, overview);
    return decorated;
}
const resolveTargets = (dependencies) => {
    const findChild = (predicate) => {
        try {
            return dependencies.findModuleChild(predicate);
        }
        catch {
            // A lazy Steam module can disappear while Decky's finder is scanning it.
            // Treat that race as unresolved so the installer retries fail-closed.
            return undefined;
        }
    };
    const carouselModule = findChild((module) => {
        if (!module || typeof module !== "object")
            return undefined;
        return typeof module._ === "function" &&
            typeof module.g === "function" &&
            module._.toString().includes("GameCapsule unable to render") &&
            module._.toString().includes("#LibraryHome_GameCarousel_ContextMenu") &&
            module._.toString().includes("gamepadgamecapsule")
            ? module
            : undefined;
    }) ?? dependencies.findModuleBySource([
        "GameCapsule unable to render",
        "#LibraryHome_GameCarousel_ContextMenu",
        "gamepadgamecapsule",
    ]);
    const homeModule = findChild((module) => typeof module?.Xd?.render === "function" && module.Xd.render.toString().includes("VBC_")
        ? module
        : undefined) ?? dependencies.findModuleBySource([
        "VirtualizedBoxCarousel",
        "VBC_",
        "fnItemRenderer",
        "CellRenderer",
    ]);
    const gridModule = findChild((module) => typeof module?.TK?.type === "function" &&
        typeof module?.hF === "function" &&
        typeof module?.Mf === "function" &&
        typeof module?.eL === "function" &&
        typeof module?.Kt === "function" &&
        typeof module?.aT === "number" &&
        typeof module?.dC === "number" &&
        typeof module?.UT === "number" &&
        typeof module?.lS === "number" &&
        typeof module?.oG === "number"
        ? module
        : undefined) ?? dependencies.findModuleBySource([
        "eForceHWCompatDisplay",
        "bHideCompatIcons",
        "LibraryItemBox",
        "BIsModOrShortcut",
    ]);
    const homeStyles = findChild((module) => typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string" ? module : undefined) ?? findOneSourceExport(dependencies.findModulesBySource(["DeckCompat", "GameCapsule"]), (module) => typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string");
    const gridStyles = findChild((module) => typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string" ? module : undefined) ?? findOneSourceExport(dependencies.findModulesBySource(["LibraryItemIcons", "SteamDeckCompatIcon"]), (module) => typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string");
    const hasWritableCallableMethod = (target, methodName) => typeof target?.[methodName] === "function" &&
        Object.getOwnPropertyDescriptor(target, methodName)?.writable === true;
    const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
    if (!carouselModule ||
        Array.isArray(homeModule) ||
        Array.isArray(gridModule) ||
        homeModule === gridModule ||
        !hasWritableCallableMethod(homeModule?.Xd, "render") ||
        !hasWritableCallableMethod(gridModule?.TK, "type") ||
        typeof carouselModule._ !== "function" ||
        typeof carouselModule.g !== "function" ||
        !isNonEmptyString(homeStyles?.DeckCompat) ||
        !isNonEmptyString(homeStyles?.GameCapsule) ||
        !isNonEmptyString(gridStyles?.LibraryItemIcons) ||
        !isNonEmptyString(gridStyles?.SteamDeckCompatIcon))
        return null;
    return {
        home: homeModule.Xd,
        carousel: carouselModule._,
        grid: gridModule.TK,
        indicator: carouselModule.g,
        homeClassName: homeStyles.DeckCompat,
        gridIconsClassName: gridStyles.LibraryItemIcons,
        gridIndicatorClassName: gridStyles.SteamDeckCompatIcon,
    };
};
const defaultDependencies = {
    findModuleChild: findLiveModuleChild,
    findModuleBySource: findSteamModuleBySource,
    findModulesBySource: findSteamModulesBySource,
    patchHomeRenderer: (component, handler) => safeAfterPatch(component, "render", handler).unpatch,
    patchGridRenderer: (component, handler) => safeAfterPatch(component, "type", handler).unpatch,
    scheduleRetry: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelRetry: (retryId) => window.clearTimeout(retryId),
    retryIntervalMs: 500,
    maxResolutionAttempts: 240,
    homeDiscoveryIntervalMs: 500,
    maxHomeDiscoveryAttempts: 60,
    getOverview,
    metadataForApp: (appId) => metadataCache[String(appId)],
    isNativeNonSteamShortcut,
    refreshCompatibilitySurfaces,
    useCompatibilityRevision: (subscribe) => {
        const [, setRevision] = SP_REACT.useState(compatibilityRevisionSnapshot);
        SP_REACT.useEffect(() => {
            const update = () => setRevision(compatibilityRevisionSnapshot());
            const unsubscribe = subscribe(update);
            update();
            return unsubscribe;
        }, [subscribe]);
    },
};
const reportInstalled = (resolutionAttempts) => {
    try {
        void Promise.resolve(frontendLog("patch", "library compatibility indicators installed", { resolutionAttempts }, "info")).catch(() => undefined);
    }
    catch {
        // Reporting must not alter renderer installation.
    }
};
/**
 * Replace an exact carousel element with an owned wrapper. Unlike Decky's
 * createReactTreePatcher this does not patch a component type in place, so a
 * cached card cannot retain a plugin closure after teardown.
 */
const wrapCarouselElement = (node, carousel, wrapper) => {
    if (!SP_REACT.isValidElement(node))
        return node;
    const element = node;
    if (carousel(element.type)) {
        return SP_REACT.createElement(wrapper(element.type), { ...element.props, key: element.key });
    }
    const originalChildren = element.props?.children;
    if (originalChildren === undefined)
        return node;
    const children = childrenOf(element);
    const wrappedChildren = children.map((child) => wrapCarouselElement(child, carousel, wrapper));
    if (wrappedChildren.every((child, index) => child === children[index]))
        return node;
    return SP_REACT.cloneElement(element, {
        children: Array.isArray(originalChildren) ? wrappedChildren : wrappedChildren[0],
    });
};
const assignRef = (ref, value) => {
    if (typeof ref === "function") {
        ref(value);
    }
    else if (ref && typeof ref === "object") {
        ref.current = value;
    }
};
/**
 * Add compatibility indicators at the two native Library card renderers.
 * The patch calls only those renderers. It never walks MobX state.
 */
const installLibraryCompatibilityIndicators = (unpatchers, provided = {}) => {
    const dependencies = { ...defaultDependencies, ...provided };
    let active = true;
    let homeUnpatch;
    let gridUnpatch;
    let retryId;
    let homeDiscoveryRetryId;
    let homeCacheUnsubscribe;
    const indicatorUnsubscribers = new Set();
    const mountedHomeCarousels = new Set();
    const mountedHomeGrids = new Map();
    const mountedHomeCarouselTypes = new Set();
    const mountedHomeCarouselWrappers = new Map();
    const homeRefCallbacks = new Map();
    let resolutionAttempts = 0;
    let homeDiscoveryAttempts = 0;
    let installed = false;
    let cleaned = false;
    const cleanup = () => {
        if (cleaned)
            return;
        cleaned = true;
        active = false;
        if (retryId !== undefined) {
            dependencies.cancelRetry(retryId);
            retryId = undefined;
        }
        if (homeDiscoveryRetryId !== undefined) {
            dependencies.cancelRetry(homeDiscoveryRetryId);
            homeDiscoveryRetryId = undefined;
        }
        const homeCleanup = homeUnpatch;
        const gridCleanup = gridUnpatch;
        homeUnpatch = undefined;
        gridUnpatch = undefined;
        const cacheCleanup = homeCacheUnsubscribe;
        homeCacheUnsubscribe = undefined;
        try {
            cacheCleanup?.();
        }
        catch {
            // Continue teardown if Steam has already removed the subscription.
        }
        mountedHomeCarousels.clear();
        mountedHomeGrids.forEach(({ restore }, grid) => {
            try {
                if (restore()) {
                    grid.recomputeGridSize?.();
                }
            }
            catch {
                // A disposed virtual grid does not need an additional cleanup pass.
            }
        });
        mountedHomeGrids.clear();
        mountedHomeCarouselTypes.clear();
        mountedHomeCarouselWrappers.clear();
        homeRefCallbacks.clear();
        indicatorUnsubscribers.forEach((unsubscribe) => {
            try {
                unsubscribe();
            }
            catch {
                // Continue releasing the remaining mounted indicator subscriptions.
            }
        });
        indicatorUnsubscribers.clear();
        try {
            homeCleanup?.();
        }
        catch {
            // A changed Steam target must not keep the grid patch alive.
        }
        try {
            gridCleanup?.();
        }
        catch {
            // The aggregate Steam cleanup continues after one target changed.
        }
    };
    // Register before resolving lazy Library modules so dismount always cancels
    // an outstanding retry, even when no renderer has been patched yet.
    unpatchers.push(cleanup);
    const subscribeIndicator = (listener) => {
        if (!active)
            return () => undefined;
        let subscribed = true;
        const unsubscribe = subscribeCompatibilityRevision(() => {
            if (active)
                listener();
        });
        indicatorUnsubscribers.add(unsubscribe);
        return () => {
            if (!subscribed)
                return;
            subscribed = false;
            indicatorUnsubscribers.delete(unsubscribe);
            unsubscribe();
        };
    };
    const installWhenTargetsResolve = () => {
        if (!active || installed)
            return;
        resolutionAttempts += 1;
        let targets;
        try {
            targets = resolveTargets(dependencies);
        }
        catch {
            // Lazy exports can be observed while their module factory is still
            // initializing. Retry that transient state instead of losing the timer.
            targets = null;
        }
        if (!targets) {
            if (resolutionAttempts < dependencies.maxResolutionAttempts) {
                retryId = dependencies.scheduleRetry(() => {
                    retryId = undefined;
                    installWhenTargetsResolve();
                }, dependencies.retryIntervalMs);
            }
            return;
        }
        const ReactiveCompatibilityIndicator = (props) => {
            dependencies.useCompatibilityRevision(subscribeIndicator);
            if (!active)
                return null;
            const appId = Number(props.overview?.appid);
            const category = resolveLibraryCompatibilityIndicator({
                renderedAppId: appId,
                overview: props.overview,
                metadata: dependencies.metadataForApp(appId),
                isNativeNonSteamShortcut: dependencies.isNativeNonSteamShortcut,
            });
            if (!category)
                return null;
            return SP_REACT.createElement(targets.indicator, {
                display: DECK_DISPLAY,
                overview: props.overview,
                className: props.className,
            });
        };
        const decorateForApp = (appId, output, decorate, renderedOverview) => {
            const overview = renderedOverview ?? dependencies.getOverview(appId);
            if (Number(overview?.appid) !== Number(appId) ||
                !dependencies.isNativeNonSteamShortcut(overview)) {
                return output;
            }
            return decorate(output, overview);
        };
        const carouselWrapperFor = (carousel) => {
            const existing = mountedHomeCarouselWrappers.get(carousel);
            if (existing)
                return existing;
            const wrapper = (props) => {
                const output = carousel(props);
                if (!active)
                    return output;
                // Steam's live Home renderer passes the shortcut overview as `app`.
                // The top-level `appid` remains a supported fallback for the alternate
                // renderer shape used by older clients.
                const appId = Number(props?.appid ?? props?.app?.appid);
                return decorateForApp(appId, output, (card, overview) => decorateCarouselCompatibility(card, ReactiveCompatibilityIndicator, targets.homeClassName, overview));
            };
            mountedHomeCarouselWrappers.set(carousel, wrapper);
            return wrapper;
        };
        const isMountedHomeCarousel = (carousel) => carousel === targets.carousel || mountedHomeCarouselTypes.has(carousel);
        const homeFiberFor = (element) => {
            try {
                const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
                return key ? element[key] : null;
            }
            catch {
                return null;
            }
        };
        const isHomeCarouselFiber = (fiber) => {
            let current = fiber;
            for (let depth = 0; current && depth < 24; depth += 1, current = current.return) {
                if (current.type === targets.home || current.elementType === targets.home)
                    return true;
                try {
                    for (const candidate of [current.type, current.elementType]) {
                        const render = typeof candidate?.render === "function"
                            ? candidate.render
                            : typeof candidate === "function"
                                ? candidate
                                : undefined;
                        const source = typeof render === "function" ? render.toString() : "";
                        if (source.includes("VBC_") &&
                            source.includes("fnOnFocusedColumnChange")) {
                            return true;
                        }
                        // Steam can replace the Home renderer with a wrapper after module
                        // resolution. That wrapper removes the VBC_ source token, but the
                        // mounted current Home grid still exposes its focused-column callback
                        // and the exact m_refGrid we need to own.
                        if (source.includes("fnOnFocusedColumnChange") &&
                            current.stateNode?.m_refGrid) {
                            return true;
                        }
                    }
                }
                catch {
                    // Keep the bounded walk fail-closed when Steam lazily swaps a type.
                }
            }
            return false;
        };
        const installCachedHomeCellRenderer = (grid, discovered = false) => {
            if (!active)
                return "unavailable";
            const original = grid?.props?.cellRenderer;
            if (typeof original !== "function" || typeof grid?.recomputeGridSize !== "function") {
                return "unavailable";
            }
            const previous = mountedHomeGrids.get(grid);
            // React can publish a new native renderer on an already-mounted grid.
            // Preserve that newest renderer as the cleanup target, rather than
            // leaving the old wrapper registered after it has been replaced.
            if (previous?.wrapper === original) {
                previous.discovered = previous.discovered || discovered;
                if (previous.needsRecompute) {
                    previous.needsRecompute = false;
                    return "wrapped";
                }
                return "intact";
            }
            const wrapRenderer = (renderer) => (...args) => wrapCarouselElement(renderer(...args), isMountedHomeCarousel, carouselWrapperFor);
            const descriptor = Object.getOwnPropertyDescriptor(grid.props, "cellRenderer");
            try {
                // Steam can inherit this renderer through the props prototype rather
                // than publishing an own descriptor. Define an own accessor in both
                // cases so a later React assignment cannot silently replace the
                // wrapper between discovery retries.
                if (!descriptor || descriptor.configurable) {
                    const gridPropsDescriptor = Object.getOwnPropertyDescriptor(grid, "props");
                    const canRetainPropsReplacement = Boolean(gridPropsDescriptor?.configurable && gridPropsDescriptor.writable);
                    let currentProps = grid.props;
                    let record;
                    const retainRenderer = (props) => {
                        const nextOriginal = props?.cellRenderer;
                        const nextDescriptor = Object.getOwnPropertyDescriptor(props ?? {}, "cellRenderer");
                        if (typeof nextOriginal !== "function" ||
                            (nextDescriptor && !nextDescriptor.configurable)) {
                            return false;
                        }
                        record.original = nextOriginal;
                        record.wrapper = wrapRenderer(nextOriginal);
                        Object.defineProperty(props, "cellRenderer", {
                            configurable: true,
                            enumerable: nextDescriptor?.enumerable ?? true,
                            get: () => record.wrapper,
                            set: (next) => {
                                if (next === record.wrapper || typeof next !== "function")
                                    return;
                                record.original = next;
                                record.wrapper = wrapRenderer(next);
                                record.needsRecompute = true;
                            },
                        });
                        return props.cellRenderer === record.wrapper;
                    };
                    record = {
                        original,
                        wrapper: wrapRenderer(original),
                        discovered,
                        needsRecompute: false,
                        restore: () => {
                            if (currentProps?.cellRenderer !== record.wrapper)
                                return false;
                            Object.defineProperty(currentProps, "cellRenderer", {
                                configurable: true,
                                enumerable: true,
                                writable: true,
                                value: record.original,
                            });
                            if (canRetainPropsReplacement) {
                                Object.defineProperty(grid, "props", {
                                    ...gridPropsDescriptor,
                                    value: currentProps,
                                });
                            }
                            return true;
                        },
                    };
                    if (canRetainPropsReplacement) {
                        Object.defineProperty(grid, "props", {
                            configurable: true,
                            enumerable: gridPropsDescriptor?.enumerable ?? true,
                            get: () => currentProps,
                            set: (nextProps) => {
                                currentProps = nextProps;
                                if (!active || nextProps?.cellRenderer === record.wrapper)
                                    return;
                                if (retainRenderer(nextProps))
                                    record.needsRecompute = true;
                            },
                        });
                    }
                    if (!retainRenderer(currentProps)) {
                        record.restore();
                        return "unavailable";
                    }
                    mountedHomeGrids.set(grid, record);
                    return "wrapped";
                }
                const wrapper = wrapRenderer(original);
                const record = {
                    original,
                    wrapper,
                    discovered,
                    needsRecompute: false,
                    restore: () => {
                        if (grid?.props?.cellRenderer !== wrapper)
                            return false;
                        grid.props.cellRenderer = record.original;
                        return true;
                    },
                };
                grid.props.cellRenderer = wrapper;
                if (grid.props.cellRenderer !== wrapper)
                    return "unavailable";
                mountedHomeGrids.set(grid, record);
                return "wrapped";
            }
            catch {
                // A changed virtual-grid target is left untouched and is not retried.
                return "unavailable";
            }
        };
        const hasMountedHomeCellRendererWrapper = (requireDiscovered = false) => {
            for (const [grid, { wrapper, discovered }] of mountedHomeGrids) {
                try {
                    if ((!requireDiscovered || discovered) && grid?.props?.cellRenderer === wrapper)
                        return true;
                }
                catch {
                    // A disposed virtual grid cannot keep a mounted wrapper alive.
                }
            }
            return false;
        };
        const retainMountedHomeCarouselTypes = (root, cardAppId) => {
            const pending = [root];
            const seen = new Set();
            let visited = 0;
            while (pending.length > 0 && visited < 96) {
                const fiber = pending.pop();
                if (!fiber || seen.has(fiber))
                    continue;
                seen.add(fiber);
                visited += 1;
                const appId = Number(fiber.memoizedProps?.app?.appid ?? fiber.memoizedProps?.appid);
                const hasCardIdentity = Number.isFinite(cardAppId) && cardAppId > 0;
                if (Number.isFinite(appId) &&
                    appId > 0 &&
                    (!hasCardIdentity || appId === cardAppId)) {
                    [fiber.type, fiber.elementType].forEach((component) => {
                        if (typeof component === "function") {
                            mountedHomeCarouselTypes.add(component);
                        }
                    });
                }
                if (fiber.child)
                    pending.push(fiber.child);
                if (fiber.sibling)
                    pending.push(fiber.sibling);
            }
        };
        const discoverMountedHomeCarousels = () => {
            const discoveredGrids = new Set();
            if (!active)
                return discoveredGrids;
            try {
                const document = steamUiCardDocument();
                const cards = document?.querySelectorAll?.("[data-id]");
                if (!cards)
                    return discoveredGrids;
                for (const card of Array.from(cards)) {
                    const cardAppId = Number(card?.getAttribute?.("data-id"));
                    let fiber = homeFiberFor(card);
                    retainMountedHomeCarouselTypes(fiber, cardAppId);
                    for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
                        const appId = Number(fiber.memoizedProps?.app?.appid ?? fiber.memoizedProps?.appid);
                        if (Number.isFinite(appId) && appId > 0) {
                            // The mounted Home card can come from a newer Steam module
                            // generation than the cached module export. Retain its exact
                            // app-bearing component identities for this bounded card renderer.
                            [fiber.type, fiber.elementType].forEach((component) => {
                                if (typeof component === "function") {
                                    mountedHomeCarouselTypes.add(component);
                                }
                            });
                        }
                        const carousel = fiber.stateNode;
                        if (carousel?.m_refGrid &&
                            isHomeCarouselFiber(fiber)) {
                            mountedHomeCarousels.add(carousel);
                            discoveredGrids.add(carousel.m_refGrid);
                            break;
                        }
                    }
                }
            }
            catch {
                // DOM/fiber access is optional; new cards still use the renderer patch.
            }
            return discoveredGrids;
        };
        const refreshMountedHomeCarousels = (refreshExisting = true) => {
            if (!active)
                return false;
            const discoveredGrids = discoverMountedHomeCarousels();
            const grids = new Set();
            mountedHomeCarousels.forEach((carousel) => {
                const grid = carousel?.m_refGrid;
                if (typeof grid?.recomputeGridSize === "function") {
                    grids.add(grid);
                }
                else {
                    mountedHomeCarousels.delete(carousel);
                }
            });
            mountedHomeGrids.forEach((_value, grid) => grids.add(grid));
            const gridsToRecompute = new Set();
            grids.forEach((grid) => {
                const previous = mountedHomeGrids.get(grid);
                const outcome = installCachedHomeCellRenderer(grid, discoveredGrids.has(grid) || previous?.discovered === true);
                if (refreshExisting || outcome === "wrapped")
                    gridsToRecompute.add(grid);
            });
            gridsToRecompute.forEach((grid) => {
                try {
                    grid.recomputeGridSize();
                }
                catch {
                    mountedHomeGrids.delete(grid);
                }
            });
            // Steam can publish a replacement native renderer while recomputing its
            // cached item output. Rewrap that newest renderer after the invalidation
            // so the current grid, not only a future render, owns the indicator.
            gridsToRecompute.forEach((grid) => {
                const previous = mountedHomeGrids.get(grid);
                installCachedHomeCellRenderer(grid, previous?.discovered ?? false);
            });
            return hasMountedHomeCellRendererWrapper(true);
        };
        const homeRefFor = (originalRef) => {
            const existing = homeRefCallbacks.get(originalRef);
            if (existing)
                return existing;
            const callback = (instance) => {
                try {
                    assignRef(originalRef, instance);
                }
                catch {
                    // A host ref must not prevent Steam's native carousel from mounting.
                }
                if (!instance || !active)
                    return;
                mountedHomeCarousels.add(instance);
                refreshMountedHomeCarousels();
            };
            homeRefCallbacks.set(originalRef, callback);
            return callback;
        };
        const scheduleMountedHomeDiscoveryRetry = () => {
            if (!active ||
                homeDiscoveryRetryId !== undefined ||
                homeDiscoveryAttempts >= dependencies.maxHomeDiscoveryAttempts) {
                return;
            }
            homeDiscoveryRetryId = dependencies.scheduleRetry(() => {
                if (!active)
                    return;
                homeDiscoveryRetryId = undefined;
                homeDiscoveryAttempts += 1;
                refreshMountedHomeCarousels(false);
                scheduleMountedHomeDiscoveryRetry();
            }, dependencies.homeDiscoveryIntervalMs);
        };
        try {
            homeUnpatch = dependencies.patchHomeRenderer(targets.home, (_args, output) => {
                const homeOutput = output;
                if (!active || !SP_REACT.isValidElement(homeOutput))
                    return output;
                const homeProps = homeOutput.props;
                if (typeof homeProps?.fnItemRenderer !== "function")
                    return output;
                const originalRenderer = homeProps.fnItemRenderer;
                return SP_REACT.cloneElement(homeOutput, {
                    ref: homeRefFor(homeOutput.ref),
                    fnItemRenderer: (...itemArgs) => wrapCarouselElement(originalRenderer(...itemArgs), isMountedHomeCarousel, carouselWrapperFor),
                });
            });
            if (typeof homeUnpatch !== "function") {
                cleanup();
                return;
            }
            gridUnpatch = dependencies.patchGridRenderer(targets.grid, (args, output) => decorateForApp(Number(args[0]?.app?.appid), output, (card, overview) => decorateGridCompatibility(card, ReactiveCompatibilityIndicator, targets.gridIconsClassName, targets.gridIndicatorClassName, overview), args[0]?.app));
            if (typeof gridUnpatch !== "function") {
                cleanup();
                return;
            }
        }
        catch {
            cleanup();
            return;
        }
        installed = true;
        homeCacheUnsubscribe = subscribeCompatibilityRevision(refreshMountedHomeCarousels);
        refreshMountedHomeCarousels();
        reportInstalled(resolutionAttempts);
        dependencies.refreshCompatibilitySurfaces();
        scheduleMountedHomeDiscoveryRetry();
    };
    installWhenTargetsResolve();
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

// The edit key is the only entry this version inserts. Keep the legacy key in
// the removal set because Steam can reuse menu arrays created by older builds.
const ENTRY_KEY = "decky-metadata-edit";
const REMOVAL_KEYS = new Set([ENTRY_KEY, "decky-metadata-compatibility"]);
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
        if (REMOVAL_KEYS.has(items[index]?.key)) {
            items.splice(index, 1);
            removed = true;
        }
    }
    return removed;
};
/** Insert our entry just above "Properties..." (or at the end) for shortcuts. */
const insertOurEntry = (items, appId) => {
    const overview = getNativeOverview(appId);
    if (!isNativeNonSteamShortcut(overview))
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
    // Steam reuses a single context-menu instance and installs the inner
    // (body) render patches only once. Those patches must read the appid of
    // whichever game is *currently* opening the menu, not the one captured on
    // first render, so keep the latest values in mutable holders that the outer
    // render refreshes on every open.
    let currentOwnerAppId = 0;
    let currentFallbackAppId = 0;
    try {
        outerPatch = DFL.afterPatch(LibraryContextMenuClass.prototype, "render", (_renderArgs, menu) => {
            currentOwnerAppId = Number(menu?._owner?.pendingProps?.overview?.appid ?? 0);
            currentFallbackAppId = resolveAppId(menu?.props?.children ?? [], 0);
            if (!innerPatch) {
                innerPatch = DFL.afterPatch(menu, "type", (_typeArgs, rendered) => {
                    // First render of the menu body.
                    DFL.afterPatch(rendered.type.prototype, "render", (_args, output) => {
                        const items = output?.props?.children?.[0];
                        try {
                            syncOurEntry("first-render", items, currentOwnerAppId, currentFallbackAppId);
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
                                syncOurEntry("should-update", nextProps.children, currentOwnerAppId, currentFallbackAppId);
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
                    syncOurEntry("outer-rerender", menu.props.children, currentOwnerAppId, currentFallbackAppId);
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

const descriptorPath = (descriptor) => {
    if (typeof descriptor?.url !== "string" || !descriptor.url)
        return "";
    try {
        return new URL(descriptor.url, "https://store.steampowered.com").pathname.toLowerCase();
    }
    catch (_error) {
        return "";
    }
};
const isSupportQuickLink = (descriptor) => descriptor?.link === "HelpAppPage";
const isCommunityQuickLink = (descriptor) => descriptor?.link === "GameHub";
const isCommunityMarketQuickLink = (descriptor) => descriptor?.link === "CommunityMarketApp";
const isStoreQuickLink = (descriptor) => /^\/app\/\d+(?:\/|$)/.test(descriptorPath(descriptor));
const isDlcQuickLink = (descriptor) => /^\/dlc\/\d+(?:\/|$)/.test(descriptorPath(descriptor));
const isPointsShopQuickLink = (descriptor) => /^\/points\/shop\/app\/\d+(?:\/|$)/.test(descriptorPath(descriptor));
const transformMatchedQuickLinks = (links, state, resources) => {
    if (!(state.steamAppid > 0))
        return links;
    const transformed = [];
    let originalStoreSlot;
    for (const descriptor of links) {
        if (isSupportQuickLink(descriptor) ||
            isCommunityMarketQuickLink(descriptor) ||
            isDlcQuickLink(descriptor) ||
            isPointsShopQuickLink(descriptor)) {
            continue;
        }
        if (isStoreQuickLink(descriptor)) {
            if (originalStoreSlot === undefined)
                originalStoreSlot = transformed.length;
            if (state.steamStoreState !== "delisted")
                transformed.push(descriptor);
            continue;
        }
        transformed.push(descriptor);
    }
    if (state.hasDlc) {
        const communityIndex = transformed.findIndex(isCommunityQuickLink);
        const insertAt = originalStoreSlot !== undefined
            ? originalStoreSlot + (state.steamStoreState === "delisted" ? 0 : 1)
            : communityIndex >= 0 ? communityIndex : 0;
        transformed.splice(insertAt, 0, {
            label: resources.localize("#AppDetails_Links_DLC", "DLC"),
            url: resources.buildDlcUrl(state.steamAppid),
        });
    }
    if (state.hasPointsShop) {
        const communityIndex = transformed.findIndex(isCommunityQuickLink);
        const insertAt = communityIndex >= 0 ? communityIndex + 1 : transformed.length;
        transformed.splice(insertAt, 0, {
            label: resources.localize("#AppDetails_Links_PointsShop", "Points Shop"),
            url: resources.buildPointsShopUrl(state.steamAppid),
        });
    }
    return transformed;
};

let cachedSteamUrlBuilder;
const asSteamUrlBuilder = (candidate) => {
    if (candidate &&
        typeof candidate.BuildStoreAppDlcURL === "function" &&
        typeof candidate.BuildAppPointsShopURL === "function") {
        return candidate;
    }
    if (!candidate || typeof candidate !== "object")
        return undefined;
    for (const key in candidate) {
        try {
            const nested = candidate[key];
            if (nested &&
                typeof nested.BuildStoreAppDlcURL === "function" &&
                typeof nested.BuildAppPointsShopURL === "function") {
                return nested;
            }
        }
        catch (_error) {
            continue;
        }
    }
    return undefined;
};
const steamUrlBuilder = () => {
    if (cachedSteamUrlBuilder !== undefined)
        return cachedSteamUrlBuilder;
    try {
        cachedSteamUrlBuilder = DFL.findModuleChild(asSteamUrlBuilder) || null;
    }
    catch (_error) {
        cachedSteamUrlBuilder = null;
    }
    return cachedSteamUrlBuilder;
};
const localizeSteamToken = (token, fallback) => {
    try {
        const manager = globalThis?.LocalizationManager;
        const localized = manager?.LocalizeString?.(token);
        if (typeof localized === "string" && localized && localized !== token) {
            return localized;
        }
    }
    catch (_error) {
        // Deterministic English labels remain valid when localization is unavailable.
    }
    return fallback;
};
const resolveQuickLinkResources = () => {
    const builder = steamUrlBuilder();
    return {
        buildDlcUrl: (steamAppid) => {
            try {
                const url = builder?.BuildStoreAppDlcURL(steamAppid, "primarylinks");
                if (typeof url === "string" && url)
                    return url;
            }
            catch (_error) {
                // Fall back to the stable public Steam URL.
            }
            return `https://store.steampowered.com/dlc/${steamAppid}/`;
        },
        buildPointsShopUrl: (steamAppid) => {
            try {
                const url = builder?.BuildAppPointsShopURL(steamAppid);
                if (typeof url === "string" && url)
                    return url;
            }
            catch (_error) {
                // Fall back to the stable public Steam URL.
            }
            return `https://store.steampowered.com/points/shop/app/${steamAppid}`;
        },
        localize: localizeSteamToken,
    };
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
// The quick-links row is not reachable from the route render tree. Steam's page
// host mounts Game Info through several function-component boundaries, so this
// hooks the class that registers the info section. Its output contains the
// function boundary whose render creates the native quick-links component.
const NullQuickLinks = () => null;
const QUICK_LINK_RUNTIME_KEY = "__deckyMetadataQuickLinkRuntime";
const quickLinkRuntime = () => {
    const host = globalThis;
    const current = host[QUICK_LINK_RUNTIME_KEY];
    if (current && typeof current === "object")
        return current;
    const runtime = { owner: 0 };
    host[QUICK_LINK_RUNTIME_KEY] = runtime;
    return runtime;
};
const installNonSteamQuickLinkPolicy = (unpatchers) => {
    const maxAttempts = 5;
    let attempts = 0;
    let cancelled = false;
    let retryId;
    let policyUnpatch;
    let quickLinkResources;
    // Steam can retain these element objects while Decky replaces a plugin in
    // place. Retained wrappers must call the current import's policy, rather
    // than mutating a live React tree during the old import's teardown.
    const runtime = quickLinkRuntime();
    const runtimeOwner = runtime.owner + 1;
    runtime.owner = runtimeOwner;
    const infoSectionWrapperCache = new Map();
    const nativeQuickLinksWrapperCache = new Map();
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
        warn("patch", "non-Steam quick-links section target not found", fields);
        void frontendLog("patch", "non-Steam quick-links section target not found", fields, "warning").catch(() => undefined);
    };
    const warnPolicyFailure = (message, fields) => {
        warn("patch", message, fields);
        void frontendLog("patch", message, fields, "warning").catch(() => undefined);
    };
    const policyWrapperFor = (original) => {
        // A retained React element can be rendered more than once before its
        // parent remounts. Reusing its policy wrapper avoids an unbounded chain.
        if (original?.__dmQuickLinksWrapper === true)
            return original;
        let wrapper = nativeQuickLinksWrapperCache.get(original);
        if (wrapper)
            return wrapper;
        wrapper = (props) => {
            const activePolicy = quickLinkRuntime().renderQuickLinks;
            return activePolicy ? activePolicy(original, props) : original(props);
        };
        wrapper.__dmQuickLinksWrapper = true;
        nativeQuickLinksWrapperCache.set(original, wrapper);
        return wrapper;
    };
    const renderQuickLinks = (original, props) => {
        const nativeOutput = original(props);
        try {
            const appId = Number(props?.overview?.appid);
            const metadata = metadataCache[String(appId)];
            if (!metadata || !isNonSteamApp(props?.overview) || !(Number(metadata.steam_appid) > 0)) {
                return nativeOutput;
            }
            if (!isReactElement(nativeOutput) || !Array.isArray(nativeOutput.props?.links)) {
                warnPolicyFailure("matched quick-links output shape changed", { appId });
                return nativeOutput;
            }
            quickLinkResources ?? (quickLinkResources = resolveQuickLinkResources());
            const links = transformMatchedQuickLinks(nativeOutput.props.links, {
                steamAppid: Number(metadata.steam_appid),
                steamStoreState: metadata.steam_store_state || "unknown",
                hasDlc: Array.isArray(metadata.steam_dlc_appids) && metadata.steam_dlc_appids.length > 0,
                hasPointsShop: metadata.has_points_shop === true,
            }, quickLinkResources);
            return SP_REACT.cloneElement(nativeOutput, { links });
        }
        catch (error) {
            warnPolicyFailure("matched quick-links transformation failed", {
                appId: Number(props?.overview?.appid) || 0,
                error: error instanceof Error ? error.message : String(error),
            });
            return nativeOutput;
        }
    };
    const renderInfoSection = (original, props) => {
        const rendered = original(props);
        try {
            const renderedAppId = Number(props?.overview?.appid);
            const metadata = metadataCache[String(renderedAppId)];
            if (!metadata || !isNonSteamApp(props?.overview))
                return rendered;
            const linkRows = [];
            findChildElements(rendered, isQuickLinksElement, linkRows);
            if (linkRows.length === 0) {
                warnPolicyFailure("non-Steam quick-links row shape changed", {
                    appId: renderedAppId,
                });
            }
            for (const row of linkRows) {
                row.type = isNeverOnSteam(renderedAppId)
                    ? NullQuickLinks
                    : policyWrapperFor(row.type);
            }
        }
        catch (error) {
            warnPolicyFailure("non-Steam quick-links section traversal failed", {
                appId: Number(props?.overview?.appid) || 0,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return rendered;
    };
    runtime.renderQuickLinks = renderQuickLinks;
    runtime.renderInfoSection = renderInfoSection;
    const tryInstall = () => {
        retryId = undefined;
        if (cancelled || policyUnpatch)
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
        policyUnpatch = safeAfterPatch(sectionClass.prototype, "render", function (_args, ret) {
            try {
                if (this?.props?.name !== "info")
                    return ret;
                const boundaries = [];
                findChildElements(ret, isInfoSectionBoundary, boundaries);
                for (const element of boundaries) {
                    const appId = Number(element.props?.overview?.appid);
                    if (!metadataCache[String(appId)] || !isNonSteamApp(element.props?.overview))
                        continue;
                    const original = element.type;
                    let wrapper = infoSectionWrapperCache.get(original);
                    if (!wrapper) {
                        wrapper = (props) => {
                            const activePolicy = quickLinkRuntime().renderInfoSection;
                            return activePolicy ? activePolicy(original, props) : original(props);
                        };
                        wrapper.__dmQuickLinksWrapper = true;
                        infoSectionWrapperCache.set(original, wrapper);
                    }
                    element.type = wrapper;
                }
            }
            catch (error) {
                warnPolicyFailure("non-Steam quick-links boundary traversal failed", {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            return ret;
        }).unpatch;
    };
    unpatchers.push(() => {
        cancelled = true;
        clearRetry();
        policyUnpatch?.();
        policyUnpatch = undefined;
        if (runtime.owner === runtimeOwner) {
            runtime.renderQuickLinks = undefined;
            runtime.renderInfoSection = undefined;
        }
        infoSectionWrapperCache.clear();
        nativeQuickLinksWrapperCache.clear();
        quickLinkResources = undefined;
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
                        const lifecycleGeneration = compatibilityLifecycleSnapshot();
                        const previousAppId = metadataState.lastObservedGameDetailAppId;
                        metadataState.lastObservedGameDetailAppId = appId;
                        if (metadataCache[String(appId)]) {
                            // `route` is a Decky template (for example `:appid`), not an
                            // authoritative path. Replacing a history listener's concrete
                            // return shield with that template makes stale editor browser
                            // tokens fail the exact-app check during the first Game Info
                            // render. Keep the shield's identity concrete.
                            const shieldPath = route.replace(":appid", String(appId));
                            armRouteShield(appId, shieldPath, "route-render");
                            if (isBypassTraceEnabled()) {
                                void frontendLog("trace", "reentry shield armed", { appId, trigger: "route-render", path: shieldPath }).catch(() => undefined);
                            }
                            // A completed editor Save wrote this overview directly while
                            // Steam still had editor route tokens. Publish its replacement
                            // only after this exact Game Info tree has re-entered under the
                            // concrete shield, so native collections update without losing
                            // the matched rich render.
                            publishDeferredEditorCompatibility(appId);
                        }
                        else {
                            if (isBypassTraceEnabled()) {
                                void frontendLog("trace", "reentry shield skip", { trigger: "route-render", path: route, appId, reason: "no-metadata-cache" }).catch(() => undefined);
                            }
                        }
                        void ensureMetadataCache().then(() => {
                            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                                return;
                            if (applyMetadata(appId))
                                notifyCompatibilityRevision();
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
                        const lifecycleGeneration = compatibilityLifecycleSnapshot();
                        metadataState.lastObservedGameDetailAppId = appId;
                        void ensureMetadataCache().then(() => {
                            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                                return;
                            if (applyMetadata(appId))
                                notifyCompatibilityRevision();
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
                // This callback's new location is authoritative. currentRoutePath()
                // can still contain the departing Game Info path while Steam commits
                // its browser tokens, so it must not keep the held update queued. The
                // callback's query and hash can carry the selected tab, so preserve
                // them instead of falling back to stale browser tokens.
                const routeContext = [location?.pathname, location?.search, location?.hash]
                    .filter(Boolean)
                    .join(" ");
                flushDeferredCompatibilityPublications(routeContext);
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

const LEGION_GO_S_CONTROLLER_TYPE = 102;
const REQUIRED_CHOOSER_TABS = new Set([
    "templates",
    "community",
    "search",
]);
const asRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
const validDisplayedAppid = (value) => typeof value === "number" && Number.isInteger(value) && value > 0;
const validControllerIndex = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0;
const tabIdentity = (id) => {
    if (typeof id !== "string")
        return null;
    const trimmed = id.trim();
    return trimmed ? trimmed : null;
};
const canonicalChooserTab = (id) => {
    // Steam's observed chooser IDs prepend a generated `«r…»` token.  Strip
    // that one exact shape only; arbitrary suffixes must stay unrelated.
    const semanticId = id.replace(/^«r[0-9a-z]+»/i, "").toLocaleLowerCase("en-US");
    if (semanticId === "templates")
        return "templates";
    if (semanticId === "community" || semanticId === "community layouts")
        return "community";
    if (semanticId === "search")
        return "search";
    return null;
};
const contentNumbers = (content) => {
    const contentRecord = asRecord(content);
    const props = asRecord(contentRecord?.props);
    if (!props)
        return null;
    const displayedAppid = props.appid ?? props.appId ?? props.nAppID;
    const controllerIndex = props.controllerIndex ?? props.nControllerIndex;
    if (!validDisplayedAppid(displayedAppid) || !validControllerIndex(controllerIndex))
        return null;
    return { displayedAppid, controllerIndex };
};
const chooserTabs = (value) => {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const output = [];
    const seenIds = new Set();
    let displayedAppid;
    let controllerIndex;
    for (const rawTab of value) {
        const tab = asRecord(rawTab);
        const id = tabIdentity(tab?.id);
        const numbers = contentNumbers(tab?.content);
        if (!id || seenIds.has(id))
            return null;
        const signature = canonicalChooserTab(id);
        if ((signature === "community" || signature === "search") && !numbers)
            return null;
        if (numbers) {
            if (displayedAppid === undefined)
                displayedAppid = numbers.displayedAppid;
            if (controllerIndex === undefined)
                controllerIndex = numbers.controllerIndex;
            if (displayedAppid !== numbers.displayedAppid || controllerIndex !== numbers.controllerIndex) {
                return null;
            }
        }
        seenIds.add(id);
        output.push({ id });
    }
    if (!displayedAppid || controllerIndex === undefined)
        return null;
    const signatures = new Set(output.map((tab) => canonicalChooserTab(tab.id)).filter((signature) => signature !== null));
    for (const required of REQUIRED_CHOOSER_TABS) {
        if (!signatures.has(required))
            return null;
    }
    return { tabs: output, displayedAppid, controllerIndex };
};
const contextMatchesAffectedChooser = (dependencies, displayedAppid, controllerIndex) => {
    const context = dependencies.resolveContext(displayedAppid);
    return context?.isNonSteamShortcut === true &&
        validDisplayedAppid(context.matchedSourceAppid) &&
        context.matchedSourceAppid !== displayedAppid &&
        dependencies.resolveControllerType(controllerIndex) === LEGION_GO_S_CONTROLLER_TYPE;
};
const callableWritableDescriptor = (descriptor) => !!descriptor &&
    typeof descriptor.value === "function" &&
    descriptor.writable === true &&
    descriptor.configurable === true;
const sourceHasChooserMarkers = (candidate) => {
    if (typeof candidate !== "function")
        return false;
    try {
        const source = Function.prototype.toString.call(candidate);
        return ["activeTab", "tabs", "onShowTab"].every((marker) => source.includes(marker));
    }
    catch (_error) {
        return false;
    }
};
const validTabsTarget = (value) => {
    const target = asRecord(value);
    return !!target &&
        target.memo !== null && typeof target.memo === "object" &&
        callableWritableDescriptor(target.descriptor);
};
const discoverControllerTabsTarget = (locateModule, onError) => {
    try {
        const target = locateModule((module) => {
            const exports = asRecord(module);
            if (!exports)
                return undefined;
            const values = Object.values(exports);
            if (!values.some(sourceHasChooserMarkers))
                return undefined;
            const targets = values.flatMap((candidate) => {
                if (candidate === null || typeof candidate !== "object")
                    return [];
                const descriptor = Object.getOwnPropertyDescriptor(candidate, "type");
                return callableWritableDescriptor(descriptor)
                    ? [{ memo: candidate, descriptor }]
                    : [];
            });
            return targets.length === 1 ? targets[0] : undefined;
        });
        return validTabsTarget(target) ? target : null;
    }
    catch (error) {
        try {
            onError?.(error);
        }
        catch (_reportError) {
            // Diagnostics must not affect Steam's native chooser.
        }
        return null;
    }
};
const defaultFindModuleChild = (predicate) => DFL.findModuleChild(predicate);
const selectionKey = (displayedAppid, controllerIndex) => `${displayedAppid}:${controllerIndex}`;
const renderScope = (propsValue, dependencies) => {
    const props = asRecord(propsValue);
    if (!props || typeof props.onShowTab !== "function")
        return null;
    const parsedTabs = chooserTabs(props.tabs);
    if (!parsedTabs || !contextMatchesAffectedChooser(dependencies, parsedTabs.displayedAppid, parsedTabs.controllerIndex))
        return null;
    return {
        key: {
            displayedAppid: parsedTabs.displayedAppid,
            controllerIndex: parsedTabs.controllerIndex,
        },
        tabs: parsedTabs.tabs,
        props,
        onShowTab: props.onShowTab,
    };
};
const installControllerTabPersistence = (provided) => {
    const dependencies = {
        ...provided,
        findModuleChild: provided.findModuleChild ?? defaultFindModuleChild,
        defineProperty: provided.defineProperty ?? Object.defineProperty,
    };
    const rememberedTabs = new Map();
    let installed = false;
    let cleanedUp = false;
    let installedTarget = null;
    let reported = false;
    const reportOnce = (error) => {
        if (reported)
            return;
        reported = true;
        try {
            dependencies.reportDiagnostic?.(error);
        }
        catch (_error) {
            // Diagnostics are optional and must remain fail-open.
        }
    };
    const cleanup = () => {
        if (cleanedUp)
            return;
        cleanedUp = true;
        rememberedTabs.clear();
        if (installedTarget) {
            try {
                dependencies.defineProperty(installedTarget.memo, "type", installedTarget.descriptor);
            }
            catch (error) {
                reportOnce(error);
            }
        }
        installed = false;
        installedTarget = null;
    };
    const ensureInstalled = () => {
        if (cleanedUp)
            return false;
        if (installed)
            return true;
        const target = discoverControllerTabsTarget(dependencies.findModuleChild, reportOnce);
        if (!target)
            return false;
        const originalRender = target.descriptor.value;
        const wrappedRender = function (...args) {
            let patchedArgs = args;
            try {
                const scope = renderScope(args[0], dependencies);
                if (scope) {
                    const key = selectionKey(scope.key.displayedAppid, scope.key.controllerIndex);
                    const availableIds = new Set(scope.tabs.map((tab) => tab.id));
                    const remembered = rememberedTabs.get(key);
                    let activeTab = scope.props.activeTab;
                    if (remembered !== undefined) {
                        if (availableIds.has(remembered))
                            activeTab = remembered;
                        else
                            rememberedTabs.delete(key);
                    }
                    const originalOnShowTab = scope.onShowTab;
                    const onShowTab = function (...callbackArgs) {
                        const requested = tabIdentity(callbackArgs[0]);
                        if (requested && availableIds.has(requested))
                            rememberedTabs.set(key, requested);
                        return originalOnShowTab.apply(this, callbackArgs);
                    };
                    patchedArgs = [{ ...scope.props, activeTab, onShowTab }, ...args.slice(1)];
                }
            }
            catch (error) {
                reportOnce(error);
            }
            return originalRender.apply(this, patchedArgs);
        };
        try {
            dependencies.defineProperty(target.memo, "type", {
                ...target.descriptor,
                value: wrappedRender,
            });
            installedTarget = target;
            installed = true;
            return true;
        }
        catch (error) {
            try {
                dependencies.defineProperty(target.memo, "type", target.descriptor);
            }
            catch (restoreError) {
                reportOnce(restoreError);
            }
            reportOnce(error);
            return false;
        }
    };
    return {
        ensureInstalled,
        beforeControllerQuery: (displayedAppid, controllerIndex, storeDriven) => {
            if (cleanedUp || !validDisplayedAppid(displayedAppid) || !validControllerIndex(controllerIndex)) {
                return;
            }
            const key = selectionKey(displayedAppid, controllerIndex);
            // The first fresh chooser query is the only chance to wrap the tab
            // callback before the user makes a selection. Discovery is lazy and
            // fail-open, so retrying here is harmless when its webpack chunk is not
            // loaded yet.
            ensureInstalled();
            if (storeDriven) {
                rememberedTabs.delete(key);
            }
        },
        cleanup,
        isInstalled: () => installed,
        rememberedTab: (displayedAppid, controllerIndex) => {
            if (!validDisplayedAppid(displayedAppid) || !validControllerIndex(controllerIndex))
                return null;
            return rememberedTabs.get(selectionKey(displayedAppid, controllerIndex)) ?? null;
        },
    };
};

const nativeControllerLayoutContext = () => ({
    isNonSteamShortcut: false,
    matchedSourceAppid: null,
});
const STEAM_SHORTCUT_APPID_MIN = 0x80000000;
const isNativeSteamAppid = (value) => typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value < STEAM_SHORTCUT_APPID_MIN;
const resolveControllerLayoutContext = (input) => {
    if (!Number.isFinite(input.displayedAppid) ||
        input.displayedAppid <= 0 ||
        !isSteamShortcutAppid(input.displayedAppid)) {
        return nativeControllerLayoutContext();
    }
    if (!input.isNonSteamShortcut) {
        return nativeControllerLayoutContext();
    }
    const sourceAppid = input.metadata?.steam_appid;
    if (!isNativeSteamAppid(sourceAppid) || sourceAppid === input.displayedAppid) {
        return { isNonSteamShortcut: true, matchedSourceAppid: null };
    }
    return { isNonSteamShortcut: true, matchedSourceAppid: sourceAppid };
};
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const positiveNumericAppid = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
// Steam shortcut IDs use the unsigned CRC namespace defined in backend/shortcuts_vdf.py.
const isSteamShortcutAppid = (value) => typeof value === "number" &&
    Number.isInteger(value) &&
    value >= STEAM_SHORTCUT_APPID_MIN &&
    value <= 0xffffffff;
const resolveControllerSearchContext = (context, displayedAppid) => {
    if (typeof context !== "object" ||
        context === null ||
        typeof context.isNonSteamShortcut !== "boolean") {
        throw new Error("invalid controller layout context");
    }
    const { isNonSteamShortcut, matchedSourceAppid } = context;
    if (matchedSourceAppid !== null &&
        (!isNativeSteamAppid(matchedSourceAppid) ||
            matchedSourceAppid === displayedAppid ||
            !isNonSteamShortcut)) {
        throw new Error("invalid matched appid");
    }
    if (!isNonSteamShortcut && matchedSourceAppid !== null) {
        throw new Error("native context has matched appid");
    }
    return {
        displayedAppid,
        isNonSteamShortcut,
        matchedSourceAppid,
    };
};
const filterControllerSearchConfigs = (nativeResult, context, supplementalSourceAppids) => {
    if (!Array.isArray(nativeResult)) {
        return { ok: false, reason: "native-search-not-array" };
    }
    let filtered = null;
    for (let index = 0; index < nativeResult.length; index += 1) {
        const value = nativeResult[index];
        let remove = false;
        if (isRecord(value)) {
            let appid;
            try {
                appid = value.appID;
            }
            catch (_error) {
                appid = undefined;
            }
            if (positiveNumericAppid(appid)) {
                if (context.isNonSteamShortcut && context.displayedAppid !== null) {
                    remove = appid !== context.displayedAppid && appid !== context.matchedSourceAppid;
                }
                else {
                    remove = isSteamShortcutAppid(appid) ||
                        (supplementalSourceAppids.has(appid) && appid !== context.displayedAppid);
                }
            }
        }
        if (remove) {
            if (filtered === null)
                filtered = nativeResult.slice(0, index);
        }
        else if (filtered !== null) {
            filtered.push(value);
        }
    }
    return { ok: true, value: filtered ?? nativeResult };
};
const hasStableUrl = (value) => typeof value.URL === "string" && value.URL.trim().length > 0;
const mergeSupplemental = (nativeBase, supplemental, include) => {
    if (!Array.isArray(supplemental)) {
        return { ok: false, reason: "supplemental-not-array" };
    }
    const merged = [...nativeBase];
    const seen = new Set();
    for (const value of nativeBase) {
        if (isRecord(value) && hasStableUrl(value)) {
            seen.add(value.URL);
        }
    }
    for (let index = 0; index < supplemental.length; index += 1) {
        const value = supplemental[index];
        if (!isRecord(value)) {
            return { ok: false, reason: "malformed-supplemental-record", index };
        }
        if (!include(value))
            continue;
        if (!hasStableUrl(value)) {
            return { ok: false, reason: "malformed-supplemental-record", index };
        }
        if (seen.has(value.URL))
            continue;
        seen.add(value.URL);
        merged.push(value);
    }
    return { ok: true, value: merged };
};
const mergeOfficialConfigs = (nativeBase, supplemental) => mergeSupplemental(nativeBase, supplemental, () => true);
const mergeRecommendedTemplates = (nativeBase, supplemental) => mergeSupplemental(nativeBase, supplemental, (record) => record.bRecommended === true);
const mergeCommunityConfigs = (nativeBase, supplemental) => mergeSupplemental(nativeBase, supplemental, () => true);

const CONTROLLER_LAYOUT_WARNING = {
    heading: "Controller layouts disabled",
    body: "Using Steam's standard controller layout UI until Decky Metadata is reloaded.",
};
const getterMerges = {
    official: mergeOfficialConfigs,
    templates: mergeRecommendedTemplates,
    workshop: mergeCommunityConfigs,
};
const getterKeys = {
    official: "GetOfficialConfigsForApp",
    templates: "GetTemplateConfigsForApp",
    workshop: "GetWorkshopConfigsForApp",
};
const callableDataDescriptor = (descriptor) => !!descriptor &&
    typeof descriptor.value === "function" &&
    descriptor.writable === true &&
    descriptor.configurable === true;
const validateTargets = (targets) => {
    const inputDescriptor = Object.getOwnPropertyDescriptor(targets.input, "QueryControllerConfigsForApp");
    const storePrototype = Object.getPrototypeOf(targets.store);
    if (!storePrototype ||
        typeof targets.store.QueryConfigsForApp !== "function" ||
        typeof targets.store.m_mapAppConfigs?.has !== "function" ||
        typeof targets.store.m_mapAppConfigs?.set !== "function" ||
        !callableDataDescriptor(inputDescriptor)) {
        return null;
    }
    const descriptors = [{
            target: targets.input,
            key: "QueryControllerConfigsForApp",
            descriptor: inputDescriptor,
        }];
    for (const key of Object.values(getterKeys)) {
        const descriptor = Object.getOwnPropertyDescriptor(storePrototype, key);
        if (!callableDataDescriptor(descriptor))
            return null;
        descriptors.push({ target: storePrototype, key, descriptor });
    }
    const searchDescriptor = Object.getOwnPropertyDescriptor(storePrototype, "GetAllConfigs");
    if (!callableDataDescriptor(searchDescriptor))
        return null;
    descriptors.push({
        target: storePrototype,
        key: "GetAllConfigs",
        descriptor: searchDescriptor,
    });
    return {
        input: targets.input,
        store: targets.store,
        storePrototype,
        descriptors,
    };
};
const errorDetail = (error) => {
    if (error instanceof Error && error.name)
        return error.name;
    return typeof error;
};
const validAppid = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const parseControllerIndex = (value) => {
    if (!Number.isInteger(value) || value < 0)
        return null;
    return value;
};
const parseFilter = (value) => typeof value === "boolean" ? value : null;
const supplementalQueryKey = (sourceAppid, controllerIndex, filterOtherControllerTypes) => {
    return {
        sourceAppid,
        controllerIndex: controllerIndex,
        filterOtherControllerTypes,
    };
};
const sameSupplementalQueryKey = (left, right) => !!left &&
    left.sourceAppid === right.sourceAppid &&
    left.controllerIndex === right.controllerIndex &&
    left.filterOtherControllerTypes === right.filterOtherControllerTypes;
const discoverControllerLayoutTargets = () => {
    const internals = globalThis;
    const input = internals.SteamClient?.Input;
    const store = internals.controllerConfiguratorStore;
    return input && store ? { input, store } : null;
};
const defaultSchedule = (callback, delayMs) => globalThis.setTimeout(callback, delayMs);
const defaultCancel = (handle) => globalThis.clearTimeout(handle);
const installControllerLayouts = (unpatchers, provided) => {
    const dependencies = {
        discoverTargets: provided.discoverTargets ?? discoverControllerLayoutTargets,
        resolveContext: provided.resolveContext,
        resolveControllerType: provided.resolveControllerType ?? controllerTypeForIndex,
        reportFailure: provided.reportFailure,
        notify: provided.notify,
        schedule: provided.schedule ?? defaultSchedule,
        cancel: provided.cancel ?? defaultCancel,
        defineProperty: provided.defineProperty ?? Object.defineProperty,
        maxAttempts: provided.maxAttempts ?? 240,
        retryDelayMs: provided.retryDelayMs ?? 500,
        createTabPersistence: provided.createTabPersistence ?? installControllerTabPersistence,
        reportTabPersistenceDiagnostic: provided.reportTabPersistenceDiagnostic ?? (() => undefined),
    };
    let disabled = false;
    let installed = false;
    let cleanedUp = false;
    let timer;
    let attempts = 0;
    let installedDescriptors = [];
    const supplementalSourceAppids = new Set();
    const supplementalQueryKeys = new Map();
    let tabPersistence = null;
    try {
        tabPersistence = dependencies.createTabPersistence({
            resolveContext: dependencies.resolveContext,
            resolveControllerType: dependencies.resolveControllerType,
            reportDiagnostic: dependencies.reportTabPersistenceDiagnostic,
        });
    }
    catch (_error) {
        // The optional Steam tabs patch must never disable controller-layout supplementation.
        tabPersistence = null;
    }
    const trip = (failure) => {
        if (disabled || cleanedUp)
            return;
        disabled = true;
        supplementalSourceAppids.clear();
        supplementalQueryKeys.clear();
        try {
            dependencies.reportFailure(failure);
        }
        catch (_error) {
            // Logging must not interfere with the secured native result.
        }
        try {
            dependencies.notify(CONTROLLER_LAYOUT_WARNING.heading, CONTROLLER_LAYOUT_WARNING.body);
        }
        catch (_error) {
            // The injected or Decky notifier is strictly best effort.
        }
    };
    const restoreDescriptors = (descriptors) => {
        for (let index = descriptors.length - 1; index >= 0; index -= 1) {
            const entry = descriptors[index];
            try {
                dependencies.defineProperty(entry.target, entry.key, entry.descriptor);
            }
            catch (_error) {
                // Continue restoring every other section even if Steam changed mid-unload.
            }
        }
    };
    const installValidatedTargets = (targets) => {
        const applied = [];
        const resolveDisplayedContext = (displayedAppid) => {
            if (!validAppid(displayedAppid)) {
                return {
                    displayedAppid: null,
                    isNonSteamShortcut: false,
                    matchedSourceAppid: null,
                };
            }
            return resolveControllerSearchContext(dependencies.resolveContext(displayedAppid), displayedAppid);
        };
        const resolveStoreAppid = (store) => {
            const candidateAppid = store.m_appId;
            if (validAppid(candidateAppid))
                return candidateAppid;
            const candidateLastAppid = store.m_lastValidAppId;
            if (validAppid(candidateLastAppid))
                return candidateLastAppid;
            return null;
        };
        const inputEntry = targets.descriptors[0];
        const originalQuery = inputEntry.descriptor.value;
        const queryWrapper = function (...args) {
            const storeDriven = targets.store
                .BConfigurationQueryInFlight === true;
            const displayedAppid = args[0];
            const controllerIndex = parseControllerIndex(args[1]);
            if (validAppid(displayedAppid) && controllerIndex !== null) {
                try {
                    tabPersistence?.beforeControllerQuery(displayedAppid, controllerIndex, storeDriven);
                }
                catch (_error) {
                    // Tab persistence is optional and independently fail-open.
                }
            }
            const nativeResult = originalQuery.apply(this, args);
            if (disabled)
                return nativeResult;
            const validDisplayedAppid = validAppid(displayedAppid) ? displayedAppid : undefined;
            let context = null;
            try {
                if (validDisplayedAppid === undefined)
                    return nativeResult;
                context = resolveDisplayedContext(displayedAppid);
                if (!context.isNonSteamShortcut || context.matchedSourceAppid === null) {
                    supplementalSourceAppids.delete(validDisplayedAppid);
                    supplementalQueryKeys.delete(validDisplayedAppid);
                    return nativeResult;
                }
                const matchedAppid = context.matchedSourceAppid;
                const requestedFilter = parseFilter(args[2]);
                if (controllerIndex === null || requestedFilter === null) {
                    trip({
                        section: "query",
                        code: "invalid-query-key",
                        displayedAppid: validDisplayedAppid,
                        matchedAppid,
                    });
                    return nativeResult;
                }
                const resolvedType = dependencies.resolveControllerType(controllerIndex);
                const effectiveSourceFilter = sourceFilterForControllerType(resolvedType, requestedFilter);
                const queryKey = supplementalQueryKey(matchedAppid, controllerIndex, effectiveSourceFilter);
                if (!queryKey) {
                    trip({
                        section: "query",
                        code: "invalid-query-key",
                        displayedAppid: validDisplayedAppid,
                        matchedAppid,
                    });
                    return nativeResult;
                }
                const cacheExisted = targets.store.m_mapAppConfigs.has(matchedAppid);
                if (cacheExisted &&
                    sameSupplementalQueryKey(supplementalQueryKeys.get(matchedAppid), queryKey)) {
                    supplementalSourceAppids.add(matchedAppid);
                    return nativeResult;
                }
                targets.store.m_mapAppConfigs.set(matchedAppid, []);
                const sourceQuery = [matchedAppid, controllerIndex, effectiveSourceFilter, ...args.slice(3)];
                originalQuery.apply(this, sourceQuery);
                supplementalQueryKeys.set(matchedAppid, queryKey);
                supplementalSourceAppids.add(matchedAppid);
            }
            catch (error) {
                trip({
                    section: "query",
                    code: "runtime-error",
                    displayedAppid: validDisplayedAppid,
                    matchedAppid: context?.matchedSourceAppid ?? undefined,
                    detail: errorDetail(error),
                });
            }
            return nativeResult;
        };
        const getterWrappers = new Map();
        for (const section of Object.keys(getterKeys)) {
            const key = getterKeys[section];
            const entry = targets.descriptors.find((candidate) => candidate.key === key);
            const originalGetter = entry.descriptor.value;
            getterWrappers.set(section, function (...args) {
                const nativeBase = originalGetter.apply(this, args);
                if (disabled)
                    return nativeBase;
                const displayedAppid = args[0];
                const validDisplayedAppid = validAppid(displayedAppid) ? displayedAppid : undefined;
                let context = null;
                try {
                    if (validDisplayedAppid === undefined)
                        return nativeBase;
                    context = resolveDisplayedContext(displayedAppid);
                    if (!context.isNonSteamShortcut || context.matchedSourceAppid === null) {
                        return nativeBase;
                    }
                    const matchedAppid = context.matchedSourceAppid;
                    if (!Array.isArray(nativeBase)) {
                        trip({
                            section,
                            code: "native-base-not-array",
                            displayedAppid: validDisplayedAppid,
                            matchedAppid,
                        });
                        return nativeBase;
                    }
                    const supplemental = originalGetter.apply(this, [matchedAppid, ...args.slice(1)]);
                    const result = getterMerges[section](nativeBase, supplemental);
                    if (result.ok === false) {
                        trip({
                            section,
                            code: result.reason,
                            displayedAppid: validDisplayedAppid,
                            matchedAppid,
                            detail: result.index === undefined ? undefined : `index:${result.index}`,
                        });
                        return nativeBase;
                    }
                    return result.value;
                }
                catch (error) {
                    trip({
                        section,
                        code: "runtime-error",
                        displayedAppid: validDisplayedAppid,
                        matchedAppid: context?.matchedSourceAppid ?? undefined,
                        detail: errorDetail(error),
                    });
                    return nativeBase;
                }
            });
        }
        const searchEntry = targets.descriptors.find((candidate) => candidate.key === "GetAllConfigs");
        const originalSearch = searchEntry.descriptor.value;
        const resolveStoreForContext = (store) => {
            if (store !== null &&
                typeof store === "object" &&
                ("m_appId" in store || "m_lastValidAppId" in store)) {
                return store;
            }
            return targets.store;
        };
        const searchWrapper = function (...args) {
            const nativeResult = originalSearch.apply(this, args);
            if (disabled)
                return nativeResult;
            try {
                const sourceStore = resolveStoreForContext(this);
                const storeAppid = resolveStoreAppid(sourceStore);
                const context = storeAppid === null
                    ? {
                        displayedAppid: null,
                        isNonSteamShortcut: false,
                        matchedSourceAppid: null,
                    }
                    : resolveDisplayedContext(storeAppid);
                const result = filterControllerSearchConfigs(nativeResult, context, supplementalSourceAppids);
                if (result.ok === false) {
                    trip({
                        section: "search",
                        code: result.reason,
                        displayedAppid: context.displayedAppid ?? undefined,
                        matchedAppid: context.matchedSourceAppid ?? undefined,
                    });
                    return nativeResult;
                }
                return result.value;
            }
            catch (error) {
                trip({
                    section: "search",
                    code: "runtime-error",
                    displayedAppid: resolveStoreAppid(resolveStoreForContext(this)) ?? undefined,
                    matchedAppid: undefined,
                    detail: errorDetail(error),
                });
                return nativeResult;
            }
        };
        const replacements = [
            { ...inputEntry, descriptor: { ...inputEntry.descriptor, value: queryWrapper } },
            ...Object.keys(getterKeys).map((section) => {
                const entry = targets.descriptors.find((candidate) => candidate.key === getterKeys[section]);
                return {
                    ...entry,
                    descriptor: { ...entry.descriptor, value: getterWrappers.get(section) },
                };
            }),
            { ...searchEntry, descriptor: { ...searchEntry.descriptor, value: searchWrapper } },
        ];
        try {
            for (const replacement of replacements) {
                dependencies.defineProperty(replacement.target, replacement.key, replacement.descriptor);
                const original = targets.descriptors.find((entry) => entry.key === replacement.key);
                applied.push(original);
            }
        }
        catch (error) {
            restoreDescriptors(applied);
            trip({ section: "install", code: "transaction-failed", detail: errorDetail(error) });
            return;
        }
        installedDescriptors = targets.descriptors;
        installed = true;
    };
    const attemptInstall = () => {
        timer = undefined;
        if (cleanedUp || disabled || installed)
            return;
        attempts += 1;
        let targets;
        try {
            targets = dependencies.discoverTargets();
        }
        catch (error) {
            trip({ section: "discovery", code: "discovery-error", detail: errorDetail(error) });
            return;
        }
        if (!targets) {
            if (attempts >= dependencies.maxAttempts) {
                trip({ section: "discovery", code: "retry-exhausted" });
            }
            else {
                try {
                    timer = dependencies.schedule(attemptInstall, dependencies.retryDelayMs);
                }
                catch (error) {
                    trip({
                        section: "discovery",
                        code: "retry-schedule-failed",
                        detail: errorDetail(error),
                    });
                }
            }
            return;
        }
        let validated;
        try {
            validated = validateTargets(targets);
        }
        catch (error) {
            trip({
                section: "install",
                code: "target-validation-failed",
                detail: errorDetail(error),
            });
            return;
        }
        if (!validated) {
            trip({ section: "install", code: "incompatible-target" });
            return;
        }
        try {
            installValidatedTargets(validated);
        }
        catch (error) {
            trip({
                section: "install",
                code: "wrapper-construction-failed",
                detail: errorDetail(error),
            });
        }
    };
    const cleanup = () => {
        if (cleanedUp)
            return;
        cleanedUp = true;
        try {
            tabPersistence?.cleanup();
        }
        catch (_error) {
            // Continue restoring the primary input/getter/Search descriptors.
        }
        tabPersistence = null;
        if (timer !== undefined) {
            dependencies.cancel(timer);
            timer = undefined;
        }
        if (installedDescriptors.length > 0) {
            restoreDescriptors(installedDescriptors);
            installedDescriptors = [];
        }
        installed = false;
        supplementalSourceAppids.clear();
        supplementalQueryKeys.clear();
    };
    unpatchers.push(cleanup);
    attemptInstall();
    return {
        isDisabled: () => disabled,
        isInstalled: () => installed,
    };
};

const resolveInstalledControllerLayoutContext = (displayedAppid) => {
    const overview = getOverview(displayedAppid);
    return resolveControllerLayoutContext({
        displayedAppid,
        isNonSteamShortcut: isNonSteamAppWithoutPatchedMethod(overview),
        metadata: metadataCache[String(displayedAppid)],
    });
};
const reportControllerLayoutFailure = (failure) => {
    warn("controller-layouts", "supplemental layouts disabled", failure);
    void frontendLog("patch", "controller layout supplementation disabled", failure, "warning").catch(() => undefined);
};
const installSteamPatches = () => {
    configureActivityMetadataLoader(ensureMetadataCache, applyMetadata);
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
        safeInstallStep("libraryCompatibilityIndicators", () => installLibraryCompatibilityIndicators(unpatchers));
        installCommunityFeedPatch(unpatchers);
        installRouterRenderPatches(unpatchers, {
            ensureMetadataCache,
            applyMetadata,
            tryEnrichScreenshotsForApp,
            tryFetchMetadataForApp,
            refreshDeckyNativeActivityForApp,
        });
        safeInstallStep("gameDetailReentryShield", () => installGameDetailReentryShield(unpatchers));
        safeInstallStep("nonSteamQuickLinkPolicy", () => installNonSteamQuickLinkPolicy(unpatchers));
        // Install last so an unrelated synchronous patch failure cannot strand
        // controller-layout descriptors outside the normal aggregate teardown.
        safeInstallStep("controllerLayouts", () => installControllerLayouts(unpatchers, {
            resolveContext: resolveInstalledControllerLayoutContext,
            reportFailure: reportControllerLayoutFailure,
            notify: toastWarn,
        }));
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

const COMPATIBILITY_QAM_RUNTIME_KEY = "__deckyMetadataCompatibilityQamRuntime";
const newCompatibilityQamRuntime = () => ({
    dropdown: {
        returnPending: false,
        controlUnmounted: false,
        returnVisible: false,
        selectionSaved: false,
        origin: "category",
    },
    policySaveId: 0,
    policySave: null,
    policySaveListeners: new Set(),
});
/**
 * A native popup can keep an old callback alive while Decky evaluates a new
 * bundle for the replacement QAM panel. Share that UI handoff state just like
 * the compatibility policy runtime, so both bundles observe one transaction.
 */
const compatibilityQamRuntime = () => {
    const host = globalThis;
    const existing = host[COMPATIBILITY_QAM_RUNTIME_KEY];
    if (existing
        && typeof existing === "object"
        && existing.dropdown
        && existing.policySaveListeners instanceof Set
        && typeof existing.policySaveId === "number") {
        return existing;
    }
    const runtime = newCompatibilityQamRuntime();
    host[COMPATIBILITY_QAM_RUNTIME_KEY] = runtime;
    return runtime;
};
const runtime = compatibilityQamRuntime();
const notifyCompatibilityPolicySave = () => {
    runtime.policySaveListeners.forEach((listener) => listener());
};
/** Keep one policy transaction alive while the native popup remounts QAM. */
const compatibilityPolicySaveSnapshot = () => runtime.policySave;
const subscribeCompatibilityPolicySave = (listener) => {
    runtime.policySaveListeners.add(listener);
    return () => runtime.policySaveListeners.delete(listener);
};
const hasPendingCompatibilityPolicySave = () => runtime.policySave !== null && runtime.policySave.pendingKind !== null;
const beginCompatibilityPolicySave = (kind, lifecycleGeneration, category, scope) => {
    const id = runtime.policySaveId + 1;
    runtime.policySaveId = id;
    runtime.policySave = {
        id,
        lifecycleGeneration,
        category,
        scope,
        pendingKind: kind,
        error: "",
    };
    notifyCompatibilityPolicySave();
    return id;
};
/** Complete only the transaction from the current plugin lifetime. */
const settleCompatibilityPolicySave = (id, lifecycleGeneration, category, scope, error = "") => {
    if (!runtime.policySave
        || runtime.policySave.id !== id
        || runtime.policySave.lifecycleGeneration !== lifecycleGeneration) {
        return false;
    }
    runtime.policySave = {
        id,
        lifecycleGeneration,
        category,
        scope,
        pendingKind: null,
        error,
    };
    notifyCompatibilityPolicySave();
    return true;
};
/** Invalidate an old plugin's transaction without letting it unlock a new mount. */
const discardStaleCompatibilityPolicySave = (lifecycleGeneration) => {
    if (!runtime.policySave
        || runtime.policySave.lifecycleGeneration === lifecycleGeneration) {
        return false;
    }
    runtime.policySave = null;
    runtime.policySaveId += 1;
    notifyCompatibilityPolicySave();
    return true;
};
const requestCompatibilityDropdownReturn = (origin) => {
    runtime.dropdown.returnPending = true;
    runtime.dropdown.controlUnmounted = false;
    runtime.dropdown.returnVisible = false;
    runtime.dropdown.selectionSaved = false;
    runtime.dropdown.origin = origin;
};
const hasCompatibilityDropdownReturn = () => runtime.dropdown.returnPending;
const compatibilityDropdownReturnOrigin = () => runtime.dropdown.origin;
const noteCompatibilityDropdownControlUnmounted = () => {
    if (!runtime.dropdown.returnPending)
        return false;
    runtime.dropdown.controlUnmounted = true;
    return true;
};
const noteCompatibilityDropdownReturnVisible = () => {
    if (!runtime.dropdown.returnPending || !runtime.dropdown.controlUnmounted) {
        return false;
    }
    runtime.dropdown.returnVisible = true;
    return true;
};
/** Selection completes after the backend confirms the new global policy. */
const noteCompatibilityDropdownSelectionSaved = () => {
    if (!runtime.dropdown.returnPending)
        return false;
    runtime.dropdown.returnVisible = true;
    runtime.dropdown.selectionSaved = true;
    return true;
};
const isCompatibilityDropdownSelectionReturn = () => runtime.dropdown.selectionSaved;
const isCompatibilityDropdownReturnReady = () => runtime.dropdown.returnPending && runtime.dropdown.returnVisible;
/**
 * Consume the request only after native gamepad focus succeeds. Failed early
 * attempts remain armed until the current close handoff finishes or aborts.
 */
const consumeCompatibilityDropdownReturn = () => {
    const pending = runtime.dropdown.returnPending;
    runtime.dropdown.returnPending = false;
    runtime.dropdown.controlUnmounted = false;
    runtime.dropdown.returnVisible = false;
    runtime.dropdown.selectionSaved = false;
    runtime.dropdown.origin = "category";
    return pending;
};
const clearCompatibilityDropdownReturn = () => {
    runtime.dropdown.returnPending = false;
    runtime.dropdown.controlUnmounted = false;
    runtime.dropdown.returnVisible = false;
    runtime.dropdown.selectionSaved = false;
    runtime.dropdown.origin = "category";
};

const DEFAULT_UPDATE_SETTINGS = {
    update_channel: "stable",
    automatic_update_checks: true,
};
const resolveLoadedUpdateSettings = (result) => ("status" in result ? DEFAULT_UPDATE_SETTINGS : result);
const resolveSavedUpdateSettings = (previous, result) => ("status" in result ? previous : result);

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

const SHORTCUT_APP_ID_BOUNDARY = 0x80000000;
const parseTrailerRootRoute = (route) => {
    const routeText = String(route || "").trim();
    const hashes = [...routeText.matchAll(/#([^\s]*)/g)].map((match) => match[1].toLowerCase());
    if (hashes.some((hash) => hash && hash !== "quickaccess") || /\b(?:tab|page|section|subpage)=/i.test(routeText))
        return null;
    const first = routeText.split(/\s+/, 1)[0];
    if (!first)
        return null;
    let path;
    try {
        const parsed = new URL(first, "https://steamloopback.host/");
        if (parsed.hostname !== "steamloopback.host")
            return null;
        if ((parsed.hash && parsed.hash.toLowerCase() !== "#quickaccess") ||
            ["tab", "page", "section", "subpage"].some((key) => parsed.searchParams.has(key)))
            return null;
        path = parsed.pathname.replace(/^\/routes(?=\/)/i, "");
    }
    catch {
        return null;
    }
    const match = path.match(/^\/library\/(?:app|details)\/(\d{1,10})\/?$/i)
        ?? path.match(/^\/library\/collection\/[^/]+\/(\d{1,10})\/?$/i)
        ?? path.match(/^\/library\/collection\/[^/]+\/app\/(\d{1,10})\/?$/i);
    if (!match)
        return null;
    const appId = Number(match[1]);
    return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : null;
};
const nativeOverviewAppId = (value) => {
    if (!value || typeof value !== "object")
        return null;
    const appId = Number(value.appid);
    return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : null;
};
const isNativeShortcut = (value) => {
    if (!value || typeof value !== "object")
        return false;
    const overview = value;
    if (Number(overview.app_type) === 1073741824)
        return true;
    try {
        return overview.BIsShortcut?.() === true;
    }
    catch {
        return false;
    }
};
const validSteamAppId = (value) => {
    if (typeof value !== "number" && !(typeof value === "string" && /^\d{1,10}$/.test(value)))
        return null;
    const appId = Number(value);
    return Number.isSafeInteger(appId) && appId > 0 && appId < SHORTCUT_APP_ID_BOUNDARY
        ? appId
        : null;
};
/** Resolve a trailer source only after Steam's native page and visible hero agree. */
const resolveTrailerSource = (context) => {
    if (!context.hydrated)
        return null;
    const pageAppId = parseTrailerRootRoute(context.route);
    if (!pageAppId || context.heroAppId !== pageAppId)
        return null;
    if (nativeOverviewAppId(context.overview) !== pageAppId)
        return null;
    if (pageAppId < SHORTCUT_APP_ID_BOUNDARY) {
        return isNativeShortcut(context.overview)
            ? null
            : { pageAppId, sourceAppId: pageAppId, kind: "steam" };
    }
    if (!isNativeShortcut(context.overview))
        return null;
    const sourceAppId = validSteamAppId(context.metadata?.steam_appid);
    return sourceAppId ? { pageAppId, sourceAppId, kind: "shortcut" } : null;
};

// @ts-nocheck
// This self-contained function is serialized into Steam's default world.
// Adapted from Decky-TrailerHero by LoZazaMastro; see NOTICE for inherited terms.
function deckyMetadataTrailerRuntimeFactory(nextSettings, ownerId, settingsRevision, injectedTranslations, identity) {
    const runtimeKey = "__deckyMetadataTrailerRuntime";
    const runtimeVersion = "0.1.0";
    const styleId = "decky-metadata-trailer-style";
    const videoClass = "decky-metadata-trailer-video";
    const targetClass = "decky-metadata-trailer-target";
    const readyClass = "decky-metadata-trailer-ready";
    const visibleClass = "decky-metadata-trailer-visible";
    const audioHintId = "decky-metadata-trailer-audio-hint";
    const audioChangeEvent = "decky-metadata-trailer:audio-change";
    const routeScanIntervalMs = 2400;
    const queuedScanDelayMs = 360;
    const directPlaybackTimeoutMs = 12000;
    const MAX_METADATA_BYTES = 1024 * 1024;
    const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
    const MAX_INIT_BYTES = 4 * 1024 * 1024;
    const MAX_SEGMENT_BYTES = 32 * 1024 * 1024;
    const translations = injectedTranslations || { en: {} };
    const safeMediaUrl = (value, base) => {
        if (typeof value !== "string" || !value.trim())
            return null;
        let parsed;
        try {
            parsed = base ? new URL(value, base) : new URL(value);
        }
        catch {
            return null;
        }
        const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || !host ||
            host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
            host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home") ||
            host.endsWith(".onion") || /^\[.*\]$/.test(host) || /^\d+(?:\.\d+){0,3}$/.test(host))
            return null;
        return parsed.href;
    };
    const readBoundedBody = async (response, maximumBytes, asText) => {
        const declaredLength = Number(response.headers?.get?.("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
            throw new Error("Steam media response is too large");
        }
        const reader = response.body?.getReader?.();
        if (!reader) {
            if (!Number.isFinite(declaredLength) || declaredLength < 0) {
                throw new Error("Steam media response has no bounded body");
            }
            const fallback = asText ? await response.text() : await response.arrayBuffer();
            const bytes = asText ? new TextEncoder().encode(fallback) : new Uint8Array(fallback);
            if (bytes.byteLength > maximumBytes)
                throw new Error("Steam media response is too large");
            return asText ? fallback : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        }
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.byteLength;
                if (size > maximumBytes) {
                    await reader.cancel();
                    throw new Error("Steam media response is too large");
                }
                chunks.push(value);
            }
        }
        catch (error) {
            try {
                await reader.cancel();
            }
            catch { }
            throw error;
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return asText ? new TextDecoder().decode(bytes) : bytes.buffer;
    };
    const validateResponseUrl = (response, requestedUrl) => {
        if (response.redirected === true)
            throw new Error("Steam media redirects are not allowed");
        if (!response.url)
            return;
        const finalUrl = safeMediaUrl(response.url);
        if (!finalUrl || finalUrl !== requestedUrl)
            throw new Error("Steam media response URL changed");
    };
    const normalizeSettings = (value) => {
        const parsed = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        const qualityOptions = ["auto", 720, 1080, 1440, 2160];
        return {
            enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
            audioEnabled: typeof parsed.audioEnabled === "boolean" ? parsed.audioEnabled : false,
            quality: qualityOptions.includes(parsed.quality) ? parsed.quality : "auto"
        };
    };
    const findOwnerRecord = () => {
        const candidates = [];
        try {
            candidates.push(window.opener);
        }
        catch { }
        candidates.push(window);
        try {
            if (window.parent !== window)
                candidates.push(window.parent);
        }
        catch { }
        for (const candidate of candidates) {
            try {
                const record = candidate?.__deckyMetadataTrailerOwner;
                if (record && typeof record === "object")
                    return record;
            }
            catch { }
        }
        return undefined;
    };
    let activeOwnerId = ownerId || "";
    let activeRevision = Number.isSafeInteger(settingsRevision) && settingsRevision >= 0 ? settingsRevision : 0;
    let settings = normalizeSettings(nextSettings);
    const normalizeIdentity = (value) => {
        const pageAppId = Number(value?.pageAppId);
        const sourceAppId = Number(value?.sourceAppId);
        if (!Number.isInteger(pageAppId) || pageAppId <= 0 || pageAppId > 0xffffffff ||
            !Number.isInteger(sourceAppId) || sourceAppId <= 0 || sourceAppId >= 0x80000000)
            return null;
        return { pageAppId, sourceAppId };
    };
    let activeIdentity = normalizeIdentity(identity);
    const ownerRecord = findOwnerRecord();
    if (activeOwnerId && (!ownerRecord || ownerRecord.ownerId !== activeOwnerId || ownerRecord.active !== true)) {
        return { status: "Steam UI unavailable", runtimeMissing: true };
    }
    if (ownerRecord && ownerRecord.ownerId === activeOwnerId && Number.isSafeInteger(ownerRecord.settingsRevision) && ownerRecord.settingsRevision > activeRevision) {
        activeRevision = ownerRecord.settingsRevision;
        settings = normalizeSettings(ownerRecord.settings);
        activeIdentity = normalizeIdentity(ownerRecord.identity);
    }
    const rt = (key, vars = {}) => {
        const template = translations.en?.[key] ?? key;
        return template.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""));
    };
    const coerceAppId = (value) => {
        if (typeof value !== "number" && (typeof value !== "string" || !/^\d{1,10}$/.test(value)))
            return undefined;
        const appId = Number(value);
        return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : undefined;
    };
    function getGameDetailsRouteAppId(value) {
        let path;
        try {
            const routeText = String(value || "").trim();
            const hashes = [...routeText.matchAll(/#([^\s]*)/g)].map((match) => match[1].toLowerCase());
            if (hashes.some((hash) => hash && hash !== "quickaccess") ||
                /\b(?:tab|page|section|subpage)=/i.test(routeText))
                return undefined;
            const route = new URL(routeText.split(/\s+/, 1)[0], window.location?.href ||
                "https://steamloopback.host/");
            if ((route.hash && route.hash.toLowerCase() !== "#quickaccess") ||
                ["tab", "page", "section", "subpage"].some((key) => route.searchParams.has(key)))
                return undefined;
            path = route.pathname;
        }
        catch {
            return undefined;
        }
        const match = path.match(/^\/(?:routes\/)?library\/(?:(?:app|details)\/)?(\d{1,10})\/?$/i) ??
            path.match(/^\/(?:routes\/)?library\/collection\/[^/]+\/(?:app\/)?(\d{1,10})\/?$/i);
        const appId = coerceAppId(match?.[1]);
        return appId;
    }
    const getLocalRouteText = () => [window.location?.href, window.location?.pathname, window.location?.hash, document.URL].filter(Boolean).join(" ").toLowerCase();
    function getOpenerRouteText() {
        try {
            const opener = window.opener;
            if (!opener?.location || new URL(opener.location.href).hostname !== "steamloopback.host")
                return "";
            return [opener.location.href, opener.location.pathname, opener.location.hash, opener.document?.URL]
                .filter(Boolean).join(" ").toLowerCase();
        }
        catch {
            return "";
        }
    }
    const activeRouteText = () => getOpenerRouteText() || getLocalRouteText();
    const detectLocationAppId = () => getGameDetailsRouteAppId(activeRouteText());
    const readRootRouteKey = () => {
        try {
            const first = activeRouteText().trim().split(/\s+/, 1)[0];
            return new URL(first, window.location.href).pathname.replace(/^\/routes(?=\/)/, "").replace(/\/$/, "") || "/";
        }
        catch {
            return "";
        }
    };
    const getElementAssetText = (element) => {
        let background = "";
        try {
            background = getComputedStyle(element).backgroundImage || "";
        }
        catch { }
        return [element.getAttribute("style") || "", element.getAttribute("src") || "", element.getAttribute("href") || "", background].join(" ");
    };
    const extractAppIdFromText = (value) => {
        const text = String(value || "");
        const patterns = [
            /(?:steam\/apps|store_item_assets\/steam\/apps|steamcommunity\/public\/images\/apps|assets)\/(\d{1,10})(?:[\/_?.&#-]|$)/i,
            /(?:config\/grid|\/grid\/)(\d{1,10})(?:[._a-z-]|$)/i,
            /\/customimages\/(\d{1,10})(?:[a-z_]*)(?:[._/?#-]|$)/i,
            /store\.steampowered\.com\/app\/(\d{1,10})(?:[/?#-]|$)/i
        ];
        const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
        const appId = coerceAppId(match?.[1]);
        return appId;
    };
    const isUsableRect = (rect) => {
        const minWidth = Math.min(420, window.innerWidth * 0.35);
        const minHeight = Math.min(180, window.innerHeight * 0.28);
        return rect.width >= minWidth && rect.height >= minHeight && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    };
    const scoreHeroElement = (element, assetText) => {
        const rect = element.getBoundingClientRect();
        if (!isUsableRect(rect))
            return 0;
        const classText = String(element.className || "").toLowerCase();
        const assetLower = assetText.toLowerCase();
        if (assetLower.includes("movie") || assetLower.includes("trailer"))
            return 0;
        const areaScore = Math.min(900, rect.width * rect.height / 900);
        const topBias = Math.max(0, 260 - Math.abs(rect.top)) / 2;
        const heroBias = assetLower.includes("library_hero") || classText.includes("hero") ? 500 : 0;
        const customHeroBias = assetLower.includes("/customimages/") && assetLower.includes("_hero") ? 700 : 0;
        const backgroundBias = classText.includes("background") || assetLower.includes("page_bg") ? 180 : 0;
        const smallMediaPenalty = element.tagName === "IMG" && rect.height < window.innerHeight * 0.32 ? 350 : 0;
        const offscreenPenalty = Math.max(0, Math.abs(rect.left) - 4) * 4 + Math.max(0, Math.abs(rect.top) - 8) * 4;
        return areaScore + topBias + heroBias + customHeroBias + backgroundBias - smallMediaPenalty - offscreenPenalty;
    };
    function findHeroCandidate(preferredAppId = detectLocationAppId()) {
        const selector = [
            "[style*='steam/apps']", "[style*='store_item_assets']", "[style*='/assets/']", "[style*='/customimages/']", "[style*='library_hero']",
            "img[src*='steam/apps']", "img[src*='store_item_assets']", "img[src*='/assets/']", "img[src*='/customimages/']", "img[src*='library_hero']", "a[href*='/app/']"
        ].join(",");
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 900);
        let best;
        for (const node of nodes) {
            const assetText = getElementAssetText(node);
            const appId = extractAppIdFromText(assetText);
            if (!appId || (preferredAppId && appId !== preferredAppId))
                continue;
            const target = node.tagName === "IMG" ? node.parentElement : node;
            if (!(target instanceof HTMLElement))
                continue;
            const score = scoreHeroElement(target, assetText);
            if (score > 0 && (!best || score > best.score))
                best = { appId, element: target, score, assetText };
        }
        return best;
    }
    function isProbablyGameDetailsPage() {
        if (!document.body)
            return false;
        const routeText = activeRouteText();
        const routeAppId = getGameDetailsRouteAppId(routeText);
        if (!routeAppId || !activeIdentity || activeIdentity.pageAppId !== routeAppId)
            return false;
        const hero = findHeroCandidate(routeAppId);
        return Boolean(hero && hero.appId === routeAppId);
    }
    const normalizeActionText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    function isLaunchActionElement(target) {
        if (!(target instanceof HTMLElement))
            return false;
        const control = target.closest("button, a, [role='button'], [tabindex], [class*='Button'], [class*='button']");
        if (!control)
            return false;
        const rect = control.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 28 || rect.bottom < 0 || rect.top > window.innerHeight)
            return false;
        const text = normalizeActionText([control.innerText, control.textContent, control.getAttribute("aria-label"), control.getAttribute("title")].filter(Boolean).join(" "));
        return /\b(play|launch|install|resume|update|stream|gioca|avvia|installa|riprendi|aggiorna|jouer|lancer|installer|reprendre|jugar|iniciar|instalar|reanudar|actualizar|jogar|continuar|spielen|installieren|fortsetzen)\b/.test(text) || ["开始游戏", "开始", "安装", "继续", "更新", "プレイ", "起動", "インストール", "再開"].some((word) => text.includes(word));
    }
    const detectGameTitle = (appId) => {
        try {
            const overview = window.appStore?.GetAppOverviewByAppID?.(appId);
            return String(overview?.display_name || overview?.name || overview?.strDisplayName || "");
        }
        catch {
            return "";
        }
    };
    function readPlaybackDisplaySize(hostWindow) {
        const dpr = Number.isFinite(hostWindow.devicePixelRatio) && hostWindow.devicePixelRatio > 0
            ? hostWindow.devicePixelRatio : 1;
        const valid = (width, height) => Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
        const screen = hostWindow.screen;
        const width = valid(screen?.width, screen?.height) ? screen.width : hostWindow.innerWidth;
        const height = valid(screen?.width, screen?.height) ? screen.height : hostWindow.innerHeight;
        if (!valid(width, height))
            return null;
        return { width: Math.round(width * dpr), height: Math.round(height * dpr) };
    }
    function resolveQualityTarget(quality, displaySize) {
        return typeof quality === "number" && [720, 1080, 1440, 2160].includes(quality)
            ? quality : displaySize ? Math.min(2160, displaySize.height) : 720;
    }
    function createStyle() {
        return `
      .${targetClass}{position:relative!important;overflow:hidden!important;isolation:isolate!important}
      .${videoClass}{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;pointer-events:none!important;opacity:0!important;transform:scale(1.015)!important;transition:opacity 1200ms ease,transform 7000ms ease!important;z-index:1!important;background:#000!important}
      .${videoClass}.${visibleClass}{opacity:1!important;transform:scale(1.04)!important}
      .${targetClass}.${readyClass}::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:2;opacity:.38;background:linear-gradient(90deg,rgba(0,0,0,.7),rgba(0,0,0,.18) 48%,rgba(0,0,0,.52)),linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.04) 42%)}
    `;
    }
    class AdaptiveSession {
        constructor(video, presentation, candidate) {
            this.video = video;
            this.presentation = presentation;
            this.candidate = candidate;
            this.requests = new Set();
            this.operation = Promise.resolve();
            this.generation = 0;
            this.pendingPump = false;
            this.starting = true;
            this.disposed = false;
            this.failed = false;
            this.handlers = [];
        }
        assertCurrent() {
            if (this.disposed || !this.candidate.isCurrent()) {
                const error = new Error("Trailer request changed");
                error.name = "AbortError";
                throw error;
            }
        }
        waitFor(target, eventName, timeoutMs, action) {
            return new Promise((resolve, reject) => {
                const signal = this.candidate.controller.signal;
                let timer;
                const cleanup = () => {
                    target.removeEventListener(eventName, done);
                    target.removeEventListener("error", failed);
                    signal.removeEventListener("abort", cancelled);
                    window.clearTimeout(timer);
                };
                const done = () => { cleanup(); resolve(); };
                const failed = () => { cleanup(); reject(new Error(`${eventName} failed`)); };
                const cancelled = () => {
                    cleanup();
                    const error = new Error("Trailer request stopped");
                    error.name = "AbortError";
                    reject(error);
                };
                if (signal.aborted || this.disposed) {
                    cancelled();
                    return;
                }
                target.addEventListener(eventName, done);
                target.addEventListener("error", failed);
                signal.addEventListener("abort", cancelled, { once: true });
                timer = window.setTimeout(() => {
                    cleanup();
                    reject(new Error(`${eventName} timed out`));
                }, timeoutMs);
                if (action) {
                    try {
                        action();
                    }
                    catch (error) {
                        cleanup();
                        reject(error);
                    }
                }
            });
        }
        async fetchBytes(url, generation, segment = false) {
            this.assertCurrent();
            const requestUrl = safeMediaUrl(url);
            if (!requestUrl)
                throw new Error("Steam media URL is not safe HTTPS");
            const controller = new AbortController();
            const request = { controller, generation, segment };
            this.requests.add(request);
            const cancel = () => controller.abort();
            this.candidate.controller.signal.addEventListener("abort", cancel, { once: true });
            const timeout = window.setTimeout(() => controller.abort(), 12000);
            try {
                const response = await fetch(requestUrl, { signal: controller.signal, cache: "default", redirect: "error" });
                validateResponseUrl(response, requestUrl);
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}: ${requestUrl}`);
                const data = await readBoundedBody(response, segment ? MAX_SEGMENT_BYTES : MAX_INIT_BYTES, false);
                this.assertCurrent();
                if (segment && generation !== this.generation) {
                    const error = new Error("Obsolete seek request");
                    error.name = "AbortError";
                    throw error;
                }
                return data;
            }
            finally {
                window.clearTimeout(timeout);
                this.candidate.controller.signal.removeEventListener("abort", cancel);
                this.requests.delete(request);
            }
        }
        async mutate(buffer, action) {
            const previous = this.operation;
            let release;
            this.operation = new Promise((resolve) => { release = resolve; });
            await previous;
            try {
                this.assertCurrent();
                await this.waitFor(buffer, "updateend", 12000, action);
            }
            finally {
                release();
            }
        }
        async start() {
            try {
                this.assertCurrent();
                if (!Number.isFinite(this.presentation.duration) || this.presentation.duration <= 0 ||
                    !this.presentation.tracks.length || this.presentation.tracks.some((track) => !track.initUrl || !track.segments.length || track.segments.some((segment) => !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start))) {
                    throw new Error("Invalid adaptive presentation");
                }
                this.mediaSource = new MediaSource();
                this.objectUrl = URL.createObjectURL(this.mediaSource);
                const opened = this.waitFor(this.mediaSource, "sourceopen", 12000);
                this.video.loop = false;
                this.video.src = this.objectUrl;
                this.video.load();
                await opened;
                this.assertCurrent();
                // CEF rejects a second SourceBuffer if any init data was appended
                // before it was allocated. Allocate every track synchronously.
                this.tracks = this.presentation.tracks.map((track) => {
                    const buffer = this.mediaSource.addSourceBuffer(track.mimeType);
                    buffer.mode = "segments";
                    const timestampOffset = Number(track.timestampOffset ?? 0);
                    if (!Number.isFinite(timestampOffset))
                        throw new Error("Invalid media timestamp offset");
                    buffer.timestampOffset = timestampOffset;
                    return { track, buffer, appended: new Set(),
                        pinned: new Set(track.segments.flatMap((segment, index) => segment.start < 8 ? [index] : [])) };
                });
                this.mediaSource.duration = this.presentation.duration;
                for (const state of this.tracks) {
                    const data = await this.fetchBytes(state.track.initUrl);
                    this.assertCurrent();
                    await this.mutate(state.buffer, () => state.buffer.appendBuffer(data));
                }
                await this.pumpWindow(this.generation, true);
                this.assertCurrent();
                this.starting = false;
                const listen = (target, name, handler) => {
                    target.addEventListener(name, handler);
                    this.handlers.push([target, name, handler]);
                };
                listen(this.video, "timeupdate", () => this.requestPump());
                listen(this.video, "waiting", () => this.requestPump());
                listen(this.video, "play", () => this.requestPump());
                listen(this.video, "seeking", () => this.seek(this.video.currentTime));
                listen(this.video, "ended", () => {
                    if (this.disposed)
                        return;
                    this.video.currentTime = 0;
                    this.seek(0);
                    this.video.play().catch(() => undefined);
                });
                this.pumpTimer = window.setInterval(() => this.requestPump(), 700);
                if (this.pendingPump)
                    this.requestPump();
            }
            catch (error) {
                this.fail(error);
                throw error;
            }
        }
        seek(_time) {
            if (this.disposed)
                return;
            this.generation++;
            for (const request of this.requests)
                if (request.segment)
                    request.controller.abort();
            this.requestPump();
        }
        requestPump() {
            if (this.disposed)
                return;
            this.pendingPump = true;
            if (this.starting || this.pumping)
                return;
            this.pumping = true;
            void (async () => {
                do {
                    this.pendingPump = false;
                    await this.pumpWindow(this.generation, false);
                } while (this.pendingPump && !this.disposed);
            })().catch((error) => this.fail(error)).finally(() => {
                this.pumping = false;
                if (this.pendingPump && !this.disposed)
                    this.requestPump();
            });
        }
        async pumpWindow(generation, priming) {
            this.assertCurrent();
            const time = Math.min(this.presentation.duration, Math.max(0, Number(this.video.currentTime) || 0));
            const from = Math.max(0, time - 6);
            const until = Math.min(this.presentation.duration, time + 12);
            for (const state of this.tracks) {
                if (generation !== this.generation)
                    return;
                const segments = state.track.segments;
                const wanted = new Set(state.pinned);
                segments.forEach((segment, index) => {
                    if (segment.start < until && segment.end > from)
                        wanted.add(index);
                });
                let removeStart, removeEnd;
                const flushRemoval = async () => {
                    if (removeStart === undefined)
                        return;
                    const start = removeStart, end = removeEnd;
                    removeStart = removeEnd = undefined;
                    await this.mutate(state.buffer, () => state.buffer.remove(start, end));
                };
                for (const index of [...state.appended].sort((a, b) => a - b)) {
                    if (generation !== this.generation)
                        return;
                    if (wanted.has(index)) {
                        await flushRemoval();
                        continue;
                    }
                    const segment = segments[index];
                    if (removeStart === undefined)
                        removeStart = segment.start;
                    else if (segment.start > removeEnd + 0.0001) {
                        await flushRemoval();
                        removeStart = segment.start;
                    }
                    removeEnd = segment.end;
                    state.appended.delete(index);
                }
                await flushRemoval();
                if (!priming && this.video.paused)
                    continue;
                for (const index of [...wanted].sort((a, b) => a - b)) {
                    if (generation !== this.generation)
                        return;
                    if (state.appended.has(index))
                        continue;
                    const segment = segments[index];
                    let data;
                    try {
                        data = await this.fetchBytes(segment.url, generation, true);
                    }
                    catch (error) {
                        if (generation !== this.generation && !this.disposed)
                            return;
                        throw error;
                    }
                    if (generation !== this.generation)
                        return;
                    this.assertCurrent();
                    await this.mutate(state.buffer, () => state.buffer.appendBuffer(data));
                    state.appended.add(index);
                }
            }
            if (generation === this.generation && !this.video.seeking &&
                this.mediaSource.readyState === "open" &&
                this.tracks.every(({ track, appended }) => appended.has(track.segments.length - 1)) &&
                this.tracks.every(({ buffer }) => !buffer.updating)) {
                this.mediaSource.endOfStream();
            }
        }
        fail(error) {
            if (this.failed || this.disposed || !this.candidate.isCurrent())
                return;
            this.failed = true;
            this.candidate.onFailure(error);
        }
        dispose() {
            if (this.disposed)
                return;
            this.disposed = true;
            this.candidate.controller.abort();
            for (const request of this.requests)
                request.controller.abort();
            if (this.pumpTimer)
                window.clearInterval(this.pumpTimer);
            for (const [target, name, handler] of this.handlers)
                target.removeEventListener(name, handler);
            this.handlers.length = 0;
            this.video.pause();
            this.video.removeAttribute("src");
            this.video.load();
            if (this.mediaSource?.readyState === "open") {
                for (const { buffer } of this.tracks ?? []) {
                    try {
                        if (!buffer.updating)
                            this.mediaSource.removeSourceBuffer(buffer);
                    }
                    catch { }
                }
            }
            if (this.objectUrl) {
                URL.revokeObjectURL(this.objectUrl);
                this.objectUrl = undefined;
            }
            this.video.remove();
        }
    }
    class Runtime {
        constructor(initialSettings, runtimeOwnerId, revision) {
            this.product = "decky-metadata-trailer";
            this.version = runtimeVersion;
            this.ownerId = runtimeOwnerId || "";
            this.settingsRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
            this.identity = activeIdentity;
            this.settings = normalizeSettings(initialSettings);
            this.status = rt("waitingGamePage");
            this.requestToken = 0;
            this.trailerCache = new Map();
            this.displaySize = readPlaybackDisplaySize(window);
            this.targetHeight = resolveQualityTarget(this.settings.quality, this.displaySize);
            this.trailerAudioEnabled = this.settings.audioEnabled;
            this.lastSecondaryPressAt = -Infinity;
            this.scanQueued = false;
            this.launchHeld = false;
            this.rootRouteKey = readRootRouteKey();
            this.handleResize = () => this.queueScan();
            this.handleRouteChange = () => {
                if (this.checkRootRoute())
                    void this.scan();
            };
            this.handleVisibilityChange = () => {
                this.failedVisit = undefined;
                if (document.hidden) {
                    this.pageEnteredAt = undefined;
                    this.cleanupVideo(true);
                }
                else {
                    this.launchHeld = false;
                    this.pageEnteredAt = undefined;
                    void this.scan();
                }
            };
            this.handleLaunchIntent = (event) => this.stopTrailerForLaunch(event.target);
            this.handleLaunchKeyDown = (event) => {
                if (event.key === "Enter" || event.key === " ")
                    this.stopTrailerForLaunch(event.target ?? document.activeElement);
            };
            const steamSideMenuVisible = () => {
                try {
                    const store = window.opener?.SteamUIStore?.m_WindowStore ??
                        window.SteamUIStore?.m_WindowStore;
                    return store?.GamepadUIMainWindowInstance?.m_MenuStore?.IsAnySideMenuVisible?.() === true;
                }
                catch {
                    return false;
                }
            };
            this.handleGamepadButtonDown = (event) => {
                if (Number(event?.detail?.button) !== 3 || event?.detail?.is_repeat ||
                    steamSideMenuVisible())
                    return;
                const editable = (element) => element instanceof HTMLElement && Boolean(element.closest("input,textarea,select,[contenteditable],[role='dialog'],[role='menu']"));
                if (editable(event.target) || editable(document.activeElement))
                    return;
                const overlayVisible = Array.from(document.querySelectorAll("[role='dialog'],[role='menu']"))
                    .some((element) => {
                    if (!(element instanceof HTMLElement) || element.hidden ||
                        element.getAttribute("aria-hidden") === "true")
                        return false;
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
                        style.visibility !== "hidden";
                });
                if (overlayVisible || Date.now() - this.lastSecondaryPressAt < 350 || !this.toggleTrailerAudio())
                    return;
                this.lastSecondaryPressAt = Date.now();
                event.preventDefault?.();
                event.stopPropagation?.();
                event.stopImmediatePropagation?.();
            };
        }
        mount() {
            this.installStyle();
            this.cleanupVideo();
            if (document.body) {
                this.observer = new MutationObserver((mutations) => {
                    if (mutations.some((mutation) => this.shouldQueueScanForMutation(mutation)))
                        this.queueScan();
                });
                this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "src", "href", "class"] });
            }
            document.addEventListener("pointerdown", this.handleLaunchIntent, true);
            document.addEventListener("click", this.handleLaunchIntent, true);
            document.addEventListener("keydown", this.handleLaunchKeyDown, true);
            document.addEventListener("vgp_onbuttondown", this.handleGamepadButtonDown, true);
            this.routeWindows = [window];
            try {
                if (window.opener && new URL(window.opener.location.href).hostname === "steamloopback.host") {
                    this.routeWindows.push(window.opener);
                }
            }
            catch { }
            for (const routeWindow of this.routeWindows) {
                routeWindow.addEventListener("hashchange", this.handleRouteChange);
                routeWindow.addEventListener("popstate", this.handleRouteChange);
            }
            window.addEventListener("resize", this.handleResize);
            document.addEventListener("visibilitychange", this.handleVisibilityChange);
            this.scanTimer = window.setInterval(() => { if (!document.hidden)
                void this.scan(); }, routeScanIntervalMs);
            void this.scan();
        }
        update(nextSettings, revision = this.settingsRevision, nextIdentity = this.identity) {
            if (Number.isSafeInteger(revision) && revision < this.settingsRevision)
                return this.snapshot();
            const previous = this.settings;
            const previousIdentity = this.identity;
            this.settings = normalizeSettings(nextSettings);
            this.settingsRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : this.settingsRevision;
            activeRevision = this.settingsRevision;
            this.identity = normalizeIdentity(nextIdentity);
            activeIdentity = this.identity;
            const identityChanged = previousIdentity?.pageAppId !== this.identity?.pageAppId ||
                previousIdentity?.sourceAppId !== this.identity?.sourceAppId;
            if (identityChanged) {
                this.failedVisit = undefined;
                this.pageEnteredAt = Date.now();
                this.cleanupVideo(true);
            }
            if (previous.audioEnabled !== this.settings.audioEnabled)
                this.setTrailerAudioEnabled(this.settings.audioEnabled, false);
            if (!this.settings.enabled) {
                this.pageEnteredAt = undefined;
                this.cleanupVideo(true);
                this.status = rt("disabled");
                return this.snapshot();
            }
            if (!previous.enabled) {
                this.launchHeld = false;
                this.failedVisit = undefined;
                this.pageEnteredAt = undefined;
            }
            this.refreshDisplayTarget();
            void this.scan();
            return this.snapshot();
        }
        refreshDisplayTarget() {
            this.displaySize = readPlaybackDisplaySize(window);
            const targetHeight = resolveQualityTarget(this.settings.quality, this.displaySize);
            if (this.targetHeight === targetHeight)
                return;
            this.targetHeight = targetHeight;
            this.failedVisit = undefined;
            this.pageEnteredAt = Date.now();
            this.cleanupVideo(true);
        }
        checkRootRoute() {
            const key = readRootRouteKey();
            if (key === this.rootRouteKey)
                return false;
            this.rootRouteKey = key;
            this.launchHeld = false;
            this.failedVisit = undefined;
            this.pageEnteredAt = undefined;
            this.cleanupVideo(true);
            return true;
        }
        snapshot() {
            return {
                appId: this.currentAppId,
                sourceAppId: this.identity?.sourceAppId,
                status: this.status,
                trailerName: this.currentTrailerName,
                gameTitle: this.currentGameTitle,
                trailerAudioEnabled: this.trailerAudioEnabled,
                quality: this.settings.quality,
                displayWidth: this.displaySize?.width ?? null,
                displayHeight: this.displaySize?.height ?? null,
                targetHeight: this.targetHeight
            };
        }
        destroy() {
            this.destroyed = true;
            this.requestToken += 1;
            this.observer?.disconnect();
            if (this.scanTimer)
                window.clearInterval(this.scanTimer);
            if (this.queuedScanTimer)
                window.clearTimeout(this.queuedScanTimer);
            for (const routeWindow of this.routeWindows ?? []) {
                routeWindow.removeEventListener("hashchange", this.handleRouteChange);
                routeWindow.removeEventListener("popstate", this.handleRouteChange);
            }
            window.removeEventListener("resize", this.handleResize);
            document.removeEventListener("pointerdown", this.handleLaunchIntent, true);
            document.removeEventListener("click", this.handleLaunchIntent, true);
            document.removeEventListener("keydown", this.handleLaunchKeyDown, true);
            document.removeEventListener("vgp_onbuttondown", this.handleGamepadButtonDown, true);
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
            this.cleanupVideo(true);
            document.getElementById(styleId)?.remove();
        }
        installStyle() {
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement("style");
                style.id = styleId;
                document.head.appendChild(style);
            }
            style.textContent = createStyle();
        }
        shouldQueueScanForMutation(mutation) {
            const target = mutation.target instanceof HTMLElement ? mutation.target : undefined;
            if (target?.closest(`.${videoClass}`))
                return false;
            if (mutation.type === "attributes" && target) {
                const assetText = getElementAssetText(target).toLowerCase();
                return assetText.includes("library_hero") || assetText.includes("_hero") || assetText.includes("customimages");
            }
            return true;
        }
        stopTrailerForLaunch(target) {
            if (!this.currentAppId || !isLaunchActionElement(target))
                return;
            this.launchHeld = true;
            this.pageEnteredAt = undefined;
            this.cleanupVideo(true);
            this.status = rt("stoppedForLaunch");
        }
        applyCurrentMediaAudioState() {
            const video = this.currentVideo;
            if (!video)
                return;
            const audible = this.trailerAudioEnabled && this.currentMediaReady === true;
            video.muted = !audible;
            video.defaultMuted = !audible;
            video.volume = audible ? 1 : 0;
        }
        dispatchAudioChange() {
            const detail = { ownerId: this.ownerId, settingsRevision: this.settingsRevision, audioEnabled: this.trailerAudioEnabled };
            const targets = [window];
            try {
                if (window.opener && !targets.includes(window.opener))
                    targets.push(window.opener);
            }
            catch { }
            for (const target of targets) {
                try {
                    target.dispatchEvent(new target.CustomEvent(audioChangeEvent, { detail }));
                }
                catch { }
            }
        }
        setTrailerAudioEnabled(enabled, notify = true) {
            if (typeof enabled !== "boolean")
                return false;
            const changed = this.trailerAudioEnabled !== enabled;
            this.trailerAudioEnabled = enabled;
            this.settings = { ...this.settings, audioEnabled: enabled };
            this.applyCurrentMediaAudioState();
            this.updateAudioHint();
            if (notify && changed)
                this.dispatchAudioChange();
            return true;
        }
        toggleTrailerAudio() {
            if (!isProbablyGameDetailsPage() || !this.currentVideo?.isConnected || !this.currentVideo.classList.contains(visibleClass))
                return false;
            return this.setTrailerAudioEnabled(!this.trailerAudioEnabled);
        }
        removeAudioHint() {
            document.getElementById(audioHintId)?.remove();
        }
        updateAudioHint() {
            const hasVideo = Boolean(this.currentVideo?.isConnected &&
                this.currentVideo.classList.contains(visibleClass) && isProbablyGameDetailsPage());
            if (!hasVideo) {
                this.removeAudioHint();
                return;
            }
            const footer = document.querySelector("#Footer > div");
            if (!(footer instanceof HTMLElement))
                return;
            let hint = document.getElementById(audioHintId);
            if (!hint || hint.parentElement !== footer) {
                hint?.remove();
                const template = Array.from(footer.children).find((element) => element.querySelector("img[src*='shared_button_a'],img[src*='shared_button_b']")) ?? Array.from(footer.children).find((element) => element.querySelector("img"));
                const nativeGlyph = template?.querySelector("img");
                const nativeLabel = Array.from(template?.children ?? []).find((element) => !element.querySelector("img"));
                if (!(template instanceof HTMLElement) || !nativeGlyph?.parentElement || !nativeLabel)
                    return;
                hint = document.createElement("div");
                hint.id = audioHintId;
                hint.className = template.className;
                hint.style.pointerEvents = "none";
                hint.setAttribute("aria-hidden", "true");
                const iconContainer = document.createElement("div");
                iconContainer.className = nativeGlyph.parentElement.className;
                const glyph = document.createElement("img");
                glyph.className = nativeGlyph.className;
                glyph.src = "/steaminputglyphs/shared_button_x.svg";
                glyph.alt = "";
                iconContainer.appendChild(glyph);
                const label = document.createElement("div");
                label.className = `${nativeLabel.className} decky-metadata-trailer-audio-label`;
                hint.append(iconContainer, label);
                const firstAction = Array.from(footer.children).find((element) => element.querySelector("img[src*='shared_button_a']"));
                footer.insertBefore(hint, firstAction ?? null);
            }
            const label = hint.querySelector(".decky-metadata-trailer-audio-label");
            if (label)
                label.textContent = rt(this.trailerAudioEnabled ? "muteTrailer" : "audio");
        }
        queueScan() {
            if (this.scanQueued || this.destroyed)
                return;
            this.scanQueued = true;
            this.queuedScanTimer = window.setTimeout(() => {
                this.queuedScanTimer = undefined;
                this.scanQueued = false;
                void this.scan();
            }, queuedScanDelayMs);
        }
        async scan() {
            if (this.destroyed)
                return;
            const owner = findOwnerRecord();
            if (!activeOwnerId || !owner || owner.ownerId !== activeOwnerId || owner.active !== true) {
                this.destroy();
                if (window[runtimeKey] === this)
                    delete window[runtimeKey];
                return;
            }
            if (Number.isSafeInteger(owner.settingsRevision) && owner.settingsRevision > this.settingsRevision) {
                this.update(owner.settings, owner.settingsRevision, owner.identity);
                return;
            }
            this.refreshDisplayTarget();
            this.checkRootRoute();
            if (!this.settings.enabled) {
                this.cleanupVideo(true);
                this.status = rt("disabled");
                return;
            }
            if (document.hidden) {
                this.cleanupVideo(true);
                return;
            }
            if (document.getElementById("decky-trailerhero-style") ||
                document.querySelector(".decky-trailerhero-video")) {
                this.cleanupVideo(true);
                this.status = "Another trailer plugin is active; remove it before enabling Metadata trailers";
                return;
            }
            if (this.launchHeld) {
                if (this.currentVideo?.isConnected)
                    this.cleanupVideo(true);
                this.status = rt("stoppedForLaunch");
                return;
            }
            if (!document.body || !isProbablyGameDetailsPage()) {
                this.failedVisit = undefined;
                this.currentAppId = undefined;
                this.currentGameTitle = undefined;
                this.currentTrailerName = undefined;
                this.cleanupVideo(true);
                this.status = rt("waitingGamePage");
                return;
            }
            const appId = detectLocationAppId();
            const hero = appId ? findHeroCandidate(appId) : undefined;
            if (!appId || !this.identity || this.identity.pageAppId !== appId || !hero || hero.appId !== appId) {
                this.currentAppId = undefined;
                this.failedVisit = undefined;
                this.cleanupVideo(true);
                this.status = rt("waitingGamePage");
                return;
            }
            if (this.failedVisit?.appId === appId && this.failedVisit?.hero === hero.element)
                return;
            if (this.currentTarget === hero.element && this.currentAppId === appId && this.currentMediaSignature === this.getDesiredMediaSignature() && this.currentVideo?.isConnected)
                return;
            if (this.pendingAppId === appId && this.pendingTarget === hero.element && this.pendingRequestToken === this.requestToken)
                return;
            const priorAppId = this.currentAppId;
            this.cleanupVideo(true);
            const token = ++this.requestToken;
            this.currentAppId = appId;
            this.currentGameTitle = detectGameTitle(appId);
            this.pageEnteredAt = priorAppId === appId ? (this.pageEnteredAt || Date.now()) : Date.now();
            this.currentTarget = hero.element;
            this.pendingAppId = appId;
            this.pendingTarget = hero.element;
            this.pendingRequestToken = token;
            this.status = rt("searchTrailerForApp", { appId });
            const sourceAppId = this.identity.sourceAppId;
            const trailer = await this.getTrailer(sourceAppId);
            if (token !== this.requestToken || this.destroyed)
                return;
            this.pendingAppId = undefined;
            this.pendingTarget = undefined;
            this.pendingRequestToken = undefined;
            if (!trailer.ok || !trailer.candidates?.length) {
                this.failedVisit = { appId, hero: hero.element };
                this.trailerCache.delete(sourceAppId);
                this.status = trailer.error || rt("steamTrailerNotPlayable");
                return;
            }
            this.currentTrailerName = trailer.name;
            this.attachVideo(hero.element, appId, this.orderCandidates(trailer.candidates), token, { mediaSignature: this.getDesiredMediaSignature() });
        }
        getDesiredMediaSignature() {
            return `${this.targetHeight}:${this.identity?.sourceAppId || 0}`;
        }
        async getTrailer(appId) {
            const cached = this.trailerCache.get(appId);
            if (cached) {
                this.trailerCache.delete(appId);
                this.trailerCache.set(appId, cached);
                return cached;
            }
            const controller = new AbortController();
            this.metadataController = controller;
            const timeout = window.setTimeout(() => controller.abort(), 9000);
            try {
                const requestUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=movies`;
                const response = await fetch(requestUrl, {
                    signal: controller.signal, cache: "default", redirect: "error"
                });
                validateResponseUrl(response, requestUrl);
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                const payload = JSON.parse(await readBoundedBody(response, MAX_METADATA_BYTES, true));
                if (controller.signal.aborted)
                    throw new Error("Steam metadata request stopped");
                const movies = payload?.[String(appId)]?.data?.movies ?? [];
                if (!Array.isArray(movies) || !movies.length)
                    return { ok: false, error: rt("noSteamTrailer") };
                const movie = movies.find((entry) => entry?.highlight) ?? movies[0];
                if (!movie?.id)
                    return { ok: false, error: rt("steamTrailerNotPlayable") };
                const candidates = [];
                const add = (url, format, label = "") => {
                    if (typeof url !== "string")
                        return;
                    const safeUrl = safeMediaUrl(url);
                    if (!safeUrl)
                        return;
                    const height = Number(String(label).match(/(?:^|[^0-9])(2160|1440|1080|720|480|360)(?:p|[^0-9]|$)/i)?.[1]
                        ?? url.match(/movie[_-]?(2160|1440|1080|720|480|360)/i)?.[1] ?? 0);
                    candidates.push({ url: safeUrl, format, height });
                };
                for (const format of ["mp4", "webm"]) {
                    if (!movie[format] || typeof movie[format] !== "object")
                        continue;
                    for (const [label, url] of Object.entries(movie[format]))
                        add(url, format, label);
                }
                for (const format of ["dash_h264", "hls_h264", "dash_av1"])
                    add(movie[format], format);
                if (!candidates.length)
                    return { ok: false, error: rt("steamTrailerNotPlayable") };
                return this.rememberTrailer(appId, { ok: true, name: movie.name ?? rt("steamTrailer"), candidates });
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : rt("steamTrailerNotPlayable") };
            }
            finally {
                window.clearTimeout(timeout);
                if (this.metadataController === controller)
                    this.metadataController = undefined;
            }
        }
        rememberTrailer(appId, result) {
            this.trailerCache.delete(appId);
            this.trailerCache.set(appId, result);
            while (this.trailerCache.size > 32)
                this.trailerCache.delete(this.trailerCache.keys().next().value);
            return result;
        }
        orderCandidates(candidates) {
            const target = this.targetHeight;
            const formatRank = { mp4: 0, webm: 1, dash_h264: 0, hls_h264: 1, dash_av1: 2 };
            const ranked = candidates.filter((candidate) => {
                if (!safeMediaUrl(candidate.url))
                    return false;
                if (candidate.format !== "dash_av1")
                    return true;
                return typeof MediaSource !== "undefined" &&
                    MediaSource.isTypeSupported?.('video/mp4; codecs="av01.0.08M.08"');
            }).map((candidate, index) => {
                const adaptive = candidate.format.startsWith("dash_") || candidate.format.startsWith("hls_");
                const height = candidate.height;
                const group = !adaptive && height === target ? 0 : adaptive ? 1 : 2;
                const range = height && height < target ? 0 : !height ? 1 : 2;
                const distance = range === 0 ? -height : range === 2 ? height : index;
                return { candidate, index, group, range, distance };
            });
            ranked.sort((a, b) => a.group - b.group ||
                (a.group === 2 ? a.range - b.range || a.distance - b.distance : 0) ||
                formatRank[a.candidate.format] - formatRank[b.candidate.format] || a.index - b.index);
            const seen = new Set();
            return ranked.map((entry) => entry.candidate).filter((candidate) => {
                if (seen.has(candidate.url))
                    return false;
                seen.add(candidate.url);
                return true;
            });
        }
        attachVideo(target, appId, candidates, token, options = {}) {
            let index = 0;
            target.classList.add(targetClass);
            this.currentTarget = target;
            this.currentAppId = appId;
            this.currentMediaSignature = options.mediaSignature ?? this.getDesiredMediaSignature();
            const clearWatchdog = () => {
                if (this.candidateWatchdog)
                    window.clearTimeout(this.candidateWatchdog);
                this.candidateWatchdog = undefined;
            };
            const clearAttempt = () => {
                clearWatchdog();
                if (this.fadeTimer)
                    window.clearTimeout(this.fadeTimer);
                this.fadeTimer = undefined;
                this.removeVideoHandlers(this.currentVideo);
                this.activeCandidate?.controller.abort();
                this.activeSession?.dispose();
                this.activeSession = undefined;
                this.currentMediaReady = false;
                const video = this.currentVideo;
                if (video?.isConnected) {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                    video.remove();
                }
                this.currentVideo = undefined;
                this.activeCandidate = undefined;
                target.classList.remove(readyClass);
                this.removeAudioHint();
            };
            const tryCandidate = () => {
                if (token !== this.requestToken || this.destroyed)
                    return;
                const source = candidates[index++];
                if (!source) {
                    this.failedVisit = { appId, hero: target };
                    this.trailerCache.delete(appId);
                    this.cleanupVideo();
                    this.status = rt("steamTrailerNotPlayable");
                    return;
                }
                const video = document.createElement("video");
                video.className = videoClass;
                video.autoplay = true;
                video.loop = source.format === "mp4" || source.format === "webm";
                video.muted = true;
                video.defaultMuted = true;
                video.playsInline = true;
                video.preload = "auto";
                video.volume = 0;
                video.setAttribute("playsinline", "true");
                video.setAttribute("webkit-playsinline", "true");
                video.setAttribute("aria-hidden", "true");
                target.insertBefore(video, target.firstChild);
                const id = this.attemptId = (this.attemptId || 0) + 1;
                const candidate = {
                    id,
                    controller: new AbortController(),
                    isCurrent: () => !this.destroyed && this.requestToken === token &&
                        this.attemptId === id && this.activeCandidate === candidate &&
                        this.currentVideo === video && video.isConnected,
                    onFailure: (error) => {
                        if (!candidate.isCurrent() || candidate.failed)
                            return;
                        candidate.failed = true;
                        clearAttempt();
                        tryCandidate();
                    }
                };
                this.activeCandidate = candidate;
                this.currentVideo = video;
                this.currentMediaReady = false;
                let readyForPlayback = source.format === "mp4" || source.format === "webm";
                let started = false;
                let lastProgress = 0;
                const watchProgress = () => {
                    clearWatchdog();
                    this.candidateWatchdog = window.setTimeout(() => {
                        if (candidate.isCurrent() && !candidate.controller.signal.aborted) {
                            candidate.onFailure(new Error(`Steam video stalled: ${source.url}`));
                        }
                    }, directPlaybackTimeoutMs);
                };
                const onCanPlay = () => {
                    if (!candidate.isCurrent() || !readyForPlayback || started)
                        return;
                    started = true;
                    video.play().then(() => {
                        if (!candidate.isCurrent())
                            return;
                        this.currentMediaReady = true;
                        this.applyCurrentMediaAudioState();
                        const delay = Math.max(0, 3000 - (Date.now() - (this.pageEnteredAt || Date.now())));
                        this.fadeTimer = window.setTimeout(() => {
                            if (!candidate.isCurrent() || video.paused)
                                return;
                            target.classList.add(readyClass);
                            video.classList.add(visibleClass);
                            this.updateAudioHint();
                            this.status = this.currentTrailerName ? rt("trailerLabel", { name: this.currentTrailerName }) : rt("trailerActive");
                        }, delay);
                    }).catch(() => {
                        if (!candidate.isCurrent())
                            return;
                        clearWatchdog();
                        this.status = rt("autoplayBlocked");
                    });
                };
                const handlers = [];
                const listen = (name, handler) => {
                    video.addEventListener(name, handler);
                    handlers.push([name, handler]);
                };
                video.__deckyMetadataTrailerHandlers = handlers;
                listen("canplay", onCanPlay);
                listen("error", () => candidate.onFailure(new Error(`Steam video error ${video.error?.code ?? 0}`)));
                listen("timeupdate", () => {
                    if (!candidate.isCurrent() || video.paused || !Number.isFinite(video.currentTime))
                        return;
                    if (video.currentTime > lastProgress + 0.05 || video.currentTime + 0.05 < lastProgress) {
                        lastProgress = video.currentTime;
                        watchProgress();
                    }
                });
                listen("seeking", () => {
                    if (!candidate.isCurrent())
                        return;
                    lastProgress = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                    if (!started || !video.paused)
                        watchProgress();
                });
                listen("pause", () => { if (started && candidate.isCurrent())
                    clearWatchdog(); });
                listen("play", () => { if (candidate.isCurrent())
                    watchProgress(); });
                watchProgress();
                if (readyForPlayback) {
                    video.src = source.url;
                    video.load();
                }
                else {
                    const playback = source.format === "hls_h264"
                        ? this.playHls(video, source.url, candidate)
                        : this.playDash(video, source.url, candidate);
                    playback.then(() => {
                        if (!candidate.isCurrent())
                            return;
                        readyForPlayback = true;
                        if (video.readyState >= 2)
                            onCanPlay();
                    }).catch((error) => candidate.onFailure(error));
                }
            };
            tryCandidate();
        }
        async playAdaptive(video, presentation, candidate) {
            if (this.activeSession)
                this.activeSession.dispose();
            const session = new AdaptiveSession(video, presentation, candidate);
            this.activeSession = session;
            await session.start();
        }
        async playHls(video, masterUrl, candidate) {
            if (typeof MediaSource === "undefined")
                throw new Error(rt("mediaSourceUnavailable"));
            const variant = this.selectHlsVariant(await this.fetchText(masterUrl, candidate), masterUrl);
            if (!candidate.isCurrent())
                return;
            const media = this.parseHlsMediaPlaylist(await this.fetchText(variant.url, candidate), variant.url);
            const tracks = [{ kind: "video", mimeType: variant.mimeType, initUrl: media.initUrl, segments: media.segments }];
            if (variant.audio) {
                const audio = this.parseHlsMediaPlaylist(await this.fetchText(variant.audio.url, candidate), variant.audio.url);
                if (Math.abs(media.duration - audio.duration) > 0.5)
                    throw new Error("HLS audio timeline differs from video");
                tracks.push({ kind: "audio", mimeType: variant.audio.mimeType, initUrl: audio.initUrl, segments: audio.segments });
            }
            if (!candidate.isCurrent())
                return;
            await this.playAdaptive(video, { duration: media.duration, tracks }, candidate);
        }
        async playDash(video, manifestUrl, candidate) {
            if (typeof MediaSource === "undefined")
                throw new Error(rt("mediaSourceUnavailable"));
            const presentation = this.selectDashVariant(await this.fetchText(manifestUrl, candidate), manifestUrl);
            if (!candidate.isCurrent())
                return;
            await this.playAdaptive(video, presentation, candidate);
        }
        async fetchText(url, candidate) {
            const requestUrl = safeMediaUrl(url);
            if (!requestUrl)
                throw new Error("Steam manifest URL is not safe HTTPS");
            const controller = new AbortController();
            const cancel = () => controller.abort();
            candidate.controller.signal.addEventListener("abort", cancel, { once: true });
            const timeout = window.setTimeout(() => controller.abort(), 9000);
            try {
                if (!candidate.isCurrent())
                    throw new Error("Trailer request changed");
                const response = await fetch(requestUrl, { signal: controller.signal, cache: "default", redirect: "error" });
                validateResponseUrl(response, requestUrl);
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}: ${requestUrl}`);
                const text = await readBoundedBody(response, MAX_MANIFEST_BYTES, true);
                if (controller.signal.aborted || !candidate.isCurrent())
                    throw new Error("Trailer request changed");
                return text;
            }
            finally {
                window.clearTimeout(timeout);
                candidate.controller.signal.removeEventListener("abort", cancel);
            }
        }
        rankRenditions(left, right) {
            const category = (height) => !Number.isFinite(height) || height <= 0 ? 2 : height <= this.targetHeight ? 0 : 1;
            const leftCategory = category(left.height);
            const rightCategory = category(right.height);
            return leftCategory - rightCategory ||
                (leftCategory === 0 ? right.height - left.height : left.height - right.height) ||
                left.bandwidth - right.bandwidth;
        }
        parseHlsAttributes(value) {
            const attributes = {};
            let start = 0, quoted = false;
            const parse = (field) => {
                const separator = field.indexOf("=");
                if (separator <= 0)
                    throw new Error("Malformed HLS attributes");
                const key = field.slice(0, separator).trim();
                const raw = field.slice(separator + 1).trim();
                if (!/^[A-Z0-9-]+$/.test(key) || !raw)
                    throw new Error("Malformed HLS attributes");
                attributes[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
            };
            for (let index = 0; index < value.length; index++) {
                if (value[index] === '"' && value[index - 1] !== "\\")
                    quoted = !quoted;
                if (value[index] === "," && !quoted) {
                    parse(value.slice(start, index));
                    start = index + 1;
                }
            }
            if (quoted)
                throw new Error("Unclosed HLS attribute");
            parse(value.slice(start));
            return attributes;
        }
        selectHlsVariant(masterText, masterUrl) {
            const lines = masterText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            if (lines[0] !== "#EXTM3U")
                throw new Error("Invalid HLS master playlist");
            const groups = new Map();
            const variants = [];
            for (let index = 1; index < lines.length; index++) {
                const line = lines[index];
                if (line.startsWith("#EXT-X-SESSION-KEY:")) {
                    const attributes = this.parseHlsAttributes(line.slice("#EXT-X-SESSION-KEY:".length));
                    if (attributes.METHOD !== "NONE")
                        throw new Error("Encrypted HLS is unsupported");
                }
                if (line.startsWith("#EXT-X-MEDIA:")) {
                    const attributes = this.parseHlsAttributes(line.slice("#EXT-X-MEDIA:".length));
                    if (attributes.TYPE === "AUDIO") {
                        const group = groups.get(attributes["GROUP-ID"]) ?? [];
                        group.push(attributes);
                        groups.set(attributes["GROUP-ID"], group);
                    }
                    continue;
                }
                if (!line.startsWith("#EXT-X-STREAM-INF:"))
                    continue;
                const attributes = this.parseHlsAttributes(line.slice("#EXT-X-STREAM-INF:".length));
                const uri = lines[index + 1];
                if (!uri || uri.startsWith("#"))
                    continue;
                index++;
                const codecs = (attributes.CODECS || "").split(",").map((codec) => codec.trim()).filter(Boolean);
                const videoCodec = codecs.find((codec) => /^avc1\./i.test(codec));
                if (!videoCodec)
                    continue;
                const videoMimeType = `video/mp4; codecs="${attributes.AUDIO ? videoCodec : codecs.join(",")}"`;
                if (!MediaSource.isTypeSupported(videoMimeType))
                    continue;
                const height = Number(attributes.RESOLUTION?.match(/^\d+x(\d+)$/)?.[1] || 0);
                const bandwidth = Number(attributes.BANDWIDTH || 0);
                const resolvedUrl = safeMediaUrl(uri, masterUrl);
                if (!resolvedUrl)
                    continue;
                variants.push({ url: resolvedUrl, mimeType: videoMimeType,
                    height, bandwidth, audioGroup: attributes.AUDIO, codecs });
            }
            if (!variants.length)
                throw new Error("HLS playlist has no supported video variants");
            variants.sort((left, right) => this.rankRenditions(left, right));
            const selected = variants[0];
            if (selected.audioGroup) {
                const group = groups.get(selected.audioGroup) || [];
                const rendition = group.find((item) => item.DEFAULT === "YES") ?? group[0];
                const codec = selected.codecs.find((item) => /^mp4a\./i.test(item));
                if (!rendition?.URI || !codec)
                    throw new Error("HLS audio group is unavailable");
                const mimeType = `audio/mp4; codecs="${codec}"`;
                if (!MediaSource.isTypeSupported(mimeType))
                    throw new Error("Unsupported HLS audio codec");
                const audioUrl = safeMediaUrl(rendition.URI, masterUrl);
                if (!audioUrl)
                    throw new Error("HLS audio URL is not safe HTTPS");
                selected.audio = { url: audioUrl, mimeType };
            }
            return selected;
        }
        selectDashVariant(manifestText, manifestUrl) {
            const xml = new DOMParser().parseFromString(manifestText, "application/xml");
            const root = xml.documentElement;
            if (root?.localName !== "MPD" || xml.querySelector("parsererror") ||
                root.getAttribute("type") !== "static" ||
                xml.getElementsByTagName("SegmentBase").length || xml.getElementsByTagName("SegmentList").length ||
                Array.from(xml.getElementsByTagName("*")).some((element) => element.localName === "ContentProtection")) {
                throw new Error("Unsupported DASH manifest");
            }
            const children = (node, name) => Array.from(node?.children ?? []).filter((child) => child.localName === name);
            const periods = children(root, "Period");
            if (periods.length !== 1)
                throw new Error("DASH requires a single Period");
            const period = periods[0];
            if (period.hasAttribute("start") && this.parseIsoDurationSeconds(period.getAttribute("start")) !== 0) {
                throw new Error("DASH Period must start at zero");
            }
            const duration = this.parseIsoDurationSeconds(period.getAttribute("duration") || root.getAttribute("mediaPresentationDuration") || "");
            if (!Number.isFinite(duration) || duration <= 0)
                throw new Error("DASH presentation duration is invalid");
            const resolveBase = (node, base) => {
                const relative = children(node, "BaseURL")[0]?.textContent?.trim();
                const resolved = relative ? safeMediaUrl(relative, base) : safeMediaUrl(base);
                if (!resolved)
                    throw new Error("DASH BaseURL is not safe HTTPS");
                return resolved;
            };
            const periodBase = resolveBase(period, resolveBase(root, manifestUrl));
            const videos = [], audio = [];
            let advertisedAudio = false;
            for (const adaptation of children(period, "AdaptationSet")) {
                const contentType = adaptation.getAttribute("contentType") || "";
                const adaptationMime = adaptation.getAttribute("mimeType") || "";
                const isAudio = contentType === "audio" || adaptationMime.startsWith("audio/");
                const isVideo = contentType === "video" || adaptationMime.startsWith("video/") || (!contentType && !adaptationMime);
                if (!isAudio && !isVideo)
                    continue;
                if (isAudio)
                    advertisedAudio = true;
                const adaptationBase = resolveBase(adaptation, periodBase);
                for (const representation of children(adaptation, "Representation")) {
                    const codec = representation.getAttribute("codecs") || adaptation.getAttribute("codecs") || "";
                    const mime = representation.getAttribute("mimeType") || adaptationMime;
                    const supportedCodec = isAudio ? /^mp4a\./i.test(codec) : /^(avc1|av01)\./i.test(codec);
                    const mimeType = `${mime}; codecs="${codec}"`;
                    if (!supportedCodec || mime !== (isAudio ? "audio/mp4" : "video/mp4") ||
                        !MediaSource.isTypeSupported(mimeType))
                        continue;
                    const templates = [root, period, adaptation, representation]
                        .map((node) => children(node, "SegmentTemplate")[0]).filter(Boolean);
                    const attribute = (name) => {
                        for (let index = templates.length - 1; index >= 0; index--) {
                            if (templates[index].hasAttribute(name))
                                return templates[index].getAttribute(name);
                        }
                        return null;
                    };
                    const representationId = representation.getAttribute("id") || "";
                    const bandwidth = Number(representation.getAttribute("bandwidth") || 0);
                    const height = Number(representation.getAttribute("height") || adaptation.getAttribute("maxHeight") || 0);
                    if (!representationId || !Number.isFinite(bandwidth) || bandwidth < 0 || !templates.length)
                        continue;
                    const initTemplate = attribute("initialization"), mediaTemplate = attribute("media");
                    if (!initTemplate || !mediaTemplate)
                        continue;
                    const base = resolveBase(representation, adaptationBase);
                    const timeline = [...templates].reverse()
                        .map((template) => children(template, "SegmentTimeline")[0]).find(Boolean);
                    const spec = {
                        media: mediaTemplate,
                        timescale: Number(attribute("timescale") ?? 1),
                        durationTicks: Number(attribute("duration") ?? 0),
                        offset: Number(attribute("presentationTimeOffset") ?? 0),
                        startNumber: Number(attribute("startNumber") ?? 1),
                        timeline: timeline ? children(timeline, "S").map((item) => ({
                            t: item.hasAttribute("t") ? Number(item.getAttribute("t")) : null,
                            d: Number(item.getAttribute("d")),
                            r: Number(item.getAttribute("r") ?? 0)
                        })) : null
                    };
                    let segments;
                    try {
                        segments = this.buildDashSegments(spec, representationId, bandwidth, duration, base);
                    }
                    catch {
                        continue;
                    }
                    if (!segments.length)
                        continue;
                    const initUrl = safeMediaUrl(this.expandDashTemplate(initTemplate, representationId, bandwidth), base);
                    if (!initUrl)
                        continue;
                    const track = {
                        kind: isAudio ? "audio" : "video", mimeType,
                        timestampOffset: -spec.offset / spec.timescale,
                        initUrl,
                        segments
                    };
                    const entry = { track, height, bandwidth };
                    if (isAudio)
                        audio.push(entry);
                    else
                        videos.push(entry);
                }
            }
            if (!videos.length)
                throw new Error("DASH manifest has no supported video rendition");
            if (advertisedAudio && !audio.length)
                throw new Error("DASH audio rendition is unsupported");
            videos.sort((left, right) => this.rankRenditions(left, right));
            audio.sort((left, right) => right.bandwidth - left.bandwidth);
            return { duration, tracks: [videos[0].track, ...(audio.length ? [audio[0].track] : [])] };
        }
        buildDashSegments(spec, representationId, bandwidth, duration, base) {
            const { timescale, durationTicks, offset, startNumber, timeline, media } = spec;
            if (!Number.isSafeInteger(timescale) || timescale <= 0 ||
                !Number.isSafeInteger(offset) || offset < 0 ||
                !Number.isSafeInteger(startNumber) || startNumber < 0)
                throw new Error("Invalid DASH timebase");
            const segments = [];
            let number = startNumber;
            const push = (tick, endTick) => {
                const start = Math.max(0, (tick - offset) / timescale);
                const end = Math.min(duration, (endTick - offset) / timescale);
                if (Number.isFinite(start) && Number.isFinite(end) && end > start && start < duration) {
                    const url = safeMediaUrl(this.expandDashTemplate(media, representationId, bandwidth, number, tick), base);
                    if (!url)
                        throw new Error("DASH segment URL is not safe HTTPS");
                    segments.push({
                        url,
                        start, end
                    });
                }
                number++;
                if (number - startNumber > 100000)
                    throw new Error("DASH timeline is unbounded");
            };
            if (timeline) {
                if (!timeline.length)
                    throw new Error("Empty DASH SegmentTimeline");
                let tick = 0;
                for (let index = 0; index < timeline.length; index++) {
                    const item = timeline[index];
                    if (!Number.isSafeInteger(item.d) || item.d <= 0 ||
                        !Number.isSafeInteger(item.r) || item.r < -1 ||
                        (item.t !== null && (!Number.isSafeInteger(item.t) || item.t < 0))) {
                        throw new Error("Invalid DASH SegmentTimeline");
                    }
                    if (item.t !== null)
                        tick = item.t;
                    const next = timeline.slice(index + 1).find((entry) => entry.t !== null);
                    const boundary = item.r === -1 ? (next?.t ?? offset + duration * timescale) : Infinity;
                    const count = item.r === -1 ? Math.ceil((boundary - tick) / item.d) : item.r + 1;
                    if (!Number.isSafeInteger(count) || count < 1 || count > 100000)
                        throw new Error("Invalid DASH repeat");
                    for (let repeat = 0; repeat < count; repeat++) {
                        push(tick, Math.min(tick + item.d, boundary));
                        tick += item.d;
                    }
                }
            }
            else {
                if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0)
                    throw new Error("Invalid DASH segment duration");
                const count = Math.ceil(duration * timescale / durationTicks);
                if (!Number.isSafeInteger(count) || count < 1 || count > 100000)
                    throw new Error("Invalid DASH segment count");
                for (let index = 0; index < count; index++) {
                    const tick = offset + index * durationTicks;
                    push(tick, tick + durationTicks);
                }
            }
            return segments;
        }
        expandDashTemplate(value, representationId, bandwidth, number, time) {
            return value.replace(/\$RepresentationID\$/g, representationId).replace(/\$Bandwidth\$/g, String(bandwidth)).replace(/\$Time\$/g, String(time ?? 0)).replace(/\$Number(?:%0(\d+)d)?\$/g, (_match, width) => {
                const text = String(number ?? 0);
                return width ? text.padStart(Number(width), "0") : text;
            }).replace(/\$\$/g, "$");
        }
        parseIsoDurationSeconds(value) {
            const match = String(value).match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
            if (!match || !match.slice(1).some(Boolean))
                return NaN;
            return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 +
                Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
        }
        parseHlsMediaPlaylist(mediaText, mediaUrl) {
            const lines = mediaText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            if (lines[0] !== "#EXTM3U" || !lines.includes("#EXT-X-ENDLIST"))
                throw new Error("HLS requires static VOD");
            let initUrl, duration = 0, pendingDuration, ended = false;
            const segments = [];
            for (const line of lines.slice(1)) {
                if (line.startsWith("#EXT-X-KEY:")) {
                    if (this.parseHlsAttributes(line.slice("#EXT-X-KEY:".length)).METHOD !== "NONE") {
                        throw new Error("Encrypted HLS is unsupported");
                    }
                }
                else if (line.startsWith("#EXT-X-BYTERANGE") || line.startsWith("#EXT-X-DISCONTINUITY") ||
                    line.startsWith("#EXT-X-PART"))
                    throw new Error("Unsupported HLS media timeline");
                else if (line.startsWith("#EXT-X-MAP:")) {
                    const attributes = this.parseHlsAttributes(line.slice("#EXT-X-MAP:".length));
                    if (!attributes.URI || attributes.BYTERANGE || initUrl || segments.length) {
                        throw new Error("Invalid HLS initialization segment");
                    }
                    initUrl = safeMediaUrl(attributes.URI, mediaUrl);
                    if (!initUrl)
                        throw new Error("HLS initialization URL is not safe HTTPS");
                }
                else if (line.startsWith("#EXTINF:")) {
                    if (pendingDuration !== undefined || ended)
                        throw new Error("Malformed HLS segment");
                    pendingDuration = Number(line.slice("#EXTINF:".length).split(",", 1)[0]);
                    if (!Number.isFinite(pendingDuration) || pendingDuration <= 0)
                        throw new Error("Invalid HLS duration");
                }
                else if (line === "#EXT-X-ENDLIST")
                    ended = true;
                else if (!line.startsWith("#")) {
                    if (ended || !initUrl || pendingDuration === undefined)
                        throw new Error("Malformed HLS segment timeline");
                    const end = duration + pendingDuration;
                    if (!Number.isFinite(end) || end <= duration || segments.length >= 100000)
                        throw new Error("Invalid HLS timeline");
                    const url = safeMediaUrl(line, mediaUrl);
                    if (!url)
                        throw new Error("HLS segment URL is not safe HTTPS");
                    segments.push({ url, start: duration, end });
                    duration = end;
                    pendingDuration = undefined;
                }
            }
            if (!initUrl || !segments.length || pendingDuration !== undefined || !ended) {
                throw new Error("Incomplete HLS VOD playlist");
            }
            return { initUrl, duration, segments };
        }
        removeVideoHandlers(video) {
            for (const [name, handler] of video?.__deckyMetadataTrailerHandlers ?? []) {
                video.removeEventListener(name, handler);
            }
            if (video)
                delete video.__deckyMetadataTrailerHandlers;
        }
        cleanupVideo(cancelPending = false) {
            this.removeAudioHint();
            if (cancelPending) {
                this.metadataController?.abort();
                this.metadataController = undefined;
                this.requestToken += 1;
                this.pendingAppId = undefined;
                this.pendingTarget = undefined;
                this.pendingRequestToken = undefined;
            }
            this.removeVideoHandlers(this.currentVideo);
            this.activeCandidate?.controller.abort();
            this.activeSession?.dispose();
            this.activeCandidate = undefined;
            this.activeSession = undefined;
            this.currentMediaReady = false;
            if (this.fadeTimer)
                window.clearTimeout(this.fadeTimer);
            if (this.candidateWatchdog)
                window.clearTimeout(this.candidateWatchdog);
            this.fadeTimer = undefined;
            this.candidateWatchdog = undefined;
            const video = this.currentVideo;
            if (video?.isConnected) {
                video.pause();
                video.removeAttribute("src");
                video.load();
                video.remove();
            }
            this.currentVideo = undefined;
            this.currentTarget?.classList.remove(targetClass, readyClass);
            this.currentTarget = undefined;
            this.currentMediaSignature = undefined;
            document.querySelectorAll(`.${videoClass}`).forEach((element) => element.remove());
            document.querySelectorAll(`.${targetClass}`).forEach((element) => element.classList.remove(targetClass, readyClass));
        }
    }
    const existing = window[runtimeKey];
    if (existing) {
        if (existing.product !== "decky-metadata-trailer") {
            return { status: "Metadata trailer runtime conflict", runtimeMissing: true };
        }
        if (existing.ownerId === activeOwnerId && existing.version === runtimeVersion) {
            return existing.update(settings, activeRevision, activeIdentity);
        }
        try {
            existing.destroy?.();
        }
        catch { }
        if (window[runtimeKey] === existing)
            delete window[runtimeKey];
    }
    const runtime = new Runtime(settings, activeOwnerId, activeRevision);
    window[runtimeKey] = runtime;
    runtime.mount();
    return runtime.snapshot();
}

const DEFAULT_TRAILER_SETTINGS = {
    enabled: false,
    audioEnabled: false,
    quality: "auto",
};
const POLL_INTERVAL_MS = 2000;
const BRIDGE_TIMEOUT_MS = 24000;
const QUALITY_OPTIONS = ["auto", 720, 1080, 1440, 2160];
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
        stoppedForLaunch: "Trailer stopped for launch",
        trailerActive: "Trailer active",
        trailerLabel: "Trailer: {name}",
        waitingGamePage: "Waiting for a Steam game page",
        muteTrailer: "Mute trailer",
        mediaSourceUnavailable: "MediaSource is not available",
    },
};
const normalizeSettings = (value) => {
    const input = value && typeof value === "object" ? value : {};
    return {
        enabled: typeof input.enabled === "boolean" ? input.enabled : false,
        audioEnabled: typeof input.audioEnabled === "boolean" ? input.audioEnabled : false,
        quality: QUALITY_OPTIONS.includes(input.quality)
            ? input.quality
            : "auto",
    };
};
const sameIdentity = (left, right) => left?.pageAppId === right?.pageAppId && left?.sourceAppId === right?.sourceAppId;
const isRuntimeSnapshot = (value) => Boolean(value && typeof value === "object" && typeof value.status === "string");
const documents = () => {
    if (typeof document === "undefined")
        return [];
    const found = [];
    const addDocument = (candidate) => {
        try {
            if (candidate?.documentElement && !found.includes(candidate))
                found.push(candidate);
        }
        catch { /* Steam can close a popup between discovery and access. */ }
    };
    const addWindow = (candidate) => {
        if (!candidate)
            return;
        for (const getter of [
            () => candidate.document,
            () => candidate.window?.document,
            () => candidate.m_Window?.document,
            () => candidate.m_popup?.document,
            () => candidate.BrowserWindow?.document,
            () => candidate.GetWindow?.()?.document,
        ]) {
            try {
                addDocument(getter());
            }
            catch { /* Native Steam handles are transient. */ }
        }
    };
    addDocument(document);
    try {
        addDocument(window.top?.document);
    }
    catch { }
    try {
        addDocument(window.parent?.document);
    }
    catch { }
    try {
        addDocument(window.opener?.document);
    }
    catch { }
    try {
        const router = globalThis.DFL?.Router ?? globalThis.Router;
        const store = router?.WindowStore;
        addWindow(store?.GamepadUIMainWindowInstance);
        if (Array.isArray(store?.SteamUIWindows))
            store.SteamUIWindows.forEach(addWindow);
    }
    catch { }
    return found;
};
const runtimeMissingScript = `(() => {
  const runtime = window.${RUNTIME_KEY};
  const owner = window.opener?.${OWNER_KEY} ?? window.${OWNER_KEY};
  return owner?.active && runtime?.ownerId === owner.ownerId
    ? runtime.snapshot()
    : { status: 'Steam UI unavailable', runtimeMissing: true };
})()`;
class TrailerController {
    constructor() {
        Object.defineProperty(this, "settings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { ...DEFAULT_TRAILER_SETTINGS }
        });
        Object.defineProperty(this, "confirmedSettings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { ...DEFAULT_TRAILER_SETTINGS }
        });
        Object.defineProperty(this, "settingsLoaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "settingsBusy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "pendingSettingsWrites", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "settingsTransactionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "settingsError", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ""
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "Loading trailer settings"
        });
        Object.defineProperty(this, "runtimeSnapshot", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "mounted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "ownerId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ""
        });
        Object.defineProperty(this, "settingsRevision", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "identity", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "pageAppId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "pageOverview", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "matchRevision", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: metadataMatchRevisionSnapshot()
        });
        Object.defineProperty(this, "statusTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pollInFlight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "installInFlight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "pendingInstall", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "settingsSaveQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Promise.resolve()
        });
        Object.defineProperty(this, "audioWindows", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "unsubscribeMatchChanges", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "snapshot", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "handleAudioChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (event) => {
                const detail = event.detail;
                const owner = window[OWNER_KEY];
                if (!this.mounted || owner?.ownerId !== this.ownerId ||
                    detail?.ownerId !== this.ownerId || detail.settingsRevision !== this.settingsRevision ||
                    typeof detail.audioEnabled !== "boolean" || detail.audioEnabled === this.settings.audioEnabled)
                    return;
                void this.updateSettings({ audioEnabled: detail.audioEnabled });
            }
        });
        Object.defineProperty(this, "subscribe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (listener) => {
                this.listeners.add(listener);
                return () => { this.listeners.delete(listener); };
            }
        });
        Object.defineProperty(this, "getSnapshot", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => this.snapshot
        });
        this.snapshot = this.buildSnapshot();
    }
    mount() {
        if (this.mounted)
            return;
        this.ownerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        this.mounted = true;
        this.pendingSettingsWrites = 0;
        this.settingsBusy = false;
        this.destroyOlderRuntimes();
        this.publishOwner();
        this.refreshAudioListeners();
        this.unsubscribeMatchChanges = subscribeMetadataMatchChanges((appId, revision) => {
            this.matchRevision = revision;
            if (appId === this.pageAppId)
                void this.refreshPageIdentity();
            else
                this.emit();
        });
        void this.loadSettings();
        this.statusTimer = window.setInterval(() => void this.poll(), POLL_INTERVAL_MS);
        this.emit();
    }
    /** Stop local playback ownership before any best-effort remote cleanup. */
    stop() {
        if (!this.mounted)
            return;
        this.mounted = false;
        if (this.statusTimer !== undefined)
            window.clearInterval(this.statusTimer);
        this.statusTimer = undefined;
        this.unsubscribeMatchChanges?.();
        this.unsubscribeMatchChanges = undefined;
        const owner = window[OWNER_KEY];
        if (owner?.ownerId === this.ownerId)
            owner.active = false;
        for (const [target, listener] of this.audioWindows) {
            try {
                target.removeEventListener(AUDIO_CHANGE_EVENT, listener);
            }
            catch { }
        }
        this.audioWindows.clear();
        for (const doc of documents()) {
            try {
                const target = doc.defaultView;
                const runtime = target?.[RUNTIME_KEY];
                if (runtime?.ownerId !== this.ownerId || typeof runtime.destroy !== "function")
                    continue;
                runtime.destroy();
                if (target[RUNTIME_KEY] === runtime)
                    delete target[RUNTIME_KEY];
            }
            catch { /* Direct teardown is best effort for closing Steam windows. */ }
        }
        if (window[OWNER_KEY]?.ownerId === this.ownerId)
            delete window[OWNER_KEY];
        const ownerId = JSON.stringify(this.ownerId);
        const cleanup = `(() => { const runtime=window.${RUNTIME_KEY}; if(runtime?.ownerId!==${ownerId}) return {status:'Steam UI unavailable',runtimeMissing:true}; runtime.destroy?.(); if(window.${RUNTIME_KEY}===runtime) delete window.${RUNTIME_KEY}; return {status:'Trailer runtime removed'}; })()`;
        void evalInBigPicture(cleanup).catch(() => undefined);
        this.listeners.clear();
    }
    setEnabled(enabled) {
        return this.updateSettings({ enabled });
    }
    setAudioEnabled(audioEnabled) {
        return this.updateSettings({ audioEnabled });
    }
    setQuality(quality) {
        return this.updateSettings({ quality });
    }
    buildSnapshot() {
        const remote = this.runtimeSnapshot;
        return {
            settings: { ...this.settings },
            appId: remote?.appId,
            sourceAppId: remote?.sourceAppId ?? this.identity?.sourceAppId,
            status: this.status,
            trailerName: remote?.trailerName,
            gameTitle: remote?.gameTitle,
            displayWidth: remote?.displayWidth ?? null,
            displayHeight: remote?.displayHeight ?? null,
            targetHeight: remote?.targetHeight ?? (this.settings.quality === "auto" ? 720 : this.settings.quality),
            settingsLoaded: this.settingsLoaded,
            busy: this.settingsBusy,
            settingsError: this.settingsError,
            matchRevision: this.matchRevision,
        };
    }
    emit() {
        this.snapshot = this.buildSnapshot();
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch { /* A panel update cannot block the controller. */ }
        }
    }
    async loadSettings() {
        try {
            const loaded = normalizeSettings(await getTrailerSettings());
            if (!this.mounted)
                return;
            this.settings = loaded;
            this.confirmedSettings = { ...loaded };
            this.settingsLoaded = true;
            this.settingsError = "";
            this.settingsRevision += 1;
            this.publishOwner();
            this.status = loaded.enabled ? "Waiting for a Steam game page" : "Disabled";
            this.emit();
            await this.poll();
        }
        catch (error) {
            if (!this.mounted)
                return;
            this.settingsError = `Trailer settings could not be loaded: ${String(error)}`;
            this.status = "Trailer settings unavailable";
            this.emit();
        }
    }
    async updateSettings(change) {
        if (!this.mounted || !this.settingsLoaded)
            return false;
        const previous = { ...this.settings };
        const next = normalizeSettings({ ...this.settings, ...change });
        if (next.enabled === previous.enabled && next.audioEnabled === previous.audioEnabled && next.quality === previous.quality) {
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
        if (!direct && next.enabled)
            void this.poll();
        let succeeded = true;
        const save = this.settingsSaveQueue.then(async () => {
            await setTrailerSettings(next);
        });
        this.settingsSaveQueue = save.then(() => {
            if (this.ownsMount(ownerId))
                this.confirmedSettings = { ...next };
        }, () => undefined);
        try {
            await save;
        }
        catch (error) {
            succeeded = false;
            if (this.ownsMount(ownerId) && transactionId === this.settingsTransactionId) {
                this.settings = { ...this.confirmedSettings };
                this.settingsRevision += 1;
                this.publishOwner();
                this.updateReachableRuntimes();
                this.settingsError = `Trailer settings could not be saved: ${String(error)}`;
                this.status = "Trailer settings were restored";
            }
        }
        finally {
            if (this.ownsMount(ownerId)) {
                this.pendingSettingsWrites = Math.max(0, this.pendingSettingsWrites - 1);
                this.settingsBusy = this.pendingSettingsWrites > 0;
                this.emit();
            }
        }
        if (succeeded && this.ownsMount(ownerId) && next.enabled)
            void this.poll();
        return succeeded;
    }
    ownsMount(ownerId) {
        const owner = window[OWNER_KEY];
        return this.mounted && this.ownerId === ownerId && owner?.ownerId === ownerId && owner.active;
    }
    publishOwner() {
        const record = {
            ownerId: this.ownerId,
            active: this.mounted,
            settings: { ...this.settings },
            settingsRevision: this.settingsRevision,
            identity: this.identity,
        };
        window[OWNER_KEY] = record;
    }
    destroyOlderRuntimes() {
        for (const doc of documents()) {
            try {
                const target = doc.defaultView;
                const runtime = target?.[RUNTIME_KEY];
                if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId === this.ownerId ||
                    typeof runtime.destroy !== "function")
                    continue;
                runtime.destroy();
                if (target[RUNTIME_KEY] === runtime)
                    delete target[RUNTIME_KEY];
            }
            catch { /* A closing window does not own this mount. */ }
        }
    }
    refreshAudioListeners() {
        const current = new Set([window]);
        for (const doc of documents()) {
            try {
                if (doc.defaultView)
                    current.add(doc.defaultView);
            }
            catch { }
        }
        for (const [target, listener] of this.audioWindows) {
            if (current.has(target))
                continue;
            try {
                target.removeEventListener(AUDIO_CHANGE_EVENT, listener);
            }
            catch { }
            this.audioWindows.delete(target);
        }
        for (const target of current) {
            if (this.audioWindows.has(target))
                continue;
            try {
                target.addEventListener(AUDIO_CHANGE_EVENT, this.handleAudioChange);
                this.audioWindows.set(target, this.handleAudioChange);
            }
            catch { /* Popups can become cross-origin or close between polls. */ }
        }
    }
    async resolveCurrentIdentity() {
        const route = currentRoutePath();
        const pageAppId = parseTrailerRootRoute(route);
        if (!this.settings.enabled)
            return { identity: null, status: "Disabled" };
        if (!pageAppId)
            return { identity: null, status: "Open a game's main Steam Library page" };
        if (pageAppId !== this.pageAppId) {
            this.pageAppId = pageAppId;
            this.pageOverview = null;
        }
        if (Number(this.pageOverview?.appid) !== pageAppId) {
            // Steam can hydrate the native overview after the route becomes visible.
            // This is a direct AppID lookup; do not scan every app on healthy polls.
            this.pageOverview = getNativeOverview(pageAppId);
        }
        if (!this.pageOverview || Number(this.pageOverview?.appid) !== pageAppId) {
            return { identity: null, status: "Steam game page is not available" };
        }
        if (pageAppId >= SHORTCUT_APP_ID_BOUNDARY && !isNativeNonSteamShortcut(this.pageOverview)) {
            return { identity: null, status: "This page is not a native non-Steam shortcut" };
        }
        if (pageAppId >= SHORTCUT_APP_ID_BOUNDARY && !metadataState.metadataLoaded) {
            try {
                await ensureMetadataCache();
            }
            catch {
                return { identity: null, status: "Saved Steam matches are not available" };
            }
            if (!this.mounted)
                return { identity: null, status: "Disabled" };
        }
        const resolved = resolveTrailerSource({
            route,
            heroAppId: pageAppId,
            overview: this.pageOverview,
            metadata: metadataCache[String(pageAppId)] ?? null,
            hydrated: pageAppId < SHORTCUT_APP_ID_BOUNDARY || metadataState.metadataLoaded,
        });
        if (resolved) {
            return { identity: { pageAppId: resolved.pageAppId, sourceAppId: resolved.sourceAppId }, status: "Waiting for the matching Steam hero" };
        }
        return {
            identity: null,
            status: pageAppId >= SHORTCUT_APP_ID_BOUNDARY
                ? "Save a valid Steam match in Decky Metadata's game editor"
                : "Steam trailer is unavailable for this page",
        };
    }
    async refreshPageIdentity() {
        if (!this.mounted)
            return;
        const next = await this.resolveCurrentIdentity();
        if (!this.mounted || sameIdentity(next.identity, this.identity))
            return;
        this.identity = next.identity;
        this.runtimeSnapshot = undefined;
        this.status = next.status;
        this.settingsRevision += 1;
        this.publishOwner();
        const direct = this.updateReachableRuntimes();
        this.emit();
        if (!direct && this.settings.enabled && this.identity)
            void this.installOrUpdate();
    }
    updateReachableRuntimes() {
        let found = false;
        for (const doc of documents()) {
            try {
                const runtime = doc.defaultView?.[RUNTIME_KEY];
                if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId !== this.ownerId ||
                    typeof runtime.update !== "function")
                    continue;
                const result = runtime.update(this.settings, this.settingsRevision, this.identity);
                if (isRuntimeSnapshot(result))
                    this.runtimeSnapshot = result;
                found = true;
            }
            catch { /* The CEF bridge can recover a missing or inaccessible runtime. */ }
        }
        return found;
    }
    readReachableRuntime() {
        for (const doc of documents()) {
            try {
                const runtime = doc.defaultView?.[RUNTIME_KEY];
                if (runtime?.product !== "decky-metadata-trailer" || runtime.ownerId !== this.ownerId ||
                    typeof runtime.snapshot !== "function")
                    continue;
                const result = runtime.snapshot();
                if (isRuntimeSnapshot(result)) {
                    this.runtimeSnapshot = result;
                    this.status = result.status;
                    return true;
                }
            }
            catch { }
        }
        return false;
    }
    buildInstallScript() {
        return `(() => {
      const settings = ${JSON.stringify(this.settings)};
      const ownerId = ${JSON.stringify(this.ownerId)};
      const settingsRevision = ${this.settingsRevision};
      const identity = ${JSON.stringify(this.identity)};
      const translations = ${JSON.stringify(TRANSLATIONS)};
      const factory = ${deckyMetadataTrailerRuntimeFactory.toString()};
      return factory(settings, ownerId, settingsRevision, translations, identity);
    })()`;
    }
    withTimeout(promise, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error("Steam debugger timed out")), timeoutMs);
            Promise.resolve(promise).then(resolve, reject).finally(() => window.clearTimeout(timer));
        });
    }
    async runInSteamTab(code) {
        try {
            const result = await this.withTimeout(evalInBigPicture(code), BRIDGE_TIMEOUT_MS);
            return result && typeof result === "object" ? result : undefined;
        }
        catch {
            this.runtimeSnapshot = undefined;
            this.status = "Steam UI unavailable";
            this.emit();
            return undefined;
        }
    }
    async installOrUpdate() {
        if (!this.mounted || !this.settings.enabled || !this.identity)
            return;
        if (this.installInFlight) {
            this.pendingInstall = true;
            return;
        }
        const ownerId = this.ownerId;
        this.installInFlight = true;
        try {
            do {
                this.pendingInstall = false;
                const result = await this.runInSteamTab(this.buildInstallScript());
                if (!this.mounted || this.ownerId !== ownerId || window[OWNER_KEY]?.ownerId !== ownerId)
                    return;
                this.applyRemoteResult(result);
                this.refreshAudioListeners();
            } while (this.mounted && this.ownerId === ownerId && this.pendingInstall);
        }
        finally {
            this.installInFlight = false;
            if (this.mounted && this.pendingInstall)
                void this.installOrUpdate();
        }
    }
    applyRemoteResult(result) {
        if (!result)
            return;
        if (result.runtimeMissing === true) {
            this.status = String(result.status || "Steam UI unavailable");
            this.runtimeSnapshot = undefined;
            this.emit();
            return;
        }
        if (!isRuntimeSnapshot(result))
            return;
        this.runtimeSnapshot = result;
        this.status = result.status;
        this.emit();
    }
    async poll() {
        if (!this.mounted || this.pollInFlight)
            return;
        this.pollInFlight = true;
        try {
            this.refreshAudioListeners();
            await this.refreshPageIdentity();
            if (!this.mounted || this.installInFlight)
                return;
            if (this.readReachableRuntime()) {
                this.emit();
                return;
            }
            const result = await this.runInSteamTab(runtimeMissingScript);
            if (!this.mounted)
                return;
            if (result?.runtimeMissing === true) {
                this.applyRemoteResult(result);
                if (this.settings.enabled && this.identity)
                    await this.installOrUpdate();
            }
            else {
                this.applyRemoteResult(result);
            }
        }
        finally {
            this.pollInFlight = false;
        }
    }
}
const trailerController = new TrailerController();
const startTrailerController = () => {
    trailerController.mount();
    return () => trailerController.stop();
};

// Version is fetched from the backend on mount; "" means not yet loaded.
const PLUGIN_VERSION = "";
// Steam can take over a second to register the fresh QAM control after its
// native popup returns. This caps one return handoff at roughly three seconds.
const COMPATIBILITY_DROPDOWN_RETURN_FOCUS_MAX_FRAMES = 360;
const COMPATIBILITY_DROPDOWN_RETURN_SETTLE_FRAMES = 2;
const COMPATIBILITY_DROPDOWN_SELECTION_SETTLE_FRAMES = 180;
const COMPATIBILITY_DROPDOWN_RETURN_FOCUS_STABLE_FRAMES = 3;
const takeNativeFocus = (element) => {
    if (!element)
        return false;
    try {
        const trees = (DFL.getGamepadNavigationTrees() || []);
        for (const tree of trees) {
            const pending = tree.Root ? [tree.Root] : [];
            while (pending.length) {
                const node = pending.pop();
                if (!node)
                    continue;
                if (node.Element === element && typeof node.BTakeFocus === "function") {
                    return Boolean(node.BTakeFocus());
                }
                if (Array.isArray(node.m_rgChildren)) {
                    pending.push(...node.m_rgChildren);
                }
            }
        }
    }
    catch (error) {
        warn("qam", "preferred metadata focus unavailable", error);
    }
    return false;
};
const compatibilityDropdownButton = (element) => element?.querySelector('button[role="combobox"]') || null;
const takeCompatibilityDropdownFocus = (element) => {
    const dropdown = compatibilityDropdownButton(element);
    if (!dropdown || dropdown.disabled || !dropdown.isConnected)
        return false;
    return takeNativeFocus(dropdown);
};
const hasCompatibilityDropdownFocus = (element) => {
    const dropdown = compatibilityDropdownButton(element);
    if (!dropdown)
        return false;
    const classes = typeof dropdown.className === "string" ? dropdown.className : "";
    return dropdown.ownerDocument.activeElement === dropdown
        || /(^|\s)gpfocus(\s|$)/.test(classes);
};
const findScrollViewport = (element) => {
    let node = element.parentElement;
    while (node) {
        const style = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
};
const scanCompleteMessage = (progress) => {
    const total = Number(progress.total || 0);
    if (!total)
        return "Refresh complete";
    const assigned = Number(progress.assigned || 0);
    const failed = Number(progress.failed || 0);
    return failed
        ? `Refresh complete: ${assigned}/${total} saved, ${failed} not matched`
        : `Refresh complete: ${assigned}/${total} saved`;
};
const scanCompleteStatusKind = (progress) => {
    const total = Number(progress.total || 0);
    const assigned = Number(progress.assigned || 0);
    const failed = Number(progress.failed || 0);
    return failed > 0 || (total > 0 && assigned < total) ? "warning" : "success";
};
const epochToUsDate = (value) => {
    if (!value)
        return "";
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime()))
        return "";
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${mm}-${dd}-${date.getUTCFullYear()}`;
};
const Content = () => {
    const [trailerSnapshot, setTrailerSnapshot] = SP_REACT.useState(trailerController.getSnapshot());
    SP_REACT.useEffect(() => trailerController.subscribe(() => {
        setTrailerSnapshot(trailerController.getSnapshot());
    }), []);
    const initialCompatibilityPolicySave = compatibilityPolicySaveSnapshot();
    const initialPendingCompatibilityPolicySave = initialCompatibilityPolicySave
        && initialCompatibilityPolicySave.pendingKind !== null
        ? initialCompatibilityPolicySave
        : null;
    const focusFrame = SP_REACT.useRef(null);
    const initialPanelFocusComplete = SP_REACT.useRef(false);
    const { games, loadGames } = useNonSteamGames();
    const [metadataCount, setMetadataCount] = SP_REACT.useState(0);
    const [missing, setMissing] = SP_REACT.useState(0);
    const [busy, setBusy] = SP_REACT.useState(false);
    const [scanMessage, setScanMessage] = SP_REACT.useState("");
    const [scanStatusKind, setScanStatusKind] = SP_REACT.useState("idle");
    const [cacheBusy, setCacheBusy] = SP_REACT.useState(false);
    const [delistedStatus, setDelistedStatus] = SP_REACT.useState(null);
    const [delistedBusy, setDelistedBusy] = SP_REACT.useState(false);
    const [logsBusy, setLogsBusy] = SP_REACT.useState(false);
    const [debugLogging, setDebugLoggingState] = SP_REACT.useState(false);
    const [debugLoggingBusy, setDebugLoggingBusy] = SP_REACT.useState(false);
    const [pluginVersion, setPluginVersion] = SP_REACT.useState(PLUGIN_VERSION);
    const [deckyVersion, setDeckyVersion] = SP_REACT.useState("");
    const [steamosVersion, setSteamosVersion] = SP_REACT.useState("");
    const [updateChannel, setUpdateChannelState] = SP_REACT.useState("stable");
    const [automaticUpdateChecks, setAutomaticUpdateChecksState] = SP_REACT.useState(true);
    const [settingsLoaded, setSettingsLoaded] = SP_REACT.useState(false);
    const [compatibilityDefault, setCompatibilityDefaultState] = SP_REACT.useState(initialPendingCompatibilityPolicySave?.category ?? compatibilityDefaultSnapshot());
    const [compatibilityDefaultLoaded, setCompatibilityDefaultLoaded] = SP_REACT.useState(false);
    const [compatibilityDefaultBusy, setCompatibilityDefaultBusy] = SP_REACT.useState(initialPendingCompatibilityPolicySave?.pendingKind === "category");
    const [compatibilityDefaultError, setCompatibilityDefaultError] = SP_REACT.useState(initialCompatibilityPolicySave?.error ?? "");
    const [compatibilityDefaultScope, setCompatibilityDefaultScopeState] = SP_REACT.useState(initialPendingCompatibilityPolicySave?.scope ?? compatibilityDefaultScopeSnapshot());
    const [compatibilityDefaultScopeBusy, setCompatibilityDefaultScopeBusy] = SP_REACT.useState(initialPendingCompatibilityPolicySave?.pendingKind === "scope");
    const compatibilityDefaultLoadVersion = SP_REACT.useRef(0);
    const [compatibilityDefaultControl, setCompatibilityDefaultControlState] = SP_REACT.useState(null);
    const [compatibilityDefaultScopeControl, setCompatibilityDefaultScopeControlState] = SP_REACT.useState(null);
    const [trailerQualityControl, setTrailerQualityControlState] = SP_REACT.useState(null);
    const [compatibilityDropdownReturnVersion, setCompatibilityDropdownReturnVersion] = SP_REACT.useState(0);
    const [controllerTypes, setControllerTypes] = SP_REACT.useState([]);
    const setCompatibilityDefaultControl = SP_REACT.useCallback((element) => {
        if (!element)
            noteCompatibilityDropdownControlUnmounted();
        setCompatibilityDefaultControlState(element);
    }, []);
    const setCompatibilityDefaultScopeControl = SP_REACT.useCallback((element) => {
        if (!element)
            noteCompatibilityDropdownControlUnmounted();
        setCompatibilityDefaultScopeControlState(element);
    }, []);
    const setTrailerQualityControl = SP_REACT.useCallback((element) => {
        if (!element)
            noteCompatibilityDropdownControlUnmounted();
        setTrailerQualityControlState(element);
    }, []);
    const synchronizeCompatibilityPolicySave = SP_REACT.useCallback((fallbackCategory = compatibilityDefaultSnapshot(), fallbackScope = compatibilityDefaultScopeSnapshot()) => {
        const shared = compatibilityPolicySaveSnapshot();
        if (shared
            && shared.lifecycleGeneration === compatibilityLifecycleSnapshot()
            && shared.pendingKind !== null) {
            setCompatibilityDefaultState(shared.category);
            setCompatibilityDefaultScopeState(shared.scope);
            setCompatibilityDefaultBusy(shared.pendingKind === "category");
            setCompatibilityDefaultScopeBusy(shared.pendingKind === "scope");
            setCompatibilityDefaultError(shared.error);
            return;
        }
        setCompatibilityDefaultState(fallbackCategory);
        setCompatibilityDefaultScopeState(fallbackScope);
        setCompatibilityDefaultBusy(false);
        setCompatibilityDefaultScopeBusy(false);
        setCompatibilityDefaultError(shared?.lifecycleGeneration === compatibilityLifecycleSnapshot()
            ? shared.error
            : "");
    }, []);
    SP_REACT.useEffect(() => {
        const mountedControl = compatibilityDefaultControl || compatibilityDefaultScopeControl || trailerQualityControl;
        if (!mountedControl)
            return;
        const qamDocument = mountedControl.ownerDocument;
        const noteVisibleReturn = () => {
            if (qamDocument.visibilityState !== "visible")
                return;
            if (!noteCompatibilityDropdownReturnVisible())
                return;
            setCompatibilityDropdownReturnVersion((version) => version + 1);
        };
        const observeVisibility = () => {
            if (qamDocument.visibilityState === "hidden") {
                noteCompatibilityDropdownControlUnmounted();
            }
            else {
                noteVisibleReturn();
            }
        };
        qamDocument.addEventListener("visibilitychange", observeVisibility);
        observeVisibility();
        return () => qamDocument.removeEventListener("visibilitychange", observeVisibility);
    }, [compatibilityDefaultControl, compatibilityDefaultScopeControl, trailerQualityControl]);
    const focusPanel = SP_REACT.useCallback((element) => {
        if (focusFrame.current !== null) {
            window.cancelAnimationFrame(focusFrame.current);
            focusFrame.current = null;
        }
        if (element && !initialPanelFocusComplete.current && !hasCompatibilityDropdownReturn()) {
            focusFrame.current = window.requestAnimationFrame(() => {
                focusFrame.current = null;
                if (initialPanelFocusComplete.current || hasCompatibilityDropdownReturn())
                    return;
                initialPanelFocusComplete.current = true;
                takeNativeFocus(element);
                // Taking focus scrolls the summary up, hiding the panel's "Metadata"
                // title (Steam's gamepad focus scroll ignores CSS scroll-padding). The
                // summary is the first row, so snap the viewport back to the top on
                // entry to keep the title visible.
                const viewport = findScrollViewport(element);
                if (viewport) {
                    window.requestAnimationFrame(() => {
                        viewport.scrollTop = 0;
                    });
                }
            });
        }
    }, []);
    SP_REACT.useEffect(() => {
        const origin = compatibilityDropdownReturnOrigin();
        const control = origin === "scope"
            ? compatibilityDefaultScopeControl
            : origin === "quality" ? trailerQualityControl : compatibilityDefaultControl;
        const loaded = origin === "quality" ? trailerSnapshot.settingsLoaded : compatibilityDefaultLoaded;
        const busy = origin === "quality"
            ? trailerSnapshot.busy
            : compatibilityDefaultBusy || compatibilityDefaultScopeBusy;
        if (!isCompatibilityDropdownReturnReady() || !control || !loaded || busy)
            return;
        const settleFrames = isCompatibilityDropdownSelectionReturn()
            ? COMPATIBILITY_DROPDOWN_SELECTION_SETTLE_FRAMES
            : COMPATIBILITY_DROPDOWN_RETURN_SETTLE_FRAMES;
        let cancelled = false;
        let frame = null;
        let attempts = 0;
        let stableFocusFrames = 0;
        const focusReturnedDropdown = () => {
            frame = null;
            if (cancelled
                || !isCompatibilityDropdownReturnReady()
                || !(origin === "quality" ? trailerSnapshot.settingsLoaded : compatibilityDefaultLoaded)
                || (origin === "quality"
                    ? trailerSnapshot.busy
                    : compatibilityDefaultBusy || compatibilityDefaultScopeBusy))
                return;
            attempts += 1;
            if (attempts <= settleFrames) {
                frame = window.requestAnimationFrame(focusReturnedDropdown);
                return;
            }
            // The native menu hides and unmounts QAM before the replacement
            // combobox is registered in Steam's navigation tree. Retry only over
            // this bounded return transition, and only with Steam's BTakeFocus.
            if (hasCompatibilityDropdownFocus(control)) {
                stableFocusFrames += 1;
                if (stableFocusFrames >= COMPATIBILITY_DROPDOWN_RETURN_FOCUS_STABLE_FRAMES) {
                    consumeCompatibilityDropdownReturn();
                    initialPanelFocusComplete.current = true;
                    return;
                }
                frame = window.requestAnimationFrame(focusReturnedDropdown);
                return;
            }
            stableFocusFrames = 0;
            takeCompatibilityDropdownFocus(control);
            if (attempts < COMPATIBILITY_DROPDOWN_RETURN_FOCUS_MAX_FRAMES) {
                frame = window.requestAnimationFrame(focusReturnedDropdown);
            }
            else {
                warn("qam", "compatibility dropdown return focus unavailable");
                clearCompatibilityDropdownReturn();
            }
        };
        frame = window.requestAnimationFrame(focusReturnedDropdown);
        return () => {
            cancelled = true;
            if (frame !== null)
                window.cancelAnimationFrame(frame);
        };
    }, [
        compatibilityDefaultBusy,
        compatibilityDefaultControl,
        compatibilityDefaultScopeBusy,
        compatibilityDefaultScopeControl,
        compatibilityDefaultLoaded,
        compatibilityDropdownReturnVersion,
        trailerQualityControl,
        trailerSnapshot.busy,
        trailerSnapshot.settingsLoaded,
    ]);
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
        let cancelled = false;
        discardStaleCompatibilityPolicySave(compatibilityLifecycleSnapshot());
        synchronizeCompatibilityPolicySave();
        const requestVersion = compatibilityDefaultLoadVersion.current;
        void ensureCompatibilityDefault()
            .then((value) => {
            if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current)
                return;
            synchronizeCompatibilityPolicySave(value, compatibilityDefaultScopeSnapshot());
            setCompatibilityDefaultLoaded(true);
        })
            .catch((error) => {
            if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current)
                return;
            const shared = compatibilityPolicySaveSnapshot();
            if (shared?.lifecycleGeneration === compatibilityLifecycleSnapshot()) {
                synchronizeCompatibilityPolicySave();
                return;
            }
            setCompatibilityDefaultError(`Compatibility default could not be loaded: ${String(error)}`);
            warn("bridge", "compatibility default load failed", error);
        });
        const unsubscribeRevision = subscribeCompatibilityRevision(() => {
            if (cancelled || !compatibilityDefaultLoadedSnapshot())
                return;
            synchronizeCompatibilityPolicySave();
            setCompatibilityDefaultLoaded(true);
        });
        const unsubscribeSave = subscribeCompatibilityPolicySave(() => {
            if (!cancelled)
                synchronizeCompatibilityPolicySave();
        });
        return () => {
            cancelled = true;
            unsubscribeRevision();
            unsubscribeSave();
        };
    }, [synchronizeCompatibilityPolicySave]);
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
        void getUpdateSettings()
            .then((settings) => {
            if (cancelled)
                return;
            const resolved = resolveLoadedUpdateSettings(settings);
            setUpdateChannelState(resolved.update_channel);
            setAutomaticUpdateChecksState(resolved.automatic_update_checks);
        })
            .catch((error) => {
            if (!cancelled) {
                setUpdateChannelState("stable");
                setAutomaticUpdateChecksState(true);
                warn("bridge", "update settings load failed", error);
            }
        })
            .finally(() => {
            if (!cancelled)
                setSettingsLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    SP_REACT.useEffect(() => {
        setControllerTypes(getConnectedControllerTypes());
    }, []);
    SP_REACT.useEffect(() => {
        let cancelled = false;
        void getSystemVersions()
            .then((versions) => {
            if (!cancelled) {
                setDeckyVersion(versions.decky || "");
                setSteamosVersion(versions.steamos || "");
            }
        })
            .catch((error) => warn("bridge", "system versions load failed", error));
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
        if (debugLoggingBusy)
            return;
        setDebugLoggingBusy(true);
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
        finally {
            setDebugLoggingBusy(false);
        }
    };
    const saveCompatibilityDefault = async (category) => {
        if (hasPendingCompatibilityPolicySave() || !compatibilityDefaultLoaded)
            return;
        const previous = compatibilityDefault;
        const lifecycleGeneration = compatibilityLifecycleSnapshot();
        const saveId = beginCompatibilityPolicySave("category", lifecycleGeneration, previous, compatibilityDefaultScope);
        compatibilityDefaultLoadVersion.current += 1;
        try {
            const saved = await setCompatibilityDefault(category);
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            const confirmed = setConfirmedCompatibilityDefault(saved, lifecycleGeneration);
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            settleCompatibilityPolicySave(saveId, lifecycleGeneration, confirmed, compatibilityDefaultScope);
            if (noteCompatibilityDropdownSelectionSaved()) {
                setCompatibilityDropdownReturnVersion((version) => version + 1);
            }
            toastSuccess("Compatibility", "Default compatibility status saved");
        }
        catch (error) {
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            const message = `Compatibility default could not be saved: ${String(error)}`;
            settleCompatibilityPolicySave(saveId, lifecycleGeneration, previous, compatibilityDefaultScope, message);
            toastError("Compatibility", message);
            warn("bridge", "compatibility default save failed", error);
        }
    };
    const saveCompatibilityDefaultScope = async (scope) => {
        if (hasPendingCompatibilityPolicySave() ||
            !compatibilityDefaultLoaded ||
            compatibilityDefault === null)
            return;
        const previous = compatibilityDefaultScope;
        const lifecycleGeneration = compatibilityLifecycleSnapshot();
        const saveId = beginCompatibilityPolicySave("scope", lifecycleGeneration, compatibilityDefault, scope);
        compatibilityDefaultLoadVersion.current += 1;
        try {
            const saved = await setCompatibilityDefaultScope(scope);
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            const confirmed = setConfirmedCompatibilityDefaultScope(saved, lifecycleGeneration);
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            settleCompatibilityPolicySave(saveId, lifecycleGeneration, compatibilityDefault, confirmed);
            if (noteCompatibilityDropdownSelectionSaved()) {
                setCompatibilityDropdownReturnVersion((version) => version + 1);
            }
            toastSuccess("Compatibility", "Default compatibility scope saved");
        }
        catch (error) {
            if (!isCompatibilityLifecycleCurrent(lifecycleGeneration))
                return;
            const message = `Compatibility default scope could not be saved: ${String(error)}`;
            settleCompatibilityPolicySave(saveId, lifecycleGeneration, compatibilityDefault, previous, message);
            toastError("Compatibility", message);
            warn("bridge", "compatibility default scope save failed", error);
        }
    };
    const saveUpdateChannel = async (enabled) => {
        const previous = updateChannel;
        const requested = enabled ? "development" : "stable";
        setUpdateChannelState(requested);
        try {
            const saved = await setUpdateChannel(requested);
            if ("status" in saved) {
                const rolledBack = resolveSavedUpdateSettings({
                    update_channel: previous,
                    automatic_update_checks: automaticUpdateChecks,
                }, saved);
                setUpdateChannelState(rolledBack.update_channel);
                toastError("Updates", saved.message || "Update channel could not be saved");
                return;
            }
            setUpdateChannelState(saved.update_channel);
            setAutomaticUpdateChecksState(saved.automatic_update_checks);
        }
        catch (error) {
            setUpdateChannelState(previous);
            warn("bridge", "update channel save failed", error);
        }
    };
    const saveAutomaticUpdateChecks = async (enabled) => {
        const previous = automaticUpdateChecks;
        setAutomaticUpdateChecksState(enabled);
        try {
            const saved = await setAutomaticUpdateChecks(enabled);
            if ("status" in saved) {
                const rolledBack = resolveSavedUpdateSettings({
                    update_channel: updateChannel,
                    automatic_update_checks: previous,
                }, saved);
                setAutomaticUpdateChecksState(rolledBack.automatic_update_checks);
                toastError("Updates", saved.message || "Automatic update setting could not be saved");
                return;
            }
            setUpdateChannelState(saved.update_channel);
            setAutomaticUpdateChecksState(saved.automatic_update_checks);
        }
        catch (error) {
            setAutomaticUpdateChecksState(previous);
            warn("bridge", "automatic update setting save failed", error);
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
                    toastSuccess("Metadata", "Refresh complete");
                }
            }, 800);
        }
        catch (error) {
            setBusy(false);
            setScanStatusKind("error");
            setScanMessage(String(error));
            toastError("Metadata refresh failed", String(error));
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
            toastSuccess("Delisted Steam games", "Delisted Steam games updated");
            await loadDelistedStatus();
        }
        catch (error) {
            warn("bridge", "delisted index refresh failed", error);
            toastError("Delisted Steam games", "Delisted Steam games refresh failed");
        }
        finally {
            setDelistedBusy(false);
        }
    };
    const viewLogs = async () => {
        if (logsBusy)
            return;
        setLogsBusy(true);
        try {
            const logs = await getPluginLogs();
            let modal;
            modal = DFL.showModal(SP_JSX.jsx(PluginLogModal, { logs: logs, closeModal: () => modal?.Close() }));
        }
        catch (error) {
            warn("bridge", "plugin log load failed", error);
            toastError("Logs", "Plugin logs could not be loaded");
        }
        finally {
            setLogsBusy(false);
        }
    };
    const delistedCountText = delistedStatus?.count && delistedStatus.fetched_at
        ? `Delisted games: ${delistedStatus.count.toLocaleString("en-US")}`
        : "Delisted Steam games not downloaded yet";
    const delistedDateText = delistedStatus?.count && delistedStatus.fetched_at
        ? `Last updated: ${epochToUsDate(delistedStatus.fetched_at)}`
        : "";
    return (SP_JSX.jsxs(DFL.Focusable, { ref: focusPanel, preferredFocus: true, navEntryPreferPosition: DFL.NavEntryPositionPreferences.PREFERRED_CHILD, style: qamPanelStyle, children: [SP_JSX.jsx(MetadataSection, { detectedCount: games.length, savedCount: metadataCount, missingCount: missing, scanBusy: busy, scanMessage: scanMessage, scanStatusKind: scanStatusKind, cacheBusy: cacheBusy, compatibilityDefault: compatibilityDefault, compatibilityDefaultLoaded: compatibilityDefaultLoaded, compatibilityDefaultBusy: compatibilityDefaultBusy, compatibilityDefaultError: compatibilityDefaultError, compatibilityDefaultScope: compatibilityDefaultScope, compatibilityDefaultScopeBusy: compatibilityDefaultScopeBusy, onRefreshMetadata: () => void scanMissing(), onClearCache: () => void clearCache(), onCompatibilityDefaultChange: (category) => void saveCompatibilityDefault(category), onCompatibilityDefaultScopeChange: (scope) => void saveCompatibilityDefaultScope(scope), onCompatibilityDefaultMenuWillOpen: requestCompatibilityDropdownReturn, onCompatibilityDefaultControlRef: setCompatibilityDefaultControl, onCompatibilityDefaultScopeControlRef: setCompatibilityDefaultScopeControl }), SP_JSX.jsx(GameTrailersSection, { state: trailerSnapshot, onEnabledChange: (enabled) => void trailerController.setEnabled(enabled), onAudioChange: (enabled) => void trailerController.setAudioEnabled(enabled), onQualityChange: async (quality) => {
                    const saved = await trailerController.setQuality(quality);
                    if (saved && noteCompatibilityDropdownSelectionSaved()) {
                        setCompatibilityDropdownReturnVersion((version) => version + 1);
                    }
                    return saved;
                }, onQualityMenuWillOpen: () => requestCompatibilityDropdownReturn("quality"), onQualityControlRef: setTrailerQualityControl }), SP_JSX.jsx(DelistedIndexSection, { countText: delistedCountText, dateText: delistedDateText, busy: delistedBusy, onRefresh: () => void refreshDelisted() }), SP_JSX.jsx(LogsSection, { logsBusy: logsBusy, debugLogging: debugLogging, debugLoggingBusy: debugLoggingBusy, onViewLogs: () => void viewLogs(), onToggleDebugLogging: (enabled) => void saveDebugLogging(enabled) }), SP_JSX.jsx(PluginUpdateSection, { currentVersion: pluginVersion, updateChannel: updateChannel, automaticUpdateChecks: automaticUpdateChecks, settingsLoaded: settingsLoaded, onToggleUpdateChannel: (enabled) => void saveUpdateChannel(enabled), onToggleAutomaticUpdateChecks: (enabled) => void saveAutomaticUpdateChecks(enabled), onInstallVersionConfirmed: setPluginVersion }), SP_JSX.jsx(VersionsSection, { pluginVersion: pluginVersion, deckyVersion: deckyVersion, steamosVersion: steamosVersion, controllerTypes: controllerTypes })] }));
};

/*
 * Resolve Steam's gamepad-aware <textarea> so the metadata editor's Description
 * field can receive on-screen-keyboard input in Gamepad UI.
 *
 * A plain <textarea> takes DOM focus but never receives OSK text: Steam only
 * routes the virtual keyboard into inputs built by its own element factory.
 * That factory (internally `v0(tag)`) returns a forwardRef component plumbed
 * into the virtual keyboard; `v0("input")` is what @decky/ui's TextField wraps,
 * and `v0("textarea")` is the multiline sibling Steam uses in its own UI but
 * does not export.
 *
 * We locate the factory by the virtual-keyboard prop plumbing that only it
 * contains, then build the textarea component once. If Steam's internals shift
 * and resolution fails, we return null and the caller falls back to a plain
 * textarea (degraded, but never a crash).
 */

const resolveGamepadTextArea = () => {
    try {
        const factory = DFL.findModuleExport((moduleExport) => typeof moduleExport === "function" &&
            typeof moduleExport.toString === "function" &&
            moduleExport.toString().includes("virtualKeyboardProps") &&
            moduleExport.toString().includes("BIsElementValidForInput"));
        if (typeof factory !== "function")
            return null;
        const component = factory("textarea");
        return typeof component === "function" || (component && typeof component === "object")
            ? component
            : null;
    }
    catch (_error) {
        return null;
    }
};
let cached;
/**
 * The resolved gamepad textarea component, or null when unavailable. Resolved
 * lazily on first use and cached (including a null result, so a miss is not
 * retried on every render).
 */
const getGamepadTextArea = () => {
    if (cached === undefined)
        cached = resolveGamepadTextArea();
    return cached;
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
    steam_dlc_appids: [],
    has_points_shop: false,
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

const editorRootClassName = "decky-metadata-editor";
const editorFocusTargetClassName = "decky-metadata-editor__focus-target";
const editorToolbarClearance = 104;
const editorScrollViewportStyle = {
    scrollPaddingTop: editorToolbarClearance,
    scrollPaddingBottom: 39,
};
const editorActionBarStyle = {
    position: "sticky",
    top: 40,
    zIndex: 20,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    width: "100%",
    minWidth: 0,
    margin: "-4px 0 0",
    padding: "8px 16px",
    boxSizing: "border-box",
    background: "rgba(14, 20, 27, 0.96)",
    backdropFilter: "blur(8px)",
};
const editorActionButtonStyle = {
    width: "100%",
    minWidth: 0,
    whiteSpace: "nowrap",
};
const editorSaveButtonStyle = {
    ...editorActionButtonStyle,
    color: "white",
    background: "linear-gradient(180deg, #75b022 0%, #588a1b 100%)",
};
const editorRemoveButtonStyle = {
    ...editorActionButtonStyle,
    color: "white",
    background: "linear-gradient(180deg, #d94b43 0%, #a92f2a 100%)",
};
const editorSearchRowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(112px, max-content)",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
};
const editorSearchInputRowSpacingStyle = {
    marginTop: 12,
};
const editorSearchResultsSpacingStyle = {
    marginTop: 12,
};
const editorSearchButtonStyle = {
    width: "100%",
    minWidth: 112,
    whiteSpace: "nowrap",
};
const editorSourceStackStyle = {
    width: "100%",
    minWidth: 0,
};
const editorSourceFieldStyle = {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    padding: "0 12px",
    background: "transparent",
    boxSizing: "border-box",
};
const editorLabelStyle = {
    display: "block",
    marginBottom: 7,
};
const editorDescriptionFieldStyle = {
    ...editorSourceFieldStyle,
    marginTop: 16,
};
const editorSourceGroupStyle = {
    ...editorSourceFieldStyle,
    marginTop: 14,
};
const editorReleaseRatingRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    marginTop: 14,
    padding: "0 12px",
    boxSizing: "border-box",
};
const editorCategoryGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: 12,
    rowGap: 6,
    width: "100%",
    minWidth: 0,
};
const editorCategoryRowMetrics = {
    minHeight: 36,
    padding: "4px 12px",
    margin: 0,
};
const editorAppIdRowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
};
const editorAppIdButtonStyle = {
    width: "auto",
    minWidth: 0,
    paddingLeft: 24,
    paddingRight: 24,
    whiteSpace: "nowrap",
};
const editorScopedCss = `
.decky-metadata-editor .decky-metadata-editor__focus-target,
.decky-metadata-editor .decky-metadata-editor__category-grid > div,
.decky-metadata-editor .decky-metadata-editor__category-grid > div [role="checkbox"] {
  scroll-margin-top: ${editorToolbarClearance}px;
  scroll-margin-bottom: 24px;
}

.decky-metadata-editor .decky-metadata-editor__action--save:hover {
  color: white !important;
  background: #75b022 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--remove:hover {
  color: white !important;
  background: #d94b43 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--save:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--save.gpfocus,
.decky-metadata-editor .decky-metadata-editor__action--remove:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--remove.gpfocus {
  color: white !important;
  outline: 3px solid white !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1a9fff !important;
}

.decky-metadata-editor .decky-metadata-editor__action--save:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--save.gpfocus {
  background: #75b022 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--remove:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--remove.gpfocus {
  background: #d94b43 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--save:disabled,
.decky-metadata-editor .decky-metadata-editor__action--remove:disabled {
  opacity: 0.55;
  filter: saturate(0.45);
}

.decky-metadata-editor .decky-metadata-editor__category-grid > div {
  display: flex;
  align-items: center;
  min-height: ${editorCategoryRowMetrics.minHeight}px !important;
  padding: ${editorCategoryRowMetrics.padding} !important;
  margin: ${editorCategoryRowMetrics.margin} !important;
  box-sizing: border-box;
}

.decky-metadata-editor .decky-metadata-editor__shortcut-name {
  background: transparent !important;
}

/*
 * Keep search results and shortcut-name text readable with a border-only
 * focus highlight instead of Steam's default filled background.
 */
.decky-metadata-editor .decky-metadata-editor__result:focus-visible,
.decky-metadata-editor .decky-metadata-editor__result.gpfocus,
.decky-metadata-editor .decky-metadata-editor__shortcut-name:focus-visible,
.decky-metadata-editor .decky-metadata-editor__shortcut-name.gpfocus {
  background: transparent !important;
  color: white !important;
  outline: 3px solid white !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1a9fff !important;
}
`;

// Shared look for the multiline Description field, applied to both the
// gamepad-aware textarea and the plain fallback.
const descriptionTextareaStyle = {
    width: "100%",
    minHeight: 144,
    boxSizing: "border-box",
    resize: "vertical",
    borderRadius: 4,
    padding: 10,
    color: "white",
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.18)",
};
const compatibilityStatusOptions = [
    { data: null, label: "Use global default" },
    { data: "valve", label: "Follow Valve" },
    { data: 3, label: "Verified" },
    { data: 2, label: "Playable" },
    { data: 1, label: "Unsupported" },
    { data: 0, label: "Unknown" },
];
const isCompatibilityCategory = (value) => typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3;
const compatibilityStatusLabel = (category) => ({ 0: "Unknown", 1: "Unsupported", 2: "Playable", 3: "Verified" })[category];
const compatibilityStatusValue = (value) => value === "valve" || isCompatibilityCategory(value) ? value : null;
const compatibilityCategoryValue = (value) => isCompatibilityCategory(value) ? value : null;
const compatibilityStatusDisplay = (metadata, globalDefault, scope) => {
    const override = compatibilityStatusValue(metadata.deck_compat_override);
    const valveCategory = compatibilityCategoryValue(metadata.deck_compat_category);
    if (isCompatibilityCategory(override))
        return compatibilityStatusLabel(override);
    if (override === "valve") {
        return valveCategory === null
            ? "Follow Valve (unavailable — original Steam status)"
            : `Follow Valve (${compatibilityStatusLabel(valveCategory)})`;
    }
    if (globalDefault !== null && isCompatibilityDefaultEligible(metadata, scope)) {
        return `Use global default (${compatibilityStatusLabel(globalDefault)})`;
    }
    if (globalDefault !== null) {
        return valveCategory === null
            ? "Use global default (outside selected scope — original Steam status)"
            : `Use global default (outside selected scope — ${compatibilityStatusLabel(valveCategory)} from Valve)`;
    }
    return valveCategory === null
        ? "Use global default (Automatic — original Steam status)"
        : `Use global default (${compatibilityStatusLabel(valveCategory)} — from Valve)`;
};
const metadataValuesEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
/**
 * A metadata load can complete after the user has begun editing. Keep each
 * field changed since that request started, while still hydrating every field
 * the user has not touched.
 */
const mergeHydratedMetadata = (saved, baseline, current) => {
    const merged = { ...saved };
    const keys = new Set([...Object.keys(saved), ...Object.keys(baseline), ...Object.keys(current)]);
    for (const key of keys) {
        if (!metadataValuesEqual(current[key], baseline[key])) {
            merged[key] = current[key];
        }
    }
    return merged;
};
const normalizedSteamAppId = (value) => {
    const appId = Number(value);
    return Number.isInteger(appId) && appId > 0 ? appId : null;
};
const MetadataPage = () => {
    const editorRootRef = SP_REACT.useRef(null);
    const descriptionRef = SP_REACT.useRef(null);
    // Steam's own gamepad-aware textarea is what receives on-screen-keyboard
    // input; a plain <textarea> cannot. Resolve it once. Null means Steam's
    // internals shifted, and we fall back to a Focusable-wrapped textarea below.
    const GamepadTextArea = SP_REACT.useMemo(() => getGamepadTextArea(), []);
    // Fallback path only: move real DOM focus onto the plain textarea so it is
    // reachable and (with a physical keyboard / Steam+X) editable. Steam's own
    // gamepad text area needs none of this.
    const focusDescription = SP_REACT.useCallback(() => {
        const el = descriptionRef.current;
        if (!el)
            return;
        // Focusable installs onActivate as the wrapper's onClick, so a pointer
        // click inside the textarea bubbles here after the browser has already
        // focused it and placed the caret at the click position. Leave that alone;
        // only take over when focus arrives from elsewhere (gamepad A press),
        // putting the caret at the end so typing appends rather than overwrites.
        if (document.activeElement === el)
            return;
        el.focus();
        const end = el.value.length;
        try {
            el.setSelectionRange(end, end);
        }
        catch (_e) {
            /* setSelectionRange is unsupported on some field types; ignore. */
        }
    }, []);
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
    const [shortcutManagement, setShortcutManagement] = SP_REACT.useState(null);
    const [shortcutManagementError, setShortcutManagementError] = SP_REACT.useState(false);
    const [currentShortcutName, setCurrentShortcutName] = SP_REACT.useState(null);
    const [steamNameLoading, setSteamNameLoading] = SP_REACT.useState(false);
    const [steamNameUnavailable, setSteamNameUnavailable] = SP_REACT.useState(false);
    const [metadataHydratedEntry, setMetadataHydratedEntry] = SP_REACT.useState(null);
    const [compatibilityDefault, setCompatibilityDefault] = SP_REACT.useState(compatibilityDefaultSnapshot());
    const [compatibilityDefaultScope, setCompatibilityDefaultScope] = SP_REACT.useState(compatibilityDefaultScopeSnapshot());
    const steamNameBackfillEntryRef = SP_REACT.useRef(null);
    const editorEntryRef = SP_REACT.useRef({ appId, token: 0 });
    // The editor can visit A, B, then A again while an async operation from the
    // first A is pending. App ID equality alone cannot distinguish those views.
    if (editorEntryRef.current.appId !== appId) {
        editorEntryRef.current = {
            appId,
            token: editorEntryRef.current.token + 1,
        };
    }
    const editorEntryToken = editorEntryRef.current.token;
    const metadataRef = SP_REACT.useRef(metadata);
    const developerTextRef = SP_REACT.useRef(developerText);
    const publisherTextRef = SP_REACT.useRef(publisherText);
    const releaseTextRef = SP_REACT.useRef(releaseText);
    const ratingTextRef = SP_REACT.useRef(ratingText);
    const formRevisionRef = SP_REACT.useRef(0);
    const busyRef = SP_REACT.useRef(false);
    const busyEntryRef = SP_REACT.useRef(null);
    const steamAppIdTextRef = SP_REACT.useRef(steamAppIdText);
    // A null owner only exists during initial state hydration/tests and remains
    // conservative. A known owner from another editor entry must not block this
    // view or be cleared by its completion callback.
    const entryBusy = busy && (busyEntryRef.current === null || busyEntryRef.current === editorEntryToken);
    const isCurrentEditorEntry = SP_REACT.useCallback((token) => editorEntryRef.current.token === token, []);
    const setFormMetadata = SP_REACT.useCallback((next) => {
        formRevisionRef.current += 1;
        metadataRef.current = next;
        setMetadata(next);
        const nextDeveloperText = personsToText(next.developers);
        const nextPublisherText = personsToText(next.publishers);
        const nextReleaseText = epochToDate(next.release_date);
        const nextRatingText = next.rating == null ? "" : String(next.rating);
        developerTextRef.current = nextDeveloperText;
        publisherTextRef.current = nextPublisherText;
        releaseTextRef.current = nextReleaseText;
        ratingTextRef.current = nextRatingText;
        setDeveloperText(nextDeveloperText);
        setPublisherText(nextPublisherText);
        setReleaseText(nextReleaseText);
        setRatingText(nextRatingText);
    }, []);
    const updateMetadata = SP_REACT.useCallback((updater) => {
        formRevisionRef.current += 1;
        setMetadata((current) => {
            const next = updater(current);
            metadataRef.current = next;
            return next;
        });
    }, []);
    const markFormEdited = SP_REACT.useCallback(() => {
        formRevisionRef.current += 1;
    }, []);
    const setSteamAppIdInput = SP_REACT.useCallback((value) => {
        steamAppIdTextRef.current = value;
        setSteamAppIdText(value);
    }, []);
    /**
     * A backend response owns every field that the user did not change while it
     * was pending. Later local edits win, so the form and cache stay aligned
     * with the full enriched record without overwriting active input.
     */
    const reconcileMetadataResponse = SP_REACT.useCallback((response, baselineMetadata, baselineText) => {
        const reconciled = mergeHydratedMetadata(response, baselineMetadata, metadataRef.current);
        metadataRef.current = reconciled;
        setMetadata(reconciled);
        if (developerTextRef.current === baselineText.developerText) {
            const value = personsToText(reconciled.developers);
            developerTextRef.current = value;
            setDeveloperText(value);
        }
        if (publisherTextRef.current === baselineText.publisherText) {
            const value = personsToText(reconciled.publishers);
            publisherTextRef.current = value;
            setPublisherText(value);
        }
        if (releaseTextRef.current === baselineText.releaseText) {
            const value = epochToDate(reconciled.release_date);
            releaseTextRef.current = value;
            setReleaseText(value);
        }
        if (ratingTextRef.current === baselineText.ratingText) {
            const value = reconciled.rating == null ? "" : String(reconciled.rating);
            ratingTextRef.current = value;
            setRatingText(value);
        }
        return reconciled;
    }, []);
    const beginBusy = SP_REACT.useCallback((entryToken) => {
        if (!isCurrentEditorEntry(entryToken))
            return false;
        if (busyRef.current && busyEntryRef.current === entryToken)
            return false;
        busyRef.current = true;
        busyEntryRef.current = entryToken;
        setBusy(true);
        return true;
    }, [isCurrentEditorEntry]);
    const endBusy = SP_REACT.useCallback((entryToken) => {
        if (busyEntryRef.current !== entryToken)
            return;
        busyRef.current = false;
        busyEntryRef.current = null;
        setBusy(false);
    }, []);
    const loadShortcutManagement = SP_REACT.useCallback(async () => {
        const requestedEntry = editorEntryToken;
        try {
            const management = await getShortcutNameManagement(appId);
            if (!isCurrentEditorEntry(requestedEntry))
                return null;
            setShortcutManagement(management);
            setShortcutManagementError(false);
            setCurrentShortcutName(nativeShortcutName(appId));
            return management;
        }
        catch (_error) {
            if (!isCurrentEditorEntry(requestedEntry))
                return null;
            setShortcutManagement(null);
            setShortcutManagementError(true);
            setCurrentShortcutName(nativeShortcutName(appId));
            return null;
        }
    }, [appId, editorEntryToken, isCurrentEditorEntry]);
    const load = SP_REACT.useCallback(async () => {
        const requestedEntry = editorEntryToken;
        const requestedRevision = formRevisionRef.current;
        const baselineMetadata = metadataRef.current;
        const baselineDeveloperText = developerTextRef.current;
        const baselinePublisherText = publisherTextRef.current;
        const baselineReleaseText = releaseTextRef.current;
        const baselineRatingText = ratingTextRef.current;
        const baselineSteamAppIdText = steamAppIdTextRef.current;
        const [metadataResult, managementResult] = await Promise.allSettled([
            getMetadata(appId),
            getShortcutNameManagement(appId),
        ]);
        if (!isCurrentEditorEntry(requestedEntry))
            return;
        if (metadataResult.status === "fulfilled") {
            const saved = metadataResult.value || metadataTemplate(appName(appId));
            if (formRevisionRef.current === requestedRevision) {
                setFormMetadata(saved);
                setSteamAppIdInput(saved.steam_appid ? String(saved.steam_appid) : "");
            }
            else {
                const hydrated = mergeHydratedMetadata(saved, baselineMetadata, metadataRef.current);
                metadataRef.current = hydrated;
                setMetadata(hydrated);
                if (developerTextRef.current === baselineDeveloperText) {
                    const nextDeveloperText = personsToText(saved.developers);
                    developerTextRef.current = nextDeveloperText;
                    setDeveloperText(nextDeveloperText);
                }
                if (publisherTextRef.current === baselinePublisherText) {
                    const nextPublisherText = personsToText(saved.publishers);
                    publisherTextRef.current = nextPublisherText;
                    setPublisherText(nextPublisherText);
                }
                if (releaseTextRef.current === baselineReleaseText) {
                    const nextReleaseText = epochToDate(saved.release_date);
                    releaseTextRef.current = nextReleaseText;
                    setReleaseText(nextReleaseText);
                }
                if (ratingTextRef.current === baselineRatingText) {
                    const nextRatingText = saved.rating == null ? "" : String(saved.rating);
                    ratingTextRef.current = nextRatingText;
                    setRatingText(nextRatingText);
                }
                if (steamAppIdTextRef.current === baselineSteamAppIdText) {
                    setSteamAppIdInput(saved.steam_appid ? String(saved.steam_appid) : "");
                }
            }
            // Backfill can only use the record that this entry's metadata RPC just
            // returned. A route change otherwise leaves the prior form visible for
            // one render while the new request is still pending.
            setMetadataHydratedEntry(requestedEntry);
        }
        else {
            setMetadataHydratedEntry(null);
        }
        if (managementResult.status === "fulfilled") {
            setShortcutManagement(managementResult.value);
            setShortcutManagementError(false);
        }
        else {
            setShortcutManagement(null);
            setShortcutManagementError(true);
        }
        setCurrentShortcutName(nativeShortcutName(appId));
    }, [
        appId,
        editorEntryToken,
        isCurrentEditorEntry,
        setFormMetadata,
        setSteamAppIdInput,
    ]);
    SP_REACT.useEffect(() => {
        void load();
    }, [load]);
    SP_REACT.useEffect(() => {
        setSteamNameLoading(false);
        setSteamNameUnavailable(false);
        setMetadataHydratedEntry(null);
    }, [appId]);
    SP_REACT.useEffect(() => {
        const steamAppId = Number(metadata.steam_appid);
        if (metadataHydratedEntry !== editorEntryToken ||
            steamNameBackfillEntryRef.current === editorEntryToken ||
            !Number.isInteger(steamAppId) ||
            steamAppId <= 0 ||
            Boolean(metadata.steam_store_name)) {
            return;
        }
        steamNameBackfillEntryRef.current = editorEntryToken;
        const requestedEntry = editorEntryToken;
        const requestedSteamAppId = steamAppId;
        const requestedMetadata = metadataRef.current;
        const requestedText = {
            developerText: developerTextRef.current,
            publisherText: publisherTextRef.current,
            releaseText: releaseTextRef.current,
            ratingText: ratingTextRef.current,
            steamAppIdText: steamAppIdTextRef.current,
        };
        setSteamNameLoading(true);
        setSteamNameUnavailable(false);
        void enrichSteamApp(appId)
            .then((enriched) => {
            const current = metadataRef.current;
            if (!isCurrentEditorEntry(requestedEntry) ||
                normalizedSteamAppId(current.steam_appid) !== requestedSteamAppId) {
                return;
            }
            if (!enriched) {
                setSteamNameUnavailable(true);
                return;
            }
            const reconciled = reconcileMetadataResponse(enriched, requestedMetadata, requestedText);
            setMetadataCacheEntry(appId, reconciled);
            if (steamAppIdTextRef.current === requestedText.steamAppIdText) {
                setSteamAppIdInput(reconciled.steam_appid ? String(reconciled.steam_appid) : "");
            }
            if (!reconciled.steam_store_name)
                setSteamNameUnavailable(true);
        })
            .catch(() => {
            if (isCurrentEditorEntry(requestedEntry) &&
                normalizedSteamAppId(metadataRef.current.steam_appid) === requestedSteamAppId) {
                setSteamNameUnavailable(true);
            }
        })
            .finally(() => {
            if (isCurrentEditorEntry(requestedEntry))
                setSteamNameLoading(false);
        });
    }, [
        appId,
        editorEntryToken,
        isCurrentEditorEntry,
        metadataHydratedEntry,
        metadata.steam_appid,
        metadata.steam_store_name,
        reconcileMetadataResponse,
    ]);
    SP_REACT.useEffect(() => {
        const scrollViewport = editorRootRef.current?.parentElement;
        if (!scrollViewport)
            return;
        const previousScrollPaddingTop = scrollViewport.style.scrollPaddingTop;
        const previousScrollPaddingBottom = scrollViewport.style.scrollPaddingBottom;
        scrollViewport.style.scrollPaddingTop = `${editorScrollViewportStyle.scrollPaddingTop}px`;
        scrollViewport.style.scrollPaddingBottom = `${editorScrollViewportStyle.scrollPaddingBottom}px`;
        return () => {
            scrollViewport.style.scrollPaddingTop = previousScrollPaddingTop;
            scrollViewport.style.scrollPaddingBottom = previousScrollPaddingBottom;
        };
    }, []);
    SP_REACT.useEffect(() => {
        void ensureCompatibilityDefault()
            .then((value) => {
            {
                setCompatibilityDefault(value);
                setCompatibilityDefaultScope(compatibilityDefaultScopeSnapshot());
            }
        })
            .catch(() => undefined);
        return subscribeCompatibilityRevision(() => {
            {
                setCompatibilityDefault(compatibilityDefaultSnapshot());
                setCompatibilityDefaultScope(compatibilityDefaultScopeSnapshot());
            }
        });
    }, []);
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
        const requestedEntry = editorEntryToken;
        if (!beginBusy(requestedEntry))
            return;
        const requestedRevision = formRevisionRef.current;
        try {
            const saved = await saveMetadata(appId, normalizedMetadata);
            if (!isCurrentEditorEntry(requestedEntry) ||
                formRevisionRef.current !== requestedRevision) {
                return;
            }
            setMetadataCacheEntry(appId, saved);
            setFormMetadata(saved);
            applyMetadata(appId, { publishCompatibility: false });
            refreshCompatibilitySurfaces();
            toastSuccess("Saved", "Metadata saved");
        }
        catch (error) {
            toastError("Save failed", String(error));
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const applySteamAppId = async () => {
        if (!nonSteam) {
            toastWarn("Not applicable", "This plugin only changes non-Steam games.");
            return;
        }
        const requestedEntry = editorEntryToken;
        if (!beginBusy(requestedEntry))
            return;
        const saveBaselineMetadata = metadataRef.current;
        const saveBaselineText = {
            developerText: developerTextRef.current,
            publisherText: publisherTextRef.current,
            releaseText: releaseTextRef.current,
            ratingText: ratingTextRef.current,
            steamAppIdText: steamAppIdTextRef.current,
        };
        try {
            const parsed = normalizedSteamAppId(parseSteamAppId(steamAppIdText));
            const savedSteamAppId = normalizedSteamAppId(normalizedMetadata.steam_appid);
            const steamAppIdChanged = parsed !== savedSteamAppId;
            const next = {
                ...normalizedMetadata,
                steam_appid: parsed || null,
                // A proposal is valid only for the Steam match that supplied it.
                // Clear it before enrichment so a failed request cannot reuse stale data.
                deck_compat_category: steamAppIdChanged ? null : normalizedMetadata.deck_compat_category,
                steam_store_name: steamAppIdChanged ? "" : normalizedMetadata.steam_store_name,
                steam_store_url: parsed
                    ? `https://store.steampowered.com/app/${parsed}/`
                    : "",
            };
            const saved = await saveMetadata(appId, next);
            if (!isCurrentEditorEntry(requestedEntry)) {
                return;
            }
            // Keep the local values as they existed just before this acknowledgement.
            // They are the only edits that can predate the enrichment request below.
            const metadataAtSaveAcknowledgement = metadataRef.current;
            // A save acknowledgement owns the Steam match. Reconcile all untouched
            // fields from it while preserving edits made during the request.
            const reconciled = reconcileMetadataResponse({
                ...saved,
                steam_appid: normalizedSteamAppId(saved.steam_appid),
                steam_store_name: typeof saved.steam_store_name === "string" ? saved.steam_store_name : "",
                steam_store_url: typeof saved.steam_store_url === "string" ? saved.steam_store_url : "",
            }, saveBaselineMetadata, saveBaselineText);
            setMetadataCacheEntry(appId, reconciled);
            if (steamAppIdTextRef.current === steamAppIdText) {
                setSteamAppIdInput(reconciled.steam_appid ? String(reconciled.steam_appid) : "");
            }
            steamNameBackfillEntryRef.current = requestedEntry;
            setSteamNameUnavailable(false);
            if (parsed === null) {
                applyMetadata(appId, { publishCompatibility: false });
                refreshCompatibilitySurfaces();
                toastSuccess("Saved", "Metadata saved");
                return;
            }
            const enrichmentBaselineMetadata = metadataRef.current;
            const enrichmentBaselineText = {
                // Text fields can be locally edited without changing metadataRef.
                // Keep edits that happened before this enrichment started too.
                ...saveBaselineText,
            };
            const enriched = await enrichSteamApp(appId);
            if (!isCurrentEditorEntry(requestedEntry) ||
                normalizedSteamAppId(metadataRef.current.steam_appid) !== parsed) {
                return;
            }
            if (enriched) {
                const normalizedEnriched = {
                    ...enriched,
                    steam_appid: normalizedSteamAppId(enriched.steam_appid),
                    steam_store_name: typeof enriched.steam_store_name === "string" ? enriched.steam_store_name : "",
                    steam_store_url: typeof enriched.steam_store_url === "string" ? enriched.steam_store_url : "",
                };
                // Edits made while saving predate the enrichment baseline, so restore
                // them before merging any newer edits from the enrichment interval.
                const enrichedWithEarlierEdits = mergeHydratedMetadata(normalizedEnriched, saveBaselineMetadata, metadataAtSaveAcknowledgement);
                const enrichedMetadata = reconcileMetadataResponse(enrichedWithEarlierEdits, enrichmentBaselineMetadata, enrichmentBaselineText);
                setMetadataCacheEntry(appId, enrichedMetadata);
                if (steamAppIdTextRef.current === steamAppIdText) {
                    setSteamAppIdInput(enrichedMetadata.steam_appid ? String(enrichedMetadata.steam_appid) : "");
                }
            }
            else {
                if (steamAppIdTextRef.current === steamAppIdText) {
                    setSteamAppIdInput(reconciled.steam_appid ? String(reconciled.steam_appid) : "");
                }
            }
            applyMetadata(appId, { publishCompatibility: false });
            refreshCompatibilitySurfaces();
            toastSuccess("Saved", "Metadata saved");
        }
        catch (error) {
            toastError("Save failed", String(error));
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const search = async () => {
        const requestedEntry = editorEntryToken;
        if (!beginBusy(requestedEntry))
            return;
        try {
            setResults(await searchMetadata(query, 8));
        }
        catch (error) {
            toastError("Save failed", String(error));
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const applyResult = async (result) => {
        const requestedEntry = editorEntryToken;
        if (!beginBusy(requestedEntry))
            return;
        const requestedRevision = formRevisionRef.current;
        try {
            const saved = await applyFetchedMetadata(appId, result.slug || result.url);
            if (!saved)
                return;
            if (!isCurrentEditorEntry(requestedEntry) ||
                formRevisionRef.current !== requestedRevision) {
                return;
            }
            setMetadataCacheEntry(appId, saved);
            applyMetadata(appId, { publishCompatibility: false });
            refreshCompatibilitySurfaces();
            setFormMetadata(saved);
            setSteamAppIdInput(saved.steam_appid ? String(saved.steam_appid) : "");
            toastSuccess("Saved", "Metadata saved");
        }
        catch (error) {
            toastError("Fetch failed", String(error));
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const removeCurrent = async () => {
        const requestedEntry = editorEntryToken;
        if (!beginBusy(requestedEntry))
            return;
        try {
            await removeMetadata(appId);
            removeMetadataCacheEntry(appId);
            applyMetadata(appId, { publishCompatibility: false });
            refreshCompatibilitySurfaces();
            if (!isCurrentEditorEntry(requestedEntry))
                return;
            setFormMetadata(metadataTemplate(appName(appId)));
            toastSuccess("Removed", "Metadata removed");
        }
        catch (error) {
            toastError("Remove failed", String(error));
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const steamAppId = Number(metadata.steam_appid);
    const hasSteamMatch = Number.isInteger(steamAppId) && steamAppId > 0;
    const steamStoreName = typeof metadata.steam_store_name === "string"
        ? metadata.steam_store_name
        : "";
    const hasSteamStoreName = Boolean(steamStoreName.trim());
    const shortcutStatus = classifyShortcutNameState(currentShortcutName, shortcutManagement?.state);
    const canUseSteamName = Boolean(!entryBusy &&
        !shortcutManagementError &&
        shortcutManagement?.eligible &&
        (shortcutStatus === "unmanaged" || shortcutStatus === "restored") &&
        currentShortcutName &&
        hasSteamMatch &&
        hasSteamStoreName &&
        currentShortcutName !== steamStoreName &&
        hasShortcutNameApi());
    const useSteamName = async () => {
        const requestedEntry = editorEntryToken;
        if (!isCurrentEditorEntry(requestedEntry))
            return;
        if (!canUseSteamName || !shortcutManagement || !currentShortcutName || !hasShortcutNameApi())
            return;
        const current = nativeShortcutName(appId);
        if (current !== currentShortcutName) {
            if (isCurrentEditorEntry(requestedEntry)) {
                toastError("Shortcut name changed", "Steam changed this shortcut before it could be renamed.");
                await loadShortcutManagement();
            }
            return;
        }
        if (!beginBusy(requestedEntry))
            return;
        try {
            // State is durable before the native request so the original spelling
            // survives an app crash, timeout, or Steam-side error.
            const state = await saveShortcutNameState(appId, current, steamStoreName, steamAppId);
            const observed = await setShortcutNameAndWait(appId, current, steamStoreName);
            if (!isCurrentEditorEntry(requestedEntry))
                return;
            setCurrentShortcutName(observed);
            setShortcutManagement({ ...shortcutManagement, state });
            toastSuccess("Shortcut name updated", "Steam confirmed the new shortcut name.");
        }
        catch (error) {
            if (isCurrentEditorEntry(requestedEntry)) {
                toastError("Shortcut name was not updated", String(error));
                await loadShortcutManagement();
            }
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const restoreOriginalShortcutName = async () => {
        const requestedEntry = editorEntryToken;
        if (!isCurrentEditorEntry(requestedEntry))
            return;
        const state = shortcutManagement?.state;
        if (!state || entryBusy || !hasShortcutNameApi())
            return;
        const current = nativeShortcutName(appId);
        if (current !== state.applied_name) {
            if (isCurrentEditorEntry(requestedEntry)) {
                toastError("Shortcut name changed", "Steam changed this shortcut before it could be restored.");
                await loadShortcutManagement();
            }
            return;
        }
        if (!beginBusy(requestedEntry))
            return;
        try {
            const observed = await setShortcutNameAndWait(appId, state.applied_name, state.original_name);
            if (isCurrentEditorEntry(requestedEntry))
                setCurrentShortcutName(observed);
            try {
                // The native restore is already complete. Clear the history for this
                // captured shortcut even if the user navigated to another editor while
                // Steam was confirming it; entry guards below protect only that UI.
                await clearShortcutNameState(appId);
            }
            catch (error) {
                if (!isCurrentEditorEntry(requestedEntry))
                    return;
                await loadShortcutManagement();
                toastError("Shortcut name restored", `Steam restored the name, but saved history could not be cleared: ${String(error)}`);
                return;
            }
            if (!isCurrentEditorEntry(requestedEntry))
                return;
            setShortcutManagement({ ...shortcutManagement, state: null });
            toastSuccess("Shortcut name restored", "Steam confirmed the original shortcut name.");
        }
        catch (error) {
            if (isCurrentEditorEntry(requestedEntry)) {
                toastError("Shortcut name was not restored", String(error));
                await loadShortcutManagement();
            }
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const forgetShortcutNameHistory = async () => {
        const requestedEntry = editorEntryToken;
        if (!isCurrentEditorEntry(requestedEntry) || !beginBusy(requestedEntry))
            return;
        try {
            await clearShortcutNameState(appId);
            if (!isCurrentEditorEntry(requestedEntry))
                return;
            setShortcutManagement((current) => current ? { ...current, state: null } : current);
            toastSuccess("Saved name history forgotten", "Steam did not change the shortcut name.");
        }
        catch (error) {
            if (isCurrentEditorEntry(requestedEntry)) {
                toastError("Saved name history was not cleared", String(error));
            }
        }
        finally {
            endBusy(requestedEntry);
        }
    };
    const showUseSteamNameModal = () => {
        if (!canUseSteamName || !currentShortcutName)
            return;
        DFL.showModal(SP_JSX.jsx(DFL.ConfirmModal, { strTitle: "Use Steam name?", strOKButtonText: "Use Steam name", onOK: () => void useSteamName(), children: SP_JSX.jsx("div", { style: compactTextStyle, children: `Change “${currentShortcutName}” to “${steamStoreName}”?` }) }));
    };
    const showRestoreShortcutNameModal = () => {
        const state = shortcutManagement?.state;
        if (!state || entryBusy || !hasShortcutNameApi())
            return;
        DFL.showModal(SP_JSX.jsx(DFL.ConfirmModal, { strTitle: "Restore original shortcut name?", strOKButtonText: "Restore original name", onOK: () => void restoreOriginalShortcutName(), children: SP_JSX.jsx("div", { style: compactTextStyle, children: `Restore “${state.original_name}”?` }) }));
    };
    const showForgetShortcutNameHistoryModal = () => {
        if (entryBusy || (busyRef.current && busyEntryRef.current === editorEntryToken))
            return;
        DFL.showModal(SP_JSX.jsx(DFL.ConfirmModal, { strTitle: "Forget saved name history?", strOKButtonText: "Forget history", onOK: () => void forgetShortcutNameHistory(), children: SP_JSX.jsx("div", { style: compactTextStyle, children: "This only removes Decky Metadata's saved restore history. Steam will not change the shortcut name." }) }));
    };
    const toggleCategory = (category, checked) => {
        updateMetadata((prev) => {
            const next = new Set(prev.store_categories || []);
            if (checked)
                next.add(category);
            else
                next.delete(category);
            return { ...prev, store_categories: Array.from(next) };
        });
    };
    return (SP_JSX.jsx(DFL.ScrollPanel, { children: SP_JSX.jsxs("div", { ref: editorRootRef, className: editorRootClassName, style: pageStyle, children: [SP_JSX.jsx("style", { children: editorScopedCss }), SP_JSX.jsx(DFL.Focusable, { className: editorFocusTargetClassName, onActivate: () => { }, style: pageTitleStyle, children: `${"Decky Metadata"} - ${appName(appId)}` }), SP_JSX.jsxs("div", { style: editorActionBarStyle, children: [SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName} decky-metadata-editor__action--save`, onClick: saveCurrent, style: editorSaveButtonStyle, children: "Save" }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName} decky-metadata-editor__action--remove`, onClick: removeCurrent, style: editorRemoveButtonStyle, children: "Remove metadata" }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, onClick: () => DFL.Navigation.NavigateBack(), style: editorActionButtonStyle, children: "Done" })] }), !nonSteam ? (SP_JSX.jsx(DFL.PanelSection, { children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: "This plugin only changes non-Steam games." }) }) })) : null, SP_JSX.jsxs(DFL.PanelSection, { title: "Search IGN metadata", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                                    ...editorSearchRowStyle,
                                    ...editorSearchInputRowSpacingStyle,
                                }, children: [SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: query, onChange: (e) => setQuery(e.target.value), style: fieldStyle }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: entryBusy, onClick: search, style: editorSearchButtonStyle, children: entryBusy ? "Searching..." : "Search" })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                                    ...rowStackStyle,
                                    ...editorSearchResultsSpacingStyle,
                                }, children: [entryBusy ? (SP_JSX.jsx("div", { style: compactTextStyle, children: "Searching..." })) : null, !entryBusy && !results.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: "No results yet." })) : null, results.map((result) => (SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName} decky-metadata-editor__result`, onClick: () => void applyResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsx("span", { style: compactTextStyle, children: result.description })] }) }, result.slug || result.url)))] }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: "Source", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: editorSourceStackStyle, children: [SP_JSX.jsxs("div", { style: editorSourceFieldStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Title" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: metadata.title, onChange: (e) => updateMetadata((prev) => ({ ...prev, title: e.target.value })), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: editorDescriptionFieldStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Description" }), GamepadTextArea ? (SP_JSX.jsx(GamepadTextArea, { className: editorFocusTargetClassName, value: metadata.description, onChange: (e) => updateMetadata((prev) => ({
                                                ...prev,
                                                description: e.target.value,
                                                short_description: e.target.value,
                                            })), style: descriptionTextareaStyle })) : (SP_JSX.jsx(DFL.Focusable, { className: editorFocusTargetClassName, style: { width: "100%" }, onActivate: focusDescription, children: SP_JSX.jsx("textarea", { ref: descriptionRef, className: editorFocusTargetClassName, tabIndex: 0, value: metadata.description, onChange: (e) => updateMetadata((prev) => ({
                                                    ...prev,
                                                    description: e.target.value,
                                                    short_description: e.target.value,
                                                })), style: descriptionTextareaStyle }) }))] }), SP_JSX.jsxs("div", { style: editorSourceGroupStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Developers" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: developerText, onChange: (e) => {
                                                markFormEdited();
                                                developerTextRef.current = e.target.value;
                                                setDeveloperText(e.target.value);
                                            }, style: fieldStyle })] }), SP_JSX.jsxs("div", { style: editorSourceGroupStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Publishers" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: publisherText, onChange: (e) => {
                                                markFormEdited();
                                                publisherTextRef.current = e.target.value;
                                                setPublisherText(e.target.value);
                                            }, style: fieldStyle })] }), SP_JSX.jsxs("div", { style: editorReleaseRatingRowStyle, children: [SP_JSX.jsxs("div", { style: { minWidth: 0 }, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Release date" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: releaseText, onChange: (e) => {
                                                        markFormEdited();
                                                        releaseTextRef.current = e.target.value;
                                                        setReleaseText(e.target.value);
                                                    }, style: fieldStyle })] }), SP_JSX.jsxs("div", { style: { minWidth: 0 }, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Rating" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: ratingText, onChange: (e) => {
                                                        markFormEdited();
                                                        ratingTextRef.current = e.target.value;
                                                        setRatingText(e.target.value);
                                                    }, style: fieldStyle })] })] })] }) }) }), nonSteam ? (SP_JSX.jsx(DFL.PanelSection, { title: "Compatibility status", children: SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx(DFL.DropdownItem, { label: "Compatibility status", rgOptions: compatibilityStatusOptions, selectedOption: compatibilityStatusValue(metadata.deck_compat_override), onChange: (option) => updateMetadata((prev) => ({
                                    ...prev,
                                    deck_compat_override: compatibilityStatusValue(option.data),
                                })), renderButtonValue: () => compatibilityStatusDisplay(metadata, compatibilityDefault, compatibilityDefaultScope) }), SP_JSX.jsxs(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "none", children: [SP_JSX.jsx("div", { style: compactTextStyle, children: "Use global default inherits the QAM setting. Follow Valve ignores it and keeps the original Steam status when Valve data is unavailable." }), SP_JSX.jsx("div", { style: compactTextStyle, children: "Manual and default categories are your choices, not Valve certification or an emulator performance result." })] })] }) })) : null, SP_JSX.jsx(DFL.PanelSection, { title: "Steam info fields", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { className: "decky-metadata-editor__category-grid", style: editorCategoryGridStyle, children: Object.entries(CATEGORY_LABELS).map(([category, label]) => (SP_JSX.jsx(DFL.ToggleField, { highlightOnFocus: false, bottomSeparator: "none", label: label, checked: (metadata.store_categories || []).includes(Number(category)), onChange: (checked) => toggleCategory(Number(category), checked) }, category))) }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Steam App ID", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: "Paste a Steam app ID, Store URL, Community URL, or SteamDB URL. Leave empty to clear the pinned Steam match." }), SP_JSX.jsxs("div", { style: editorAppIdRowStyle, children: [SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: steamAppIdText, onChange: (e) => {
                                                markFormEdited();
                                                setSteamAppIdInput(e.target.value);
                                            }, style: fieldStyle }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: entryBusy, onClick: applySteamAppId, style: editorAppIdButtonStyle, children: "Apply Steam App ID" })] })] }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Shortcut name", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx(DFL.Field, { className: `${editorFocusTargetClassName} decky-metadata-editor__shortcut-name`, focusable: true, highlightOnFocus: false, childrenLayout: "below", padding: "none", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: `Current: ${currentShortcutName ?? "Steam did not expose a native shortcut name"}` }), steamStoreName ? SP_JSX.jsx("div", { style: compactTextStyle, children: `Steam: ${steamStoreName}` }) : null, steamNameLoading ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Loading Steam name..." }) : null, steamNameUnavailable ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Steam did not return an official name" }) : null, shortcutManagementError ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Shortcut-name management is unavailable" }) : null, !shortcutManagementError && shortcutManagement?.eligible && !hasShortcutNameApi() ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Steam's native shortcut-name API is unavailable" }) : null, !shortcutManagementError && shortcutManagement?.reason === "shortcut_not_found" ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Steam shortcut was not found" }) : null, !shortcutManagementError && shortcutManagement?.reason === "derived_shortcut_id" ? SP_JSX.jsx("div", { style: compactTextStyle, children: "This shortcut has a derived ID and cannot be renamed safely" }) : null, !shortcutManagementError && shortcutManagement?.eligible && currentShortcutName === steamStoreName && steamStoreName ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Shortcut name already matches Steam" }) : null, shortcutStatus === "diverged" ? SP_JSX.jsx("div", { style: compactTextStyle, children: "This shortcut name changed outside Decky Metadata. Rename and restore are disabled until saved history is forgotten." }) : null, !steamNameLoading && !steamStoreName && hasSteamMatch && !steamNameUnavailable ? SP_JSX.jsx("div", { style: compactTextStyle, children: "Steam did not return an official name" }) : null] }) }), canUseSteamName ? (SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: entryBusy, onClick: showUseSteamNameModal, style: editorAppIdButtonStyle, children: "Use Steam name" })) : null, shortcutManagement?.eligible && shortcutStatus === "managed" && shortcutManagement.state ? (SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: entryBusy || !hasShortcutNameApi(), onClick: showRestoreShortcutNameModal, style: editorAppIdButtonStyle, children: "Restore original name" })) : null, shortcutManagement?.eligible && shortcutStatus === "diverged" ? (SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: entryBusy, onClick: showForgetShortcutNameHistoryModal, style: editorAppIdButtonStyle, children: "Forget saved name history" })) : null] }) }) })] }) }));
};

const METADATA_ROUTE = "/decky-metadata/:appid";
const installInPlaceReloadGuard = (onFailedReload) => {
    const loader = globalThis.DeckyPluginLoader;
    if (!loader || typeof loader.importPlugin !== "function") {
        return { isPending: () => false, unpatch: () => undefined };
    }
    const original = loader.importPlugin;
    let pending = false;
    const guardedImport = async function (name, ...args) {
        const isThisPlugin = name === "Decky Metadata";
        if (isThisPlugin)
            pending = true;
        try {
            return await original.call(this, name, ...args);
        }
        catch (error) {
            if (isThisPlugin && pending)
                onFailedReload();
            throw error;
        }
        finally {
            if (isThisPlugin)
                pending = false;
        }
    };
    loader.importPlugin = guardedImport;
    return {
        isPending: () => pending,
        unpatch: () => {
            if (loader.importPlugin === guardedImport)
                loader.importPlugin = original;
        },
    };
};
var index = DFL.definePlugin(() => {
    clearCompatibilityDropdownReturn();
    beginCompatibilityLifecycle();
    let retainedReloadBaselines = false;
    const reloadGuard = installInPlaceReloadGuard(() => {
        if (!retainedReloadBaselines)
            return;
        try {
            restoreAllCompatibilityBaselines();
        }
        finally {
            discardRetainedCompatibilityState();
            retainedReloadBaselines = false;
        }
    });
    void getDebugLogging()
        .then((enabled) => setVerboseLogging(enabled))
        .catch((error) => warn("bridge", "debug logging setting load failed", error));
    void refreshMetadataCache();
    void ensureCompatibilityDefault().catch((error) => warn("bridge", "compatibility default load failed", error));
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
    const stopTrailerController = startTrailerController();
    const menuPatch = contextMenuPatch(LibraryContextMenu);
    routerHook.addRoute(METADATA_ROUTE, () => SP_JSX.jsx(MetadataPage, {}), { exact: true });
    return {
        // Plugin identity used by Decky Loader (must match plugin.json "name" so
        // find_plugin_folder resolves this install for in-place self-update, and
        // must equal EXPECTED_PLUGIN_NAME + the manifest pluginName discovery checks).
        name: "Decky Metadata",
        // Display label shown in the QAM header; kept human-readable on purpose.
        titleView: SP_JSX.jsx("div", { className: DFL.staticClasses.Title, children: "Decky Metadata" }),
        content: SP_JSX.jsx(Content, {}),
        icon: SP_JSX.jsx(FaTags, {}),
        onDismount() {
            stopTrailerController();
            const reloading = reloadGuard.isPending();
            // The bootstrap stopper invalidates the compatibility lifecycle. Retain
            // the held Game Info intent before it does so during an in-place import.
            try {
                if (reloading) {
                    retainCompatibilityBaselinesForReload();
                    retainedReloadBaselines = true;
                }
            }
            catch (error$1) {
                error("patch", "compatibility reload state retain failed", error$1);
            }
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
                clearCompatibilityDropdownReturn();
            }
            catch (error$1) {
                error("patch", "compatibility dropdown focus stop failed", error$1);
            }
            try {
                if (!reloading) {
                    restoreAllCompatibilityBaselines();
                }
            }
            catch (error$1) {
                error("patch", "compatibility baseline restore failed", error$1);
            }
            try {
                cancelCompatibilityDefaultLoad();
            }
            catch (error$1) {
                error("patch", "compatibility default load stop failed", error$1);
            }
            try {
                unpatchSteam?.();
            }
            catch (error$1) {
                error("patch", "Steam unpatch failed", error$1);
            }
            reloadGuard.unpatch();
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
