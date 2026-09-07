// Read one native shortcut's exact display name and sort field without writing.
// Target: SharedJSContext. Vars: __APPID__, __TARGET_B64__.
(() => {
  const appId = Number("__APPID__");
  const targetB64 = "__TARGET_B64__";
  const b64 = (value) => btoa(unescape(encodeURIComponent(String(value ?? ""))));
  const apps = Array.isArray(appStore?.allApps) ? appStore.allApps : Object.values(appStore?.allApps || {});
  const overview = apps.find((entry) => Number(entry?.appid) === appId) || null;
  const native = Boolean(
    overview && (
      Number(overview.app_type) === 1073741824 ||
      overview.BIsShortcut?.() === true
    )
  );
  const current = typeof overview?.display_name === "string" ? overview.display_name : "";
  const hasUsableCurrent = Boolean(current.trim());
  const running = apps.some((entry) => {
    try { return entry?.BIsRunning?.() === true; } catch (_) { return false; }
  });
  return JSON.stringify({
    native,
    running,
    hasCurrent: hasUsableCurrent,
    currentB64: b64(current),
    sortAsB64: b64(overview?.sort_as ?? overview?.sortAs ?? ""),
    matchesTarget: hasUsableCurrent && b64(current) === targetB64,
  });
})()
