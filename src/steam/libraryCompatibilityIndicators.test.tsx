import { createElement, Fragment } from "react";
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
    expect((children[2] as any).key).toBe("decky-metadata-compatibility-home");
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
    expect((children[1] as any).key).toBe("decky-metadata-compatibility-grid");
  });

  it("keeps existing native or plugin indicators and unrelated false, null, fragment, and icon-row children", () => {
    const output = createElement(
      "div",
      {},
      "art",
      "in-library",
      createElement(CompatibilityIndicator, { display: 1 }),
      false,
      null,
      createElement(Fragment, {}, "footer"),
    );
    const pluginKey = createElement("span", { key: "decky-metadata-compatibility-grid" });
    const gridOutput = createElement(
      "div",
      {},
      createElement("div", { className: "grid-icons" }, false, null, pluginKey),
      createElement("div", { className: "outside" }, "keep"),
    );

    expect(decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat", 3)).toBe(output);
    expect(decorateGridCompatibility(gridOutput, CompatibilityIndicator, "grid-icons", "grid-compat", 2)).toBe(gridOutput);
  });

  it("does not alter a card when no effective status should be displayed", () => {
    const output = createElement("div", {}, "unchanged");

    expect(decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat", null)).toBe(output);
    expect(decorateGridCompatibility(output, CompatibilityIndicator, "grid-icons", "grid-compat", null)).toBe(output);
  });
});

