import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeHandlers: [] as Array<(tree: unknown) => unknown>,
  addPatch: vi.fn((_route: string, handler: (tree: unknown) => unknown) => {
    mocks.routeHandlers.push(handler);
    return handler;
  }),
  removePatch: vi.fn(),
  findModuleChild: vi.fn(),
  afterPatch: vi.fn((target: Record<string, unknown>, method: string, handler: Function) => {
    const original = target[method] as (...args: unknown[]) => unknown;
    target[method] = function (this: unknown, ...args: unknown[]) {
      return handler.call(this, args, original.apply(this, args));
    };
    return { unpatch: () => { target[method] = original; } };
  }),
}));

vi.mock("@decky/api", () => ({
  routerHook: {
    addPatch: mocks.addPatch,
    removePatch: mocks.removePatch,
  },
}));
vi.mock("@decky/ui", () => ({
  afterPatch: mocks.afterPatch,
  findInReactTree: vi.fn((tree: unknown) => tree),
  findModuleChild: mocks.findModuleChild,
}));
vi.mock("../backend", () => ({ frontendLog: vi.fn(() => Promise.resolve()) }));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  armRouteShield,
  compatibilityRevisionSnapshot,
  currentRoutePath,
  isCurrentGameDetailRoute,
  metadataCache,
  metadataState,
  notifyCompatibilityRevision,
} from "./core";
import { installMetadataPatches, setConfirmedCompatibilityDefault } from "./metadataPatch";
import { installRouterRenderPatches } from "./routerPatches";

afterEach(() => {
  mocks.routeHandlers.length = 0;
  mocks.addPatch.mockClear();
  mocks.removePatch.mockClear();
  mocks.afterPatch.mockClear();
  mocks.findModuleChild.mockReset();
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  metadataState.compatibilityRevision = 0;
  metadataState.lastObservedGameDetailAppId = 0;
  metadataState.bypassCounter = 0;
  metadataState.routeShield = null;
  metadataState.compatibilityDefault = null;
  metadataState.compatibilityDefaultLoaded = false;
  delete (globalThis as any).Router;
  delete (globalThis as any).window;
  delete (globalThis as any).appStore;
  delete (globalThis as any).appDetailsStore;
  delete (globalThis as any).document;
  delete (globalThis as any).parent;
  delete (globalThis as any).top;
  delete (globalThis as any).SteamUIStore;
  vi.useRealTimers();
});

