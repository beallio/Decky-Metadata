import * as ReactModule from "react";
import { describe, expect, it, vi } from "vitest";

const { createElement, Fragment } = ReactModule;

const reactHooks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  effectDependencies: [] as Array<readonly unknown[] | undefined>,
  setRevision: vi.fn(),
  useEffect: vi.fn((
    effect: () => void | (() => void),
    dependencies?: readonly unknown[],
  ) => {
    reactHooks.effects.push(effect);
    reactHooks.effectDependencies.push(dependencies);
  }),
  useState: vi.fn((initial: number | (() => number)) => [
    typeof initial === "function" ? initial() : initial,
    reactHooks.setRevision,
  ] as const),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof ReactModule>(),
  useEffect: reactHooks.useEffect,
  useState: reactHooks.useState,
}));

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
  type LibraryCompatibilityIndicatorDependencies,
  resolveLibraryCompatibilityIndicator,
} from "./libraryCompatibilityIndicators";
import { notifyCompatibilityRevision } from "./core";

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
    const decorated = decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat");
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
    const decorated = decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat");

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
    const decorated = decorateGridCompatibility(output, CompatibilityIndicator, "grid-icons", "grid-compat");
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

    expect(decorateCarouselCompatibility(output, CompatibilityIndicator, "home-compat")).toBe(output);
    expect(decorateGridCompatibility(gridOutput, CompatibilityIndicator, "grid-icons", "grid-compat")).toBe(gridOutput);
  });
});

