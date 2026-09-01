import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterPatch: vi.fn((target: Record<string, unknown>, method: string, handler: Function) => {
    const original = target[method] as Function;
    target[method] = function (this: unknown, ...args: unknown[]) {
      return handler.call(this, args, original.apply(this, args));
    };
    return { unpatch: () => { target[method] = original; } };
  }),
  getAllMetadata: vi.fn(),
}));

vi.mock("@decky/ui", () => ({ afterPatch: mocks.afterPatch, findModuleChild: vi.fn() }));
vi.mock("../backend", () => ({
  autoFetchMetadata: vi.fn(),
  fetchMetadata: vi.fn(),
  frontendLog: vi.fn(() => Promise.resolve()),
  getAllMetadata: mocks.getAllMetadata,
  saveMetadata: vi.fn(),
}));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  compatibilityRevisionSnapshot,
  metadataCache,
  metadataState,
  subscribeCompatibilityRevision,
} from "./core";
import {
  applyMetadata,
  effectiveCompatibilityCategory,
  installMetadataPatches,
  refreshCompatibilitySurfaces,
  refreshMetadataCache,
  startMetadataBootstrap,
  restoreAllCompatibilityBaselines,
} from "./metadataPatch";

type Overview = {
  appid: number;
  app_type: number;
  BIsShortcut: (...args: unknown[]) => boolean;
  BIsModOrShortcut: (...args: unknown[]) => boolean;
  icon_hash?: string;
  icon_data?: string;
  library_capsule?: string;
  library_hero?: string;
  library_logo?: string;
};

const matchedShortcutAppId = 2155012430;
const matchedSteamAppId = 55150;
let unpatchers: Array<() => void> = [];

const setRoute = (pathname: string, browserPathname = pathname) => {
  const host = globalThis as Record<string, unknown>;
  host.Router = {
    WindowStore: { GamepadUIMainWindowInstance: { m_history: { location: { pathname } } } },
  };
  host.window = { location: { pathname: browserPathname } };
};

const installWithOverview = (route: string) => {
  setRoute(route);
  const original = vi.fn(function (this: Overview) { return this === overview; });
  const overview = Object.assign(Object.create({
    BIsShortcut: () => true,
    BIsModOrShortcut: original,
  }), {
    appid: matchedShortcutAppId,
    app_type: 1073741824,
  }) as Overview;
  const appStore = {
    allApps: [overview],
    GetAppOverviewByAppID: (appId: number) => appId === matchedShortcutAppId ? overview : null,
  };
  (globalThis as Record<string, unknown>).appStore = appStore;
  (globalThis as Record<string, unknown>).appDetailsStore = {};
  metadataCache[String(matchedShortcutAppId)] = { steam_appid: matchedSteamAppId } as any;
  metadataState.bypassCounter = 0;
  metadataState.routeShield = null;
  unpatchers = [];
  installMetadataPatches(unpatchers);
  return { appStore, original, overview };
};

afterEach(() => {
  unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  metadataState.bypassCounter = 0;
  metadataState.routeShield = null;
  metadataState.compatibilityBaselines = {};
  metadataState.metadataLoaded = false;
  metadataState.metadataLoadPromise = null;
  metadataState.compatibilityRevision = 0;
  delete (globalThis as Record<string, unknown>).appStore;
  delete (globalThis as Record<string, unknown>).appDetailsStore;
  delete (globalThis as Record<string, unknown>).appInfoStore;
  delete (globalThis as Record<string, unknown>).Router;
  delete (globalThis as Record<string, unknown>).window;
  mocks.afterPatch.mockClear();
  mocks.getAllMetadata.mockReset();
  vi.useRealTimers();
});

