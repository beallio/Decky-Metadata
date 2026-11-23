import { Fragment, cloneElement, createElement, isValidElement, useEffect, useState } from "react";
import type { ElementType, ReactElement, ReactNode } from "react";
import type { CompatDisplayHook } from "./compatDisplay";
import { findSteamCompatDisplayHook, makeOwnedCompatIndicator } from "./compatDisplay";
import { frontendLog } from "../backend";
import type { MetadataData } from "../types";
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../types";
import {
  effectiveCompatibilityCategory,
  refreshCompatibilitySurfaces,
} from "./metadataPatch";
import {
  compatibilityRevisionSnapshot,
  getOverview,
  isNativeNonSteamShortcut,
  metadataCache,
  safeAfterPatch,
  subscribeCompatibilityRevision,
  Unpatch,
} from "./core";
import { findSteamUiDocumentMatch, steamUiDocuments, steamUiWindow } from "./steamUiHost";
import type { SteamUiDocument } from "./steamUiHost";
import {
  findLiveModuleChild,
  findSteamModuleBySource,
  findSteamModulesBySource,
} from "./steamUiModules";

const DECK_DISPLAY = 1;

type ModuleFinder = (predicate: (module: any) => any) => any;
type ModuleSourceFinder = (fragments: string[]) => any;
type ModuleSourceCandidatesFinder = (fragments: string[]) => any[];
type CompatibilityMetadata = Pick<MetadataData, "deck_compat_override" | "deck_compat_category" | "steam_appid">;

const HOME_INDICATOR_KEY = "decky-metadata-compatibility-home";
const GRID_INDICATOR_KEY = "decky-metadata-compatibility-grid";

const reactFiberFor = (element: unknown) => {
  try {
    const key = Object.keys(element as object).find((name) =>
      name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$")
    );
    return key ? (element as Record<string, unknown>)[key] : undefined;
  } catch {
    return undefined;
  }
};

const reactRootFor = (document: { querySelectorAll?: (selector: string) => Iterable<unknown> } | undefined) => {
  try {
    for (const element of document?.querySelectorAll?.("*") ?? []) {
      let fiber = reactFiberFor(element);
      for (let depth = 0; fiber && typeof fiber === "object" && "return" in fiber && fiber.return && depth < 20000; depth += 1) {
        fiber = fiber.return;
      }
      if (fiber) return fiber;
    }
  } catch {
    // React DOM discovery is optional.
  }
  return undefined;
};

const steamUiCardDocument = () => {
  return findSteamUiDocumentMatch((document) =>
    document.querySelector("[data-id]") ? document : undefined
  );
};

const currentLibraryRoute = () => {
  const host = steamUiWindow() as any;
  const globalHost = globalThis as any;
  return host.SteamUIStore?.m_WindowStore?.GamepadUIMainWindowInstance?.m_history?.location?.pathname ??
    host.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location?.pathname ??
    globalHost.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location?.pathname ??
    globalHost.window?.location?.pathname ??
    "";
};