describe("router compatibility publication", () => {
  it.each([
    ["Follow Valve", "valve" as const],
    ["an explicit category", 3 as const],
  ])("protects a pre-mounted %s Game Info refresh after its old shield expires", (_label, override) => {
    vi.useFakeTimers();
    const appId = 9710;
    class NativeOverview {
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0x0f;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      GetPerClientData() {
        return {};
      }

      GetGameID() {
        return this.BIsModOrShortcut();
      }
    }
    const overview = new NativeOverview();
    const details = { GetDescriptions: () => ({ strSnippet: "rich details" }) };
    class NativeGameInfo {
      props: { overview: NativeOverview; details: typeof details };
      m_bDelayedLoad = false;
      forceUpdate = vi.fn(() => this.render());

      constructor(props: { overview: NativeOverview; details: typeof details }) {
        this.props = props;
      }

      componentDidMount() {}

      render() {
        if (this.m_bDelayedLoad) return null;
        this.props.overview.GetPerClientData();
        const isNonSteam = this.props.overview.BIsModOrShortcut();
        const descriptions = this.props.details.GetDescriptions();
        return isNonSteam ? null : descriptions;
      }
    }
    (NativeGameInfo.prototype as any).isReactComponent = {};
    mocks.findModuleChild.mockImplementation((predicate: (module: unknown) => unknown) =>
      predicate({ NativeGameInfo })
    );
    (globalThis as any).Router = {
      WindowStore: {
        GamepadUIMainWindowInstance: {
          m_history: { location: { pathname: `/library/app/${appId}/tab/GameInfo` } },
        },
      },
    };
    (globalThis as any).window = { location: { pathname: `/library/app/${appId}/tab/GameInfo` } };
    (globalThis as any).appStore = { allApps: [overview] };
    (globalThis as any).appDetailsStore = {};
    metadataCache[String(appId)] = {
      steam_appid: 55150,
      deck_compat_override: override,
      deck_compat_category: 3,
    } as any;
    metadataState.compatibilityDefault = 3;
    metadataState.compatibilityDefaultLoaded = true;
    const metadataUnpatchers: Array<() => void> = [];
    installMetadataPatches(metadataUnpatchers);

    const mounted = new NativeGameInfo({ overview, details });
    const anchor = {
      textContent: "Steam Deck Compatibility",
      children: [],
      __reactFiber$test: {
        elementType: NativeGameInfo,
        stateNode: mounted,
        return: null,
      },
    };
    const sharedDocument = { querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []) };
    const bigPictureDocument = { querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => [anchor]) };
    (globalThis as any).document = sharedDocument;
    (globalThis as any).parent = {
      webpackChunksteamui: [],
      SteamUIStore: {
        m_WindowStore: {
          MainWindowInstance: { m_BrowserWindow: { document: bigPictureDocument } },
        },
      },
    };
    (globalThis as any).top = { document: sharedDocument };

    const unpatchers: Array<() => void> = [];
    const originalMount = NativeGameInfo.prototype.componentDidMount;
    installRouterRenderPatches(unpatchers, {
      ensureMetadataCache: vi.fn(async () => undefined),
      applyMetadata: vi.fn(() => false),
      tryEnrichScreenshotsForApp: vi.fn(async () => undefined),
      tryFetchMetadataForApp: vi.fn(async () => undefined),
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });
    expect(mocks.findModuleChild).toHaveBeenCalled();
    expect(NativeGameInfo.prototype.componentDidMount).not.toBe(originalMount);
    expect(isCurrentGameDetailRoute(currentRoutePath(), overview.appid)).toBe(true);

    armRouteShield(appId, currentRoutePath(), "pre-existing-render");
    const shieldHitsBeforeLaunch = metadataState.routeShield?.remaining;
    expect(overview.GetGameID()).toBe(true);
    expect(metadataState.routeShield?.remaining).toBe(shieldHitsBeforeLaunch);
    vi.advanceTimersByTime(2_100);
    expect(mounted.props.overview).toBe(overview);

    setConfirmedCompatibilityDefault(1);

    expect(mounted.forceUpdate).toHaveBeenCalledOnce();
    expect(mounted.props.overview).toBe(overview);
    expect(mounted.props.details).toBe(details);
    expect(mounted.forceUpdate).toHaveReturnedWith({ strSnippet: "rich details" });
    expect(bigPictureDocument.querySelectorAll).toHaveBeenCalledWith("div");
    expect(sharedDocument.querySelectorAll).not.toHaveBeenCalled();
    unpatchers.reverse().forEach((unpatch) => unpatch());
    metadataUnpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it("refreshes a mounted observer-wrapped Game Info renderer found only through the real document fiber", () => {
    const appId = 9711;
    class NativeOverview {
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      GetPerClientData() {
        return {};
      }
    }
    const overview = new NativeOverview();
    const details = { GetDescriptions: () => ({ strSnippet: "rich details" }) };
    class NativeGameInfo {
      props: { overview: NativeOverview; details: typeof details };
      forceUpdate = vi.fn(() => this.render());

      constructor(props: { overview: NativeOverview; details: typeof details }) {
        this.props = props;
      }

      componentDidMount() {}

      componentWillUnmount() {}

      render() {
        this.props.overview.BIsModOrShortcut();
        this.props.details.GetDescriptions();
        const packedCategory = this.props.overview.steam_hw_compat_category_packed & 0x0f;
        return packedCategory === 0x0f
          ? { content: "rich game info", category: "Verified" }
          : { content: "non-Steam placeholder", category: "Unknown" };
      }
    }
    (NativeGameInfo.prototype as any).isReactComponent = {};
    const nativeRender = NativeGameInfo.prototype.render;
    Object.defineProperty(NativeGameInfo.prototype, "render", {
      configurable: true,
      writable: true,
      value: function observerWrappedRender(this: NativeGameInfo) {
        return nativeRender.call(this);
      },
    });
    mocks.findModuleChild.mockReturnValue(undefined);
    (globalThis as any).Router = {
      WindowStore: {
        GamepadUIMainWindowInstance: {
          m_history: { location: { pathname: `/library/app/${appId}/tab/GameInfo` } },
        },
      },
    };
    (globalThis as any).window = { location: { pathname: `/library/app/${appId}/tab/GameInfo` } };
    (globalThis as any).appStore = { allApps: [overview] };
    (globalThis as any).appDetailsStore = {};
    metadataCache[String(appId)] = {
      steam_appid: 55150,
      deck_compat_category: 3,
    } as any;
    metadataState.compatibilityDefault = null;
    metadataState.compatibilityDefaultLoaded = true;
    const metadataUnpatchers: Array<() => void> = [];
    installMetadataPatches(metadataUnpatchers);

    const mounted = new NativeGameInfo({ overview, details });
    const fallbackParagraph = {
      textContent: "This non-Steam game has no Game Info details.",
      children: [],
      __reactFiber$test: {
        elementType: () => null,
        stateNode: null,
        return: {
          elementType: NativeGameInfo,
          stateNode: mounted,
          return: null,
        },
      },
    };
    const bigPictureDocument = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [fallbackParagraph]),
    };
    (globalThis as any).document = { querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []) };
    (globalThis as any).parent = {
      webpackChunksteamui: [],
      SteamUIStore: {
        m_WindowStore: {
          MainWindowInstance: { m_BrowserWindow: { document: bigPictureDocument } },
        },
      },
    };
    (globalThis as any).top = { document: (globalThis as any).document };

    const unpatchers: Array<() => void> = [];
    installRouterRenderPatches(unpatchers, {
      ensureMetadataCache: vi.fn(async () => undefined),
      applyMetadata: vi.fn(() => false),
      tryEnrichScreenshotsForApp: vi.fn(async () => undefined),
      tryFetchMetadataForApp: vi.fn(async () => undefined),
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });

    setConfirmedCompatibilityDefault(3);

    expect(mounted.forceUpdate).toHaveBeenCalledOnce();
    expect(mounted.forceUpdate).toHaveReturnedWith({ content: "rich game info", category: "Verified" });
    expect(bigPictureDocument.querySelectorAll).toHaveBeenCalledWith("div");
    unpatchers.reverse().forEach((unpatch) => unpatch());
    notifyCompatibilityRevision();
    expect(mounted.forceUpdate).toHaveBeenCalledOnce();
    metadataUnpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it.each([
    [false, 0],
    [true, 1],
  ])("publishes only when route metadata changes: changed=%s", async (changed, expectedRevision) => {
    const appId = changed ? 9701 : 9702;
    const overview = {
      appid: appId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
    };
    const output = { props: { children: { props: { overview } } } };
    const renderTree = { renderFunc: () => output };
    const ensureMetadataCache = vi.fn(async () => undefined);
    const applyMetadata = vi.fn(() => changed);
    const unpatchers: Array<() => void> = [];

    installRouterRenderPatches(unpatchers, {
      ensureMetadataCache,
      applyMetadata,
      tryEnrichScreenshotsForApp: vi.fn(async () => undefined),
      tryFetchMetadataForApp: vi.fn(async () => undefined),
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });
    expect(mocks.routeHandlers.length).toBeGreaterThan(0);

    mocks.routeHandlers[0](renderTree);
    renderTree.renderFunc();
    await vi.waitFor(() => expect(applyMetadata).toHaveBeenCalledWith(appId));

    expect(compatibilityRevisionSnapshot()).toBe(expectedRevision);
    unpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it("does not resume a pending route callback after its lifecycle ends", async () => {
    const appId = 9703;
    const overview = {
      appid: appId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
    };
    const output = { props: { children: { props: { overview } } } };
    const renderTree = { renderFunc: () => output };
    let resolveCache!: () => void;
    const ensureMetadataCache = vi.fn(() => new Promise<void>((resolve) => {
      resolveCache = resolve;
    }));
    const applyMetadata = vi.fn(() => true);
    const tryEnrichScreenshotsForApp = vi.fn(async () => undefined);
    const tryFetchMetadataForApp = vi.fn(async () => undefined);
    metadataState.compatibilityLifecycleGeneration = 1;
    const unpatchers: Array<() => void> = [];

    installRouterRenderPatches(unpatchers, {
      ensureMetadataCache,
      applyMetadata,
      tryEnrichScreenshotsForApp,
      tryFetchMetadataForApp,
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });
    mocks.routeHandlers[0](renderTree);
    renderTree.renderFunc();
    metadataState.compatibilityLifecycleGeneration += 1;
    resolveCache();
    await Promise.resolve();

    expect(applyMetadata).not.toHaveBeenCalled();
    expect(tryEnrichScreenshotsForApp).not.toHaveBeenCalled();
    expect(tryFetchMetadataForApp).not.toHaveBeenCalled();
    unpatchers.reverse().forEach((unpatch) => unpatch());
  });
});
