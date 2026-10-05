import { currentRoutePath, gameDetailAppIdFromPath, getOverview, isCurrentGameInfoRoute, isNativeNonSteamShortcut, metadataCache, type Unpatch } from "./core";
import { findLiveModuleChild } from "./steamUiModules";
import { steamUiDocuments, steamUiWindow } from "./steamUiHost";

const MARKER = "data-decky-metadata-description";
const selector = (className: string) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(className) ? `.${className}` : "";

const resolveClasses = () => {
  const inspect = (module: any): any => {
    if (!module || typeof module !== "object") return undefined;
    if (typeof module.GameDescription === "string" && typeof module.Description === "string" && typeof module.DescriptionStatsCtn === "string") return module;
    if (typeof module.GameInfoContainer === "string" && typeof module.GameInfoQuickLinks === "string") return module;
    for (const value of Object.values(module)) {
      if (!value || typeof value !== "object") continue;
      if (typeof (value as any).GameDescription === "string" && typeof (value as any).DescriptionStatsCtn === "string") return value;
      if (typeof (value as any).GameInfoContainer === "string" && typeof (value as any).GameInfoQuickLinks === "string") return value;
    }
    return undefined;
  };
  const descriptions: any = findLiveModuleChild((module) => {
    const found = inspect(module);
    return found?.GameDescription ? found : undefined;
  });
  const details: any = findLiveModuleChild((module) => {
    const found = inspect(module);
    return found?.GameInfoContainer ? found : undefined;
  });
  return descriptions && details ? { owner: details.GameInfoContainer, description: descriptions.GameDescription } : undefined;
};

/** Read one confirmed scalar prop on host ancestors, never enumerate Steam stores. */
export const descriptionOwnerAppId = (owner: HTMLElement): number => {
  const fiberKey = Object.keys(owner).find((key) => key.startsWith("__reactFiber$"));
  let fiber = fiberKey ? (owner as any)[fiberKey] : undefined;
  for (let depth = 0; fiber && depth < 16; depth++, fiber = fiber.return) {
    const appId = Number(fiber.memoizedProps?.overview?.appid);
    if (Number.isSafeInteger(appId) && appId > 0) return appId;
  }
  return 0;
};
export type DescriptionPresentationDependencies = {
  documents: () => Document[];
  classes: () => { owner: string; description: string } | undefined;
  route: () => string;
  eligible: (appId: number) => boolean;
  ownerAppId: (owner: HTMLElement) => number;
  visible: (owner: HTMLElement) => boolean;
  listen: (callback: () => void) => Unpatch;
  observe: (target: Node, callback: () => void) => Unpatch;
  visibility?: (owner: HTMLElement, callback: () => void) => Unpatch;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (id: number) => void;
};
const defaultDependencies = (): DescriptionPresentationDependencies => {
  let latestRoute: string | undefined;
  return {
    documents: () => steamUiDocuments() as Document[],
    classes: resolveClasses,
    route: () => latestRoute ?? currentRoutePath(),
    eligible: (appId) => {
      const overview = getOverview(appId);
      return Number(overview?.appid) === appId && isNativeNonSteamShortcut(overview) && !!metadataCache[String(appId)];
    },
    ownerAppId: descriptionOwnerAppId,
    visible: (owner) => owner.isConnected && owner.getClientRects().length > 0,
    listen: (callback) => {
      const host = steamUiWindow() as any;
      const history = host.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ?? host.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
      return history?.listen?.((location: any) => {
        latestRoute = [location?.pathname, location?.search, location?.hash].filter(Boolean).join(" ");
        callback();
      }) ?? (() => {});
    },
    observe: (target, callback) => {
      const observer = new MutationObserver(callback);
      observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
      return () => observer.disconnect();
    },
    visibility: (owner, callback) => {
      const Constructor = (owner.ownerDocument.defaultView as any)?.IntersectionObserver;
      if (!Constructor) return () => {};
      const observer = new Constructor(callback);
      observer.observe(owner);
      return () => observer.disconnect();
    },
    schedule: (callback, delay) => window.setTimeout(callback, delay),
    cancel: (id) => window.clearTimeout(id),
  };
};