const isLibraryGridRoute = (route: unknown) =>
  typeof route === "string" && /(?:^|\/)library\/(?!home(?:\/|$)).*/.test(route.split(/[?#]/, 1)[0]);

const hasOwn = (value: unknown, key: PropertyKey) =>
  value !== null && (typeof value === "object" || typeof value === "function") &&
  Object.prototype.hasOwnProperty.call(value, key);

export type LibraryCompatibilityIndicatorDependencies = {
  findModuleChild: ModuleFinder;
  findModuleBySource: ModuleSourceFinder;
  findModulesBySource: ModuleSourceCandidatesFinder;
  patchHomeRenderer: (module: any, handler: (args: any[], output: any) => any) => Unpatch;
  patchGridRenderer: (component: any, handler: (args: any[], output: any) => any) => Unpatch;
  refreshCompatibilitySurfaces: () => void;
  scheduleRetry: (callback: () => void, delayMs: number) => number;
  cancelRetry: (retryId: number) => void;
  retryIntervalMs: number;
  maxResolutionAttempts: number;
  homeDiscoveryIntervalMs: number;
  maxHomeDiscoveryAttempts: number;
  maxGridDiscoveryAttempts: number;
  getCardDocument: () => any;
  getSteamUiDocuments: () => SteamUiDocument[];
  getCurrentRoute: () => string;
  findCompatDisplayHook?: () => CompatDisplayHook | null;
  getOverview: (appId: number) => any;
  metadataForApp: (appId: number) => MetadataData | undefined;
  isNativeNonSteamShortcut: (overview: any) => boolean;
  useCompatibilityRevision: (subscribe: (listener: () => void) => Unpatch) => void;
};

type HomeCompatibilityTargets = {
  home: any;
  carousel: any;
  indicator: ElementType;
  homeClassName: string;
  stable: boolean;
};

type GridCompatibilityTargets = {
  grid: any;
  indicator: ElementType;
  gridIconsClassName: string;
  gridIndicatorClassName: string;
  stable: boolean;
};

type LibraryCompatibilityTargets = {
  home?: HomeCompatibilityTargets;
  grid?: GridCompatibilityTargets;
};

type MountedHomeGrid = {
  original: any;
  wrapper: any;
  discovered: boolean;
  needsRecompute: boolean;
  restore: () => boolean;
};

const findOneSourceExport = (modules: any[], predicate: (module: any) => boolean): any | undefined => {
  const matches = modules.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
};
const findEquivalentSourceExport = (
  modules: any[],
  predicate: (module: any) => boolean,
  keys: string[],
): any | undefined => {
  const matches = modules.filter(predicate);
  if (matches.length === 0) return undefined;
  const first = matches[0];
  return matches.every((module) => keys.every((key) => module[key] === first[key]))
    ? first
    : undefined;
};

/**
 * Return a category only when a rendered card is the exact native shortcut
 * and Steam has a positive status to display. Category 0 is Steam's native
 * no-status state, so it deliberately does not fabricate an Unknown badge.
 */
export const resolveLibraryCompatibilityIndicator = ({
  renderedAppId,
  overview,
  metadata,
  globalDefault,
  globalScope,
  isNativeNonSteamShortcut: isNativeShortcut,
}: {
  renderedAppId: number;
  overview: any;
  metadata: CompatibilityMetadata | undefined;
  globalDefault?: DeckCompatibilityCategory | null;
  globalScope?: CompatibilityDefaultScope;
  isNativeNonSteamShortcut: (overview: any) => boolean;
}) => {
  if (Number(overview?.appid) !== Number(renderedAppId) || !isNativeShortcut(overview)) return null;
  const category = effectiveCompatibilityCategory(
    metadata,
    globalDefault,
    globalScope,
  );
  return category === null || category === 0 ? null : category;
};

type CompatibilityCardProps = {
  children?: ReactNode;
  className?: string;
};

const childrenOf = (element: ReactElement<CompatibilityCardProps>): ReactNode[] => {
  const children = element.props.children;
  return Array.isArray(children) ? children : [children];
};

const containsIndicator = (children: ReactNode[], predicate: (element: ReactElement) => boolean): boolean =>
  children.some((child) => isValidElement<CompatibilityCardProps>(child) && (
    predicate(child) || (child.type === Fragment && containsIndicator(childrenOf(child), predicate))
  ));

const normalizeIndicators = (children: ReactNode[], nativeIndicator: ElementType, indicator: ElementType, key: string) => {
  const nativePresent = containsIndicator(children, (child) => child.type === nativeIndicator && child.key !== key);
  let keptOwned = false;
  const normalize = (nodes: ReactNode[]): ReactNode[] => nodes.flatMap((child) => {
    if (!isValidElement<CompatibilityCardProps>(child)) return [child];
    if (child.key === key) {
      if (nativePresent || keptOwned || child.type !== indicator) return [];
      keptOwned = true;
    }
    if (child.type === Fragment) {
      const original = childrenOf(child);
      const cleaned = normalize(original);
      if (cleaned.length !== original.length || cleaned.some((node, index) => node !== original[index])) return [cloneElement(child, { children: cleaned })];
    }
    return [child];
  });
  return normalize(children);
};
const hasIndicator = (children: ReactNode[], nativeIndicator: ElementType, indicator: ElementType, key: string) =>
  containsIndicator(children, (child) => child.type === nativeIndicator || (child.type === indicator && child.key === key));

const unchangedChildren = (children: ReactNode[], original: ReactNode[]) =>
  children.length === original.length && children.every((child, index) => child === original[index]);

export function decorateCarouselCompatibility(
  output: ReactElement<CompatibilityCardProps>,
  nativeIndicator: ElementType,
  indicator: ElementType,
  className: string,
  overview?: unknown,
): ReactElement<CompatibilityCardProps>;
export function decorateCarouselCompatibility<T>(
  output: T,
  nativeIndicator: ElementType,
  indicator: ElementType,
  className: string,
  overview?: unknown,
): T;
export function decorateCarouselCompatibility<T>(
  output: T,
  nativeIndicator: ElementType,
  indicator: ElementType,
  className: string,
  overview?: unknown,
): T {
  if (!isValidElement<CompatibilityCardProps>(output)) return output;
  const originalChildren = childrenOf(output);
  const children = normalizeIndicators(originalChildren, nativeIndicator, indicator, HOME_INDICATOR_KEY);
  if (hasIndicator(children, nativeIndicator, indicator, HOME_INDICATOR_KEY)) return (unchangedChildren(children, originalChildren) ? output : cloneElement(output, { children })) as T;

  // Steam's GameCapsule places compatibility after its in-library marker. A
  // shortcut suppresses that native slot with `false`; replace only that
  // confirmed placeholder. If Steam changes the shape, insert our indicator
  // without discarding another child.
  const nativeCompatibilitySlot = children[2];
  const remainingChildren = nativeCompatibilitySlot === false
    ? children.slice(3)
    : children.slice(2);
  const decorated = cloneElement(output, {
    children: [
      ...children.slice(0, 2),
      createElement(indicator, { key: HOME_INDICATOR_KEY, overview, className }),
      ...remainingChildren,
    ],
  });
  // `isValidElement` proves T is this React element while preserving callers' concrete type.
  return decorated as unknown as T;
}

const decorateGridIconRow = (
  node: ReactNode,
  nativeIndicator: ElementType,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview: unknown,
  forcedDisplay?: number,
): ReactNode => {
  if (!isValidElement<CompatibilityCardProps>(node)) return node;
  if (node.props.className === iconRowClassName) {
    const originalChildren = childrenOf(node);
    const children = normalizeIndicators(originalChildren, nativeIndicator, indicator, GRID_INDICATOR_KEY);
    if (hasIndicator(children, nativeIndicator, indicator, GRID_INDICATOR_KEY)) return unchangedChildren(children, originalChildren) ? node : cloneElement(node, { children });
    return cloneElement(node, {
      children: [
        ...children,
        createElement(indicator, {
          key: GRID_INDICATOR_KEY,
          overview,
          className: indicatorClassName,
          forcedDisplay,
        }),
      ],
    });
  }

  const originalChildren = node.props.children;
  const children = childrenOf(node);
  const decoratedChildren = children.map((child) =>
    decorateGridIconRow(child, nativeIndicator, indicator, iconRowClassName, indicatorClassName, overview, forcedDisplay)
  );
  if (decoratedChildren.every((child, index) => child === children[index])) return node;
  return cloneElement(node, {
    children: Array.isArray(originalChildren) ? decoratedChildren : decoratedChildren[0],
  });
};

export function decorateGridCompatibility(
  output: ReactElement<CompatibilityCardProps>,
  nativeIndicator: ElementType,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview?: unknown,
  forcedDisplay?: number,
): ReactElement<CompatibilityCardProps>;
export function decorateGridCompatibility<T>(
  output: T,
  nativeIndicator: ElementType,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview?: unknown,
  forcedDisplay?: number,
): T;
export function decorateGridCompatibility<T>(
  output: T,
  nativeIndicator: ElementType,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview?: unknown,
  forcedDisplay?: number,
): T {
  const decorated = decorateGridIconRow(
    output as ReactNode,
    nativeIndicator,
    indicator,
    iconRowClassName,
    indicatorClassName,
    overview,
    forcedDisplay,
  );
  return decorated as unknown as T;
}

const resolveTargets = (
  dependencies: Pick<
    LibraryCompatibilityIndicatorDependencies,
    "findModuleChild" | "findModuleBySource" | "findModulesBySource" | "getCardDocument" | "getSteamUiDocuments"
  >,
  discoverGrid: boolean,
  discoverHomeGrid: boolean,
): LibraryCompatibilityTargets => {
  const findChild = (predicate: (module: any) => any) => {
    try {
      return dependencies.findModuleChild(predicate);
    } catch {
      return undefined;
    }
  };
  const carouselModule = findChild((module) => {
    if (!module || typeof module !== "object") return undefined;
    return typeof module._ === "function" &&
      typeof module.g === "function" &&
      module._.toString().includes("GameCapsule unable to render") &&
      module._.toString().includes("#LibraryHome_GameCarousel_ContextMenu") &&
      module._.toString().includes("gamepadgamecapsule")
      ? module
      : undefined;
  }) ?? dependencies.findModuleBySource([
    "GameCapsule unable to render",
    "#LibraryHome_GameCarousel_ContextMenu",
  ]);
  const homeModule = findChild((module) =>
    typeof module?.Xd?.render === "function" && module.Xd.render.toString().includes("VBC_")
      ? module
      : undefined
  ) ?? dependencies.findModuleBySource(["VBC_"]);
  const gridModule = findChild((module) =>
    typeof module?.TK?.type === "function" &&
    typeof module?.hF === "function" &&
    typeof module?.Mf === "function" &&
    typeof module?.eL === "function" &&
    typeof module?.Kt === "function" &&
    typeof module?.aT === "number" &&
    typeof module?.dC === "number" &&
    typeof module?.UT === "number" &&
    typeof module?.lS === "number" &&
    typeof module?.oG === "number"
      ? module
      : undefined
  ) ?? dependencies.findModuleBySource([
    "eForceHWCompatDisplay",
    "bHideCompatIcons",
    "LibraryItemBox",
  ]);
  const hasWritableCallableMethod = (target: unknown, methodName: string) => {
    if (!target || (typeof target !== "object" && typeof target !== "function")) return false;
    const descriptor = Object.getOwnPropertyDescriptor(target, methodName);
    return typeof descriptor?.value === "function" && descriptor.writable === true;
  };
  const sourceOf = (value: unknown) => typeof value === "function" ? value.toString() : "";
  const sourceOfMethod = (target: unknown, methodName: string) =>
    target && (typeof target === "object" || typeof target === "function")
      ? sourceOf(Reflect.get(target, methodName))
      : "";
  const findOneExport = (module: unknown, predicate: (key: string, value: unknown) => boolean) => {
    if (!module || typeof module !== "object" || Array.isArray(module)) return undefined;
    const matches: Array<[string, unknown]> = [];
    for (const key of Object.keys(module)) {
      try {
        const value = Reflect.get(module, key);
        if (predicate(key, value)) matches.push([key, value]);
      } catch {
        // A lazy module getter is not a target.
      }
    }
    return matches.length === 1 ? matches[0] : undefined;
  };
  const isCarouselRenderer = (value: unknown) => {
    const source = sourceOf(value);
    return source.includes("GameCapsule unable to render") &&
      source.includes("#LibraryHome_GameCarousel_ContextMenu");
  };
  const carouselByName: [string, unknown] | undefined =
    typeof carouselModule?._ === "function" && isCarouselRenderer(carouselModule._)
      ? ["_", carouselModule._]
      : undefined;
  const carouselEntry = carouselByName ?? findOneExport(carouselModule, (_key, value) =>
    isCarouselRenderer(value)
  );
  const isCompatIndicator = (value: unknown) => {
    const source = sourceOf(value);
    return source.includes("display") &&
      source.includes("overview") &&
      source.includes("platforms") &&
      source.includes("className") &&
      source.includes("steam_deck_compat_category") &&
      source.includes("steam_os_compat_category") &&
      source.includes("steam_machine_compat_category") &&
      source.includes("steam_frame_compat_category");
  };
  const indicator: unknown = carouselByName && typeof carouselModule?.g === "function"
    ? carouselModule.g
    : findOneExport(carouselModule, (_key, value) => isCompatIndicator(value))?.[1];
  const homeByName = homeModule?.Xd;
  const home: unknown = hasWritableCallableMethod(homeByName, "render") &&
    sourceOfMethod(homeByName, "render").includes("VBC_")
    ? homeByName
    : findOneExport(homeModule, (_key, value) =>
      hasWritableCallableMethod(value, "render") && sourceOfMethod(value, "render").includes("VBC_")
    )?.[1];
  const homeStable = home !== undefined;
  const gridByName = gridModule?.TK;
  let grid: unknown = hasWritableCallableMethod(gridByName, "type")
    ? gridByName
    : findOneExport(gridModule, (_key, value) => {
      const source = sourceOfMethod(value, "type");
      return hasWritableCallableMethod(value, "type") &&
        source.includes("eForceHWCompatDisplay") &&
        source.includes("bHideCompatIcons") &&
        source.includes("LibraryItemBox");
    })?.[1];
  const gridStable = grid !== undefined;
  if (!grid && (discoverGrid || discoverHomeGrid)) {
    let document: any;
    try {
      document = dependencies.getCardDocument();
    } catch {
      document = undefined;
    }
    let cardRoots: any[] = [];
    try {
      const cards = Array.from(document?.querySelectorAll?.("[data-id]") ?? []).slice(0, 64);
      cardRoots = cards.map(reactFiberFor).filter(Boolean);
    } catch {
      cardRoots = [];
    }
    const exported = (module: unknown, candidate: unknown) => {
      if (!module || typeof module !== "object" || Array.isArray(module)) return false;
      return Object.keys(module).some((name) => {
        try {
          return Reflect.get(module, name) === candidate;
        } catch {
          return false;
        }
      });
    };
    let otherModules: any[] = [];
    let scannedOtherModules = false;
    const isConfirmedGridExport = (candidate: unknown) => {
      if (exported(carouselModule, candidate)) return true;
      if (!scannedOtherModules) {
        scannedOtherModules = true;
        try {
          otherModules = dependencies.findModulesBySource([]);
        } catch {
          otherModules = [];
        }
      }
      return otherModules.some((module) => exported(module, candidate));
    };
    const findGridTarget = (fiber: any, includeHome: boolean) => {
      try {
        const props = fiber.memoizedProps;
        const appId = Number(props?.app?.appid);
        if (!Number.isFinite(appId) || appId <= 0) return undefined;
        const homeMemo = fiber.elementType;
        if (
          includeHome &&
          hasOwn(props, "bShortLayout") &&
          homeMemo !== carouselEntry?.[1] &&
          homeMemo &&
          typeof homeMemo === "object" &&
          hasWritableCallableMethod(homeMemo, "type") &&
          exported(carouselModule, homeMemo)
        ) {
          return homeMemo;
        }
        if (!discoverGrid || !hasOwn(props, "eForceHWCompatDisplay")) return undefined;
        for (const candidate of [fiber.elementType, fiber.type]) {
          if (
            candidate &&
            typeof candidate === "object" &&
            hasWritableCallableMethod(candidate, "type") &&
            isConfirmedGridExport(candidate)
          ) {
            return candidate;
          }
        }
      } catch {
        // A stale fiber is ignored during this bounded discovery attempt.
      }
      return undefined;
    };
    const scanFibers = (roots: any[], limit: number, includeHome: boolean) => {
      const pending = [...roots];
      const seen = new Set<any>();
      let visited = 0;
      while (pending.length > 0 && visited < limit) {
        const fiber = pending.pop();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);
        visited += 1;
        const candidate = findGridTarget(fiber, includeHome);
        if (candidate) return candidate;
        if (fiber.child) pending.push(fiber.child);
        if (fiber.sibling) pending.push(fiber.sibling);
      }
      return undefined;
    };
    grid = scanFibers(cardRoots, 512, discoverHomeGrid || discoverGrid);
    if (!grid && discoverGrid) {
      const roots = dependencies.getSteamUiDocuments()
        .map(reactRootFor)
        .filter(Boolean);
      // shortcut: tiles mounted before a grid-route discovery keep the old renderer until they remount (scroll/revisit); Home-time discovery normally patches first.
      grid = scanFibers(roots, 20000, false);
    }
  }
  const homeStyles = findChild((module) =>
    typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string" ? module : undefined
  ) ?? findOneSourceExport(dependencies.findModulesBySource(["DeckCompat", "GameCapsule"]), (module) =>
    typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string"
  );
  const gridStyles = findChild((module) =>
    typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string" ? module : undefined
  ) ?? findEquivalentSourceExport(
    dependencies.findModulesBySource(["LibraryItemIcons", "SteamDeckCompatIcon"]),
    (module) => typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string",
    ["LibraryItemIcons", "SteamDeckCompatIcon"],
  );
  const isElementType = (value: unknown): value is ElementType => typeof value === "function";
  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;
  const nativeIndicator = isElementType(indicator) ? indicator : undefined;
  const commonResolved = Boolean(carouselModule && carouselEntry && nativeIndicator);
  const homeResolved = commonResolved &&
    !Array.isArray(homeModule) &&
    home !== grid &&
    hasWritableCallableMethod(home, "render") &&
    isNonEmptyString(homeStyles?.DeckCompat) &&
    isNonEmptyString(homeStyles?.GameCapsule);
  const gridResolved = commonResolved &&
    !Array.isArray(gridModule) &&
    hasWritableCallableMethod(grid, "type") &&
    isNonEmptyString(gridStyles?.LibraryItemIcons) &&
    isNonEmptyString(gridStyles?.SteamDeckCompatIcon);
  return {
    home: homeResolved ? {
      home,
      carousel: carouselEntry![1],
      indicator: nativeIndicator!,
      homeClassName: homeStyles!.DeckCompat,
      stable: homeStable,
    } : undefined,
    grid: gridResolved ? {
      grid,
      indicator: nativeIndicator!,
      gridIconsClassName: gridStyles!.LibraryItemIcons,
      gridIndicatorClassName: gridStyles!.SteamDeckCompatIcon,
      stable: gridStable,
    } : undefined,
  };
};

const defaultDependencies: LibraryCompatibilityIndicatorDependencies = {
  findModuleChild: findLiveModuleChild,
  findModuleBySource: findSteamModuleBySource,
  findModulesBySource: findSteamModulesBySource,
  patchHomeRenderer: (component, handler) => safeAfterPatch(component, "render", handler).unpatch,
  patchGridRenderer: (component, handler) => safeAfterPatch(component, "type", handler).unpatch,
  refreshCompatibilitySurfaces,
  scheduleRetry: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelRetry: (retryId) => window.clearTimeout(retryId),
  retryIntervalMs: 500,
  maxResolutionAttempts: 240,
  homeDiscoveryIntervalMs: 500,
  maxHomeDiscoveryAttempts: 60,
  maxGridDiscoveryAttempts: 60,
  getCardDocument: steamUiCardDocument,
  getSteamUiDocuments: steamUiDocuments,
  getCurrentRoute: currentLibraryRoute,
  getOverview,
  metadataForApp: (appId) => metadataCache[String(appId)],
  isNativeNonSteamShortcut,
  useCompatibilityRevision: (subscribe) => {
    const [, setRevision] = useState(compatibilityRevisionSnapshot);
    useEffect(() => {
      const update = () => setRevision(compatibilityRevisionSnapshot());
      const unsubscribe = subscribe(update);
      update();
      return unsubscribe;
    }, [subscribe]);
  },
};

const reportInstalled = (resolutionAttempts: number) => {
  try {
    void Promise.resolve(frontendLog(
      "patch",
      "library compatibility indicators installed",
      { resolutionAttempts },
      "info",
    )).catch(() => undefined);
  } catch {
    // Reporting must not alter renderer installation.
  }
};

/**
 * Replace an exact carousel element with an owned wrapper. Unlike Decky's
 * createReactTreePatcher this does not patch a component type in place, so a
 * cached card cannot retain a plugin closure after teardown.
 */
const wrapCarouselElement = (node: any, carousel: any, wrapper: any): any => {
  if (!isValidElement(node)) return node;
  const element = node as any;
  if (carousel(element.type)) {
    return createElement(wrapper(element.type), { ...element.props, key: element.key });
  }

  const originalChildren = element.props?.children;
  if (originalChildren === undefined) return node;
  const children = childrenOf(element);
  const wrappedChildren = children.map((child) => wrapCarouselElement(child, carousel, wrapper));
  if (wrappedChildren.every((child, index) => child === children[index])) return node;
  return cloneElement(element, {
    children: Array.isArray(originalChildren) ? wrappedChildren : wrappedChildren[0],
  });
};

const assignRef = (ref: any, value: any) => {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref && typeof ref === "object") {
    ref.current = value;
  }
};

/**
 * Add compatibility indicators at the two native Library card renderers.
 * The patch calls only those renderers. It never walks MobX state.
 */
export const installLibraryCompatibilityIndicators = (
  unpatchers: Unpatch[],
  provided: Partial<LibraryCompatibilityIndicatorDependencies> = {},
) => {
  const dependencies = { ...defaultDependencies, ...provided };
  let active = true;
  let homeUnpatch: Unpatch | undefined;
  let gridUnpatch: Unpatch | undefined;
  let homeRetryId: number | undefined;
  let gridRetryId: number | undefined;
  let routeRetryId: number | undefined;
  let homeDiscoveryRetryId: number | undefined;
  let homeCacheUnsubscribe: Unpatch | undefined;
  const indicatorUnsubscribers = new Set<Unpatch>();
  const mountedHomeCarousels = new Set<any>();
  const mountedHomeGrids = new Map<any, MountedHomeGrid>();
  const mountedHomeCarouselTypes = new Set<any>();
  const mountedHomeCarouselWrappers = new Map<any, any>();
  const homeRefCallbacks = new Map<any, (instance: any) => void>();
  let homeResolutionAttempts = 0;
  let gridResolutionAttempts = 0;
  let homeDiscoveryAttempts = 0;
  let gridRouteDiscoveryAttempts = 0;
  let compatHookResolved = false;
  let compatHook: CompatDisplayHook | null = null;
  let lastObservedRoute = "";
  let reportedInstalled = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    if (homeRetryId !== undefined) dependencies.cancelRetry(homeRetryId);
    if (gridRetryId !== undefined) dependencies.cancelRetry(gridRetryId);
    if (routeRetryId !== undefined) dependencies.cancelRetry(routeRetryId);
    homeRetryId = undefined;
    gridRetryId = undefined;
    routeRetryId = undefined;
    if (homeDiscoveryRetryId !== undefined) {
      dependencies.cancelRetry(homeDiscoveryRetryId);
      homeDiscoveryRetryId = undefined;
    }
    const homeCleanup = homeUnpatch;
    const gridCleanup = gridUnpatch;
    homeUnpatch = undefined;
    gridUnpatch = undefined;
    const cacheCleanup = homeCacheUnsubscribe;
    homeCacheUnsubscribe = undefined;
    try {
      cacheCleanup?.();
    } catch {
      // Continue teardown if Steam has already removed the subscription.
    }
    mountedHomeCarousels.clear();
    mountedHomeGrids.forEach(({ restore }, grid) => {
      try {
        if (restore()) {
          grid.recomputeGridSize?.();
        }
      } catch {
        // A disposed virtual grid does not need an additional cleanup pass.
      }
    });
    mountedHomeGrids.clear();
    mountedHomeCarouselTypes.clear();
    mountedHomeCarouselWrappers.clear();
    homeRefCallbacks.clear();
    indicatorUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // Continue releasing the remaining mounted indicator subscriptions.
      }
    });
    indicatorUnsubscribers.clear();
    try {
      homeCleanup?.();
    } catch {
      // A changed Steam target must not keep the grid patch alive.
    }
    try {
      gridCleanup?.();
    } catch {
      // The aggregate Steam cleanup continues after one target changed.
    }
  };
  // Register before resolving lazy Library modules so dismount always cancels
  // an outstanding retry, even when no renderer has been patched yet.
  unpatchers.push(cleanup);

  const subscribeIndicator = (listener: () => void): Unpatch => {
    if (!active) return () => undefined;
    let subscribed = true;
    const unsubscribe = subscribeCompatibilityRevision(() => {
      if (active) listener();
    });
    indicatorUnsubscribers.add(unsubscribe);
    return () => {
      if (!subscribed) return;
      subscribed = false;
      indicatorUnsubscribers.delete(unsubscribe);
      unsubscribe();
    };
  };
  const scheduleResolutionRetry = (surface: "home" | "grid") => {
    const installed = surface === "home" ? homeUnpatch !== undefined : gridUnpatch !== undefined;
    const attempts = surface === "home" ? homeResolutionAttempts : gridResolutionAttempts;
    const retryId = surface === "home" ? homeRetryId : gridRetryId;
    if (!active || installed || retryId !== undefined || attempts >= dependencies.maxResolutionAttempts) return;
    const scheduled = dependencies.scheduleRetry(() => {
      if (surface === "home") homeRetryId = undefined;
      else gridRetryId = undefined;
      installWhenTargetsResolve(surface);
    }, dependencies.retryIntervalMs);
    if (surface === "home") homeRetryId = scheduled;
    else gridRetryId = scheduled;
  };
  const cancelResolutionRetry = (surface: "home" | "grid") => {
    const retryId = surface === "home" ? homeRetryId : gridRetryId;
    if (retryId !== undefined) dependencies.cancelRetry(retryId);
    if (surface === "home") homeRetryId = undefined;
    else gridRetryId = undefined;
  };
  const installWhenTargetsResolve = (surface?: "home" | "grid") => {
    if (!active || (homeUnpatch && gridUnpatch)) return;
    if (!surface || surface === "home") homeResolutionAttempts += 1;
    if (!surface || surface === "grid") gridResolutionAttempts += 1;
    let gridRoute = false;
    try {
      gridRoute = isLibraryGridRoute(dependencies.getCurrentRoute());
    } catch {
      gridRoute = false;
    }
    const discoverGrid = gridRoute && gridRouteDiscoveryAttempts < dependencies.maxGridDiscoveryAttempts;
    if (discoverGrid) gridRouteDiscoveryAttempts += 1;
    const discoverHomeGrid = !gridRoute && gridResolutionAttempts <= dependencies.maxResolutionAttempts;
    let targets: LibraryCompatibilityTargets;
    try {
      targets = resolveTargets(dependencies, discoverGrid, discoverHomeGrid);
    } catch {
      targets = {};
    }
    if (!targets.home && !targets.grid) {
      scheduleResolutionRetry("home");
      scheduleResolutionRetry("grid");
      return;
    }
    const homeTargets = targets.home;
    const gridTargets = targets.grid;
    if (!compatHookResolved) {
      compatHookResolved = true;
      compatHook = dependencies.findCompatDisplayHook
        ? dependencies.findCompatDisplayHook()
        : findSteamCompatDisplayHook(dependencies.findModulesBySource);
    }
    const sharedOwned = homeTargets && gridTargets && homeTargets.stable === gridTargets.stable
      ? makeOwnedCompatIndicator(
        homeTargets.indicator,
        compatHook,
        homeTargets.stable ? DECK_DISPLAY : null,
      )
      : undefined;
    const homeOwned = homeTargets
      ? sharedOwned ?? makeOwnedCompatIndicator(homeTargets.indicator, compatHook, homeTargets.stable ? DECK_DISPLAY : null)
      : undefined;
    const gridOwned = gridTargets
      ? sharedOwned ?? makeOwnedCompatIndicator(gridTargets.indicator, compatHook, gridTargets.stable ? DECK_DISPLAY : null)
      : undefined;
    type IndicatorProps = {
      overview?: { appid?: unknown };
      className?: string;
      forcedDisplay?: number;
    };
    const renderIndicator = (owned: ElementType, props: IndicatorProps) => {
      if (!active) return null;
      const appId = Number(props.overview?.appid);
      if (!Number.isFinite(appId) || appId <= 0) return null;
      const metadata = dependencies.metadataForApp(appId);
      const eligible = Number(props.overview?.appid) === appId &&
        dependencies.isNativeNonSteamShortcut(props.overview) &&
        effectiveCompatibilityCategory(metadata) !== null;
      return eligible
        ? createElement(owned, {
          overview: props.overview,
          className: props.className,
          forcedDisplay: props.forcedDisplay,
        })
        : null;
    };
    const reactiveIndicator = (owned: ElementType) => (props: IndicatorProps) => {
      dependencies.useCompatibilityRevision(subscribeIndicator);
      return renderIndicator(owned, props);
    };
    const HomeCompatibilityIndicator = homeOwned ? reactiveIndicator(homeOwned) : undefined;
    const GridCompatibilityIndicator = gridOwned
      ? (gridOwned === homeOwned ? HomeCompatibilityIndicator : reactiveIndicator(gridOwned))
      : undefined;
    const renderGridIndicator = gridOwned
      ? (props: IndicatorProps) => renderIndicator(gridOwned, props)
      : () => null;

    const decorateForApp = (
      appId: number,
      output: unknown,
      decorate: (output: unknown, overview: unknown) => unknown,
      renderedOverview?: { appid?: unknown },
    ) => {
      const overview = renderedOverview ?? dependencies.getOverview(appId);
      if (Number(overview?.appid) !== Number(appId)) return output;
      return dependencies.isNativeNonSteamShortcut(overview)
        ? decorate(output, overview)
        : output;
    };

    const carouselWrapperFor = (carousel: any) => {
      const existing = mountedHomeCarouselWrappers.get(carousel);
      if (existing) return existing;
      const wrapper = (props: any) => {
        const output = carousel(props);
        if (!active) return output;
        // Steam's live Home renderer passes the shortcut overview as `app`.
        // The top-level `appid` remains a supported fallback for the alternate
        // renderer shape used by older clients.
        const appId = Number(props?.appid ?? props?.app?.appid);
        return decorateForApp(
          appId,
          output,
          (card, overview) => decorateCarouselCompatibility(
            card,
            homeTargets!.indicator,
            HomeCompatibilityIndicator!,
            homeTargets!.homeClassName,
            overview,
          ),
        );
      };
      mountedHomeCarouselWrappers.set(carousel, wrapper);
      return wrapper;
    };
    const isMountedHomeCarousel = (carousel: any) =>
      carousel === homeTargets?.carousel || mountedHomeCarouselTypes.has(carousel);

    const homeFiberFor = (element: any) => {
      try {
        const key = Object.keys(element).find((name) =>
          name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$")
        );
        return key ? element[key] : null;
      } catch {
        return null;
      }
    };
    const isHomeCarouselFiber = (fiber: any) => {
      let current = fiber;
      for (let depth = 0; current && depth < 24; depth += 1, current = current.return) {
        if (current.type === homeTargets?.home || current.elementType === homeTargets?.home) return true;
        try {
          for (const candidate of [current.type, current.elementType]) {
            const render = typeof candidate?.render === "function"
              ? candidate.render
              : typeof candidate === "function"
                ? candidate
                : undefined;
            const source = typeof render === "function" ? render.toString() : "";
            if (
              source.includes("VBC_") &&
              source.includes("fnOnFocusedColumnChange")
            ) {
              return true;
            }
            // Steam can replace the Home renderer with a wrapper after module
            // resolution. That wrapper removes the VBC_ source token, but the
            // mounted current Home grid still exposes its focused-column callback
            // and the exact m_refGrid we need to own.
            if (
              source.includes("fnOnFocusedColumnChange") &&
              current.stateNode?.m_refGrid
            ) {
              return true;
            }
          }
        } catch {
          // Keep the bounded walk fail-closed when Steam lazily swaps a type.
        }
      }
      return false;
    };
    const installCachedHomeCellRenderer = (grid: any, discovered = false) => {
      if (!active) return "unavailable";
      const original = grid?.props?.cellRenderer;
      if (typeof original !== "function" || typeof grid?.recomputeGridSize !== "function") {
        return "unavailable";
      }
      const previous = mountedHomeGrids.get(grid);
      // React can publish a new native renderer on an already-mounted grid.
      // Preserve that newest renderer as the cleanup target, rather than
      // leaving the old wrapper registered after it has been replaced.
      if (previous?.wrapper === original) {
        previous.discovered = previous.discovered || discovered;
        if (previous.needsRecompute) {
          previous.needsRecompute = false;
          return "wrapped";
        }
        return "intact";
      }
      const wrapRenderer = (renderer: any) => (...args: any[]) =>
        wrapCarouselElement(renderer(...args), isMountedHomeCarousel, carouselWrapperFor);
      const descriptor = Object.getOwnPropertyDescriptor(grid.props, "cellRenderer");
      try {
        // Steam can inherit this renderer through the props prototype rather
        // than publishing an own descriptor. Define an own accessor in both
        // cases so a later React assignment cannot silently replace the
        // wrapper between discovery retries.
        if (!descriptor || descriptor.configurable) {
          const gridPropsDescriptor = Object.getOwnPropertyDescriptor(grid, "props");
          const canRetainPropsReplacement = Boolean(
            gridPropsDescriptor?.configurable && gridPropsDescriptor.writable,
          );
          let currentProps = grid.props;
          let record: MountedHomeGrid;
          const retainRenderer = (props: any) => {
            const nextOriginal = props?.cellRenderer;
            const nextDescriptor = Object.getOwnPropertyDescriptor(props ?? {}, "cellRenderer");
            if (
              typeof nextOriginal !== "function" ||
              (nextDescriptor && !nextDescriptor.configurable)
            ) {
              return false;
            }
            record.original = nextOriginal;
            record.wrapper = wrapRenderer(nextOriginal);
            Object.defineProperty(props, "cellRenderer", {
              configurable: true,
              enumerable: nextDescriptor?.enumerable ?? true,
              get: () => record.wrapper,
              set: (next) => {
                if (next === record.wrapper || typeof next !== "function") return;
                record.original = next;
                record.wrapper = wrapRenderer(next);
                record.needsRecompute = true;
              },
            });
            return props.cellRenderer === record.wrapper;
          };
          record = {
            original,
            wrapper: wrapRenderer(original),
            discovered,
            needsRecompute: false,
            restore: () => {
              if (currentProps?.cellRenderer !== record.wrapper) return false;
              Object.defineProperty(currentProps, "cellRenderer", {
                configurable: true,
                enumerable: true,
                writable: true,
                value: record.original,
              });
              if (canRetainPropsReplacement) {
                Object.defineProperty(grid, "props", {
                  ...gridPropsDescriptor,
                  value: currentProps,
                });
              }
              return true;
            },
          };
          if (canRetainPropsReplacement) {
            Object.defineProperty(grid, "props", {
              configurable: true,
              enumerable: gridPropsDescriptor?.enumerable ?? true,
              get: () => currentProps,
              set: (nextProps) => {
                currentProps = nextProps;
                if (!active || nextProps?.cellRenderer === record.wrapper) return;
                if (retainRenderer(nextProps)) record.needsRecompute = true;
              },
            });
          }
          if (!retainRenderer(currentProps)) {
            record.restore();
            return "unavailable";
          }
          mountedHomeGrids.set(grid, record);
          return "wrapped";
        }
        const wrapper = wrapRenderer(original);
        const record: MountedHomeGrid = {
          original,
          wrapper,
          discovered,
          needsRecompute: false,
          restore: () => {
            if (grid?.props?.cellRenderer !== wrapper) return false;
            grid.props.cellRenderer = record.original;
            return true;
          },
        };
        grid.props.cellRenderer = wrapper;
        if (grid.props.cellRenderer !== wrapper) return "unavailable";
        mountedHomeGrids.set(grid, record);
        return "wrapped";
      } catch {
        // A changed virtual-grid target is left untouched and is not retried.
        return "unavailable";
      }
    };
    const hasMountedHomeCellRendererWrapper = (requireDiscovered = false) => {
      for (const [grid, { wrapper, discovered }] of mountedHomeGrids) {
        try {
          if ((!requireDiscovered || discovered) && grid?.props?.cellRenderer === wrapper) return true;
        } catch {
          // A disposed virtual grid cannot keep a mounted wrapper alive.
        }
      }
      return false;
    };
    const retainMountedHomeCarouselTypes = (root: any, cardAppId: number) => {
      const pending = [root];
      const seen = new Set<any>();
      let visited = 0;
      while (pending.length > 0 && visited < 96) {
        const fiber = pending.pop();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);
        visited += 1;
        const appId = Number(fiber.memoizedProps?.app?.appid ?? fiber.memoizedProps?.appid);
        const hasCardIdentity = Number.isFinite(cardAppId) && cardAppId > 0;
        if (
          Number.isFinite(appId) &&
          appId > 0 &&
          (!hasCardIdentity || appId === cardAppId)
        ) {
          [fiber.type, fiber.elementType].forEach((component) => {
            if (typeof component === "function") {
              mountedHomeCarouselTypes.add(component);
            }
          });
        }
        if (fiber.child) pending.push(fiber.child);
        if (fiber.sibling) pending.push(fiber.sibling);
      }
    };
    const discoverMountedHomeCarousels = () => {
      const discoveredGrids = new Set<any>();
      if (!active) return discoveredGrids;
      try {
        const document = dependencies.getCardDocument();
        const cards = document?.querySelectorAll?.("[data-id]");
        if (!cards) return discoveredGrids;
        for (const card of Array.from(cards) as any[]) {
          const cardAppId = Number(card?.getAttribute?.("data-id"));
          let fiber = homeFiberFor(card);
          retainMountedHomeCarouselTypes(fiber, cardAppId);
          for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
            const appId = Number(fiber.memoizedProps?.app?.appid ?? fiber.memoizedProps?.appid);
            if (Number.isFinite(appId) && appId > 0) {
              // The mounted Home card can come from a newer Steam module
              // generation than the cached module export. Retain its exact
              // app-bearing component identities for this bounded card renderer.
              [fiber.type, fiber.elementType].forEach((component) => {
                if (typeof component === "function") {
                  mountedHomeCarouselTypes.add(component);
                }
              });
            }
            const carousel = fiber.stateNode;
            if (
              carousel?.m_refGrid &&
              isHomeCarouselFiber(fiber)
            ) {
              mountedHomeCarousels.add(carousel);
              discoveredGrids.add(carousel.m_refGrid);
              break;
            }
          }
        }
      } catch {
        // DOM/fiber access is optional; new cards still use the renderer patch.
      }
      return discoveredGrids;
    };
    const refreshMountedHomeCarousels = (refreshExisting = true) => {
      if (!active) return false;
      const discoveredGrids = discoverMountedHomeCarousels();
      const grids = new Set<any>();
      mountedHomeCarousels.forEach((carousel) => {
        const grid = carousel?.m_refGrid;
        if (typeof grid?.recomputeGridSize === "function") {
          grids.add(grid);
        } else {
          mountedHomeCarousels.delete(carousel);
        }
      });
      mountedHomeGrids.forEach((_value, grid) => grids.add(grid));
      const gridsToRecompute = new Set<any>();
      grids.forEach((grid) => {
        const previous = mountedHomeGrids.get(grid);
        const outcome = installCachedHomeCellRenderer(
          grid,
          discoveredGrids.has(grid) || previous?.discovered === true,
        );
        if (refreshExisting || outcome === "wrapped") gridsToRecompute.add(grid);
      });
      gridsToRecompute.forEach((grid) => {
        try {
          grid.recomputeGridSize();
        } catch {
          mountedHomeGrids.delete(grid);
        }
      });
      // Steam can publish a replacement native renderer while recomputing its
      // cached item output. Rewrap that newest renderer after the invalidation
      // so the current grid, not only a future render, owns the indicator.
      gridsToRecompute.forEach((grid) => {
        const previous = mountedHomeGrids.get(grid);
        installCachedHomeCellRenderer(grid, previous?.discovered ?? false);
      });
      return hasMountedHomeCellRendererWrapper(true);
    };
    const homeRefFor = (originalRef: any) => {
      const existing = homeRefCallbacks.get(originalRef);
      if (existing) return existing;
      const callback = (instance: any) => {
        try {
          assignRef(originalRef, instance);
        } catch {
          // A host ref must not prevent Steam's native carousel from mounting.
        }
        if (!instance || !active) return;
        mountedHomeCarousels.add(instance);
        refreshMountedHomeCarousels();
      };
      homeRefCallbacks.set(originalRef, callback);
      return callback;
    };

    const scheduleMountedHomeDiscoveryRetry = () => {
      if (
        !active ||
        homeDiscoveryRetryId !== undefined ||
        homeDiscoveryAttempts >= dependencies.maxHomeDiscoveryAttempts
      ) {
        return;
      }
      homeDiscoveryRetryId = dependencies.scheduleRetry(() => {
        if (!active) return;
        homeDiscoveryRetryId = undefined;
        homeDiscoveryAttempts += 1;
        refreshMountedHomeCarousels(false);
        scheduleMountedHomeDiscoveryRetry();
      }, dependencies.homeDiscoveryIntervalMs);
    };

    let didInstallTarget = false;
    if (homeTargets && !homeUnpatch) {
      try {
        const patch = dependencies.patchHomeRenderer(
          homeTargets.home,
          (_args, output) => {
            const homeOutput = output as any;
            if (!active || !isValidElement(homeOutput)) return output;
            const homeProps = (homeOutput as any).props;
            if (typeof homeProps?.fnItemRenderer !== "function") return output;
            const originalRenderer = homeProps.fnItemRenderer;
            return cloneElement(homeOutput as any, {
              ref: homeRefFor((homeOutput as any).ref),
              fnItemRenderer: (...itemArgs: any[]) =>
                wrapCarouselElement(originalRenderer(...itemArgs), isMountedHomeCarousel, carouselWrapperFor),
            });
          },
        );
        if (typeof patch === "function") {
          homeUnpatch = patch;
          didInstallTarget = true;
        }
      } catch {
        homeUnpatch = undefined;
      }
      if (homeUnpatch) {
        cancelResolutionRetry("home");
        homeCacheUnsubscribe ??= subscribeCompatibilityRevision(refreshMountedHomeCarousels);
        refreshMountedHomeCarousels();
        scheduleMountedHomeDiscoveryRetry();
      }
    }
    const decorateGrid = (args: any[], output: unknown, owned: ElementType) => {
      const props = args[0];
      return decorateForApp(
        Number(props?.app?.appid),
        output,
        (card, overview) => decorateGridCompatibility(
          card,
          gridTargets!.indicator,
          owned,
          gridTargets!.gridIconsClassName,
          gridTargets!.gridIndicatorClassName,
          overview,
          props?.eForceHWCompatDisplay,
        ),
        props?.app,
      );
    };
    if (gridTargets && !gridUnpatch) {
      try {
        const patch = provided.patchGridRenderer
          ? dependencies.patchGridRenderer(
            gridTargets.grid,
            (args, output) => decorateGrid(args, output, GridCompatibilityIndicator!),
          )
          : installNativeGridCompatibilityDispatcher(gridTargets.grid, {
            patch: dependencies.patchGridRenderer,
            decorate: decorateGrid,
            render: renderGridIndicator,
            subscribeRevision: subscribeCompatibilityRevision,
          });
        if (typeof patch === "function") {
          gridUnpatch = patch;
          didInstallTarget = true;
        }
      } catch {
        gridUnpatch = undefined;
      }
      if (gridUnpatch) cancelResolutionRetry("grid");
    }
    if (homeUnpatch) cancelResolutionRetry("home");
    if (gridUnpatch) cancelResolutionRetry("grid");
    else scheduleResolutionRetry("grid");
    if (homeUnpatch) cancelResolutionRetry("home");
    else scheduleResolutionRetry("home");
    if ((homeUnpatch || gridUnpatch) && !reportedInstalled) {
      reportedInstalled = true;
      reportInstalled(homeResolutionAttempts + gridResolutionAttempts);
    }
    if (didInstallTarget) dependencies.refreshCompatibilitySurfaces();
    if (homeTargets && homeUnpatch) scheduleMountedHomeDiscoveryRetry();
  };

  const checkLibraryRoute = () => {
    routeRetryId = undefined;
    if (!active) return;
    let route = "";
    try {
      route = dependencies.getCurrentRoute();
    } catch {
      route = "";
    }
    if (route !== lastObservedRoute) {
      lastObservedRoute = route;
      if (isLibraryGridRoute(route) && !gridUnpatch) {
        gridResolutionAttempts = 0;
        gridRouteDiscoveryAttempts = 0;
        cancelResolutionRetry("grid");
        installWhenTargetsResolve("grid");
      }
    }
    if (active && !gridUnpatch) routeRetryId = dependencies.scheduleRetry(checkLibraryRoute, dependencies.retryIntervalMs);
  };

  try {
    lastObservedRoute = dependencies.getCurrentRoute();
  } catch {
    lastObservedRoute = "";
  }
  installWhenTargetsResolve();
  if (!gridUnpatch) routeRetryId = dependencies.scheduleRetry(checkLibraryRoute, dependencies.retryIntervalMs);

};
type NativeGridDispatcherOptions = {
  patch: (target: any, handler: (args: any[], output: any) => any) => Unpatch;
  decorate: (args: any[], output: any, owned: ElementType) => any;
  render: (props: any) => ReactNode;
  subscribeRevision: (listener: () => void) => Unpatch;
};
type NativeGridDispatcher = {
  original: any;
  wrapper: any;
  indicator: ElementType;
  owner?: symbol;
  decorate?: NativeGridDispatcherOptions["decorate"];
  render?: NativeGridDispatcherOptions["render"];
  unsubscribe?: Unpatch;
  listeners: Set<() => void>;
};

