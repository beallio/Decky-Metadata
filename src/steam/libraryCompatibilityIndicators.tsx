import { findModuleChild } from "@decky/ui";
import { cloneElement, createElement, isValidElement, useEffect, useState } from "react";
import type { ElementType, ReactElement, ReactNode } from "react";
import { frontendLog } from "../backend";
import type { MetadataData } from "../types";
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

const DECK_DISPLAY = 1;

type ModuleFinder = (predicate: (module: any) => any) => any;
type ModuleSourceFinder = (fragments: string[]) => any;
type ModuleSourceCandidatesFinder = (fragments: string[]) => any[];
type CompatibilityMetadata = Pick<MetadataData, "deck_compat_override" | "deck_compat_category">;

const HOME_INDICATOR_KEY = "decky-metadata-compatibility-home";
const GRID_INDICATOR_KEY = "decky-metadata-compatibility-grid";

const steamUiWindow = () => {
  const candidates: any[] = [globalThis];
  try {
    const currentWindow = globalThis as any;
    candidates.push(currentWindow.parent, currentWindow.top);
  } catch {
    // A cross-origin frame can still use its own Decky module bridge.
  }
  return candidates.find((candidate) =>
    candidate?.webpackChunksteamui || typeof candidate?.DFL?.findModuleChild === "function"
  ) ?? globalThis;
};

const steamUiCardDocument = () => {
  // SharedJSContext does not own Big Picture's DOM. Steam exposes the mounted
  // browser document through this same-window bridge instead. Prefer the
  // established MainWindow path, while retaining the Gamepad-specific form
  // seen on older/current SteamUI builds.
  try {
    const windowStore = (globalThis as any)?.SteamUIStore?.m_WindowStore;
    const browserWindows = [
      windowStore?.MainWindowInstance?.m_BrowserWindow,
      windowStore?.GamepadUIMainWindowInstance?.m_BrowserWindow,
    ];
    for (const browserWindow of browserWindows) {
      const document = browserWindow?.document;
      if (
        typeof document?.querySelector === "function" &&
        !!document.querySelector("[data-id]")
      ) {
        return document;
      }
    }
  } catch {
    // A changed Steam window bridge must leave the optional cache patch inert.
  }
  const candidates: any[] = [globalThis];
  try {
    const currentWindow = globalThis as any;
    candidates.push(currentWindow.parent, currentWindow.top);
  } catch {
    // A cross-origin frame can still use its own document when it has cards.
  }
  return candidates.find((candidate) =>
    typeof candidate?.document?.querySelector === "function" &&
    !!candidate.document.querySelector("[data-id]")
  )?.document;
};

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
  getOverview: (appId: number) => any;
  metadataForApp: (appId: number) => MetadataData | undefined;
  isNativeNonSteamShortcut: (overview: any) => boolean;
  useCompatibilityRevision: (subscribe: (listener: () => void) => Unpatch) => void;
};

type LibraryCompatibilityTargets = {
  home: any;
  carousel: any;
  grid: any;
  indicator: (props: any) => any;
  homeClassName: string;
  gridIconsClassName: string;
  gridIndicatorClassName: string;
};

/**
 * Decky's module finder sees the observer/memo export, not LibraryItemBox's
 * renderer source. Query only webpack factory text, then load its one match.
 * This never walks React or MobX state.
 */