describe("installMetadataPatches BIsModOrShortcut wiring", () => {
  it("passes Library Home shortcut identity through to Steam's icon resolver without artwork writes", () => {
    const { appStore, overview } = installWithOverview("/routes/library/home");
    const artworkBefore = { ...overview };
    const resolveIcon = () => overview.BIsModOrShortcut() ? "shortcut-icon-request" : null;

    expect(overview.BIsModOrShortcut()).toBe(true);
    expect(resolveIcon()).toBe("shortcut-icon-request");
    expect(appStore.GetAppOverviewByAppID(matchedSteamAppId)).toBe(overview);
    expect(overview).toMatchObject(artworkBefore);
  });

  it("spoofs only the overview's own current matched detail route and preserves off-detail budgets", () => {
    const { overview } = installWithOverview(`/routes/library/app/${matchedShortcutAppId}`);
    expect(overview.BIsModOrShortcut()).toBe(false);

    setRoute("/routes/library/home");
    metadataState.bypassCounter = 4;
    metadataState.routeShield = {
      appId: matchedShortcutAppId,
      path: "/routes/library/app/2155012430",
      trigger: "test",
      armedAt: Date.now(),
      remaining: 1,
      seqId: 1,
    };
    expect(overview.BIsModOrShortcut()).toBe(true);
    expect(metadataState.bypassCounter).toBe(4);
    expect(metadataState.routeShield?.remaining).toBe(1);
  });

  it("fails closed for an ambiguous Home transition without spending its armed budgets", () => {
    const { overview } = installWithOverview(`/routes/library/app/${matchedShortcutAppId}`);
    metadataState.bypassCounter = 4;
    metadataState.routeShield = {
      appId: matchedShortcutAppId,
      path: `/routes/library/app/${matchedShortcutAppId}`,
      trigger: "test",
      armedAt: Date.now(),
      remaining: 1,
      seqId: 1,
    };
    setRoute("/routes/library/home", `/routes/library/app/${matchedShortcutAppId}`);

    expect(overview.BIsModOrShortcut()).toBe(true);
    expect(metadataState.bypassCounter).toBe(4);
    expect(metadataState.routeShield?.remaining).toBe(1);
  });

  it.each([
    `/app/${matchedShortcutAppId}/controllerconfigurator/layouts`,
    `/routes/app/${matchedShortcutAppId}/controllerconfigurator/layouts`,
  ])("fails closed for an ambiguous controller transition without spending its armed budgets: %s", (controllerPath) => {
    const { overview } = installWithOverview(`/routes/library/app/${matchedShortcutAppId}`);
    metadataState.bypassCounter = 4;
    metadataState.routeShield = {
      appId: matchedShortcutAppId,
      path: `/routes/library/app/${matchedShortcutAppId}`,
      trigger: "test",
      armedAt: Date.now(),
      remaining: 1,
      seqId: 1,
    };
    setRoute(controllerPath, `/routes/library/app/${matchedShortcutAppId}`);

    expect(overview.BIsModOrShortcut()).toBe(true);
    expect(metadataState.bypassCounter).toBe(4);
    expect(metadataState.routeShield?.remaining).toBe(1);
  });

  it("preserves receiver, arguments, return value, and unload restoration", () => {
    const { original, overview } = installWithOverview("/routes/library/home");
    expect(overview.BIsModOrShortcut("sentinel")).toBe(true);
    expect(original).toHaveBeenLastCalledWith("sentinel");
    unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
    expect(overview.BIsModOrShortcut("restored")).toBe(true);
    expect(original).toHaveBeenLastCalledWith("restored");
  });
});

const compatibilityMetadata = (category?: number | null, override?: number | null) => ({
  title: "Example",
  id: "example",
  description: "",
  store_categories: [],
  steam_dlc_appids: [],
  has_points_shop: false,
  deck_compat_category: category,
  deck_compat_override: override,
});

const incomingOverview = (appId: number, packed: number, nonSteam = true) => {
  let currentPacked = packed;
  return {
    appid: () => appId,
    app_type: () => nonSteam ? 1073741824 : 0,
    steam_hw_compat_category_packed: () => currentPacked,
    set_steam_hw_compat_category_packed: (nextPacked: number) => {
      currentPacked = nextPacked;
    },
  };
};

const installCompatibilityOverview = (appId: number, packed: number, nonSteam = true) => {
  const overview = {
    appid: appId,
    app_type: nonSteam ? 1073741824 : 0,
    BIsShortcut: () => nonSteam,
    BIsModOrShortcut: () => nonSteam,
    steam_hw_compat_category_packed: packed,
  };
  const host = globalThis as Record<string, unknown>;
  host.appStore = {
    allApps: [overview],
    GetAppOverviewByAppID: (candidate: number) => candidate === appId ? overview : null,
  };
  host.appDetailsStore = {};
  return overview;
};