describe("installLibraryCompatibilityIndicators", () => {
  const alternateShortcut = { appid: 2155012431, app_type: 1073741824, BIsShortcut: () => true };

  const makeHarness = (options: {
    candidates?: any[];
    findModuleBySource?: (fragments: string[]) => any;
    patchHomeRenderer?: (component: any, handler: (args: any[], output: any) => any) => () => void;
    patchGridRenderer?: (component: any, handler: (args: any[], output: any) => any) => () => void;
    metadataForApp?: (appId: number) => any;
    getOverview?: (appId: number) => any;
    isNativeNonSteamShortcut?: (overview: any) => boolean;
  } = {}) => {
    const carousel = function carousel() {
      /* GameCapsule unable to render #LibraryHome_GameCarousel_ContextMenu gamepadgamecapsule */
      return createElement("div", {}, "art", "in-library", false, "footer");
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
    const unpatchHomeRenderer = vi.fn(() => { homeHandler = undefined; });
    const unpatchGridRenderer = vi.fn(() => { gridHandler = undefined; });
    const patchHomeRenderer = vi.fn((_component, handler) => {
      homeHandler = handler;
      return unpatchHomeRenderer;
    });
    const patchGridRenderer = vi.fn((_component, handler) => {
      gridHandler = handler;
      return unpatchGridRenderer;
    });
    const candidates = options.candidates ?? [
      { _: carousel, g: indicator },
      { DeckCompat: "home-compat", GameCapsule: "capsule" },
      { LibraryItemIcons: "grid-icons", SteamDeckCompatIcon: "grid-compat" },
    ];
    const unpatchers: Array<() => void> = [];

    installLibraryCompatibilityIndicators(unpatchers, {
      findModuleChild: (predicate) => candidates.map(predicate).find(Boolean),
      findModuleBySource: options.findModuleBySource ?? ((fragments) => fragments[0] === "VirtualizedBoxCarousel" ? { Xd: home } : { TK: grid }),
      patchHomeRenderer: options.patchHomeRenderer ?? patchHomeRenderer,
      patchGridRenderer: options.patchGridRenderer ?? patchGridRenderer,
      getOverview: options.getOverview ?? ((appId) => appId === nativeShortcut.appid ? nativeShortcut : alternateShortcut),
      metadataForApp: options.metadataForApp ?? (() => ({ deck_compat_override: 3 } as any)),
      isNativeNonSteamShortcut: options.isNativeNonSteamShortcut ?? ((overview) => overview === nativeShortcut || overview === alternateShortcut),
    });

    return {
      carousel,
      grid,
      home,
      indicator,
      unpatchers,
      get homeHandler() { return homeHandler; },
      get gridHandler() { return gridHandler; },
      patchHomeRenderer,
      patchGridRenderer,
      unpatchHomeRenderer,
      unpatchGridRenderer,
    };
  };

  const renderHomeCapsule = (handler: (args: any[], output: any) => any, carousel: any, appid: number) => {
    const homeOutput = createElement("div", {
      fnItemRenderer: (item: any) => createElement(
        "section",
        {},
        createElement(carousel, { appid: item.appid }),
      ),
    });
    const patchedHome = handler([], homeOutput);
    const tree = patchedHome.props.fnItemRenderer({ appid });
    const capsule = tree.props.children;
    return { capsule, output: capsule.type(capsule.props) };
  };

  it("uses a faithful two-phase Home wrapper, prevents App-ID bleed and duplicate badges, and makes cached cards inert on cleanup", () => {
    const harness = makeHarness({
      metadataForApp: (appId) => ({ deck_compat_override: appId === nativeShortcut.appid ? 3 : 2 } as any),
    });

    expect(harness.patchHomeRenderer).toHaveBeenCalledWith(harness.home, expect.any(Function));
    expect(harness.patchGridRenderer).toHaveBeenCalledWith(harness.grid, expect.any(Function));

    const first = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    const second = renderHomeCapsule(harness.homeHandler!, harness.carousel, alternateShortcut.appid);
    const repeat = first.capsule.type(first.capsule.props);

    expect(first.output.props.children[2]).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: nativeShortcut, className: "home-compat" },
    });
    expect(second.output.props.children[2]).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: alternateShortcut, className: "home-compat" },
    });
    expect(repeat.props.children.filter((child: any) => child?.type === harness.indicator)).toHaveLength(1);

    harness.unpatchers[0]();
    expect(harness.unpatchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.unpatchGridRenderer).toHaveBeenCalledOnce();
    expect(first.capsule.type(first.capsule.props).props.children[2]).toBe(false);
  });

  it("uses the live carousel app prop when the renderer does not provide a top-level App ID", () => {
    const harness = makeHarness();
    const homeOutput = createElement("div", {
      fnItemRenderer: (item: any) => createElement(
        "section",
        {},
        createElement(harness.carousel, { app: item.app }),
      ),
    });

    const patchedHome = harness.homeHandler!([], homeOutput);
    const capsule = patchedHome.props.fnItemRenderer({ app: nativeShortcut }).props.children;
    const output = capsule.type(capsule.props);

    expect(output.props.children[2]).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: nativeShortcut, className: "home-compat" },
    });

    harness.unpatchers[0]();
  });

  it("reinstalls one owned Home wrapper after cleanup without retaining the old decorator", () => {
    const first = makeHarness();
    const cached = renderHomeCapsule(first.homeHandler!, first.carousel, nativeShortcut.appid).capsule;
    first.unpatchers[0]();
    const second = makeHarness();
    const rerendered = renderHomeCapsule(second.homeHandler!, second.carousel, nativeShortcut.appid);

    expect(cached.type(cached.props).props.children[2]).toBe(false);
    expect(rerendered.output.props.children.filter((child: any) => child?.type === second.indicator)).toHaveLength(1);
    expect(rerendered.capsule.type).not.toBe(cached.type);
    second.unpatchers[0]();
  });

  it("does not change Home or grid output for an unresolved shortcut or an official game", () => {
    const harness = makeHarness({
      getOverview: (appId) => appId === nativeShortcut.appid ? nativeShortcut : officialGame,
      metadataForApp: () => ({ deck_compat_override: 0 } as any),
      isNativeNonSteamShortcut: (overview) => overview === nativeShortcut,
    });

    const home = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    expect(home.output.props.children[2]).toBe(false);

    const gridOutput = createElement("div", {}, createElement("div", { className: "grid-icons" }, "existing"));
    expect(harness.gridHandler!([{ app: nativeShortcut }], gridOutput)).toBe(gridOutput);
    expect(harness.gridHandler!([{ app: officialGame }], gridOutput)).toBe(gridOutput);

    harness.unpatchers[0]();
  });

  it.each([
    ["missing", () => undefined],
    ["renamed", (_home: any, grid: any) => ({ Yd: _home, TK: grid })],
    ["swapped", (_home: any, grid: any) => ({ TK: grid })],
    ["ambiguous", (home: any) => [{ Xd: home }, { Xd: home }]],
  ])("fails closed when Home target resolution is %s", (_label, homeModule) => {
    const harness = makeHarness({
      findModuleBySource: (fragments) => fragments[0] === "VirtualizedBoxCarousel"
        ? homeModule({ render: () => null }, Object.assign(() => null, { type: () => null }))
        : { TK: Object.assign(() => null, { type: () => null }) },
    });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.unpatchers).toHaveLength(0);
  });

  it("fails closed when the grid target is missing", () => {
    const harness = makeHarness({
      findModuleBySource: (fragments) => fragments[0] === "VirtualizedBoxCarousel"
        ? { Xd: { render: () => null } }
        : undefined,
    });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.unpatchers).toHaveLength(0);
  });

  it.each([
    ["a non-callable Home render", { render: "not a function" }, Object.assign(() => null, { type: () => null })],
    ["a non-callable grid type", { render: () => null }, Object.assign(() => null, { type: "not a function" })],
  ])("fails closed for %s", (_label, home, grid) => {
    const harness = makeHarness({
      findModuleBySource: (fragments) => fragments[0] === "VirtualizedBoxCarousel" ? { Xd: home } : { TK: grid },
    });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
  });

  it("fails closed for an invalid indicator export", () => {
    const carousel = function carousel() {
      /* GameCapsule unable to render #LibraryHome_GameCarousel_ContextMenu gamepadgamecapsule */
      return null;
    };
    const harness = makeHarness({
      candidates: [
        { _: carousel, g: "not a component" },
        { DeckCompat: "home-compat", GameCapsule: "capsule" },
        { LibraryItemIcons: "grid-icons", SteamDeckCompatIcon: "grid-compat" },
      ],
    });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
  });

  it("unwinds Home immediately when grid installation fails", () => {
    const gridInstallFailure = vi.fn(() => { throw new Error("grid target changed"); });
    const harness = makeHarness({ patchGridRenderer: gridInstallFailure });

    expect(gridInstallFailure).toHaveBeenCalledOnce();
    expect(harness.unpatchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.unpatchers).toHaveLength(0);
  });

  it("requires writable renderer descriptors before patching", () => {
    const home = {} as { render?: () => void };
    Object.defineProperty(home, "render", { value: () => undefined, writable: false });
    const grid = Object.assign(() => null, {} as { type?: () => void });
    Object.defineProperty(grid, "type", { value: () => undefined, writable: false });
    const harness = makeHarness({
      findModuleBySource: (fragments) => fragments[0] === "VirtualizedBoxCarousel" ? { Xd: home } : { TK: grid },
    });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
  });
});
