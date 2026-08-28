import { createReactTreePatcher, findInReactTree, findModuleChild } from "@decky/ui";
import { cloneElement, createElement, isValidElement } from "react";
import type { MetadataData } from "../types";
import { effectiveCompatibilityCategory } from "./metadataPatch";
import { getOverview, isNativeNonSteamShortcut, metadataCache, safeAfterPatch, Unpatch } from "./core";

const DECK_DISPLAY = 1;

type ModuleFinder = (predicate: (module: any) => any) => any;
type ModuleSourceFinder = (fragments: string[]) => any;
type TreeFinder = (tree: any, predicate: (node: any) => boolean) => any;
type TreePatcher = (steps: Array<(tree: any) => any>, handler: (args: any[], ret: any) => any) => any;
type CompatibilityMetadata = Pick<MetadataData, "deck_compat_override" | "deck_compat_category">;

export type LibraryCompatibilityIndicatorDependencies = {
  findModuleChild: ModuleFinder;
  findModuleBySource: ModuleSourceFinder;
  findInReactTree: TreeFinder;
  createReactTreePatcher: TreePatcher;
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
    const moduleId = Object.keys(webpackRequire?.m ?? {}).find((id) => {
      const factory = webpackRequire.m[id];
      const source = typeof factory === "function" ? factory.toString() : "";
      return fragments.every((fragment) => source.includes(fragment));
    });
    return moduleId === undefined ? undefined : webpackRequire(moduleId);
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

const hasIndicator = (children: any[], indicator: any) =>
  children.some((child) => isValidElement(child) && child.type === indicator);

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
  if (hasIndicator(children, indicator)) return output;

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
      createElement(indicator, { display: DECK_DISPLAY, overview, className }),
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
    if (hasIndicator(children, indicator)) return node;
    return cloneElement(element, {
      children: [
        ...children,
        createElement(indicator, { display: DECK_DISPLAY, overview, className: indicatorClassName }),
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

  if (
    !carouselModule ||
    !homeModule?.Xd ||
    Object.getOwnPropertyDescriptor(homeModule.Xd, "render")?.writable !== true ||
    !gridModule?.TK ||
    Object.getOwnPropertyDescriptor(gridModule.TK, "type")?.writable !== true ||
    !homeStyles ||
    !gridStyles
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
  findInReactTree,
  createReactTreePatcher,
  patchHomeRenderer: (component, handler) => safeAfterPatch(component, "render", handler).unpatch,
  patchGridRenderer: (component, handler) => safeAfterPatch(component, "type", handler).unpatch,
  getOverview,
  metadataForApp: (appId) => metadataCache[String(appId)],
  isNativeNonSteamShortcut,
};

const cardTreePatcher = (
  component: any,
  decorate: (props: any, output: any) => any,
  dependencies: LibraryCompatibilityIndicatorDependencies,
) => dependencies.createReactTreePatcher(
  [
    (tree) => dependencies.findInReactTree(tree, (node) => node?.type === component),
  ],
  (args, output) => decorate(args[0], output),
);

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

  const homeCardPatcher = cardTreePatcher(
    targets.carousel,
    (props, output) => decorateForApp(
      Number(props?.appid),
      output,
      (card, category, overview) => decorateCarouselCompatibility(
        card,
        targets.indicator,
        targets.homeClassName,
        category,
        overview,
      ),
    ),
    dependencies,
  );
  const homeUnpatch = dependencies.patchHomeRenderer(
    targets.home,
    (_args, output) => {
      const homeOutput = output as any;
      if (!isValidElement(homeOutput)) return output;
      const homeProps = (homeOutput as any).props;
      if (typeof homeProps?.fnItemRenderer !== "function") return output;
      const originalRenderer = homeProps.fnItemRenderer;
      return cloneElement(homeOutput as any, {
        fnItemRenderer: (...itemArgs: any[]) => homeCardPatcher(itemArgs, originalRenderer(...itemArgs)),
      });
    },
  );
  const gridUnpatch = dependencies.patchGridRenderer(
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

  unpatchers.push(homeUnpatch, gridUnpatch);
};
