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
import { applyMetadata, installMetadataPatches, setConfirmedCompatibilityDefault } from "./metadataPatch";
import {
  installGameDetailReentryShield,
  installNonSteamQuickLinkPolicy,
  installRouterRenderPatches,
} from "./routerPatches";

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
  it("keeps a query/hash Game Info history event held until a real tab exit", () => {
    const appId = 9714;
    const overview = {
      appid: appId,
      app_type: 1073741824,
      steam_hw_compat_category_packed: 0x6a,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
    };
    let historyListener: ((location: unknown) => void) | undefined;
    const history = {
      location: {
        pathname: `/library/app/${appId}`,
        search: "?tab=GameInfo",
        hash: "#compatibility",
      },
      listen: vi.fn((listener: (location: unknown) => void) => {
        historyListener = listener;
        return vi.fn();
      }),
    };
    (globalThis as any).Router = {
      WindowStore: { GamepadUIMainWindowInstance: { m_history: history } },
    };
    (globalThis as any).window = {
      location: {
        pathname: `/library/app/${appId}`,
        search: "?tab=GameInfo",
        hash: "#compatibility",
      },
    };
    (globalThis as any).appStore = {
      allApps: [overview],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? overview : null,
    };
    (globalThis as any).appDetailsStore = {};
    metadataState.compatibilityDefault = 3;
    metadataState.compatibilityDefaultLoaded = true;
    const metadataUnpatchers: Array<() => void> = [];
    installMetadataPatches(metadataUnpatchers);
    setConfirmedCompatibilityDefault(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0x6a);

    const shieldUnpatchers: Array<() => void> = [];
    installGameDetailReentryShield(shieldUnpatchers);
    if (!historyListener) throw new Error("history listener was not installed");

    historyListener({
      pathname: `/library/app/${appId}`,
      search: "?tab=GameInfo",
      hash: "#compatibility",
    });
    expect(overview.steam_hw_compat_category_packed).toBe(0x6a);

    historyListener({
      pathname: `/library/app/${appId}`,
      search: "?tab=Activity",
      hash: "#compatibility",
    });
    expect(overview.steam_hw_compat_category_packed).toBe(0x6f);

    shieldUnpatchers.reverse().forEach((unpatch) => unpatch());
    metadataUnpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it("keeps matched Game Info rich when Done returns after a completed editor save", () => {
    const appId = 9715;
    class NativeOverview {
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0x0a;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }
    }
    const overview = new NativeOverview();
    const overviews: any = new Map([[appId, overview]]);
    let classificationAtMapPublication: "non-Steam placeholder" | "rich matched Game Info" | undefined;
    const nativeSet = vi.fn((key: number, value: NativeOverview) => {
      // Steam's observable app map can synchronously classify a replacement
      // before NavigateBack commits its Game Info route. That classification
      // is the placeholder race reported by the Deck validation.
      classificationAtMapPublication = value.BIsModOrShortcut()
        ? "non-Steam placeholder"
        : "rich matched Game Info";
      return Map.prototype.set.call(overviews, key, value);
    });
    overviews.originalSet = nativeSet;
    const history = {
      index: 1,
      entries: [
        { pathname: `/library/app/${appId}/tab/GameInfo` },
        { pathname: `/decky-metadata/${appId}` },
      ],
      location: { pathname: `/decky-metadata/${appId}` },
      goBack: vi.fn(),
    };
    history.goBack.mockImplementation(() => {
      history.location = { pathname: `/library/app/${appId}/tab/GameInfo` };
    });
    (globalThis as any).Router = {
      WindowStore: { GamepadUIMainWindowInstance: { m_history: history } },
    };
    (globalThis as any).window = { location: { pathname: `/decky-metadata/${appId}` } };
    (globalThis as any).appStore = {
      allApps: [overview],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? overview : null,
    };
    (globalThis as any).appDetailsStore = {};
    metadataCache[String(appId)] = {
      steam_appid: 15100,
      deck_compat_override: 1,
    } as any;

    const metadataUnpatchers: Array<() => void> = [];
    installMetadataPatches(metadataUnpatchers);
    expect(applyMetadata(appId, { publishCompatibility: false })).toBe(true);
    expect(overview.steam_hw_compat_category_packed & 0x0f).toBe(0x05);
    expect(nativeSet).not.toHaveBeenCalled();

    const shieldUnpatchers: Array<() => void> = [];
    installGameDetailReentryShield(shieldUnpatchers);
    history.goBack();

    // Steam can enter the route while its browser token still names the
    // editor. Exercise the real route-render hook between NavigateBack and
    // the first native identity call; it must retain an exact shield path.
    const routeProps = {
      renderFunc: () => ({ props: { children: { props: { overview } } } }),
    };
    const routerUnpatchers: Array<() => void> = [];
    installRouterRenderPatches(routerUnpatchers, {
      ensureMetadataCache: vi.fn(async () => undefined),
      applyMetadata: vi.fn(() => false),
      tryEnrichScreenshotsForApp: vi.fn(async () => undefined),
      tryFetchMetadataForApp: vi.fn(async () => undefined),
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });
    mocks.routeHandlers[0](routeProps);
    routeProps.renderFunc();

    const renderGameInfo = () => ({
      content: classificationAtMapPublication ??
        (overview.BIsModOrShortcut() ? "non-Steam placeholder" : "rich matched Game Info"),
      category: (overview.steam_hw_compat_category_packed & 0x0f) === 0x05 ? "Unsupported" : "other",
    });
    expect(renderGameInfo()).toEqual({ content: "rich matched Game Info", category: "Unsupported" });

    routerUnpatchers.reverse().forEach((unpatch) => unpatch());
    shieldUnpatchers.reverse().forEach((unpatch) => unpatch());
    metadataUnpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it("keeps retained quick-link wrappers single across a plugin reimport", () => {
    const appId = 9713;
    const overview = {
      appid: appId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
    };
    const details = {};
    const reactElement = Symbol.for("react.element");
    const OriginalQuickLinks = () => null;
    let quickLinksElement: any;
    const OriginalInfoBoundary = () => quickLinksElement;
    quickLinksElement = {
      $$typeof: reactElement,
      type: OriginalQuickLinks,
      props: { overview, details, workshopVisible: false, marketPresence: false },
    };
    const infoBoundaryElement: any = {
      $$typeof: reactElement,
      type: OriginalInfoBoundary,
      props: { overview, details, children: quickLinksElement },
    };
    const retainedInfoTree = {
      $$typeof: reactElement,
      type: "div",
      props: { children: infoBoundaryElement },
    };
    class InfoSectionHost {
      props = { name: "info" };

      render() {
        // Steam's section host exposes this stable native fingerprint.
        void "RegisterSection";
        return retainedInfoTree;
      }
    }
    (InfoSectionHost.prototype as any).isReactComponent = {};
    mocks.findModuleChild.mockImplementation((predicate: (module: unknown) => unknown) =>
      predicate({ InfoSectionHost })
    );
    metadataCache[String(appId)] = { steam_appid: 55150 } as any;

    const firstLifetime: Array<() => void> = [];
    installNonSteamQuickLinkPolicy(firstLifetime);
    new InfoSectionHost().render();
    infoBoundaryElement.type({ overview, details });

    expect(infoBoundaryElement.type).not.toBe(OriginalInfoBoundary);
    expect(quickLinksElement.type).not.toBe(OriginalQuickLinks);
    const firstInfoWrapper = infoBoundaryElement.type;
    const firstQuickLinksWrapper = quickLinksElement.type;

    // Decky reimports in place. Steam can retain this exact React tree after
    // the first plugin lifetime has ended. Do not mutate a mounted element at
    // teardown; the retained wrapper must delegate to the next lifetime.
    firstLifetime.reverse().forEach((unpatch) => unpatch());

    expect(infoBoundaryElement.type).toBe(firstInfoWrapper);
    expect(quickLinksElement.type).toBe(firstQuickLinksWrapper);

    const secondLifetime: Array<() => void> = [];
    installNonSteamQuickLinkPolicy(secondLifetime);
    new InfoSectionHost().render();
    infoBoundaryElement.type({ overview, details });

    // The current policy handles the retained tree without building another
    // wrapper layer around the first lifetime's native component.
    expect(infoBoundaryElement.type).toBe(firstInfoWrapper);
    expect(quickLinksElement.type).toBe(firstQuickLinksWrapper);
    secondLifetime.reverse().forEach((unpatch) => unpatch());
    expect(infoBoundaryElement.type).toBe(firstInfoWrapper);
    expect(quickLinksElement.type).toBe(firstQuickLinksWrapper);
  });

  it.skip.each([
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
    let queuedFrame: FrameRequestCallback | undefined;
    const mainWindow = {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        queuedFrame = callback;
        return 17;
      }),
      cancelAnimationFrame: vi.fn(),
    };
    const bigPictureDocument = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [anchor]),
      defaultView: mainWindow,
    };
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
    expect(NativeGameInfo.prototype.componentDidMount).toBe(originalMount);
    expect(isCurrentGameDetailRoute(currentRoutePath(), overview.appid)).toBe(true);

    armRouteShield(appId, currentRoutePath(), "pre-existing-render");
    const shieldHitsBeforeLaunch = metadataState.routeShield?.remaining;
    expect(overview.GetGameID()).toBe(true);
    expect(metadataState.routeShield?.remaining).toBe(shieldHitsBeforeLaunch);
    vi.advanceTimersByTime(2_100);
    expect(mounted.props.overview).toBe(overview);

    setConfirmedCompatibilityDefault(1);
    if (!queuedFrame) throw new Error("native Game Info refresh was not deferred to the main window");
    queuedFrame(16);

    expect(mounted.forceUpdate).toHaveBeenCalledOnce();
    expect(mounted.props.overview).toBe(overview);
    expect(mounted.props.details).toBe(details);
    expect(mounted.forceUpdate).toHaveReturnedWith({ strSnippet: "rich details" });
    expect(bigPictureDocument.querySelectorAll).toHaveBeenCalledWith("div");
    expect(sharedDocument.querySelectorAll).not.toHaveBeenCalled();
    unpatchers.reverse().forEach((unpatch) => unpatch());
    metadataUnpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it.skip("refreshes a mounted observer-wrapped Game Info renderer found only through the real document fiber", () => {
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
    let queuedFrame: FrameRequestCallback | undefined;
    const mainWindow = {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        queuedFrame = callback;
        return 23;
      }),
      cancelAnimationFrame: vi.fn(),
    };
    const bigPictureDocument = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [fallbackParagraph]),
      defaultView: mainWindow,
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
    if (!queuedFrame) throw new Error("native Game Info refresh was not deferred to the main window");
    queuedFrame(16);

    expect(mounted.forceUpdate).toHaveBeenCalledOnce();
    expect(mounted.forceUpdate).toHaveReturnedWith({ content: "rich game info", category: "Verified" });
    expect(bigPictureDocument.querySelectorAll).toHaveBeenCalledWith("div");
    unpatchers.reverse().forEach((unpatch) => unpatch());
    notifyCompatibilityRevision();
    expect(mounted.forceUpdate).toHaveBeenCalledOnce();
    metadataUnpatchers.reverse().forEach((unpatch) => unpatch());
  });

  it.skip("refreshes the replacement Game Info view after native publication settles", () => {
    const appId = 9712;
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
    const replacementOverview = new NativeOverview();
    let currentOverview = overview;
    let visibleResult: { content: string; category: string } = {
      content: "non-Steam placeholder",
      category: "Unknown",
    };
    class NativeGameInfo {
      props: { overview: NativeOverview };
      details = { GetDescriptions: () => ({ strSnippet: "rich details" }) };
      visible = false;
      forceUpdate = vi.fn(() => {
        const result = this.render();
        if (this.visible) visibleResult = result;
        return result;
      });

      constructor(props: { overview: NativeOverview }) {
        this.props = props;
      }

      componentDidMount() {}

      componentWillUnmount() {}

      render() {
        this.props.overview.BIsModOrShortcut();
        this.details.GetDescriptions();
        const category = this.props.overview.steam_hw_compat_category_packed & 0x0f;
        return category === 0x0f
          ? { content: "rich game info", category: "Verified" }
          : category === 0x0a
            ? { content: "rich game info", category: "Playable" }
          : { content: "non-Steam placeholder", category: "Unknown" };
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
    (globalThis as any).appStore = {
      allApps: [overview],
      GetAppOverviewByAppID: (requestedAppId: number) =>
        requestedAppId === appId ? currentOverview : null,
    };
    (globalThis as any).appDetailsStore = {};
    metadataState.compatibilityDefault = null;
    metadataState.compatibilityDefaultLoaded = true;
    const metadataUnpatchers: Array<() => void> = [];
    installMetadataPatches(metadataUnpatchers);

    const stale = new NativeGameInfo({ overview });
    const replacement = new NativeGameInfo({ overview: replacementOverview });
    let currentFiber: Record<string, unknown> = {
      elementType: NativeGameInfo,
      stateNode: stale,
      return: null,
    };
    const anchor = {
      textContent: "Steam Deck Compatibility",
      children: [],
      get __reactFiber$test() {
        return currentFiber;
      },
    };
    let queuedFrame: FrameRequestCallback | undefined;
    const mainWindow = {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        queuedFrame = callback;
        return 41;
      }),
      cancelAnimationFrame: vi.fn(),
    };
    const bigPictureDocument = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [anchor]),
      defaultView: mainWindow,
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
      tryFetchMetadataForApp: vi.fn(async () => null),
      refreshDeckyNativeActivityForApp: vi.fn(async () => null),
    });

    setConfirmedCompatibilityDefault(3);
    setConfirmedCompatibilityDefault(2);
    expect(overview.steam_hw_compat_category_packed & 0x0f).toBe(0x0a);
    expect(mainWindow.requestAnimationFrame).toHaveBeenCalledOnce();

    // Steam commits a replacement native view after the revision signal. The
    // queued refresh must capture and update this live instance, not `stale`.
    stale.componentWillUnmount();
    replacement.visible = true;
    replacementOverview.steam_hw_compat_category_packed = overview.steam_hw_compat_category_packed;
    currentOverview = replacementOverview;
    replacement.componentDidMount();
    currentFiber = { elementType: NativeGameInfo, stateNode: replacement, return: null };

    if (!queuedFrame) throw new Error("native Game Info refresh was not deferred to the main window");
    queuedFrame(16);

    expect(visibleResult).toEqual({ content: "rich game info", category: "Playable" });

    // A retained fiber from the previous plugin module must not receive a
    // forced update after Steam has published a new overview object. That
    // update can re-enter an unmounted observer wrapper during in-place reload.
    currentFiber = { elementType: NativeGameInfo, stateNode: stale, return: null };
    notifyCompatibilityRevision();
    if (!queuedFrame) throw new Error("stale Game Info refresh was not deferred to the main window");
    queuedFrame(32);
    expect(stale.forceUpdate).not.toHaveBeenCalled();
    unpatchers.reverse().forEach((unpatch) => unpatch());
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
