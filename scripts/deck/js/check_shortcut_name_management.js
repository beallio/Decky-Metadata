// Query the plugin's management RPC without returning names or VDF fields.
// Target: SharedJSContext. Vars: __APPID__.
(async () => {
  const appId = Number("__APPID__");
  const call = window.DeckyPluginLoader?.callPluginMethod;
  if (!Number.isInteger(appId) || appId <= 0) return JSON.stringify({ ok: false, reason: "invalid_appid" });
  if (typeof call !== "function") return JSON.stringify({ ok: false, reason: "loader_unavailable" });
  try {
    const result = await call("Decky Metadata", "get_shortcut_name_management", [appId]);
    const management = result?.result ?? result;
    return JSON.stringify({
      ok: Boolean(management?.eligible && management?.reason === "ready"),
      reason: String(management?.reason || "unknown"),
      hasState: Boolean(management?.state),
    });
  } catch (_) {
    return JSON.stringify({ ok: false, reason: "rpc_failed" });
  }
})()
