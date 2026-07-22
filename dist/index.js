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
const checkForPluginUpdate = callable("check_for_plugin_update");
const revalidatePluginUpdate = callable("revalidate_plugin_update");
const recordUpdateInstallRequested = callable("record_update_install_requested");
const confirmUpdateInstallHandoff = callable("confirm_update_install_handoff");
const clearPendingUpdateInstall = callable("clear_pending_update_install");
const getUpdateCheckContext = callable("get_update_check_context");
const getUpdateSettings = callable("get_update_settings");
const setUpdateChannel = callable("set_update_channel");
const setAutomaticUpdateChecks = callable("set_automatic_update_checks");

var backend = /*#__PURE__*/Object.freeze({
    __proto__: null,
    applyFetchedMetadata: applyFetchedMetadata,
    autoFetchMetadata: autoFetchMetadata,
    checkForPluginUpdate: checkForPluginUpdate,
    clearMetadataCache: clearMetadataCache,
    clearPendingUpdateInstall: clearPendingUpdateInstall,
    confirmUpdateInstallHandoff: confirmUpdateInstallHandoff,
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
    getPluginLogs: getPluginLogs,
    getPluginVersion: getPluginVersion,
    getScanProgress: getScanProgress,
    getSystemVersions: getSystemVersions,
    getUpdateCheckContext: getUpdateCheckContext,
    getUpdateSettings: getUpdateSettings,
    recordUpdateInstallRequested: recordUpdateInstallRequested,
    refreshDelistedIndex: refreshDelistedIndex,
    refreshSteamActivityForApp: refreshSteamActivityForApp,
    removeMetadata: removeMetadata,
    revalidatePluginUpdate: revalidatePluginUpdate,
    saveMetadata: saveMetadata,
    searchMetadata: searchMetadata,
    setAutomaticUpdateChecks: setAutomaticUpdateChecks,
    setDebugLogging: setDebugLogging,
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

function LogsSection({ logsBusy, debugLogging, debugLoggingBusy, onViewLogs, onToggleDebugLogging, }) {
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Logs", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "none", disabled: logsBusy, onClick: onViewLogs, children: logsBusy ? "Loading..." : "View Logs" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Debug Logging", description: "Enables verbose logging for troubleshooting.", bottomSeparator: "standard", checked: debugLogging, disabled: debugLoggingBusy, onChange: onToggleDebugLogging }) })] }));
}