/**
 * React retains a memo's resolved function in mounted cards. Keep its owned
 * dispatcher stable across reload, while swapping only the active generation.
 * Native card components, hooks, focus and peer wrappers retain their identity.
 */
export const installNativeGridCompatibilityDispatcher = (
  target: any,
  options: NativeGridDispatcherOptions,
): Unpatch => {
  const host = globalThis as any;
  const registry: WeakMap<object, NativeGridDispatcher> = host.__deckyMetadataGridCompatibilityDispatchers ??=
    new WeakMap<object, NativeGridDispatcher>();
  let state = registry.get(target);
  if (!state) {
    const created: NativeGridDispatcher = {
      original: undefined,
      wrapper: undefined,
      indicator: () => null,
      listeners: new Set(),
    };
    // These listeners belong to mounted React leaves. No Steam subscription or
    // monitoring survives unload; the small bridge only publishes activation.
    created.indicator = function LiveGridCompatibilityIndicator(props: any) {
      const [, setRevision] = useState(0);
      useEffect(() => {
        const update = () => setRevision((revision) => revision + 1);
        created.listeners.add(update);
        // Hydration can publish after render but before this passive effect.
        // Catch up once attached, as the regular compatibility hook does.
        update();
        return () => { created.listeners.delete(update); };
      }, []);
      return created.render?.(props) ?? null;
    };
    registry.set(target, created);
    state = created;
  }
  const current = state;
  const publish = () => current.listeners.forEach((listener) => listener());
  const owner = Symbol("decky-metadata-grid-generation");
  current.unsubscribe?.();
  current.owner = owner;
  current.decorate = options.decorate;
  current.render = options.render;
  // Decky's chain-aware unpatch can remove a predecessor while our wrapper
  // stays mounted. Reuse its current chain, never the installation snapshot.
  current.original = current.wrapper?.__deckyPatch?.original ?? current.original;
  if (target.type === current.original && current.wrapper) {
    target.type = current.wrapper;
  } else if (target.type !== current.wrapper) {
    current.original = target.type;
    options.patch(target, (args, output) =>
      current.decorate?.(args, output, current.indicator) ?? output
    );
    current.wrapper = target.type;
  }
  current.unsubscribe = options.subscribeRevision(publish);
  publish();
  return () => {
    if (current.owner !== owner) return;
    current.unsubscribe?.();
    current.unsubscribe = undefined;
    current.owner = undefined;
    current.decorate = undefined;
    current.render = undefined;
    // Restore only our exact head. A peer wrapper published later remains.
    // The captured dispatcher stays inert in Steam's mounted memo cache.
    current.original = current.wrapper?.__deckyPatch?.original ?? current.original;
    if (target.type === current.wrapper) target.type = current.original;
    publish();
  };
};
