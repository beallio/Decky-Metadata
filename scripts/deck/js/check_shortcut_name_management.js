// Query the plugin's management RPC without returning names or VDF fields.
// Target: SharedJSContext. Vars: __APPID__.
(async () => {
  const appId = Number("__APPID__");
  if (!Number.isInteger(appId) || appId <= 0) return JSON.stringify({ ok: false, reason: "invalid_appid" });
  const loader = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
  if (typeof loader?.connect !== "function") return JSON.stringify({ ok: false, reason: "loader_unavailable" });
  try {
    // Match @decky/api's versioned, plugin-scoped connection. Keeping the
    // receivers and scalar argument explicit makes this a real RPC check.
    let api;
    try {
      api = loader.connect.call(loader, 2, "Decky Metadata");
    } catch (_) {
      api = loader.connect.call(loader, 1, "Decky Metadata");
    }
    if (typeof api?.call !== "function") return JSON.stringify({ ok: false, reason: "api_unavailable" });
    const management = await api.call.call(api, "get_shortcut_name_management", appId);
    return JSON.stringify({
      ok: Boolean(management?.eligible && management?.reason === "ready"),
      reason: String(management?.reason || "unknown"),
      hasState: Boolean(management?.state),
    });
  } catch (_) {
    return JSON.stringify({ ok: false, reason: "rpc_failed" });
  }
})()