function MetadataSection({ detectedCount, savedCount, missingCount, scanBusy, scanMessage, scanStatusKind, cacheBusy, onRefreshMetadata, onClearCache, }) {
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Metadata", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: false, preferredFocus: true, childrenLayout: "below", padding: "standard", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Detected non-Steam games", ":"] }), " ", detectedCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Metadata saved", ":"] }), " ", savedCount] }), SP_JSX.jsxs("div", { children: [SP_JSX.jsxs("b", { children: ["Missing metadata", ":"] }), " ", missingCount] })] }) }) }), SP_JSX.jsxs(DFL.PanelSectionRow, { children: [SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "none", disabled: scanBusy || detectedCount === 0, onClick: onRefreshMetadata, children: scanBusy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Refreshing..." })) : ("Refresh metadata") }), scanBusy || scanMessage ? (SP_JSX.jsx("div", { style: inlineStatusStyle(scanStatusKind), children: scanMessage || "Refreshing metadata..." })) : null] }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "none", children: SP_JSX.jsx("div", { style: compactTextStyle, children: "Find and save metadata for detected non-Steam games that do not have a match yet." }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: sectionHeadingStyle, children: "Metadata cache" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", bottomSeparator: "none", disabled: cacheBusy || scanBusy, onClick: onClearCache, children: cacheBusy ? (SP_JSX.jsx(ButtonLabel, { busy: true, children: "Clearing..." })) : ("Clear cache") }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: false, childrenLayout: "below", padding: "none", bottomSeparator: "standard", children: SP_JSX.jsx("div", { style: { ...compactTextStyle, paddingBottom: space.md }, children: "Clear saved matches and metadata so games can be matched again." }) }) })] }));
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
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Updates", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Installed Version", padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsxs("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: [effectiveCurrentVersion, " ", isLocalBuild ? "(Local Build)" : ""] }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Receive development releases", description: "Includes prerelease builds intended for testing. These builds may contain regressions.", checked: updateChannel === "development", onChange: handleToggleChannel }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Automatically check for updates", description: "Checks in the background while the plugin is loaded.", checked: automaticUpdateChecks, onChange: onToggleAutomaticUpdateChecks }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Status", description: lastCheckedText, padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsx("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }, children: getStatusContent() }) }) }), errorMsg && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: { display: "flex", gap: "8px", color: "#f87171", padding: "10px 15px", fontSize: "13px" }, children: [SP_JSX.jsx("span", { style: { flexShrink: 0, marginTop: "2px", display: "inline-flex" }, children: SP_JSX.jsx(FaExclamationTriangle, {}) }), SP_JSX.jsxs("div", { children: [SP_JSX.jsx("div", { children: errorMsg }), checkResult?.status === "failed" && checkResult.retry_after && (SP_JSX.jsxs("div", { children: ["Try again after ", new Date(checkResult.retry_after).toLocaleString()] }))] })] }) })), candidate && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Candidate", padding: "standard", focusable: true, highlightOnFocus: true, children: SP_JSX.jsxs("div", { style: { fontSize: "14px", color: "#cbd5e1" }, children: [SP_JSX.jsxs("div", { children: ["New version: v", candidate.version, " (", candidate.channel, ")"] }), candidate.action === "downgrade_to_stable" && (SP_JSX.jsx("div", { style: { color: "#f87171", fontSize: "12px", marginTop: "4px" }, children: "Warning: Reverting to stable is a downgrade." }))] }) }) })), candidate && isDeckyAvailable && !isLocalBuild && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => handleInstallClick(candidate), disabled: isChecking || isInstalling, children: SP_JSX.jsx("div", { style: buttonRowStyle, children: isInstalling ? (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx("div", { style: spinnerSlotStyle, children: SP_JSX.jsx(DFL.Spinner, { size: "small", style: { color: "#1a9fff" } }) }), SP_JSX.jsx("span", { children: isHandoffPending ? "Waiting for Decky..." : "Preparing..." })] })) : (SP_JSX.jsx("span", { children: getActionText(candidate) })) }) }) })), candidate && (!isDeckyAvailable || isLocalBuild) && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: true, padding: "standard", children: SP_JSX.jsx("div", { style: { color: "#f87171", fontSize: "13px", marginBottom: "8px" }, children: isLocalBuild
                            ? "Local builds cannot self-update. Install this release manually from GitHub Releases."
                            : "Automatic installation is unavailable in this Decky environment. Install this release manually from GitHub Releases." }) }) })), candidate && (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => DFL.Navigation.NavigateToExternalWeb(candidate.release_url), children: "View Release Notes" }) })), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => checkNow(), disabled: isChecking || isInstalling, children: SP_JSX.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }, children: [isChecking ? (SP_JSX.jsx(DFL.Spinner, { style: { width: "16px", height: "16px", color: "#1a9fff" } })) : (SP_JSX.jsx(IoMdRefresh, {})), SP_JSX.jsx("span", { children: "Check now" })] }) }) })] }));
}

function VersionsSection({ pluginVersion, deckyVersion, steamosVersion, }) {
    return (SP_JSX.jsx(DFL.PanelSection, { title: "Versions", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { focusable: true, highlightOnFocus: true, childrenLayout: "below", padding: "standard", bottomSeparator: "none", children: SP_JSX.jsxs("div", { style: compactTextStyle, children: [SP_JSX.jsxs("div", { children: ["Decky Metadata: ", pluginVersion.trim() || "Unknown"] }), SP_JSX.jsxs("div", { children: ["Decky: ", deckyVersion.trim() || "Unknown"] }), SP_JSX.jsxs("div", { children: ["SteamOS: ", steamosVersion.trim() || "Unknown"] })] }) }) }) }));
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