const findSteamModulesBySource: ModuleSourceCandidatesFinder = (fragments) => {
  const chunks = (steamUiWindow() as any).webpackChunksteamui;
  if (!chunks?.push) return [];

  let webpackRequire: any;
  try {
    chunks.push([[Symbol("decky-metadata-library-compatibility")], {}, (requireFn: any) => {
      webpackRequire = requireFn;
    }]);
    const moduleIds = Object.keys(webpackRequire?.m ?? {}).filter((id) => {
      const factory = webpackRequire.m[id];
      const source = typeof factory === "function" ? factory.toString() : "";
      return fragments.every((fragment) => source.includes(fragment));
    });
    return moduleIds.flatMap((moduleId) => {
      try {
        return [webpackRequire(moduleId)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
};

const findSteamModuleBySource: ModuleSourceFinder = (fragments) => {
  const candidates = findSteamModulesBySource(fragments);
  return candidates.length === 1 ? candidates[0] : undefined;
};

const findLiveModuleChild: ModuleFinder = (predicate) => {
  const liveFinder = (steamUiWindow() as any).DFL?.findModuleChild;
  return typeof liveFinder === "function" ? liveFinder(predicate) : findModuleChild(predicate);
};

const findOneSourceExport = (modules: any[], predicate: (module: any) => boolean): any | undefined => {
  const matches = modules.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
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
  isNativeNonSteamShortcut: isNativeShortcut,
}: {
  renderedAppId: number;
  overview: any;
  metadata: CompatibilityMetadata | undefined;
  isNativeNonSteamShortcut: (overview: any) => boolean;
}) => {
  if (Number(overview?.appid) !== Number(renderedAppId) || !isNativeShortcut(overview)) return null;
  const category = effectiveCompatibilityCategory(metadata as MetadataData | undefined);
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

const hasIndicator = (children: ReactNode[], indicator: ElementType, key: string) =>
  children.some((child) => isValidElement(child) && (child.type === indicator || child.key === key));

export function decorateCarouselCompatibility(
  output: ReactElement<CompatibilityCardProps>,
  indicator: ElementType,
  className: string,
  overview?: unknown,
): ReactElement<CompatibilityCardProps>;
export function decorateCarouselCompatibility<T>(
  output: T,
  indicator: ElementType,
  className: string,
  overview?: unknown,
): T;
export function decorateCarouselCompatibility<T>(
  output: T,
  indicator: ElementType,
  className: string,
  overview?: unknown,
): T {
  if (!isValidElement<CompatibilityCardProps>(output)) return output;
  const children = childrenOf(output);
  if (hasIndicator(children, indicator, HOME_INDICATOR_KEY)) return output;

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
      createElement(indicator, { key: HOME_INDICATOR_KEY, display: DECK_DISPLAY, overview, className }),
      ...remainingChildren,
    ],
  });
  // `isValidElement` proves T is this React element while preserving callers' concrete type.
  return decorated as unknown as T;
}

const decorateGridIconRow = (
  node: ReactNode,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview: unknown,
): ReactNode => {
  if (!isValidElement<CompatibilityCardProps>(node)) return node;
  if (node.props.className === iconRowClassName) {
    const children = childrenOf(node);
    if (hasIndicator(children, indicator, GRID_INDICATOR_KEY)) return node;
    return cloneElement(node, {
      children: [
        ...children,
        createElement(indicator, {
          key: GRID_INDICATOR_KEY,
          display: DECK_DISPLAY,
          overview,
          className: indicatorClassName,
        }),
      ],
    });
  }

  const originalChildren = node.props.children;
  if (originalChildren === undefined) return node;
  const children = childrenOf(node);
  const decoratedChildren = children.map((child) =>
    decorateGridIconRow(child, indicator, iconRowClassName, indicatorClassName, overview)
  );
  if (decoratedChildren.every((child, index) => child === children[index])) return node;
  return cloneElement(node, {
    children: Array.isArray(originalChildren) ? decoratedChildren : decoratedChildren[0],
  });
};

export function decorateGridCompatibility(
  output: ReactElement<CompatibilityCardProps>,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview?: unknown,
): ReactElement<CompatibilityCardProps>;
export function decorateGridCompatibility<T>(
  output: T,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview?: unknown,
): T;
export function decorateGridCompatibility<T>(
  output: T,
  indicator: ElementType,
  iconRowClassName: string,
  indicatorClassName: string,
  overview?: unknown,
): T {
  const decorated = decorateGridIconRow(
    output as ReactNode,
    indicator,
    iconRowClassName,
    indicatorClassName,
    overview,
  );
  return decorated as unknown as T;
}

const resolveTargets = (
  dependencies: Pick<
    LibraryCompatibilityIndicatorDependencies,
    "findModuleChild" | "findModuleBySource" | "findModulesBySource"
  >,
): LibraryCompatibilityTargets | null => {
  const findChild = (predicate: (module: any) => any) => {
    try {
      return dependencies.findModuleChild(predicate);
    } catch {
      // A lazy Steam module can disappear while Decky's finder is scanning it.
      // Treat that race as unresolved so the installer retries fail-closed.
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
    "gamepadgamecapsule",
  ]);
  const homeModule = findChild((module) =>
    typeof module?.Xd?.render === "function" && module.Xd.render.toString().includes("VBC_")
      ? module
      : undefined
  ) ?? dependencies.findModuleBySource([
    "VirtualizedBoxCarousel",
    "VBC_",
    "fnItemRenderer",
    "CellRenderer",
  ]);
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
    "BIsModOrShortcut",
  ]);
  const homeStyles = findChild((module) =>
    typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string" ? module : undefined
  ) ?? findOneSourceExport(dependencies.findModulesBySource(["DeckCompat", "GameCapsule"]), (module) =>
    typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string"
  );
  const gridStyles = findChild((module) =>
    typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string" ? module : undefined
  ) ?? findOneSourceExport(dependencies.findModulesBySource(["LibraryItemIcons", "SteamDeckCompatIcon"]), (module) =>
    typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string"
  );

  const hasWritableCallableMethod = (target: any, methodName: string) =>
    typeof target?.[methodName] === "function" &&
    Object.getOwnPropertyDescriptor(target, methodName)?.writable === true;
  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;

  if (
    !carouselModule ||
    Array.isArray(homeModule) ||
    Array.isArray(gridModule) ||
    homeModule === gridModule ||
    !hasWritableCallableMethod(homeModule?.Xd, "render") ||
    !hasWritableCallableMethod(gridModule?.TK, "type") ||
    typeof carouselModule._ !== "function" ||
    typeof carouselModule.g !== "function" ||
    !isNonEmptyString(homeStyles?.DeckCompat) ||
    !isNonEmptyString(homeStyles?.GameCapsule) ||
    !isNonEmptyString(gridStyles?.LibraryItemIcons) ||
    !isNonEmptyString(gridStyles?.SteamDeckCompatIcon)
  ) return null;
  return {
    home: homeModule.Xd,
    carousel: carouselModule._,
    grid: gridModule.TK,
    indicator: carouselModule.g,
    homeClassName: homeStyles.DeckCompat,
    gridIconsClassName: gridStyles.LibraryItemIcons,
    gridIndicatorClassName: gridStyles.SteamDeckCompatIcon,
  };
};

