import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({
  callable: vi.fn(() => vi.fn()),
  routerHook: { addPatch: vi.fn(), removePatch: vi.fn() },
}));
vi.mock("@decky/ui", () => ({
  createReactTreePatcher: vi.fn(),
  findInReactTree: vi.fn(),
  findModuleChild: vi.fn(),
}));

import {
  decorateCarouselCompatibility,
  decorateGridCompatibility,
  installLibraryCompatibilityIndicators,
  resolveLibraryCompatibilityIndicator,
} from "./libraryCompatibilityIndicators";

const nativeShortcut = { appid: 2155012430, app_type: 1073741824, BIsShortcut: () => true };
const officialGame = { appid: 55150, app_type: 0, BIsShortcut: () => false };

describe("resolveLibraryCompatibilityIndicator", () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
      renderedAppId: 2155012430,
      overview: nativeShortcut,
      metadata: { deck_compat_override: 3 },
      isNativeNonSteamShortcut: (overview: unknown) => overview === nativeShortcut,
      ...overrides,
    }) as Parameters<typeof resolveLibraryCompatibilityIndicator>[0];

  it.each([1, 2, 3] as const)("uses effective positive category %i for an exact native shortcut", (category) => {
    expect(resolveLibraryCompatibilityIndicator(input({ metadata: { deck_compat_override: category } }))).toBe(category);
  });

  it("uses the fetched category for Automatic", () => {
    expect(resolveLibraryCompatibilityIndicator(input({ metadata: { deck_compat_override: null, deck_compat_category: 2 } }))).toBe(2);
  });

  it("keeps explicit Unknown and unresolved Automatic as Steam's normal no-status state", () => {
    expect(resolveLibraryCompatibilityIndicator(input({ metadata: { deck_compat_override: 0 } }))).toBeNull();
    expect(resolveLibraryCompatibilityIndicator(input({ metadata: { deck_compat_override: null } }))).toBeNull();
  });

  it("fails closed for a mismatched App ID or an official game", () => {
    expect(resolveLibraryCompatibilityIndicator(input({ renderedAppId: 55150 }))).toBeNull();
    expect(resolveLibraryCompatibilityIndicator(input({
      overview: officialGame,
      renderedAppId: 55150,
      isNativeNonSteamShortcut: () => false,
    }))).toBeNull();
  });
});

