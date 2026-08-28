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
    const SIDEBAR_ICON_MAX_DIMENSION = 128;
    const documentNode = globalThis.document;
    const homeSelected = Boolean(documentNode?.querySelector("a[href='/library/home'][aria-current='page']"));
    const labelHashValid = /^[0-9a-f]{8}$/.test(sidebarLabelHash);
    const isVisible = (element) => {
      const rect = element?.getBoundingClientRect?.();
      const style = globalThis.getComputedStyle?.(element);
      return Boolean(
        rect && rect.width > 0 && rect.height > 0
        && style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0"
      );
    };
    const matchingElements = labelHashValid
      ? Array.from(documentNode?.querySelectorAll?.("div, a, button, [aria-label]") ?? []).filter((element) => {
          const label = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
          return hash(label) === sidebarLabelHash;
        })
      : [];
    const uniqueCells = Array.from(new Set(matchingElements.map((element) => element.closest("[role=gridcell]")).filter(Boolean)))
      .filter(isVisible);
    const imageCandidates = uniqueCells.flatMap((cell) => Array.from(cell.querySelectorAll?.("img") ?? [])).map((image) => {
      const source = image.getAttribute("src") ?? "";
      const rect = image.getBoundingClientRect?.();
      const naturalWidth = Number(image.naturalWidth ?? 0);
      const naturalHeight = Number(image.naturalHeight ?? 0);
      const renderedWidth = Number(rect?.width ?? 0);
      const renderedHeight = Number(rect?.height ?? 0);
      const classification = source.startsWith("data" + ":image/") ? "data"
        : /(?:steamuserimages|custom|grid)/i.test(source) ? "custom"
        : "other";
      return {
        complete: Boolean(image.complete),
        naturalWidth,
        naturalHeight,
        renderedWidth,
        renderedHeight,
        classification,
      };
    });
    const isCustom = (candidate) => candidate.classification === "data" || candidate.classification === "custom";
    const isSidebarIcon = (candidate) => isCustom(candidate)
      && candidate.complete
      && candidate.naturalWidth > 0 && candidate.naturalHeight > 0
      && candidate.naturalWidth === candidate.naturalHeight
      && candidate.naturalWidth <= SIDEBAR_ICON_MAX_DIMENSION
      && candidate.renderedWidth > 0 && candidate.renderedHeight > 0
      && Math.abs(candidate.renderedWidth - candidate.renderedHeight) <= 1
      && candidate.renderedWidth <= SIDEBAR_ICON_MAX_DIMENSION
      && candidate.renderedHeight <= SIDEBAR_ICON_MAX_DIMENSION;
    const sidebarIcons = imageCandidates.filter(isSidebarIcon);
    const completeImageDimensions = imageCandidates
      .filter((candidate) => candidate.complete
        && candidate.naturalWidth > 0 && candidate.naturalHeight > 0
        && candidate.renderedWidth > 0 && candidate.renderedHeight > 0)
      .map((candidate) => [
        candidate.naturalWidth,
        candidate.naturalHeight,
        candidate.renderedWidth,
        candidate.renderedHeight,
      ])
      .sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2] || left[3] - right[3]);
    return JSON.stringify({
      homeSelected,
      labelHashValid,
      matchingCellCount: uniqueCells.length,
      completeImageCount: completeImageDimensions.length,
      customImageCount: imageCandidates.filter(isCustom).length,
      portraitCandidateCount: imageCandidates.filter((candidate) => isCustom(candidate)
        && candidate.complete && candidate.naturalHeight > candidate.naturalWidth).length,
      customSidebarIconCount: sidebarIcons.length,
      customSidebarIconFound: sidebarIcons.length > 0,
      completeImageDimensions,
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
