import { currentRoutePath, gameDetailAppIdFromPath, getOverview, isCurrentGameInfoRoute, isNativeNonSteamShortcut, metadataCache, subscribeCompatibilityRevision, subscribeMetadataMatchChanges, type Unpatch } from "./core";
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
  revisions: (callback: () => void) => Unpatch;
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
    revisions: (callback) => {
      const stops = [subscribeCompatibilityRevision(callback), subscribeMetadataMatchChanges(callback)];
      return () => stops.forEach((stop) => stop());
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
  type Owner = {
    appId: number;
    stops: Unpatch[];
    originals: Map<HTMLElement, { marker: string | null; spacing: string; priority: string }>;
  };
  const owners = new Map<HTMLElement, Owner>();
  let discoveryStops: Unpatch[] = [];
  let discoveryExpiry: number | undefined;
  const restore = (record: Owner, leaf: HTMLElement) => {
    const original = record.originals.get(leaf);
    if (!original) return;
    if (original.marker === null) leaf.removeAttribute(MARKER);
    else leaf.setAttribute(MARKER, original.marker);
    if (original.spacing) leaf.style.setProperty("white-space", original.spacing, original.priority);
    else leaf.style.removeProperty("white-space");
    record.originals.delete(leaf);
  };
  const stopDiscovery = () => {
    discoveryStops.splice(0).forEach((stop) => stop());
    if (discoveryExpiry !== undefined) dependencies.cancel(discoveryExpiry);
    discoveryExpiry = undefined;
  };
  const releaseOwner = (owner: HTMLElement, record: Owner) => {
    record.stops.splice(0).forEach((stop) => stop());
    for (const leaf of record.originals.keys()) restore(record, leaf);
    owners.delete(owner);
  };
  const refreshOwner = (owner: HTMLElement, record: Owner) => {
    if (!dependencies.visible(owner) || dependencies.ownerAppId(owner) !== record.appId || !dependencies.eligible(record.appId)) {
      releaseOwner(owner, record);
      return;
    }
    const leaves = Array.from(owner.querySelectorAll<HTMLElement>(selector(classes.description)));
    for (const leaf of record.originals.keys()) if (!leaves.includes(leaf)) restore(record, leaf);
    for (const leaf of leaves) {
      if (!record.originals.has(leaf)) record.originals.set(leaf, {
        marker: leaf.getAttribute(MARKER),
        spacing: leaf.style.getPropertyValue("white-space"),
        priority: leaf.style.getPropertyPriority("white-space"),
      });
      if (leaf.getAttribute(MARKER) !== String(record.appId)) leaf.setAttribute(MARKER, String(record.appId));
      if (leaf.style.getPropertyValue("white-space") !== "pre-wrap" || leaf.style.getPropertyPriority("white-space") !== "important") leaf.style.setProperty("white-space", "pre-wrap", "important");
    }
  };
  const hasCurrentOwner = (appId: number) => Array.from(owners.values()).some((record) => record.appId === appId);
  const discover = () => {
    if (disposed) return;
    const route = dependencies.route();
    const appId = gameDetailAppIdFromPath(route);
    if (!isCurrentGameInfoRoute(route, appId) || !dependencies.eligible(appId)) return;
    for (const doc of dependencies.documents()) {
      const matched = Array.from(doc.querySelectorAll<HTMLElement>(selector(classes.owner))).find((candidate) => dependencies.ownerAppId(candidate) === appId && dependencies.visible(candidate));
      if (!matched) continue;
      stopDiscovery();
      // Each outgoing owner keeps its formatting for its own visible DOM lifetime.
      if (!owners.has(matched)) {
        const record: Owner = { appId, stops: [], originals: new Map() };
        owners.set(matched, record);
        const refresh = () => {
          if (disposed) return;
          refreshOwner(matched, record);
          if (!owners.has(matched) && isCurrentGameInfoRoute(dependencies.route(), appId) && dependencies.eligible(appId)) reconcile();
        };
        record.stops.push(dependencies.observe(matched, refresh));
        if (dependencies.visibility) record.stops.push(dependencies.visibility(matched, refresh));
        refreshOwner(matched, record);
      }
      return;
    }
  };
  const reconcile = () => {
    if (disposed) return;
    stopDiscovery();
    for (const [owner, record] of owners) refreshOwner(owner, record);
    const route = dependencies.route();
    const appId = gameDetailAppIdFromPath(route);
    if (!isCurrentGameInfoRoute(route, appId) || !dependencies.eligible(appId)) return;
    if (hasCurrentOwner(appId)) return;
    discover();
    if (hasCurrentOwner(appId)) return;
    // Discovery exists only while entering this exact Game Info surface. It
    // expires even if Steam never mounts the expected owner.
    for (const doc of dependencies.documents()) if (doc.body) discoveryStops.push(dependencies.observe(doc.body, discover));
    discoveryExpiry = dependencies.schedule(stopDiscovery, 2000);
  };
  const unlisten = dependencies.listen(reconcile);
  const unsubscribeRevisions = dependencies.revisions(reconcile);
  unpatchers.push(() => {
    disposed = true;
    unlisten();
    unsubscribeRevisions();
    stopDiscovery();
    for (const [owner, record] of owners) releaseOwner(owner, record);
  });
  reconcile();
};
