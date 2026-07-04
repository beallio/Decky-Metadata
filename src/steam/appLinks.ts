import { findModuleChild } from "@decky/ui";
import { frontendLog } from "../backend";
import {
  Unpatch,
  currentGameDetailAppId,
  currentRoutePath,
  gameDetailAppIdFromPath,
  getOverview,
  isNonSteamApp,
  safeDecodeURIComponent,
  steamAppIdForApp,
} from "./core";

const DECKY_HIDE_APP_LINKS_CLASS = "decky-hide-applinks";
const DECKY_HIDE_APP_LINKS_STYLE_ID = "decky-hide-applinks-style";

const isAppDetailsQuickLinksModule = (candidate: any) =>
  !!candidate &&
  typeof candidate === "object" &&
  typeof candidate.GameInfoQuickLinks === "string" &&
  typeof candidate.GameInfoContainer === "string";

const appDetailsQuickLinksModuleFromExports = (module: any) => {
  if (isAppDetailsQuickLinksModule(module)) return module;
  if (!module || typeof module !== "object") return undefined;
  for (const candidate of Object.values(module)) {
    if (isAppDetailsQuickLinksModule(candidate)) return candidate;
  }
  return undefined;
};

const resolveAppDetailsQuickLinksClasses = (): string[] => {
  try {
    let discovered = findModuleChild(appDetailsQuickLinksModuleFromExports);
    if (!discovered) {
      discovered = findModuleChild((module: any) => {
        if (!module || typeof module !== "object") return undefined;
        for (const candidate of Object.values(module)) {
          const nested = appDetailsQuickLinksModuleFromExports(candidate);
          if (nested) return nested;
        }
        return undefined;
      });
    }
    const quickLinks = discovered?.GameInfoQuickLinks;
    return typeof quickLinks === "string" && quickLinks.trim() ? [quickLinks.trim()] : [];
  } catch (_error) {
    return [];
  }
};

const onGameDetailRoute = (path: string) => {
  const decoded = safeDecodeURIComponent(String(path || ""));
  if (/\/achievements(\b|\/)/i.test(decoded)) return false;
  return gameDetailAppIdFromPath(decoded) > 0 || /\/library\/(app|details)\//i.test(decoded);
};

const appLinksHiderClassSelector = (className: string) => {
  const trimmed = className.trim();
  return /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(trimmed) ? `.${trimmed}` : "";
};

const buildUnmatchedAppLinksHiderStyle = (linkRowClasses: string[]) => {
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

const appLinksHiderTargetDocument = (): Document | null => {
  try {
    const doc = (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_BrowserWindow
      ?.document;
    if (doc && typeof doc.createElement === "function" && doc.head && doc.body) {
      return doc as Document;
    }
  } catch (_error) {
    // fall through
  }
  return null;
};

const appLinksDomClassPresent = (className: string, doc: Document) => {
  const trimmed = className.trim();
  if (!trimmed) return false;
  try {
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(trimmed)
        : trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return !!doc.querySelector(`.${escaped}`);
  } catch (_error) {
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

const logUnmatchedAppLinksDecision = (
  decision: boolean,
  resolvedLinkRowClasses: string[],
  lastSignature: string,
  doc: Document | null
) => {
  const details = unmatchedAppLinksDecisionDetails();
  const signature = `${decision}|${resolvedLinkRowClasses.join(",")}|${details.appId}`;
  if (signature === lastSignature) return lastSignature;
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
  } catch (_error) {
    // Diagnostic logging must never affect the passive hider.
  }
  return signature;
};

const shouldHideUnmatchedAppLinks = () => {
  const path = currentRoutePath();
  if (!onGameDetailRoute(path)) return false;
  const appId = currentGameDetailAppId();
  if (!appId) return false;
  return isNonSteamApp(getOverview(appId)) && steamAppIdForApp(appId) === 0;
};

export const installUnmatchedAppLinksHider = (unpatchers: Unpatch[]) => {
  const globalState = globalThis as any;
  if (globalState.__deckyAppLinksHider) {
    unpatchers.push(() => undefined);
    return;
  }
  if (typeof document === "undefined" || !document.body || !document.head) {
    unpatchers.push(() => undefined);
    return;
  }

  globalState.__deckyAppLinksHider = { installed: true };

  let resolvedQuickLinksClasses: string[] = [];
  let appliedQuickLinksClasses = "";
  let lastDecisionLogSignature = "";
  let injectedDoc: Document | null = null;

  const update = () => {
    try {
      const doc = appLinksHiderTargetDocument();
      if (!doc) return;

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
      if (
        forceStyleRefresh ||
        !style.textContent ||
        nextAppliedQuickLinksClasses !== appliedQuickLinksClasses
      ) {
        style.textContent = buildUnmatchedAppLinksHiderStyle(resolvedQuickLinksClasses);
        appliedQuickLinksClasses = nextAppliedQuickLinksClasses;
      }

      const decision = shouldHideUnmatchedAppLinks();
      lastDecisionLogSignature = logUnmatchedAppLinksDecision(
        decision,
        resolvedQuickLinksClasses,
        lastDecisionLogSignature,
        doc
      );
      doc.body.classList.toggle(DECKY_HIDE_APP_LINKS_CLASS, decision);
    } catch (_error) {
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
    } catch (_error) {
      // Best effort teardown.
    }
    delete globalState.__deckyAppLinksHider;
  });
};
