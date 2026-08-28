import { findModuleChild } from "@decky/ui";
import { cloneElement, createElement, isValidElement } from "react";
import type { MetadataData } from "../types";
import { effectiveCompatibilityCategory } from "./metadataPatch";
import { getOverview, isNativeNonSteamShortcut, metadataCache, safeAfterPatch, Unpatch } from "./core";

const DECK_DISPLAY = 1;

type ModuleFinder = (predicate: (module: any) => any) => any;
type ModuleSourceFinder = (fragments: string[]) => any;
type CompatibilityMetadata = Pick<MetadataData, "deck_compat_override" | "deck_compat_category">;

const HOME_INDICATOR_KEY = "decky-metadata-compatibility-home";
const GRID_INDICATOR_KEY = "decky-metadata-compatibility-grid";

export type LibraryCompatibilityIndicatorDependencies = {
  findModuleChild: ModuleFinder;
  findModuleBySource: ModuleSourceFinder;
  patchHomeRenderer: (module: any, handler: (args: any[], output: any) => any) => Unpatch;
  patchGridRenderer: (component: any, handler: (args: any[], output: any) => any) => Unpatch;
  getOverview: (appId: number) => any;
  metadataForApp: (appId: number) => MetadataData | undefined;
  isNativeNonSteamShortcut: (overview: any) => boolean;
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
const findSteamModuleBySource: ModuleSourceFinder = (fragments) => {
  const chunks = (window as any).webpackChunksteamui;
  if (!chunks?.push) return undefined;

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
    return moduleIds.length === 1 ? webpackRequire(moduleIds[0]) : undefined;
  } catch {
    return undefined;
  }
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

const childrenOf = (element: any): any[] => {
  const children = element?.props?.children;
  return Array.isArray(children) ? children : [children];
};

const hasIndicator = (children: any[], indicator: any, key: string) =>
  children.some((child) => isValidElement(child) && (child.type === indicator || child.key === key));

export const decorateCarouselCompatibility = (
  output: any,
  indicator: any,
  className: string,
  category: number | null,
  overview?: any,
) => {
  if (!category || !isValidElement(output)) return output;
  const element = output as any;
  const children = childrenOf(element);
  if (hasIndicator(children, indicator, HOME_INDICATOR_KEY)) return output;

  // Steam's GameCapsule places compatibility after its in-library marker. A
  // shortcut suppresses that native slot with `false`; replace only that
  // confirmed placeholder. If Steam changes the shape, insert our indicator
  // without discarding another child.
  const nativeCompatibilitySlot = children[2];
  const remainingChildren = nativeCompatibilitySlot === false
    ? children.slice(3)
    : children.slice(2);
  return cloneElement(element, {
    children: [
      ...children.slice(0, 2),
      createElement(indicator, { key: HOME_INDICATOR_KEY, display: DECK_DISPLAY, overview, className }),
      ...remainingChildren,
    ],
  });
};

const decorateGridIconRow = (
  node: any,
  indicator: any,
  iconRowClassName: string,
  indicatorClassName: string,
  overview: any,
): any => {
  if (!isValidElement(node)) return node;
  const element = node as any;
  if (element.props?.className === iconRowClassName) {
    const children = childrenOf(element);
    if (hasIndicator(children, indicator, GRID_INDICATOR_KEY)) return node;
    return cloneElement(element, {
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

  const originalChildren = element.props?.children;
  if (originalChildren === undefined) return node;
  const children = childrenOf(node);
  const decoratedChildren = children.map((child) =>
    decorateGridIconRow(child, indicator, iconRowClassName, indicatorClassName, overview)
  );
  if (decoratedChildren.every((child, index) => child === children[index])) return node;
  return cloneElement(element, {
    children: Array.isArray(originalChildren) ? decoratedChildren : decoratedChildren[0],
  });
};

export const decorateGridCompatibility = (
  output: any,
  indicator: any,
  iconRowClassName: string,
  indicatorClassName: string,
  category: number | null,
  overview?: any,
) => {
  if (!category || !isValidElement(output)) return output;
  return decorateGridIconRow(output, indicator, iconRowClassName, indicatorClassName, overview);
};

const resolveTargets = (dependencies: Pick<LibraryCompatibilityIndicatorDependencies, "findModuleChild" | "findModuleBySource">): LibraryCompatibilityTargets | null => {
  const carouselModule = dependencies.findModuleChild((module) => {
    if (!module || typeof module !== "object") return undefined;
    return typeof module._ === "function" &&
      typeof module.g === "function" &&
      module._.toString().includes("GameCapsule unable to render") &&
      module._.toString().includes("#LibraryHome_GameCarousel_ContextMenu") &&
      module._.toString().includes("gamepadgamecapsule")
      ? module
      : undefined;
  });
  const homeModule = dependencies.findModuleBySource([
    "VirtualizedBoxCarousel",
    "VBC_",
    "fnItemRenderer",
    "CellRenderer",
  ]);
  const gridModule = dependencies.findModuleBySource([
    "eForceHWCompatDisplay",
    "bHideCompatIcons",
    "LibraryItemBox",
    "BIsModOrShortcut",
  ]);
  const homeStyles = dependencies.findModuleChild((module) =>
    typeof module?.DeckCompat === "string" && typeof module?.GameCapsule === "string" ? module : undefined
  );
  const gridStyles = dependencies.findModuleChild((module) =>
    typeof module?.LibraryItemIcons === "string" && typeof module?.SteamDeckCompatIcon === "string" ? module : undefined
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
    typeof gridModule?.TK !== "function" ||
    !hasWritableCallableMethod(gridModule.TK, "type") ||
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
  findModuleChild,
  findModuleBySource: findSteamModuleBySource,
  patchHomeRenderer: (component, handler) => safeAfterPatch(component, "render", handler).unpatch,
  patchGridRenderer: (component, handler) => safeAfterPatch(component, "type", handler).unpatch,
  getOverview,
  metadataForApp: (appId) => metadataCache[String(appId)],
  isNativeNonSteamShortcut,
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

/**
 * Add compatibility indicators at the two native Library card renderers.
 * The patch calls only those renderers. It never walks MobX state.
 */
export const installLibraryCompatibilityIndicators = (
  unpatchers: Unpatch[],
  provided: Partial<LibraryCompatibilityIndicatorDependencies> = {},
) => {
  const dependencies = { ...defaultDependencies, ...provided };
  const targets = resolveTargets(dependencies);
  if (!targets) return;

  const decorateForApp = (
    appId: number,
    output: any,
    decorate: (output: any, category: number | null, overview: any) => any,
    renderedOverview?: any,
  ) => {
    const overview = renderedOverview ?? dependencies.getOverview(appId);
    const category = resolveLibraryCompatibilityIndicator({
      renderedAppId: appId,
      overview,
      metadata: dependencies.metadataForApp(appId),
      isNativeNonSteamShortcut: dependencies.isNativeNonSteamShortcut,
    });
    return decorate(output, category, overview);
  };

  let active = true;
  let homeUnpatch: Unpatch | undefined;
  let gridUnpatch: Unpatch | undefined;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    const homeCleanup = homeUnpatch;
    const gridCleanup = gridUnpatch;
    homeUnpatch = undefined;
    gridUnpatch = undefined;
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
      (card, category, overview) => decorateCarouselCompatibility(
        card,
        targets.indicator,
        targets.homeClassName,
        category,
        overview,
      ),
    );
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
        (card, category, overview) => decorateGridCompatibility(
          card,
          targets.indicator,
          targets.gridIconsClassName,
          targets.gridIndicatorClassName,
          category,
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

  unpatchers.push(cleanup);
};