// Pure decision logic for the BIsModOrShortcut afterPatch. Extracted so the
// precedence rules are unit-testable: the 2026-07-11 launch regression was an
// ordering bug here (the render shield consumed before the in-call truth
// window), which only surfaced on-device.
const decideBIsModOrShortcut = (input) => {
    const { isPatchedNonSteam, originalRet, bypassCounter, hasCache, path, consumeShield } = input;
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
    // Only matched games (in metadataCache) are intentionally spoofed as
    // real Steam apps so their Game Info renders. For any OTHER non-Steam
    // shortcut (Heroic, Ludusavi, unmatched emulator entries), spoofing them
    // as real never-played apps makes Steam tag them "New to Library". Return
    // the native value so they keep their true shortcut status. Placed after
    // the in-call-truth check so nothing outranks bypassCounter === -1.
    if (!hasCache) {
        return { finalRet: originalRet, reason: "not-matched", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
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

const hasMatchedSteamAppId = (metadata) => {
    const steamAppId = Number(metadata?.steam_appid);
    return Number.isFinite(steamAppId) && steamAppId > 0;
};
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
                hasCache,
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
const infoSectionWrapperCache = new Map();
const nativeQuickLinksWrapperCache = new Map();
const installNonSteamQuickLinkPolicy = (unpatchers) => {
    const maxAttempts = 5;
    let attempts = 0;
    let cancelled = false;
    let retryId;
    let policyUnpatch;
    let quickLinkResources;
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
        let wrapper = nativeQuickLinksWrapperCache.get(original);
        if (wrapper)
            return wrapper;
        wrapper = (props) => {
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
        wrapper.__dmQuickLinksWrapper = true;
        nativeQuickLinksWrapperCache.set(original, wrapper);
        return wrapper;
    };
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
        !input.isNonSteamShortcut) {
        return nativeControllerLayoutContext();
    }
    const sourceAppid = input.metadata?.steam_appid;
    if (!isNativeSteamAppid(sourceAppid) ||
        sourceAppid === input.displayedAppid) {
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
const filterControllerSearchConfigs = (nativeResult, activeDisplayedShortcutAppid, activeMatchedSourceAppid, supplementalSourceAppids) => {
    if (!Array.isArray(nativeResult)) {
        return { ok: false, reason: "native-search-not-array" };
    }
    if (supplementalSourceAppids.size === 0 &&
        activeDisplayedShortcutAppid === null) {
        return { ok: true, value: nativeResult };
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
                remove = (supplementalSourceAppids.has(appid) &&
                    appid !== activeMatchedSourceAppid) || (activeDisplayedShortcutAppid !== null &&
                    isSteamShortcutAppid(appid) &&
                    appid !== activeDisplayedShortcutAppid);
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
const supplementalQueryKey = (sourceAppid, args) => {
    const controllerIndex = args[1];
    const filterOtherControllerTypes = args[2];
    if (!Number.isInteger(controllerIndex) ||
        controllerIndex < 0 ||
        typeof filterOtherControllerTypes !== "boolean") {
        return null;
    }
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
        discoverTargets: discoverControllerLayoutTargets,
        schedule: defaultSchedule,
        cancel: defaultCancel,
        defineProperty: Object.defineProperty,
        maxAttempts: 240,
        retryDelayMs: 500,
        ...provided,
    };
    let disabled = false;
    let installed = false;
    let cleanedUp = false;
    let timer;
    let attempts = 0;
    let installedDescriptors = [];
    let activeDisplayedShortcutAppid = null;
    let activeMatchedSourceAppid = null;
    const supplementalSourceAppids = new Set();
    const supplementalQueryKeys = new Map();
    const trip = (failure) => {
        if (disabled || cleanedUp)
            return;
        disabled = true;
        activeDisplayedShortcutAppid = null;
        activeMatchedSourceAppid = null;
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
        const establishDisplayedContext = (displayedAppid) => {
            activeDisplayedShortcutAppid = null;
            activeMatchedSourceAppid = null;
            if (!validAppid(displayedAppid))
                return null;
            const context = dependencies.resolveContext(displayedAppid);
            if (typeof context !== "object" ||
                context === null ||
                typeof context.isNonSteamShortcut !== "boolean") {
                throw new Error("invalid controller layout context");
            }
            const isNonSteamShortcut = context.isNonSteamShortcut;
            const matchedAppid = context.matchedSourceAppid;
            if (matchedAppid !== null &&
                (!isNativeSteamAppid(matchedAppid) ||
                    matchedAppid === displayedAppid ||
                    !isNonSteamShortcut)) {
                throw new Error("invalid matched appid");
            }
            if (!isNonSteamShortcut) {
                if (matchedAppid !== null)
                    throw new Error("native context has matched appid");
                if (supplementalSourceAppids.has(displayedAppid)) {
                    supplementalSourceAppids.delete(displayedAppid);
                    supplementalQueryKeys.delete(displayedAppid);
                }
                return null;
            }
            activeDisplayedShortcutAppid = displayedAppid;
            if (matchedAppid === null)
                return null;
            activeMatchedSourceAppid = matchedAppid;
            return matchedAppid;
        };
        const inputEntry = targets.descriptors[0];
        const originalQuery = inputEntry.descriptor.value;
        const queryWrapper = function (...args) {
            const nativeResult = originalQuery.apply(this, args);
            if (disabled)
                return nativeResult;
            const displayedAppid = args[0];
            const validDisplayedAppid = validAppid(displayedAppid) ? displayedAppid : undefined;
            let matchedAppid = null;
            try {
                matchedAppid = establishDisplayedContext(displayedAppid);
                if (matchedAppid === null || validDisplayedAppid === undefined)
                    return nativeResult;
                const queryKey = supplementalQueryKey(matchedAppid, args);
                if (!queryKey) {
                    trip({
                        section: "query",
                        code: "invalid-query-key",
                        displayedAppid: validDisplayedAppid,
                        matchedAppid,
                    });
                    return nativeResult;
                }
                activeMatchedSourceAppid = matchedAppid;
                const cacheExisted = targets.store.m_mapAppConfigs.has(matchedAppid);
                if (cacheExisted &&
                    sameSupplementalQueryKey(supplementalQueryKeys.get(matchedAppid), queryKey)) {
                    supplementalSourceAppids.add(matchedAppid);
                    return nativeResult;
                }
                targets.store.m_mapAppConfigs.set(matchedAppid, []);
                originalQuery.apply(this, [matchedAppid, ...args.slice(1)]);
                supplementalQueryKeys.set(matchedAppid, queryKey);
                supplementalSourceAppids.add(matchedAppid);
            }
            catch (error) {
                trip({
                    section: "query",
                    code: "runtime-error",
                    displayedAppid: validDisplayedAppid,
                    matchedAppid: matchedAppid ?? undefined,
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
                let matchedAppid = null;
                try {
                    matchedAppid = establishDisplayedContext(displayedAppid);
                    if (matchedAppid === null || validDisplayedAppid === undefined)
                        return nativeBase;
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
                        matchedAppid: matchedAppid ?? undefined,
                        detail: errorDetail(error),
                    });
                    return nativeBase;
                }
            });
        }
        const searchEntry = targets.descriptors.find((candidate) => candidate.key === "GetAllConfigs");
        const originalSearch = searchEntry.descriptor.value;
        const searchWrapper = function (...args) {
            const nativeResult = originalSearch.apply(this, args);
            if (disabled)
                return nativeResult;
            const displayedAppid = activeDisplayedShortcutAppid;
            const matchedAppid = activeMatchedSourceAppid;
            try {
                const result = filterControllerSearchConfigs(nativeResult, displayedAppid, matchedAppid, supplementalSourceAppids);
                if (result.ok === false) {
                    trip({
                        section: "search",
                        code: result.reason,
                        displayedAppid: displayedAppid ?? undefined,
                        matchedAppid: matchedAppid ?? undefined,
                    });
                    return nativeResult;
                }
                return result.value;
            }
            catch (error) {
                trip({
                    section: "search",
                    code: "runtime-error",
                    displayedAppid: displayedAppid ?? undefined,
                    matchedAppid: matchedAppid ?? undefined,
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
        if (timer !== undefined) {
            dependencies.cancel(timer);
            timer = undefined;
        }
        if (installedDescriptors.length > 0) {
            restoreDescriptors(installedDescriptors);
            installedDescriptors = [];
        }
        installed = false;
        activeDisplayedShortcutAppid = null;
        activeMatchedSourceAppid = null;
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

// Version is fetched from the backend on mount; "" means not yet loaded.
const PLUGIN_VERSION = "";
const takePreferredPanelFocus = (element) => {
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
    const focusFrame = SP_REACT.useRef(null);
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
    const focusPanel = SP_REACT.useCallback((element) => {
        if (focusFrame.current !== null) {
            window.cancelAnimationFrame(focusFrame.current);
            focusFrame.current = null;
        }
        if (element) {
            focusFrame.current = window.requestAnimationFrame(() => {
                focusFrame.current = null;
                takePreferredPanelFocus(element);
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
    return (SP_JSX.jsxs(DFL.Focusable, { ref: focusPanel, preferredFocus: true, navEntryPreferPosition: DFL.NavEntryPositionPreferences.PREFERRED_CHILD, style: qamPanelStyle, children: [SP_JSX.jsx(MetadataSection, { detectedCount: games.length, savedCount: metadataCount, missingCount: missing, scanBusy: busy, scanMessage: scanMessage, scanStatusKind: scanStatusKind, cacheBusy: cacheBusy, onRefreshMetadata: () => void scanMissing(), onClearCache: () => void clearCache() }), SP_JSX.jsx(DelistedIndexSection, { countText: delistedCountText, dateText: delistedDateText, busy: delistedBusy, onRefresh: () => void refreshDelisted() }), SP_JSX.jsx(LogsSection, { logsBusy: logsBusy, debugLogging: debugLogging, debugLoggingBusy: debugLoggingBusy, onViewLogs: () => void viewLogs(), onToggleDebugLogging: (enabled) => void saveDebugLogging(enabled) }), SP_JSX.jsx(PluginUpdateSection, { currentVersion: pluginVersion, updateChannel: updateChannel, automaticUpdateChecks: automaticUpdateChecks, settingsLoaded: settingsLoaded, onToggleUpdateChannel: (enabled) => void saveUpdateChannel(enabled), onToggleAutomaticUpdateChecks: (enabled) => void saveAutomaticUpdateChecks(enabled), onInstallVersionConfirmed: setPluginVersion }), SP_JSX.jsx(VersionsSection, { pluginVersion: pluginVersion, deckyVersion: deckyVersion, steamosVersion: steamosVersion })] }));
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

/*
 * Search results: the default DialogButton focus fill washes out the result
 * text. Replace it with a border-only highlight (no background fill) so the
 * title and description stay readable when the row is selected.
 */
.decky-metadata-editor .decky-metadata-editor__result:focus-visible,
.decky-metadata-editor .decky-metadata-editor__result.gpfocus {
  background: transparent !important;
  color: white !important;
  outline: 3px solid white !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1a9fff !important;
}
`;

const MetadataPage = () => {
    const editorRootRef = SP_REACT.useRef(null);
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
    return (SP_JSX.jsx(DFL.ScrollPanel, { children: SP_JSX.jsxs("div", { ref: editorRootRef, className: editorRootClassName, style: pageStyle, children: [SP_JSX.jsx("style", { children: editorScopedCss }), SP_JSX.jsx(DFL.Focusable, { className: editorFocusTargetClassName, onActivate: () => { }, style: pageTitleStyle, children: `${"Decky Metadata"} - ${appName(appId)}` }), SP_JSX.jsxs("div", { style: editorActionBarStyle, children: [SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName} decky-metadata-editor__action--save`, onClick: saveCurrent, style: editorSaveButtonStyle, children: "Save" }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName} decky-metadata-editor__action--remove`, onClick: removeCurrent, style: editorRemoveButtonStyle, children: "Remove metadata" }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, onClick: () => DFL.Navigation.NavigateBack(), style: editorActionButtonStyle, children: "Done" })] }), !nonSteam ? (SP_JSX.jsx(DFL.PanelSection, { children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { style: compactTextStyle, children: "This plugin only changes non-Steam games." }) }) })) : null, SP_JSX.jsxs(DFL.PanelSection, { title: "Search IGN metadata", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                                    ...editorSearchRowStyle,
                                    ...editorSearchInputRowSpacingStyle,
                                }, children: [SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: query, onChange: (e) => setQuery(e.target.value), style: fieldStyle }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: busy, onClick: search, style: editorSearchButtonStyle, children: busy ? "Searching..." : "Search" })] }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: {
                                    ...rowStackStyle,
                                    ...editorSearchResultsSpacingStyle,
                                }, children: [busy ? (SP_JSX.jsx("div", { style: compactTextStyle, children: "Searching..." })) : null, !busy && !results.length ? (SP_JSX.jsx("div", { style: compactTextStyle, children: "No results yet." })) : null, results.map((result) => (SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName} decky-metadata-editor__result`, onClick: () => void applyResult(result), style: { justifyContent: "flex-start", textAlign: "left" }, children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("b", { children: result.title }), SP_JSX.jsx("span", { style: compactTextStyle, children: result.description })] }) }, result.slug || result.url)))] }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: "Source", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: editorSourceStackStyle, children: [SP_JSX.jsxs("div", { style: editorSourceFieldStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Title" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: metadata.title, onChange: (e) => setMetadata((prev) => ({ ...prev, title: e.target.value })), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: editorDescriptionFieldStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Description" }), SP_JSX.jsx(DFL.Focusable, { className: editorFocusTargetClassName, style: { width: "100%" }, children: SP_JSX.jsx("textarea", { className: editorFocusTargetClassName, value: metadata.description, onChange: (e) => setMetadata((prev) => ({
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
                                                } }) })] }), SP_JSX.jsxs("div", { style: editorSourceGroupStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Developers" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: developerText, onChange: (e) => setDeveloperText(e.target.value), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: editorSourceGroupStyle, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Publishers" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: publisherText, onChange: (e) => setPublisherText(e.target.value), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: editorReleaseRatingRowStyle, children: [SP_JSX.jsxs("div", { style: { minWidth: 0 }, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Release date" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: releaseText, onChange: (e) => setReleaseText(e.target.value), style: fieldStyle })] }), SP_JSX.jsxs("div", { style: { minWidth: 0 }, children: [SP_JSX.jsx("label", { style: editorLabelStyle, children: "Rating" }), SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: ratingText, onChange: (e) => setRatingText(e.target.value), style: fieldStyle })] })] })] }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Steam info fields", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("div", { className: "decky-metadata-editor__category-grid", style: editorCategoryGridStyle, children: Object.entries(CATEGORY_LABELS).map(([category, label]) => (SP_JSX.jsx(DFL.ToggleField, { highlightOnFocus: false, bottomSeparator: "none", label: label, checked: (metadata.store_categories || []).includes(Number(category)), onChange: (checked) => toggleCategory(Number(category), checked) }, category))) }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Steam App ID", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsxs("div", { style: rowStackStyle, children: [SP_JSX.jsx("div", { style: compactTextStyle, children: "Paste a Steam app ID, Store URL, Community URL, or SteamDB URL. Leave empty to clear the pinned Steam match." }), SP_JSX.jsxs("div", { style: editorAppIdRowStyle, children: [SP_JSX.jsx(DFL.TextField, { className: editorFocusTargetClassName, value: steamAppIdText, onChange: (e) => setSteamAppIdText(e.target.value), style: fieldStyle }), SP_JSX.jsx(FocusableButton, { className: `DialogButton ${editorFocusTargetClassName}`, disabled: busy, onClick: applySteamAppId, style: editorAppIdButtonStyle, children: "Apply Steam App ID" })] })] }) }) })] }) }));
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
        // Plugin identity used by Decky Loader (must match plugin.json "name" so
        // find_plugin_folder resolves this install for in-place self-update, and
        // must equal EXPECTED_PLUGIN_NAME + the manifest pluginName discovery checks).
        name: "Decky Metadata",
        // Display label shown in the QAM header; kept human-readable on purpose.
        titleView: SP_JSX.jsx("div", { className: DFL.staticClasses.Title, children: "Decky Metadata" }),
        content: SP_JSX.jsx(Content, {}),
        icon: SP_JSX.jsx(FaTags, {}),
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