describe("Library card compatibility decoration", () => {
  const CompatibilityIndicator = () => null;

  it("adds Steam's native indicator to the Home carousel at its native slot", () => {
    const output = createElement("div", {}, "art", "in-library", false, "footer");
    const decorated = decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat", 3);
    const children = decorated.props.children as unknown[];

    expect(children).toHaveLength(4);
    expect(children[2]).toMatchObject({
      type: CompatibilityIndicator,
      props: { display: 1, className: "home-compat" },
    });
  });

  it("keeps a non-placeholder Home child when Steam changes the card shape", () => {
    const output = createElement("div", {}, "art", "in-library", "new-native-child", "footer");
    const decorated = decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat", 3);

    expect(decorated.props.children).toMatchObject([
      "art",
      "in-library",
      { type: CompatibilityIndicator, props: { display: 1, className: "home-compat" } },
      "new-native-child",
      "footer",
    ]);
  });

  it("adds Steam's native indicator only inside the Library grid icon row", () => {
    const output = createElement(
      "div",
      {},
      createElement("div", { className: "outside" }, "outside"),
      createElement("div", { className: "grid-icons" }, "existing"),
    );
    const decorated = decorateGridCompatibility(output, CompatibilityIndicator, "grid-icons", "grid-compat", 2);
    const gridIcons = (decorated.props.children as any[])[1];
    const children = gridIcons.props.children as unknown[];

    expect(children).toHaveLength(2);
    expect(children[1]).toMatchObject({
      type: CompatibilityIndicator,
      props: { display: 1, className: "grid-compat" },
    });
  });

  it("does not alter a card when no effective status should be displayed", () => {
    const output = createElement("div", {}, "unchanged");

    expect(decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat", null)).toBe(output);
    expect(decorateGridCompatibility(output, CompatibilityIndicator, "grid-icons", "grid-compat", null)).toBe(output);
  });
});

describe("installLibraryCompatibilityIndicators", () => {
  it("patches only the identified Home and Library-grid renderers, shows a positive exact shortcut status, and cleans both up", () => {
    const carousel = function carousel() {
      /* GameCapsule unable to render #LibraryHome_GameCarousel_ContextMenu gamepadgamecapsule */
      return null;
    };
    const gridRenderer = function gridRenderer() {
      /* eForceHWCompatDisplay bHideCompatIcons LibraryItemBox BIsModOrShortcut */
      return null;
    };
    const home = { render: () => null };
    const grid = Object.assign(function grid() { return null; }, { type: gridRenderer });
    const indicator = () => null;
    const findModuleBySource = vi.fn((fragments: string[]) =>
      fragments[0] === "VirtualizedBoxCarousel" ? { Xd: home } : { TK: grid }
    );
    let homeHandler: ((args: any[], output: any) => any) | undefined;
    let gridHandler: ((args: any[], output: any) => any) | undefined;
    const unpatchHomeRenderer = vi.fn(() => { homeHandler = undefined; });
    const patchHomeRenderer = vi.fn((_component, handler) => {
      homeHandler = handler;
      return unpatchHomeRenderer;
    });
    const unpatchGridRenderer = vi.fn(() => { gridHandler = undefined; });
    const patchGridRenderer = vi.fn((_component, handler) => {
      gridHandler = handler;
      return unpatchGridRenderer;
    });
    const unpatchers: Array<() => void> = [];
    const findInReactTree = vi.fn((tree, predicate) => predicate(tree) ? tree : undefined);
    const createReactTreePatcher = vi.fn((_steps, handler) => handler);
    const candidates = [
      { _: carousel, g: indicator },
      { DeckCompat: "home-compat", GameCapsule: "capsule" },
      { LibraryItemIcons: "grid-icons", SteamDeckCompatIcon: "grid-compat" },
    ];

    installLibraryCompatibilityIndicators(unpatchers, {
      findModuleChild: (predicate) => candidates.map(predicate).find(Boolean),
      findModuleBySource,
      findInReactTree,
      createReactTreePatcher,
      patchHomeRenderer,
      patchGridRenderer,
      getOverview: () => nativeShortcut as any,
      metadataForApp: () => ({ deck_compat_override: 3 } as any),
      isNativeNonSteamShortcut: () => true,
    });

    expect(findModuleBySource).toHaveBeenCalledWith([
      "VirtualizedBoxCarousel",
      "VBC_",
      "fnItemRenderer",
      "CellRenderer",
    ]);
    expect(findModuleBySource).toHaveBeenCalledWith([
      "eForceHWCompatDisplay",
      "bHideCompatIcons",
      "LibraryItemBox",
      "BIsModOrShortcut",
    ]);
    expect(patchHomeRenderer).toHaveBeenCalledWith(home, expect.any(Function));
    expect(patchGridRenderer).toHaveBeenCalledWith(grid, expect.any(Function));

    const homeCard = createElement("div", {}, "art", "in-library", false, "footer");
    const homeOutput = createElement("div", { fnItemRenderer: () => homeCard });
    const patchedHome = homeHandler!([], homeOutput);
    const decoratedHomeCard = patchedHome.props.fnItemRenderer({ appid: nativeShortcut.appid });
    expect(decoratedHomeCard.props.children[2]).toMatchObject({
      type: indicator,
      props: { display: 1, overview: nativeShortcut, className: "home-compat" },
    });

    const gridOutput = createElement(
      "div",
      {},
      createElement("div", { className: "grid-icons" }, "existing"),
    );
    const decoratedGrid = gridHandler!([{ app: nativeShortcut }], gridOutput);
    expect(decoratedGrid.props.children.props.children[1]).toMatchObject({
      type: indicator,
      props: { display: 1, overview: nativeShortcut, className: "grid-compat" },
    });

    unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());

    expect(unpatchHomeRenderer).toHaveBeenCalledOnce();
    expect(unpatchGridRenderer).toHaveBeenCalledOnce();
    expect(homeHandler).toBeUndefined();
    expect(gridHandler).toBeUndefined();
  });

  it("does not change Home or grid output for an unresolved shortcut or an official game", () => {
    const carousel = function carousel() {
      /* GameCapsule unable to render #LibraryHome_GameCarousel_ContextMenu gamepadgamecapsule */
      return null;
    };
    const gridRenderer = function gridRenderer() {
      /* eForceHWCompatDisplay bHideCompatIcons LibraryItemBox BIsModOrShortcut */
      return null;
    };
    const home = { render: () => null };
    const grid = Object.assign(function grid() { return null; }, { type: gridRenderer });
    const indicator = () => null;
    let homeHandler: ((args: any[], output: any) => any) | undefined;
    let gridHandler: ((args: any[], output: any) => any) | undefined;
    const candidates = [
      { _: carousel, g: indicator },
      { DeckCompat: "home-compat", GameCapsule: "capsule" },
      { LibraryItemIcons: "grid-icons", SteamDeckCompatIcon: "grid-compat" },
    ];
    const unpatchers: Array<() => void> = [];

    installLibraryCompatibilityIndicators(unpatchers, {
      findModuleChild: (predicate) => candidates.map(predicate).find(Boolean),
      findModuleBySource: (fragments) => fragments[0] === "VirtualizedBoxCarousel" ? { Xd: home } : { TK: grid },
      findInReactTree: (tree, predicate) => predicate(tree) ? tree : undefined,
      createReactTreePatcher: (_steps, handler) => handler,
      patchHomeRenderer: (_component, handler) => {
        homeHandler = handler;
        return () => { homeHandler = undefined; };
      },
      patchGridRenderer: (_component, handler) => {
        gridHandler = handler;
        return () => { gridHandler = undefined; };
      },
      getOverview: (appId) => appId === nativeShortcut.appid ? nativeShortcut : officialGame,
      metadataForApp: () => ({ deck_compat_override: 0 } as any),
      isNativeNonSteamShortcut: (overview) => overview === nativeShortcut,
    });

    const homeCard = createElement("div", {}, "art", "in-library", false, "footer");
    const homeOutput = createElement("div", { fnItemRenderer: () => homeCard });
    const patchedHome = homeHandler!([], homeOutput);
    expect(patchedHome.props.fnItemRenderer({ appid: nativeShortcut.appid })).toBe(homeCard);

    const gridOutput = createElement("div", {}, createElement("div", { className: "grid-icons" }, "existing"));
    expect(gridHandler!([{ app: nativeShortcut }], gridOutput)).toBe(gridOutput);
    expect(gridHandler!([{ app: officialGame }], gridOutput)).toBe(gridOutput);

    unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
    expect(homeHandler).toBeUndefined();
    expect(gridHandler).toBeUndefined();
  });
});