describe("installLibraryCompatibilityIndicators", () => {
  const alternateShortcut = { appid: 2155012431, app_type: 1073741824, BIsShortcut: () => true };

  const makeHarness = (options: {
    candidates?: any[];
    findModuleChild?: (predicate: (module: any) => any) => any;
    findModuleBySource?: (fragments: string[]) => any;
    findModulesBySource?: (fragments: string[]) => any[];
    enableSourceFallbacks?: boolean;
    useLiveChildRendererTargets?: boolean;
    useDefaultRevisionHook?: boolean;
    useMemoGridTarget?: boolean;
    patchHomeRenderer?: (component: any, handler: (args: any[], output: any) => any) => () => void;
    patchGridRenderer?: (component: any, handler: (args: any[], output: any) => any) => () => void;
    refreshCompatibilitySurfaces?: () => void;
    metadataForApp?: (appId: number) => any;
    useCompatibilityRevision?: LibraryCompatibilityIndicatorDependencies["useCompatibilityRevision"];
    getOverview?: (appId: number) => any;
    isNativeNonSteamShortcut?: (overview: any) => boolean;
    homeResolution?: () => "valid" | "missing" | "ambiguous";
    throwSourceLookups?: number;
    retryIntervalMs?: number;
    maxResolutionAttempts?: number;
  } = {}) => {
    const carousel = function carousel() {
      /* GameCapsule unable to render #LibraryHome_GameCarousel_ContextMenu gamepadgamecapsule */
      return createElement("div", {}, "art", "in-library", false, "footer");
    };
    const gridRenderer = function gridRenderer() {
      /* eForceHWCompatDisplay bHideCompatIcons LibraryItemBox BIsModOrShortcut */
      return null;
    };
    const home = {
      render: function homeRenderer() {
        /* VBC_ */
        return null;
      },
    };
    const grid = options.useMemoGridTarget
      ? { type: gridRenderer }
      : Object.assign(function grid() { return null; }, { type: gridRenderer });
    const indicator = () => null;
    const useCompatibilityRevision = options.useCompatibilityRevision ?? vi.fn();
    const refreshCompatibilitySurfaces =
      options.refreshCompatibilitySurfaces ?? vi.fn();
    let homeHandler: ((args: any[], output: any) => any) | undefined;
    let gridHandler: ((args: any[], output: any) => any) | undefined;
    const unpatchHomeRenderer = vi.fn(() => { homeHandler = undefined; });
    const unpatchGridRenderer = vi.fn(() => { gridHandler = undefined; });
    const scheduledRetries: Array<{ id: number; callback: () => void }> = [];
    const pendingRetries = new Map<number, () => void>();
    let nextRetryId = 1;
    const scheduleRetry = vi.fn((callback: () => void, _delayMs: number) => {
      const id = nextRetryId++;
      scheduledRetries.push({ id, callback });
      pendingRetries.set(id, callback);
      return id;
    });
    const cancelRetry = vi.fn((id: number) => {
      pendingRetries.delete(id);
    });
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
      ...(options.useLiveChildRendererTargets ? [
        { Xd: home },
        {
          TK: grid,
          hF: () => undefined,
          Mf: () => undefined,
          eL: () => undefined,
          Kt: () => undefined,
          aT: 0,
          dC: 0,
          UT: 0,
          lS: 0,
          oG: 0,
        },
      ] : []),
    ];
    const unpatchers: Array<() => void> = [];
    let remainingSourceLookupFailures = options.throwSourceLookups ?? 0;
    const defaultFindModuleBySource = (fragments: string[]) => {
      if (remainingSourceLookupFailures > 0) {
        remainingSourceLookupFailures -= 1;
        throw new Error("lazy module factory is initializing");
      }
      const resolution = options.homeResolution?.() ?? "valid";
      if (options.enableSourceFallbacks && fragments[0] === "GameCapsule unable to render") {
        return { _: carousel, g: indicator };
      }
      if (fragments[0] === "VirtualizedBoxCarousel") {
        if (resolution === "missing") return undefined;
        if (resolution === "ambiguous") return [{ Xd: home }, { Xd: home }];
        return { Xd: home };
      }
      return { TK: grid };
    };
    const defaultFindModulesBySource = (fragments: string[]) => {
      if (!options.enableSourceFallbacks) return [];
      if (fragments[0] === "DeckCompat") return [{ DeckCompat: "home-compat", GameCapsule: "capsule" }];
      if (fragments[0] === "LibraryItemIcons") {
        return [{ LibraryItemIcons: "grid-icons", SteamDeckCompatIcon: "grid-compat" }];
      }
      return [];
    };

    installLibraryCompatibilityIndicators(unpatchers, {
      findModuleChild: options.findModuleChild ?? ((predicate) => candidates.map(predicate).find(Boolean)),
      findModuleBySource: options.findModuleBySource ?? defaultFindModuleBySource,
      findModulesBySource: options.findModulesBySource ?? defaultFindModulesBySource,
      patchHomeRenderer: options.patchHomeRenderer ?? patchHomeRenderer,
      patchGridRenderer: options.patchGridRenderer ?? patchGridRenderer,
      refreshCompatibilitySurfaces,
      scheduleRetry,
      cancelRetry,
      retryIntervalMs: options.retryIntervalMs ?? 500,
      maxResolutionAttempts: options.maxResolutionAttempts ?? 3,
      getOverview: options.getOverview ?? ((appId) => appId === nativeShortcut.appid ? nativeShortcut : alternateShortcut),
      metadataForApp: options.metadataForApp ?? (() => ({ deck_compat_override: 3 } as any)),
      isNativeNonSteamShortcut: options.isNativeNonSteamShortcut ?? ((overview) => overview === nativeShortcut || overview === alternateShortcut),
      ...(options.useDefaultRevisionHook ? {} : { useCompatibilityRevision }),
    });

    return {
      carousel,
      grid,
      home,
      indicator,
      useCompatibilityRevision,
      refreshCompatibilitySurfaces,
      unpatchers,
      get homeHandler() { return homeHandler; },
      get gridHandler() { return gridHandler; },
      patchHomeRenderer,
      patchGridRenderer,
      unpatchHomeRenderer,
      unpatchGridRenderer,
      scheduleRetry,
      cancelRetry,
      pendingRetries,
      runNextRetry() {
        const next = pendingRetries.entries().next().value;
        if (!next) throw new Error("No pending retry");
        const [id, callback] = next;
        pendingRetries.delete(id);
        callback();
      },
      runScheduledRetry(id: number) {
        const retry = scheduledRetries.find((item) => item.id === id);
        if (!retry) throw new Error(`No scheduled retry ${id}`);
        retry.callback();
      },
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
    expect(harness.scheduleRetry).not.toHaveBeenCalled();
    expect(harness.refreshCompatibilitySurfaces).toHaveBeenCalledOnce();

    const first = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    const second = renderHomeCapsule(harness.homeHandler!, harness.carousel, alternateShortcut.appid);
    const repeat = first.capsule.type(first.capsule.props);

    const firstSlot = first.output.props.children[2];
    const secondSlot = second.output.props.children[2];
    expect(firstSlot.type(firstSlot.props)).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: nativeShortcut, className: "home-compat" },
    });
    expect(secondSlot.type(secondSlot.props)).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: alternateShortcut, className: "home-compat" },
    });
    expect(repeat.props.children[2].type).toBe(firstSlot.type);

    harness.unpatchers[0]();
    expect(harness.unpatchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.unpatchGridRenderer).toHaveBeenCalledOnce();
    expect(first.capsule.type(first.capsule.props).props.children[2]).toBe(false);
  });

  it("keeps Home and grid badge slots reactive when metadata arrives after their first render", () => {
    let metadata: Parameters<typeof resolveLibraryCompatibilityIndicator>[0]["metadata"];
    const useCompatibilityRevision = vi.fn();
    const harness = makeHarness({
      metadataForApp: () => metadata,
      useCompatibilityRevision,
    });

    const home = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    const homeSlot = home.output.props.children[2];
    expect(homeSlot.type).not.toBe(harness.indicator);
    expect(homeSlot.type(homeSlot.props)).toBeNull();

    const gridOutput = createElement(
      "div",
      {},
      createElement("div", { className: "grid-icons" }, "existing"),
    );
    const decoratedGrid = harness.gridHandler!([{ app: nativeShortcut }], gridOutput);
    const gridIcons = decoratedGrid.props.children;
    const gridSlot = gridIcons.props.children[1];
    expect(gridSlot.type).toBe(homeSlot.type);
    expect(gridSlot.type(gridSlot.props)).toBeNull();

    metadata = { deck_compat_override: 3 };
    expect(homeSlot.type(homeSlot.props)).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: nativeShortcut, className: "home-compat" },
    });
    expect(gridSlot.type(gridSlot.props)).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: nativeShortcut, className: "grid-compat" },
    });
    expect(useCompatibilityRevision).toHaveBeenCalledTimes(4);

    harness.unpatchers[0]();
  });

  it("disconnects mounted badge subscribers when the Steam patch is removed", () => {
    const listener = vi.fn();
    let unsubscribe: (() => void) | undefined;
    const harness = makeHarness({
      useCompatibilityRevision: (subscribe) => {
        unsubscribe ??= subscribe(listener);
      },
    });
    const home = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    const homeSlot = home.output.props.children[2];
    homeSlot.type(homeSlot.props);

    notifyCompatibilityRevision();
    expect(listener).toHaveBeenCalledOnce();

    harness.unpatchers[0]();
    notifyCompatibilityRevision();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe?.();
  });

  it("wires the production revision hook through subscribe, update, and unmount", () => {
    reactHooks.effects.length = 0;
    reactHooks.effectDependencies.length = 0;
    reactHooks.setRevision.mockClear();
    reactHooks.useEffect.mockClear();
    reactHooks.useState.mockClear();
    const harness = makeHarness({ useDefaultRevisionHook: true });
    const home = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    const homeSlot = home.output.props.children[2];

    homeSlot.type(homeSlot.props);
    homeSlot.type(homeSlot.props);
    expect(reactHooks.useState).toHaveBeenCalledTimes(2);
    expect(reactHooks.useEffect).toHaveBeenCalledTimes(2);
    const firstDependencies = reactHooks.effectDependencies[0];
    const secondDependencies = reactHooks.effectDependencies[1];
    expect(firstDependencies).toHaveLength(1);
    expect(secondDependencies).toHaveLength(1);
    expect(firstDependencies?.[0]).toBe(secondDependencies?.[0]);
    const cleanup = reactHooks.effects[0]();
    expect(cleanup).toEqual(expect.any(Function));
    expect(reactHooks.setRevision).toHaveBeenCalledOnce();

    notifyCompatibilityRevision();
    expect(reactHooks.setRevision).toHaveBeenCalledTimes(2);

    if (typeof cleanup === "function") cleanup();
    notifyCompatibilityRevision();
    expect(reactHooks.setRevision).toHaveBeenCalledTimes(2);
    harness.unpatchers[0]();
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

    const slot = output.props.children[2];
    expect(slot.type(slot.props)).toMatchObject({
      type: harness.indicator,
      props: { display: 1, overview: nativeShortcut, className: "home-compat" },
    });

    harness.unpatchers[0]();
  });

  it("uses strict source-factory fallbacks for lazy carousel and style exports", () => {
    const harness = makeHarness({ candidates: [], enableSourceFallbacks: true });

    expect(harness.patchHomeRenderer).toHaveBeenCalledWith(harness.home, expect.any(Function));
    expect(harness.patchGridRenderer).toHaveBeenCalledWith(harness.grid, expect.any(Function));
    expect(harness.scheduleRetry).not.toHaveBeenCalled();
    harness.unpatchers[0]();
  });

  it("uses strict live child exports when the factory scanner is unavailable", () => {
    const harness = makeHarness({
      useLiveChildRendererTargets: true,
      findModuleBySource: () => undefined,
    });

    expect(harness.patchHomeRenderer).toHaveBeenCalledWith(harness.home, expect.any(Function));
    expect(harness.patchGridRenderer).toHaveBeenCalledWith(harness.grid, expect.any(Function));
    harness.unpatchers[0]();
  });

  it("accepts Steam's writable memo grid renderer target", () => {
    const harness = makeHarness({
      useLiveChildRendererTargets: true,
      useMemoGridTarget: true,
      findModuleBySource: () => undefined,
    });

    expect(harness.patchGridRenderer).toHaveBeenCalledWith(harness.grid, expect.any(Function));
    harness.unpatchers[0]();
  });

  it("retries when Decky's child finder races a lazy module scan", () => {
    let homeResolution: "valid" | "missing" = "missing";
    const harness = makeHarness({
      enableSourceFallbacks: true,
      findModuleChild: () => { throw new Error("lazy module changed during scan"); },
      homeResolution: () => homeResolution,
    });

    expect(harness.scheduleRetry).toHaveBeenCalledOnce();
    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();

    homeResolution = "valid";
    harness.runNextRetry();

    expect(harness.patchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.patchGridRenderer).toHaveBeenCalledOnce();
    harness.unpatchers[0]();
  });

  it("reinstalls one owned Home wrapper after cleanup without retaining the old decorator", () => {
    const first = makeHarness();
    const cached = renderHomeCapsule(first.homeHandler!, first.carousel, nativeShortcut.appid).capsule;
    first.unpatchers[0]();
    const second = makeHarness();
    const rerendered = renderHomeCapsule(second.homeHandler!, second.carousel, nativeShortcut.appid);

    expect(cached.type(cached.props).props.children[2]).toBe(false);
    const reinstalledSlot = rerendered.output.props.children[2];
    expect(reinstalledSlot.type(reinstalledSlot.props).type).toBe(second.indicator);
    expect(rerendered.capsule.type).not.toBe(cached.type);
    second.unpatchers[0]();
  });

  it("mounts inert owned slots for unresolved shortcuts and leaves official games unchanged", () => {
    const harness = makeHarness({
      getOverview: (appId) => appId === nativeShortcut.appid ? nativeShortcut : officialGame,
      metadataForApp: () => ({ deck_compat_override: 0 } as any),
      isNativeNonSteamShortcut: (overview) => overview === nativeShortcut,
    });

    const home = renderHomeCapsule(harness.homeHandler!, harness.carousel, nativeShortcut.appid);
    const homeSlot = home.output.props.children[2];
    expect(homeSlot.type(homeSlot.props)).toBeNull();

    const gridOutput = createElement("div", {}, createElement("div", { className: "grid-icons" }, "existing"));
    const decoratedGrid = harness.gridHandler!([{ app: nativeShortcut }], gridOutput);
    const gridSlot = decoratedGrid.props.children.props.children[1];
    expect(gridSlot.type(gridSlot.props)).toBeNull();
    expect(harness.gridHandler!([{ app: officialGame }], gridOutput)).toBe(gridOutput);

    harness.unpatchers[0]();
  });

  it("retries missing lazy Library targets and installs the wrappers exactly once when they resolve", () => {
    let homeResolution: "valid" | "missing" = "missing";
    const harness = makeHarness({ homeResolution: () => homeResolution });

    expect(harness.unpatchers).toHaveLength(1);
    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.scheduleRetry).toHaveBeenCalledOnce();
    expect(harness.scheduleRetry).toHaveBeenCalledWith(expect.any(Function), 500);

    homeResolution = "valid";
    harness.runNextRetry();

    expect(harness.patchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.patchGridRenderer).toHaveBeenCalledOnce();
    expect(harness.pendingRetries.size).toBe(0);
    expect(harness.scheduleRetry).toHaveBeenCalledOnce();
    harness.unpatchers[0]();
  });

  it("cancels a pending target retry and keeps a raced callback inert after cleanup", () => {
    const harness = makeHarness({ homeResolution: () => "missing" });

    harness.unpatchers[0]();

    expect(harness.cancelRetry).toHaveBeenCalledWith(1);
    expect(harness.pendingRetries.size).toBe(0);
    harness.runScheduledRetry(1);
    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.scheduleRetry).toHaveBeenCalledOnce();
  });

  it("retries an ambiguous target until one unique Library module remains", () => {
    let homeResolution: "valid" | "ambiguous" = "ambiguous";
    const harness = makeHarness({ homeResolution: () => homeResolution });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();

    homeResolution = "valid";
    harness.runNextRetry();

    expect(harness.patchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.patchGridRenderer).toHaveBeenCalledOnce();
    harness.unpatchers[0]();
  });

  it("retries when a lazy source factory throws during target resolution", () => {
    const harness = makeHarness({ throwSourceLookups: 1 });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.scheduleRetry).toHaveBeenCalledOnce();

    harness.runNextRetry();

    expect(harness.patchHomeRenderer).toHaveBeenCalledOnce();
    expect(harness.patchGridRenderer).toHaveBeenCalledOnce();
    harness.unpatchers[0]();
  });

  it("stops retrying unresolved targets at the bounded attempt limit", () => {
    const harness = makeHarness({
      homeResolution: () => "missing",
      maxResolutionAttempts: 2,
    });

    expect(harness.scheduleRetry).toHaveBeenCalledOnce();
    harness.runNextRetry();

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.pendingRetries.size).toBe(0);
    expect(harness.scheduleRetry).toHaveBeenCalledOnce();
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
    expect(harness.unpatchers).toHaveLength(1);
  });

  it("fails closed when the grid target is missing", () => {
    const harness = makeHarness({
      findModuleBySource: (fragments) => fragments[0] === "VirtualizedBoxCarousel"
        ? { Xd: { render: () => null } }
        : undefined,
    });

    expect(harness.patchHomeRenderer).not.toHaveBeenCalled();
    expect(harness.patchGridRenderer).not.toHaveBeenCalled();
    expect(harness.unpatchers).toHaveLength(1);
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
    expect(harness.unpatchers).toHaveLength(1);
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
