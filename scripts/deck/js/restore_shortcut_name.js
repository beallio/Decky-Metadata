// Emergency cleanup only: restore a previously captured name encoded as base64.
// Target: SharedJSContext. Vars: __APPID__, __NAME_B64__.
(() => {
  const appId = Number("__APPID__");
  const decode = (value) => decodeURIComponent(escape(atob(value)));
  const name = decode("__NAME_B64__");
  const apps = SteamClient?.Apps;
  if (!Number.isInteger(appId) || appId <= 0) return "FAIL: invalid shortcut app ID";
  if (!name) return "FAIL: cleanup name is empty";
  if (!apps || typeof apps.SetShortcutName !== "function") return "FAIL: native shortcut-name API unavailable";
  apps.SetShortcutName(appId, name);
  return "cleanup requested";
})()