export const installMetadataDescriptions = (
  unpatchers: Unpatch[],
  dependencies: DescriptionPresentationDependencies = defaultDependencies(),
): void => {
  const classes = dependencies.classes();
  if (!classes || !selector(classes.owner) || !selector(classes.description)) return;
  let disposed = false;
  let owner: HTMLElement | undefined;
  let ownerAppId = 0;
  let ownerStops: Unpatch[] = [];
  let discoveryStops: Unpatch[] = [];
  let discoveryExpiry: number | undefined;
  const originals = new Map<HTMLElement, { marker: string | null; spacing: string; priority: string }>();
  const restore = (leaf: HTMLElement) => {
    const original = originals.get(leaf);
    if (!original) return;
    if (original.marker === null) leaf.removeAttribute(MARKER);
    else leaf.setAttribute(MARKER, original.marker);
    if (original.spacing) leaf.style.setProperty("white-space", original.spacing, original.priority);
    else leaf.style.removeProperty("white-space");
    originals.delete(leaf);
  };
  const stopDiscovery = () => {
    discoveryStops.splice(0).forEach((stop) => stop());
    if (discoveryExpiry !== undefined) dependencies.cancel(discoveryExpiry);
    discoveryExpiry = undefined;
  };
  const releaseOwner = () => {
    ownerStops.splice(0).forEach((stop) => stop());
    for (const leaf of originals.keys()) restore(leaf);
    owner = undefined;
    ownerAppId = 0;
  };
  const refreshOwner = () => {
    if (!owner) return;
    if (!dependencies.visible(owner) || dependencies.ownerAppId(owner) !== ownerAppId || !dependencies.eligible(ownerAppId)) {
      releaseOwner();
      return;
    }
    const leaves = Array.from(owner.querySelectorAll<HTMLElement>(selector(classes.description)));
    for (const leaf of originals.keys()) if (!leaves.includes(leaf)) restore(leaf);
    for (const leaf of leaves) {
      if (!originals.has(leaf)) originals.set(leaf, {
        marker: leaf.getAttribute(MARKER),
        spacing: leaf.style.getPropertyValue("white-space"),
        priority: leaf.style.getPropertyPriority("white-space"),
      });
      if (leaf.getAttribute(MARKER) !== String(ownerAppId)) leaf.setAttribute(MARKER, String(ownerAppId));
      if (leaf.style.getPropertyValue("white-space") !== "pre-wrap" || leaf.style.getPropertyPriority("white-space") !== "important") leaf.style.setProperty("white-space", "pre-wrap", "important");
    }
  };
  const discover = () => {
    if (disposed) return;
    const route = dependencies.route();
    const appId = gameDetailAppIdFromPath(route);
    if (!isCurrentGameInfoRoute(route, appId) || !dependencies.eligible(appId)) return;
    for (const doc of dependencies.documents()) {
      const matched = Array.from(doc.querySelectorAll<HTMLElement>(selector(classes.owner))).find((candidate) => dependencies.ownerAppId(candidate) === appId && dependencies.visible(candidate));
      if (!matched) continue;
      releaseOwner();
      owner = matched;
      ownerAppId = appId;
      stopDiscovery();
      ownerStops.push(dependencies.observe(matched, refreshOwnerAndRecover));
      if (dependencies.visibility) ownerStops.push(dependencies.visibility(matched, refreshOwnerAndRecover));
      refreshOwner();
      return;
    }
  };
  const reconcile = () => {
    stopDiscovery();
    refreshOwner();
    const route = dependencies.route();
    const appId = gameDetailAppIdFromPath(route);
    if (!isCurrentGameInfoRoute(route, appId) || !dependencies.eligible(appId)) return;
    if (owner && ownerAppId === appId) return;
    discover();
    if (owner && ownerAppId === appId) return;
    // Discovery exists only while entering this exact Game Info surface. It
    // expires even if Steam never mounts the expected owner.
    for (const doc of dependencies.documents()) if (doc.body) discoveryStops.push(dependencies.observe(doc.body, discover));
    discoveryExpiry = dependencies.schedule(stopDiscovery, 2000);
  };
  const refreshOwnerAndRecover = () => {
    const previousAppId = ownerAppId;
    refreshOwner();
    if (!disposed && !owner && previousAppId > 0 &&
        isCurrentGameInfoRoute(dependencies.route(), previousAppId) && dependencies.eligible(previousAppId)) {
      // Steam can replace the entire Game Info owner without changing route.
      // Reuse the bounded entry discovery rather than leaving a document-wide
      // observer resident after the old owner disappears.
      reconcile();
    }
  };
  const unlisten = dependencies.listen(reconcile);
  unpatchers.push(() => {
    disposed = true;
    unlisten();
    stopDiscovery();
    releaseOwner();
  });
  reconcile();
};
