// Read-only artwork identity probe. Targets: SharedJSContext and Steam.
// Vars: SHORTCUT_APPID, MATCHED_APPID, PROBE_MODE, SIDEBAR_LABEL_HASH.
// The bounded icon request may populate Steam's in-memory icon-data cache.
(async () => {
  const ICON_HYDRATION_DEADLINE_MS = 15000;
  const ICON_HYDRATION_POLL_INTERVAL_MS = 250;
  const shortcutAppId = Number(__SHORTCUT_APPID__);
  const matchedAppId = Number(__MATCHED_APPID__);
  const probeMode = "__PROBE_MODE__";
  const sidebarLabelHash = "__SIDEBAR_LABEL_HASH__";
  const startedAt = Date.now();
  const hash = (value) => {
    let state = 2166136261;
    for (const character of String(value)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
    return (state >>> 0).toString(16).padStart(8, "0");
  };
  if (probeMode === "desktop-home") {
    const documentNode = globalThis.document;
    const homeSelected = Boolean(documentNode?.querySelector("a[href='/library/home'][aria-current='page']"));
    const labelHashValid = /^[0-9a-f]{8}$/.test(sidebarLabelHash);
    const matchingRows = labelHashValid
      ? Array.from(documentNode?.querySelectorAll?.("div, a, button, [aria-label]") ?? []).filter((element) => {
          const label = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
          return hash(label) === sidebarLabelHash;
        })
      : [];
    const rows = matchingRows.filter((element) => {
      const parentLabel = (element.parentElement?.getAttribute("aria-label") ?? element.parentElement?.textContent ?? "").trim();
      return hash(parentLabel) !== sidebarLabelHash;
    });
    const row = rows.length === 1 ? rows[0] : null;
    const image = row?.querySelector("img") ?? null;
    const imageSource = image?.getAttribute("src") ?? "";
    const imageClassification = !image ? "none"
      : imageSource.startsWith("data" + ":image/") ? "data"
      : /(?:steamuserimages|custom|grid)/i.test(imageSource) ? "custom"
      : "other";
    return JSON.stringify({
      homeSelected,
      labelHashValid,
      rowCount: rows.length,
      rowFound: Boolean(row),
      imageFound: Boolean(image),
      imageComplete: Boolean(image?.complete),
      imageNaturalWidth: Number(image?.naturalWidth ?? 0),
      imageNaturalHeight: Number(image?.naturalHeight ?? 0),
      imageClassification,
    });
  }
  if (probeMode !== "identity") throw new Error("unsupported probe mode");
  const routeLocation = globalThis.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
  const routeText = String(routeLocation?.pathname || globalThis.window?.location?.pathname || "");
  const detailExpression = new RegExp(
    `^/(?:routes/)?library/(?:(?:app|details)/${shortcutAppId}|[^/?#\\s]+/app/${shortcutAppId})(?:/|$)`,
    "i"
  );
  const routeScope = /^\/(?:routes\/)?library\/home(?:\/|$)/i.test(routeText)
    ? "library-home"
    : detailExpression.test(routeText) ? "current-detail" : "other";
  const overview = appStore?.GetAppOverviewByAppID?.(shortcutAppId) ?? null;
  const matchedOverview = appStore?.GetAppOverviewByAppID?.(matchedAppId) ?? null;
  const booleanMethod = (method) => {
    try { return Boolean(overview?.[method]?.()); } catch (_error) { return null; }
  };
  const candidates = (method) => {
    try {
      const values = method?.call(appStore, overview);
      const images = Array.isArray(values) ? values.filter((value) => typeof value === "string" && value.length > 0) : [];
      return { count: images.length, hashes: images.map(hash) };
    } catch (_error) {
      return { count: 0, hashes: [] };
    }
  };
  let iconResolved = false;
  let iconValueHash = null;
  let iconRequestError = false;
  let iconAttempts = 0;
  const iconDeadline = Date.now() + ICON_HYDRATION_DEADLINE_MS;
  for (;;) {
    iconAttempts += 1;
    try {
      const candidate = appStore?.GetIconURLForApp?.(overview);
      iconResolved = typeof candidate === "string" && candidate.length > 0;
      iconValueHash = iconResolved ? hash(candidate) : null;
    } catch (_error) {
      iconRequestError = true;
      break;
    }
    if (iconResolved || Date.now() >= iconDeadline) break;
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(ICON_HYDRATION_POLL_INTERVAL_MS, iconDeadline - Date.now())
    ));
  }
  return JSON.stringify({
    routeScope,
    shortcutAppId,
    matchedAppId,
    requestedObjectAppId: Number(overview?.appid ?? 0),
    matchedObjectAppId: Number(matchedOverview?.appid ?? 0),
    aliasSameObject: Boolean(overview && overview === matchedOverview),
    appType: Number(overview?.app_type ?? 0),
    isShortcut: booleanMethod("BIsShortcut"),
    isModOrShortcut: booleanMethod("BIsModOrShortcut"),
    iconHashPresent: Boolean(overview?.icon_hash),
    iconDataPresent: Boolean(overview?.icon_data),
    iconResolved,
    iconValueHash,
    iconRequestError,
    iconAttempts,
    iconDeadlineMs: ICON_HYDRATION_DEADLINE_MS,
    artwork: {
      vertical: candidates(appStore?.GetCustomVerticalCapsuleURLs),
      landscape: candidates(appStore?.GetCustomLandcapeImageURLs),
      hero: candidates(appStore?.GetCustomHeroImageURLs),
      logo: candidates(appStore?.GetCustomLogoImageURLs),
    },
    elapsedMs: Date.now() - startedAt,
  });
})()