const defaultDependencies: LibraryCompatibilityIndicatorDependencies = {
  findModuleChild: findLiveModuleChild,
  findModuleBySource: findSteamModuleBySource,
  findModulesBySource: findSteamModulesBySource,
  patchHomeRenderer: (component, handler) => safeAfterPatch(component, "render", handler).unpatch,
  patchGridRenderer: (component, handler) => safeAfterPatch(component, "type", handler).unpatch,
  scheduleRetry: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelRetry: (retryId) => window.clearTimeout(retryId),
  retryIntervalMs: 500,
  maxResolutionAttempts: 240,
  getOverview,
  metadataForApp: (appId) => metadataCache[String(appId)],
  isNativeNonSteamShortcut,
  refreshCompatibilitySurfaces,
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
  if (element.type === carousel) {
    return createElement(wrapper, { ...element.props, key: element.key });
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
  let retryId: number | undefined;
  let homeCacheUnsubscribe: Unpatch | undefined;
  const indicatorUnsubscribers = new Set<Unpatch>();
  const mountedHomeCarousels = new Set<any>();
  const mountedHomeGrids = new Map<any, { original: any; wrapper: any }>();
  const homeRefCallbacks = new Map<any, (instance: any) => void>();
  let resolutionAttempts = 0;
  let installed = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    if (retryId !== undefined) {
      dependencies.cancelRetry(retryId);
      retryId = undefined;
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
    mountedHomeGrids.forEach(({ original, wrapper }, grid) => {
      try {
        if (grid?.props?.cellRenderer === wrapper) {
          grid.props.cellRenderer = original;
          grid.recomputeGridSize?.();
        }
      } catch {
        // A disposed virtual grid does not need an additional cleanup pass.
      }
    });
    mountedHomeGrids.clear();
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
  const installWhenTargetsResolve = () => {
    if (!active || installed) return;
    resolutionAttempts += 1;
    let targets: LibraryCompatibilityTargets | null;
    try {
      targets = resolveTargets(dependencies);
    } catch {
      // Lazy exports can be observed while their module factory is still
      // initializing. Retry that transient state instead of losing the timer.
      targets = null;
    }
    if (!targets) {
      if (resolutionAttempts < dependencies.maxResolutionAttempts) {
        retryId = dependencies.scheduleRetry(() => {
          retryId = undefined;
          installWhenTargetsResolve();
        }, dependencies.retryIntervalMs);
      }
      return;
    }

    const ReactiveCompatibilityIndicator = (props: {
      overview?: { appid?: unknown };
      className?: string;
    }) => {
      dependencies.useCompatibilityRevision(subscribeIndicator);
      if (!active) return null;
      const appId = Number(props.overview?.appid);
      const category = resolveLibraryCompatibilityIndicator({
        renderedAppId: appId,
        overview: props.overview,
        metadata: dependencies.metadataForApp(appId),
        isNativeNonSteamShortcut: dependencies.isNativeNonSteamShortcut,
      });
      if (!category) return null;
      return createElement(targets.indicator, {
        display: DECK_DISPLAY,
        overview: props.overview,
        className: props.className,
      });
    };

    const decorateForApp = (
      appId: number,
      output: unknown,
      decorate: (output: unknown, overview: unknown) => unknown,
      renderedOverview?: { appid?: unknown },
    ) => {
      const overview = renderedOverview ?? dependencies.getOverview(appId);
      if (
        Number(overview?.appid) !== Number(appId) ||
        !dependencies.isNativeNonSteamShortcut(overview)
      ) {
        return output;
      }
      return decorate(output, overview);
    };

    const carouselWrapper = (props: any) => {
      const output = targets.carousel(props);
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
          ReactiveCompatibilityIndicator,
          targets.homeClassName,
          overview,
        ),
      );
    };

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
        if (current.type === targets.home || current.elementType === targets.home) return true;
        try {
          const candidate = current.type ?? current.elementType;
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
        } catch {
          // Keep the bounded walk fail-closed when Steam lazily swaps a type.
        }
      }
      return false;
    };
    const installCachedHomeCellRenderer = (grid: any) => {
      const original = grid?.props?.cellRenderer;
      if (typeof original !== "function" || typeof grid?.recomputeGridSize !== "function") return;
      const previous = mountedHomeGrids.get(grid);
      // React can publish a new native renderer on an already-mounted grid.
      // Preserve that newest renderer as the cleanup target, rather than
      // leaving the old wrapper registered after it has been replaced.
      if (previous?.wrapper === original) return;
      const wrapper = (...args: any[]) =>
        wrapCarouselElement(original(...args), targets.carousel, carouselWrapper);
      try {
        grid.props.cellRenderer = wrapper;
        if (grid.props.cellRenderer !== wrapper) return;
        mountedHomeGrids.set(grid, { original, wrapper });
      } catch {
        // A changed virtual-grid target is left untouched and is not retried.
      }
    };
    const discoverMountedHomeCarousels = () => {
      try {
        const document = steamUiCardDocument();
        const cards = document?.querySelectorAll?.("[data-id]");
        if (!cards) return;
        for (const card of Array.from(cards) as any[]) {
          let fiber = homeFiberFor(card);
          for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
            const carousel = fiber.stateNode;
            if (
              carousel?.m_refGrid &&
              isHomeCarouselFiber(fiber)
            ) {
              mountedHomeCarousels.add(carousel);
              installCachedHomeCellRenderer(carousel.m_refGrid);
              break;
            }
          }
        }
      } catch {
        // DOM/fiber access is optional; new cards still use the renderer patch.
      }
    };
    const refreshMountedHomeCarousels = () => {
      discoverMountedHomeCarousels();
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
      grids.forEach((grid) => {
        try {
          grid.recomputeGridSize();
        } catch {
          mountedHomeGrids.delete(grid);
        }
      });
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

    try {
      homeUnpatch = dependencies.patchHomeRenderer(
        targets.home,
        (_args, output) => {
          const homeOutput = output as any;
          if (!active || !isValidElement(homeOutput)) return output;
          const homeProps = (homeOutput as any).props;
          if (typeof homeProps?.fnItemRenderer !== "function") return output;
          const originalRenderer = homeProps.fnItemRenderer;
          return cloneElement(homeOutput as any, {
            ref: homeRefFor((homeOutput as any).ref),
            fnItemRenderer: (...itemArgs: any[]) =>
              wrapCarouselElement(originalRenderer(...itemArgs), targets.carousel, carouselWrapper),
          });
        },
      );
      if (typeof homeUnpatch !== "function") {
        cleanup();
        return;
      }
      gridUnpatch = dependencies.patchGridRenderer(
        targets.grid,
        (args, output) => decorateForApp(
          Number(args[0]?.app?.appid),
          output,
          (card, overview) => decorateGridCompatibility(
            card,
            ReactiveCompatibilityIndicator,
            targets.gridIconsClassName,
            targets.gridIndicatorClassName,
            overview,
          ),
          args[0]?.app,
        ),
      );
      if (typeof gridUnpatch !== "function") {
        cleanup();
        return;
      }
    } catch {
      cleanup();
      return;
    }
    installed = true;
    homeCacheUnsubscribe = subscribeCompatibilityRevision(refreshMountedHomeCarousels);
    refreshMountedHomeCarousels();
    reportInstalled(resolutionAttempts);
    dependencies.refreshCompatibilitySurfaces();
  };

  installWhenTargetsResolve();
};