describe("compatibility metadata application", () => {
  it("uses the manual choice before Valve metadata and preserves explicit Unknown", () => {
    expect(effectiveCompatibilityCategory(compatibilityMetadata(3, 0) as any)).toBe(0);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(2, null) as any)).toBe(2);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(null, null) as any)).toBeNull();
  });

  it.each([0, 1, 2, 3])("writes category %i without changing higher packed bits", (category) => {
    const appId = 9000 + category;
    const overview = installCompatibilityOverview(appId, 0xab);
    metadataCache[String(appId)] = compatibilityMetadata(null, category) as any;

    expect(applyMetadata(appId)).toBe(true);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0 | category | (category << 2));
    expect(applyMetadata(appId)).toBe(false);
  });

  it("restores the original packed low nibble after metadata removal", () => {
    const appId = 9100;
    const overview = installCompatibilityOverview(appId, 0x9b);
    metadataCache[String(appId)] = compatibilityMetadata(3, null) as any;
    applyMetadata(appId);

    delete metadataCache[String(appId)];
    applyMetadata(appId);

    expect(overview.steam_hw_compat_category_packed).toBe(0x9b);
  });

  it("restores compatibility when a backend cache refresh removes the record", async () => {
    const appId = 9200;
    const overview = installCompatibilityOverview(appId, 0x4d);
    metadataCache[String(appId)] = compatibilityMetadata(1, null) as any;
    applyMetadata(appId);
    mocks.getAllMetadata.mockResolvedValue({});

    await refreshMetadataCache();

    expect(overview.steam_hw_compat_category_packed).toBe(0x4d);
  });

  it("publishes one revision after a cache refresh applies the complete batch", async () => {
    const appId = 9250;
    const overview = installCompatibilityOverview(appId, 0xa0);
    mocks.getAllMetadata.mockResolvedValue({
      [appId]: compatibilityMetadata(2, null),
    });
    const observedPackedValues: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => {
      observedPackedValues.push(overview.steam_hw_compat_category_packed);
    });

    await refreshMetadataCache();

    expect(compatibilityRevisionSnapshot()).toBe(1);
    expect(observedPackedValues).toEqual([0xaa]);
    unsubscribe();

    await refreshMetadataCache();
    expect(observedPackedValues).toEqual([0xaa]);
  });

  it("publishes once when a delayed bootstrap tick can finally write compatibility", async () => {
    vi.useFakeTimers();
    const appId = 9260;
    const overview = installCompatibilityOverview(appId, 0xa0);
    let packed = 0xa0;
    let writable = false;
    Object.defineProperty(overview, "steam_hw_compat_category_packed", {
      configurable: true,
      get: () => packed,
      set: (value: number) => {
        if (!writable) throw new Error("overview is not writable yet");
        packed = value;
      },
    });
    mocks.getAllMetadata.mockResolvedValue({
      [appId]: compatibilityMetadata(2, null),
    });
    (globalThis as Record<string, unknown>).window = globalThis;

    const stop = startMetadataBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(compatibilityRevisionSnapshot()).toBe(1);
    expect(packed).toBe(0xa0);

    writable = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(packed).toBe(0xaa);
    expect(compatibilityRevisionSnapshot()).toBe(2);

    await vi.advanceTimersByTimeAsync(500);
    expect(compatibilityRevisionSnapshot()).toBe(2);
    stop();
  });

  it("restores every plugin-mutated shortcut during dismount cleanup", () => {
    const appId = 9300;
    const overview = installCompatibilityOverview(appId, 0xe6);
    metadataCache[String(appId)] = compatibilityMetadata(2, null) as any;
    applyMetadata(appId);

    restoreAllCompatibilityBaselines();

    expect(overview.steam_hw_compat_category_packed).toBe(0xe6);
  });

  it("does not change official Steam games", () => {
    const appId = 9400;
    const overview = installCompatibilityOverview(appId, 0x57, false);
    metadataCache[String(appId)] = compatibilityMetadata(3, 0) as any;

    applyMetadata(appId);

    expect(overview.steam_hw_compat_category_packed).toBe(0x57);
  });

  it("does not follow a patched official AppID alias when applying or restoring", () => {
    const officialAppId = 55150;
    const shortcutAppId = 2155012430;
    const official = {
      appid: officialAppId,
      app_type: 0,
      BIsShortcut: () => false,
      BIsModOrShortcut: () => false,
      steam_hw_compat_category_packed: 0x5a,
    };
    const shortcut = {
      appid: shortcutAppId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
      steam_hw_compat_category_packed: 0x6b,
    };
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [official, shortcut],
      GetAppOverviewByAppID: (appId: number) =>
        appId === officialAppId ? shortcut : appId === shortcutAppId ? shortcut : null,
    };
    host.appDetailsStore = {};
    metadataCache[String(officialAppId)] = compatibilityMetadata(3, 0) as any;
    metadataState.compatibilityBaselines[String(officialAppId)] = 0x0f;

    applyMetadata(officialAppId);
    restoreAllCompatibilityBaselines();

    expect(official.steam_hw_compat_category_packed).toBe(0x5a);
    expect(shortcut.steam_hw_compat_category_packed).toBe(0x6b);
  });

  it("reapplies a positive category to a native AppOverview replacement before Steam publishes it", () => {
    const appId = 9450;
    const initial = installCompatibilityOverview(appId, 0xab);
    metadataCache[String(appId)] = compatibilityMetadata(2, null) as any;
    applyMetadata(appId);

    let currentOverview: any = initial;
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = {
      allApps: [initial],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? currentOverview : null,
      UpdateAppOverview: (incoming: any) => {
        appInfoStore.OnAppOverviewChange([incoming]);
        currentOverview = {
          ...initial,
          steam_hw_compat_category_packed: incoming.steam_hw_compat_category_packed(),
        };
        appStore.allApps = [currentOverview];
        return currentOverview;
      },
    };
    host.appStore = appStore;
    host.appDetailsStore = {};
    host.appInfoStore = appInfoStore;
    unpatchers = [];
    installMetadataPatches(unpatchers);

    const replacementInput = incomingOverview(appId, 0);
    const observedRevisions: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => {
      observedRevisions.push(currentOverview.steam_hw_compat_category_packed);
    });

    expect((host.appStore as any).UpdateAppOverview(replacementInput)).toBe(currentOverview);
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x0a);
    expect(observedRevisions).toEqual([0x0a]);

    (host.appStore as any).UpdateAppOverview(incomingOverview(appId, 0x0a));
    expect(observedRevisions).toEqual([0x0a]);

    restoreAllCompatibilityBaselines();
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x0b);
    unsubscribe();
  });

  it.each([false, true])("publishes a constructor-initialized %s AppOverview replacement", (observable) => {
    const appId = observable ? 9452 : 9451;
    let constructions = 0;
    class TestAppOverview {
      LOG_CHANGE: { owner: number };
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0xa0;

      constructor() {
        const owner = ++constructions;
        this.LOG_CHANGE = { owner };
        Object.defineProperty(this, "constructorState", {
          configurable: false,
          enumerable: false,
          value: { owner },
        });
      }

      BHasObservables() {
        return observable;
      }

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      nativeApi() {
        return `${this.appid}:${this.steam_hw_compat_category_packed}`;
      }
    }

    const original = new TestAppOverview();
    const overviews = new Map([[appId, original]]);
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [original],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? original : null,
    };
    host.appDetailsStore = {};
    metadataCache[String(appId)] = compatibilityMetadata(2, null) as any;

    expect(applyMetadata(appId)).toBe(true);

    const replacement = overviews.get(appId) as TestAppOverview;
    expect(replacement).toBeInstanceOf(TestAppOverview);
    expect(replacement).not.toBe(original);
    expect(constructions).toBe(2);
    expect(replacement.BHasObservables()).toBe(observable);
    expect(replacement.nativeApi()).toBe(`${appId}:170`);
    expect(replacement.LOG_CHANGE.owner).toBe(2);
    expect((replacement as any).constructorState).toEqual({ owner: 2 });
  });

  it.each([
    ["an official Steam game", false, undefined],
    ["missing metadata", true, undefined],
    ["unresolved Automatic metadata", true, compatibilityMetadata(null, null)],
    ["explicit Unknown metadata", true, compatibilityMetadata(null, 0)],
  ])("does not publish a replacement compatibility change for %s", (_label, native, metadata) => {
    const appId = 9460;
    const currentOverview = installCompatibilityOverview(appId, 0, native);
    if (metadata) metadataCache[String(appId)] = metadata as any;
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = host.appStore as any;
    appStore.UpdateAppOverview = (incoming: any) => {
      appInfoStore.OnAppOverviewChange([incoming]);
      return currentOverview;
    };
    host.appInfoStore = appInfoStore;
    unpatchers = [];
    installMetadataPatches(unpatchers);
    const observedRevisions: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => {
      observedRevisions.push(currentOverview.steam_hw_compat_category_packed);
    });

    expect(appStore.UpdateAppOverview(incomingOverview(appId, 0, native))).toBe(currentOverview);
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0);
    expect(observedRevisions).toEqual([]);
    unsubscribe();
  });

  it("publishes a revision without replacing the current route", () => {
    const replace = vi.fn();
    const host = globalThis as Record<string, unknown>;
    host.Router = {
      WindowStore: {
        GamepadUIMainWindowInstance: {
          m_history: {
            location: {
              pathname: "/routes/library/app/2155012430",
              search: "?tab=GameInfo",
              hash: "#compatibility",
              state: { source: "test" },
            },
            replace,
          },
        },
      },
    };

    expect(refreshCompatibilitySurfaces()).toBe(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not fail when Steam's router history is absent", () => {
    expect(() => refreshCompatibilitySurfaces()).not.toThrow();
  });
});
