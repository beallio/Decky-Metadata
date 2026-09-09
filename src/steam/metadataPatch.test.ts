import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterPatch: vi.fn((target: Record<string, unknown>, method: string, handler: Function) => {
    const original = target[method] as Function;
    target[method] = function (this: unknown, ...args: unknown[]) {
      return handler.call(this, args, original.apply(this, args));
    };
    return { unpatch: () => { target[method] = original; } };
  }),
  getAllMetadata: vi.fn(),
  getCompatibilityDefault: vi.fn(),
  getCompatibilityDefaultMatchedOnly: vi.fn(),
  autoFetchMetadata: vi.fn(),
  fetchMetadata: vi.fn(),
  saveMetadata: vi.fn(),
}));

vi.mock("@decky/ui", () => ({ afterPatch: mocks.afterPatch, findModuleChild: vi.fn() }));
vi.mock("../backend", () => ({
  autoFetchMetadata: mocks.autoFetchMetadata,
  fetchMetadata: mocks.fetchMetadata,
  frontendLog: vi.fn(() => Promise.resolve()),
  getAllMetadata: mocks.getAllMetadata,
  getCompatibilityDefault: mocks.getCompatibilityDefault,
  getCompatibilityDefaultMatchedOnly: mocks.getCompatibilityDefaultMatchedOnly,
  saveMetadata: mocks.saveMetadata,
}));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  compatibilityRevisionSnapshot,
  deckyNativeActivityCache,
  metadataCache,
  metadataState,
  subscribeCompatibilityRevision,
} from "./core";
import { refreshDeckyNativeActivityForApp } from "./activity";
import {
  applyMetadata,
  effectiveCompatibilityCategory,
  flushDeferredCompatibilityPublications,
  installMetadataPatches,
  applyCompatibilityDefault,
  beginCompatibilityLifecycle,
  cancelCompatibilityDefaultLoad,
  ensureCompatibilityDefault,
  refreshCompatibilitySurfaces,
  refreshMetadataCache,
  setConfirmedCompatibilityDefault,
  setConfirmedCompatibilityDefaultMatchedOnly,
  startMetadataBootstrap,
  tryEnrichScreenshotsForApp,
  tryFetchMetadataForApp,
  restoreAllCompatibilityBaselines,
  retainCompatibilityBaselinesForReload,
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
  steam_hw_compat_category_packed?: number;
};

const matchedShortcutAppId = 2155012430;
const matchedSteamAppId = 55150;
let unpatchers: Array<() => void> = [];

const setRoute = (pathname: string, browserPathname = pathname, browserHref?: string) => {
  const host = globalThis as Record<string, unknown>;
  host.Router = {
    WindowStore: { GamepadUIMainWindowInstance: { m_history: { location: { pathname } } } },
  };
  host.window = { location: { pathname: browserPathname, href: browserHref } };
};

const installWithOverview = (route: string, browserPathname = route, browserHref?: string) => {
  setRoute(route, browserPathname, browserHref);
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

beforeEach(() => {
  mocks.getCompatibilityDefaultMatchedOnly.mockResolvedValue(false);
});

afterEach(() => {
  unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  metadataState.bypassCounter = 0;
  metadataState.routeShield = null;
  metadataState.compatibilityBaselines = {};
  metadataState.compatibilityDefault = null;
  metadataState.compatibilityDefaultLoaded = false;
  metadataState.compatibilityDefaultMatchedOnly = false;
  metadataState.compatibilityDefaultGeneration = 0;
  metadataState.compatibilityLifecycleGeneration = 0;
  metadataState.compatibilityDefaultLoadPromise = null;
  metadataState.metadataLoaded = false;
  metadataState.metadataLoadPromise = null;
  metadataState.loadingMetadata.clear();
  metadataState.loadingScreenshots.clear();
  mocks.autoFetchMetadata.mockReset();
  mocks.fetchMetadata.mockReset();
  mocks.saveMetadata.mockReset();
  metadataState.compatibilityRevision = 0;
  deckyNativeActivityCache().clear();
  delete (globalThis as Record<string, unknown>).appStore;
  delete (globalThis as Record<string, unknown>).appActivityStore;
  delete (globalThis as Record<string, unknown>).appDetailsStore;
  delete (globalThis as Record<string, unknown>).appInfoStore;
  delete (globalThis as Record<string, unknown>).Router;
  delete (globalThis as Record<string, unknown>).window;
  mocks.afterPatch.mockClear();
  mocks.getAllMetadata.mockReset();
  mocks.getCompatibilityDefault.mockReset();
  mocks.getCompatibilityDefaultMatchedOnly.mockReset();
  mocks.getCompatibilityDefaultMatchedOnly.mockResolvedValue(false);
  vi.useRealTimers();
});

describe("installMetadataPatches BIsModOrShortcut wiring", () => {
  it("keeps the editor app's matched render identity through a packed-changing save", () => {
    const { overview } = installWithOverview(
      `/decky-metadata/${matchedShortcutAppId}`,
      `/routes/decky-metadata/${matchedShortcutAppId}`,
      `https://steamloopback.host/routes/decky-metadata/${matchedShortcutAppId}`,
    );
    Object.assign(overview, { steam_hw_compat_category_packed: 0xa0 });
    metadataCache[String(matchedShortcutAppId)] = compatibilityMetadata(3, 3) as any;

    expect(applyMetadata(matchedShortcutAppId)).toBe(true);
    expect(overview.steam_hw_compat_category_packed).toBe(0xaf);
    // Steam renders the rich matched Game Info tree only when this reports
    // native-app identity for the exact editor app.
    expect(overview.BIsModOrShortcut()).toBe(false);
  });

  it("keeps different and unmatched shortcuts native while an editor route is current", () => {
    const { overview } = installWithOverview(
      `/decky-metadata/${matchedShortcutAppId}`,
      `/routes/decky-metadata/${matchedShortcutAppId}`,
      `https://steamloopback.host/routes/decky-metadata/${matchedShortcutAppId}`,
    );
    const otherAppId = matchedShortcutAppId + 1;
    metadataCache[String(otherAppId)] = { steam_appid: matchedSteamAppId + 1 } as any;

    expect(overview.BIsModOrShortcut()).toBe(false);
    overview.appid = otherAppId;
    expect(overview.BIsModOrShortcut()).toBe(true);

    delete metadataCache[String(otherAppId)];
    expect(overview.BIsModOrShortcut()).toBe(true);
  });

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

const compatibilityMetadata = (category?: number | null, override?: number | "valve" | null) => ({
  title: "Example",
  id: "example",
  description: "",
  store_categories: [],
  steam_dlc_appids: [],
  has_points_shop: false,
  deck_compat_category: category,
  deck_compat_override: override,
});

const activityMetadata = (title: string, gid: string, steamNews = true) => ({
  ...compatibilityMetadata(null, null),
  steam_appid: 55150,
  steam_news: steamNews ? [{
    id: gid,
    gid,
    title,
    summary: `${title} summary`,
    date: 1700000000,
    url: `https://store.steampowered.com/news/app/55150/view/${gid}`,
  }] : [],
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
  it("uses manual and Follow Valve choices before the global default and preserves explicit Unknown", () => {
    expect(effectiveCompatibilityCategory(compatibilityMetadata(3, 0) as any, 2)).toBe(0);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(2, "valve") as any, 3)).toBe(2);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(null, "valve") as any, 3)).toBeNull();
    expect(effectiveCompatibilityCategory(compatibilityMetadata(2, null) as any, 3)).toBe(3);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(2, null) as any, null)).toBe(2);
    expect(effectiveCompatibilityCategory(undefined, 1)).toBe(1);
    expect(effectiveCompatibilityCategory(undefined, null)).toBeNull();
  });

  it("applies a numeric default to exact no-record shortcuts without creating metadata", () => {
    const appId = 8999;
    const overview = installCompatibilityOverview(appId, 0xab);
    metadataState.compatibilityDefault = 3;

    expect(applyCompatibilityDefault()).toBe(true);
    expect(overview.steam_hw_compat_category_packed).toBe(0xaf);
    expect(metadataCache[String(appId)]).toBeUndefined();
  });

  it("loads and applies the global default at startup without opening the QAM", async () => {
    vi.useFakeTimers();
    const appId = 8994;
    const overview = installCompatibilityOverview(appId, 0xa0);
    mocks.getAllMetadata.mockResolvedValue({});
    mocks.getCompatibilityDefault.mockResolvedValue(3);
    (globalThis as Record<string, unknown>).window = globalThis;

    const stop = startMetadataBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(overview.steam_hw_compat_category_packed).toBe(0xaf);
    expect(metadataCache[String(appId)]).toBeUndefined();
    stop();
    await Promise.resolve();
  });

  it("restores the native baseline for a Follow Valve shortcut with no category", () => {
    const appId = 8998;
    const overview = installCompatibilityOverview(appId, 0x9b);
    metadataState.compatibilityDefault = 3;
    metadataCache[String(appId)] = compatibilityMetadata(null, "valve") as any;

    expect(applyMetadata(appId)).toBe(false);
    expect(overview.steam_hw_compat_category_packed).toBe(0x9b);
  });

  it("reapplies all native shortcuts once after a confirmed default change", () => {
    const appId = 8997;
    const overview = installCompatibilityOverview(appId, 0xa0);
    const observed: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => observed.push(overview.steam_hw_compat_category_packed));

    setConfirmedCompatibilityDefault(2);

    expect(overview.steam_hw_compat_category_packed).toBe(0xaa);
    expect(observed).toEqual([0xaa]);
    unsubscribe();
  });

  it("does not let a late initial setting response replace a confirmed save", async () => {
    const appId = 8996;
    const overview = installCompatibilityOverview(appId, 0xa0);
    let resolveLoad!: (value: 0 | 1 | 2 | 3 | null) => void;
    mocks.getCompatibilityDefault.mockReturnValue(new Promise((resolve) => {
      resolveLoad = resolve;
    }));

    const pending = ensureCompatibilityDefault();
    setConfirmedCompatibilityDefault(3);
    resolveLoad(null);
    await pending;

    expect(metadataState.compatibilityDefault).toBe(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0xaf);
  });

  it("does not apply a late global-save acknowledgement after the plugin dismounts", () => {
    const appId = 89961;
    const overview = installCompatibilityOverview(appId, 0xa0);
    const lifecycle = beginCompatibilityLifecycle();

    cancelCompatibilityDefaultLoad();
    setConfirmedCompatibilityDefault(3, lifecycle);

    expect(metadataState.compatibilityDefaultLoaded).toBe(false);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
  });

  it("makes a late default response inert after dismount cleanup begins", async () => {
    const appId = 8995;
    const overview = installCompatibilityOverview(appId, 0xa0);
    let resolveLoad!: (value: 0 | 1 | 2 | 3 | null) => void;
    mocks.getCompatibilityDefault.mockReturnValue(new Promise((resolve) => {
      resolveLoad = resolve;
    }));

    const pending = ensureCompatibilityDefault();
    cancelCompatibilityDefaultLoad();
    resolveLoad(3);
    await pending;

    expect(metadataState.compatibilityDefaultLoaded).toBe(false);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
  });

  it("does not resume bootstrap work after a pending metadata load stops", async () => {
    vi.useFakeTimers();
    const appId = 89951;
    const overview = installCompatibilityOverview(appId, 0xa0);
    let resolveMetadata!: (value: Record<string, any>) => void;
    mocks.getAllMetadata.mockReturnValue(new Promise((resolve) => {
      resolveMetadata = resolve;
    }));
    mocks.getCompatibilityDefault.mockResolvedValue(3);
    (globalThis as Record<string, unknown>).window = globalThis;

    const stop = startMetadataBootstrap();
    stop();
    resolveMetadata({});
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.getCompatibilityDefault).not.toHaveBeenCalled();
    expect(metadataCache[String(appId)]).toBeUndefined();
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
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

  it("recomputes inheritance instead of restoring baseline when metadata removal leaves a global default", () => {
    const appId = 9101;
    const overview = installCompatibilityOverview(appId, 0x9b);
    metadataCache[String(appId)] = compatibilityMetadata(2, 3) as any;
    applyMetadata(appId);
    metadataState.compatibilityDefault = 1;

    delete metadataCache[String(appId)];
    applyMetadata(appId);

    expect(overview.steam_hw_compat_category_packed).toBe(0x95);
  });

  it("removes a prior positive category when the confirmed default is explicit Unknown", () => {
    const appId = 9102;
    const overview = installCompatibilityOverview(appId, 0xa0);
    setConfirmedCompatibilityDefault(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0xaf);

    setConfirmedCompatibilityDefault(0);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
  });

  it("keeps a numeric default off no-record shortcuts while the matched-games-only scope is on", () => {
    const recordedAppId = 9111;
    const bareAppId = 9112;
    const recorded = {
      appid: recordedAppId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
      steam_hw_compat_category_packed: 0xa0,
    };
    const bare = { ...recorded, appid: bareAppId, steam_hw_compat_category_packed: 0xb0 };
    const overviews = new Map<number, typeof recorded>([
      [recordedAppId, recorded],
      [bareAppId, bare],
    ]);
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [recorded, bare],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (candidate: number) => overviews.get(candidate) ?? null,
    };
    host.appDetailsStore = {};
    // A record with no Steam match still counts as matched.
    metadataCache[String(recordedAppId)] = compatibilityMetadata(null, null) as any;

    setConfirmedCompatibilityDefault(3);
    expect(recorded.steam_hw_compat_category_packed).toBe(0xaf);
    expect(bare.steam_hw_compat_category_packed).toBe(0xbf);

    setConfirmedCompatibilityDefaultMatchedOnly(true);
    expect(recorded.steam_hw_compat_category_packed).toBe(0xaf);
    expect(bare.steam_hw_compat_category_packed).toBe(0xb0);

    setConfirmedCompatibilityDefaultMatchedOnly(false);
    expect(bare.steam_hw_compat_category_packed).toBe(0xbf);
  });

  it("keeps fixed and Follow Valve per-game choices under the matched-games-only scope", () => {
    metadataState.compatibilityDefaultMatchedOnly = true;
    expect(effectiveCompatibilityCategory(compatibilityMetadata(3, 0) as any, 2)).toBe(0);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(2, "valve") as any, 3)).toBe(2);
    expect(effectiveCompatibilityCategory(compatibilityMetadata(2, null) as any, 3)).toBe(3);
    expect(effectiveCompatibilityCategory(undefined, 3)).toBeNull();
  });

  it("returns a shortcut to its native baseline when record removal meets the matched-games-only scope", () => {
    const appId = 9113;
    const overview = installCompatibilityOverview(appId, 0x90);
    metadataCache[String(appId)] = compatibilityMetadata(null, null) as any;
    metadataState.compatibilityDefaultMatchedOnly = true;
    setConfirmedCompatibilityDefault(1);
    expect(overview.steam_hw_compat_category_packed).toBe(0x95);

    delete metadataCache[String(appId)];
    applyMetadata(appId);

    expect(overview.steam_hw_compat_category_packed).toBe(0x90);
  });

  it("holds the active Game Info value when the scope changes and applies it after the exit", () => {
    const appId = 9114;
    const overview = installCompatibilityOverview(appId, 0xa0);
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    setConfirmedCompatibilityDefault(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);

    setConfirmedCompatibilityDefaultMatchedOnly(true);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);

    setRoute("/library/home");
    flushDeferredCompatibilityPublications();

    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
  });

  it("loads the scope with the default before either applies", async () => {
    const appId = 9115;
    const overview = installCompatibilityOverview(appId, 0xa0);
    let resolveScope: (value: boolean) => void = () => undefined;
    mocks.getCompatibilityDefault.mockResolvedValue(3);
    mocks.getCompatibilityDefaultMatchedOnly.mockReturnValue(
      new Promise<boolean>((resolve) => { resolveScope = resolve; })
    );

    const pending = ensureCompatibilityDefault();
    await Promise.resolve();
    expect(metadataState.compatibilityDefaultLoaded).toBe(false);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);

    resolveScope(true);
    await pending;

    expect(metadataState.compatibilityDefaultLoaded).toBe(true);
    expect(metadataState.compatibilityDefaultMatchedOnly).toBe(true);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
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

  it("publishes a revision when Follow Valve availability changes without a packed write", async () => {
    const appId = 9201;
    const overview = installCompatibilityOverview(appId, 0xaa);
    metadataState.metadataLoaded = true;
    metadataCache[String(appId)] = compatibilityMetadata(null, "valve") as any;
    mocks.getAllMetadata.mockResolvedValue({
      [appId]: compatibilityMetadata(2, "valve"),
    });
    const revisions: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => revisions.push(compatibilityRevisionSnapshot()));

    await refreshMetadataCache();

    expect(overview.steam_hw_compat_category_packed).toBe(0xaa);
    expect(revisions).toEqual([1]);
    unsubscribe();
  });

  it("keeps global-only baselines out of an empty metadata refresh batch", async () => {
    const overviews = Array.from({ length: 5_000 }, (_, index) => ({
      appid: 93000 + index,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
      steam_hw_compat_category_packed: 0xa0,
    }));
    let allAppsReads = 0;
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      get allApps() {
        allAppsReads += 1;
        return overviews;
      },
      GetAppOverviewByAppID: (appId: number) => overviews.find((overview) => overview.appid === appId),
    };
    host.appDetailsStore = {};
    metadataState.compatibilityDefault = 3;
    applyCompatibilityDefault();
    allAppsReads = 0;
    mocks.getAllMetadata.mockResolvedValue({});

    await refreshMetadataCache();

    expect(allAppsReads).toBeLessThanOrEqual(1);
  });

  it("retries a failed baseline restoration on a later empty refresh", async () => {
    const appId = 93001;
    const overview = installCompatibilityOverview(appId, 0x9b);
    let packed = 0x9b;
    let writable = true;
    Object.defineProperty(overview, "steam_hw_compat_category_packed", {
      configurable: true,
      get: () => packed,
      set: (value: number) => {
        if (!writable) throw new Error("overview is temporarily read-only");
        packed = value;
      },
    });
    metadataCache[String(appId)] = compatibilityMetadata(3, null) as any;
    applyMetadata(appId);
    expect(packed).toBe(0x9f);

    writable = false;
    mocks.getAllMetadata.mockResolvedValue({});
    await refreshMetadataCache();
    expect(packed).toBe(0x9f);

    writable = true;
    await refreshMetadataCache();
    expect(packed).toBe(0x9b);
  });

  it("does not mutate after dismount when a per-app metadata fetch completes", async () => {
    const appId = 93002;
    installCompatibilityOverview(appId, 0xa0);
    metadataState.metadataLoaded = true;
    beginCompatibilityLifecycle();
    let resolveFetch!: (metadata: Record<string, any> | null) => void;
    mocks.autoFetchMetadata.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const pending = tryFetchMetadataForApp(appId);
    await Promise.resolve();
    cancelCompatibilityDefaultLoad();
    resolveFetch(compatibilityMetadata(2, null));
    await pending;

    expect(metadataCache[String(appId)]).toBeUndefined();

    beginCompatibilityLifecycle();
    mocks.autoFetchMetadata.mockResolvedValue(compatibilityMetadata(2, null));
    await tryFetchMetadataForApp(appId);
    expect(metadataCache[String(appId)]).toEqual(compatibilityMetadata(2, null));
  });

  it("does not start a late screenshot save after dismount", async () => {
    const appId = 93003;
    installCompatibilityOverview(appId, 0xa0);
    metadataState.metadataLoaded = true;
    const existing = {
      ...compatibilityMetadata(null, null),
      source: "IGN",
      source_url: "https://example.invalid/game",
      screenshots: [],
    } as any;
    metadataCache[String(appId)] = existing;
    beginCompatibilityLifecycle();
    let resolveFetch!: (metadata: Record<string, any> | null) => void;
    mocks.fetchMetadata.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const pending = tryEnrichScreenshotsForApp(appId);
    await Promise.resolve();
    cancelCompatibilityDefaultLoad();
    resolveFetch({ screenshots: [{ url: "https://example.invalid/shot.png" }] });
    await pending;

    expect(mocks.saveMetadata).not.toHaveBeenCalled();
    expect(metadataCache[String(appId)]).toBe(existing);

    beginCompatibilityLifecycle();
    const saved = { ...existing, screenshots: [{ url: "https://example.invalid/shot.png" }] };
    mocks.fetchMetadata.mockResolvedValue({ screenshots: saved.screenshots });
    mocks.saveMetadata.mockResolvedValue(saved);
    await tryEnrichScreenshotsForApp(appId);
    expect(mocks.saveMetadata).toHaveBeenCalledWith(appId, expect.objectContaining({ screenshots: saved.screenshots }));
    expect(metadataCache[String(appId)]).toBe(saved);
  });

  it("retries cached metadata when its native overview appears after the first bootstrap pass", async () => {
    vi.useFakeTimers();
    const appId = 9261;
    const overview = {
      appid: appId,
      app_type: 1073741824,
      BIsShortcut: () => true,
      BIsModOrShortcut: () => true,
      steam_hw_compat_category_packed: 0xa0,
      metacritic_score: 0,
    };
    const host = globalThis as Record<string, unknown>;
    const appStore = {
      allApps: [] as any[],
      GetAppOverviewByAppID: (candidate: number) => appStore.allApps.find((item) => item.appid === candidate),
    };
    host.appStore = appStore;
    host.appDetailsStore = { GetAppData: () => ({ descriptionsData: {}, associationData: {} }) };
    mocks.getAllMetadata.mockResolvedValue({
      [appId]: { ...compatibilityMetadata(2, null), rating: 88 },
    });
    mocks.getCompatibilityDefault.mockResolvedValue(null);
    (globalThis as Record<string, unknown>).window = globalThis;

    const stop = startMetadataBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    appStore.allApps = [overview];
    await vi.advanceTimersByTimeAsync(500);

    expect(overview.steam_hw_compat_category_packed).toBe(0xaa);
    expect(overview.metacritic_score).toBe(88);
    stop();
  });

  it("clears injected Activity when removal or an empty save applies metadata", async () => {
    const appId = 9220;
    installCompatibilityOverview(appId, 0xa0);
    const store = {
      m_mapAppActivity: new Map<number, any>(),
    };
    (globalThis as Record<string, unknown>).appActivityStore = store;

    metadataCache[String(appId)] = activityMetadata("Old plugin card", "12345678901234567") as any;
    await refreshDeckyNativeActivityForApp(appId, store);
    expect(store.m_mapAppActivity.get(appId)).toMatchObject({ __deckyNativeActivity: true });

    delete metadataCache[String(appId)];
    applyMetadata(appId);
    expect(store.m_mapAppActivity.get(appId)).toBeUndefined();

    metadataCache[String(appId)] = activityMetadata("Old plugin card", "12345678901234567") as any;
    await refreshDeckyNativeActivityForApp(appId, store);
    mocks.getAllMetadata.mockResolvedValue({});
    await refreshMetadataCache();
    expect(store.m_mapAppActivity.get(appId)).toBeUndefined();

    metadataCache[String(appId)] = activityMetadata("Old plugin card", "12345678901234567") as any;
    await refreshDeckyNativeActivityForApp(appId, store);
    metadataCache[String(appId)] = activityMetadata("", "", false) as any;
    applyMetadata(appId);
    expect(store.m_mapAppActivity.get(appId)).toBeUndefined();
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
    mocks.getCompatibilityDefault.mockResolvedValue(null);
    (globalThis as Record<string, unknown>).window = globalThis;

    const stop = startMetadataBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    // The settings load publishes its own confirmed-policy revision; only the
    // deferred compatibility write is under test here.
    const revisionAfterLoad = compatibilityRevisionSnapshot();
    expect(packed).toBe(0xa0);

    writable = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(packed).toBe(0xaa);
    expect(compatibilityRevisionSnapshot()).toBe(revisionAfterLoad + 1);

    await vi.advanceTimersByTimeAsync(500);
    expect(compatibilityRevisionSnapshot()).toBe(revisionAfterLoad + 1);
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

  it("continues compatibility installation when UpdateAppOverview is read-only", async () => {
    const appId = 9453;
    const initial = installCompatibilityOverview(appId, 0xab);
    metadataCache[String(appId)] = compatibilityMetadata(2, null) as any;
    applyMetadata(appId);

    let currentOverview: any = initial;
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = {
      allApps: [initial],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? currentOverview : null,
    } as Record<string, any>;
    Object.defineProperty(appStore, "UpdateAppOverview", {
      configurable: true,
      writable: false,
      value: (incoming: any) => {
        appInfoStore.OnAppOverviewChange([incoming]);
        currentOverview = {
          ...initial,
          steam_hw_compat_category_packed: incoming.steam_hw_compat_category_packed(),
        };
        appStore.allApps = [currentOverview];
        return currentOverview;
      },
    });
    host.appStore = appStore;
    host.appDetailsStore = {};
    host.appInfoStore = appInfoStore;
    unpatchers = [];

    expect(() => installMetadataPatches(unpatchers)).not.toThrow();
    const observedRevisions: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => {
      observedRevisions.push(currentOverview.steam_hw_compat_category_packed);
    });

    expect(appStore.UpdateAppOverview(incomingOverview(appId, 0))).toBe(currentOverview);
    await Promise.resolve();

    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x0a);
    expect(observedRevisions).toEqual([0x0a]);
    unsubscribe();
  });

  it.each([false, true])("publishes a constructor-valid %s native AppOverview replacement after the completed change", (observable) => {
    const appId = observable ? 9452 : 9451;
    let constructions = 0;
    let restoreCalls = 0;
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

      GetPreservedState() {
        return undefined;
      }

      RestorePreservedState() {
        restoreCalls += 1;
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
    let packedAtFirstPublication: number | undefined;
    const overviews = new Map([[appId, original]]);
    const set = overviews.set.bind(overviews);
    vi.spyOn(overviews, "set").mockImplementation((key, value) => {
      if (packedAtFirstPublication === undefined) {
        packedAtFirstPublication = original.steam_hw_compat_category_packed;
      }
      return set(key, value);
    });
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [original],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? original : null,
    };
    host.appDetailsStore = {};
    metadataCache[String(appId)] = compatibilityMetadata(2, null) as any;

    expect(applyMetadata(appId)).toBe(true);

    const current = overviews.get(appId) as TestAppOverview;
    expect(current).toBeInstanceOf(TestAppOverview);
    expect(current).not.toBe(original);
    expect(constructions).toBe(2);
    expect(packedAtFirstPublication).toBe(0xaa);
    expect(current.BHasObservables()).toBe(observable);
    expect(current.nativeApi()).toBe(`${appId}:170`);
    expect(current.LOG_CHANGE.owner).toBe(2);
    expect((current as any).constructorState).toEqual({ owner: 2 });
    expect(restoreCalls).toBe(1);
  });

  it("publishes a compatibility replacement through a preserved native map setter", () => {
    const appId = 9453;
    class NativeOverview {
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0xa0;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      GetPreservedState() {
        return undefined;
      }

      RestorePreservedState() {}
    }

    const original = new NativeOverview();
    const overviews: any = new Map([[appId, original]]);
    const nativeSet = vi.fn((key: number, value: NativeOverview) =>
      Map.prototype.set.call(overviews, key, value)
    );
    const foreignSet = vi.fn((key: number, value: NativeOverview) => nativeSet(key, value));
    overviews.originalSet = nativeSet;
    overviews.set = foreignSet;
    const host = globalThis as Record<string, unknown>;
    host.appStore = { allApps: [original], m_mapApps: overviews };
    host.appDetailsStore = {};
    metadataCache[String(appId)] = compatibilityMetadata(3, null) as any;

    expect(applyMetadata(appId)).toBe(true);

    expect(foreignSet).not.toHaveBeenCalled();
    expect(nativeSet).toHaveBeenCalledWith(appId, expect.any(NativeOverview));
    expect(overviews.get(appId)).not.toBe(original);
    expect(overviews.get(appId).steam_hw_compat_category_packed).toBe(0xaf);
  });

  it("does not republish an unchanged default after a retained in-place reload", () => {
    const appId = 9454;
    class NativeOverview {
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0xa0;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      GetPreservedState() {
        return undefined;
      }

      RestorePreservedState() {}
    }

    const original = new NativeOverview();
    const overviews = new Map<number, NativeOverview>([[appId, original]]);
    const set = overviews.set.bind(overviews);
    const publish = vi.spyOn(overviews, "set").mockImplementation((key, value) => set(key, value));
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [original],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (candidate: number) => overviews.get(candidate) ?? null,
    };
    host.appDetailsStore = {};

    setConfirmedCompatibilityDefault(3);
    const published = overviews.get(appId) as NativeOverview;
    host.appStore = {
      ...(host.appStore as object),
      allApps: [published],
    };
    expect(publish).toHaveBeenCalledTimes(1);

    retainCompatibilityBaselinesForReload();
    Object.keys(metadataState.compatibilityBaselines).forEach((key) =>
      delete metadataState.compatibilityBaselines[key]
    );
    metadataState.compatibilityDefault = null;
    metadataState.compatibilityDefaultLoaded = false;
    beginCompatibilityLifecycle();
    setConfirmedCompatibilityDefault(3);

    expect(metadataState.compatibilityBaselines[String(appId)]).toBe(0);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(overviews.get(appId)).toBe(published);
  });

  it("holds an active Game Info compatibility value until the view exits", () => {
    const appId = 9455;
    class NativeOverview {
      appid = appId;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0xa0;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      GetPreservedState() {
        return undefined;
      }

      RestorePreservedState() {}
    }

    const original = new NativeOverview();
    const overviews = new Map<number, NativeOverview>([[appId, original]]);
    const set = overviews.set.bind(overviews);
    const publish = vi.spyOn(overviews, "set").mockImplementation((key, value) => set(key, value));
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [original],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (candidate: number) => overviews.get(candidate) ?? null,
    };
    host.appDetailsStore = {};
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    metadataCache[String(appId)] = compatibilityMetadata(3, null) as any;
    metadataState.compatibilityDefault = 3;
    metadataState.compatibilityDefaultLoaded = true;

    expect(applyMetadata(appId)).toBe(false);
    expect(original.steam_hw_compat_category_packed).toBe(0xa0);
    expect(publish).not.toHaveBeenCalled();
    expect(overviews.get(appId)).toBe(original);

    setRoute("/library/home");
    flushDeferredCompatibilityPublications();

    expect(publish).toHaveBeenCalledWith(appId, expect.any(NativeOverview));
    expect(overviews.get(appId)).not.toBe(original);
    expect(overviews.get(appId)?.steam_hw_compat_category_packed).toBe(0xaf);
  });

  it("holds the active Game Info status while other shortcuts use the latest policy", () => {
    class NativeOverview {
      appid = 0;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0;

      BIsShortcut() {
        return true;
      }

      BIsModOrShortcut() {
        return true;
      }

      GetPreservedState() {
        return undefined;
      }

      RestorePreservedState() {}
    }

    const activeAppId = 9456;
    const otherAppId = 9457;
    const active = new NativeOverview();
    active.appid = activeAppId;
    active.steam_hw_compat_category_packed = 0xa0;
    const other = new NativeOverview();
    other.appid = otherAppId;
    other.steam_hw_compat_category_packed = 0xb0;
    const overviews = new Map<number, NativeOverview>([
      [activeAppId, active],
      [otherAppId, other],
    ]);
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [active, other],
      m_mapApps: overviews,
      GetAppOverviewByAppID: (appId: number) => overviews.get(appId) ?? null,
    };
    host.appDetailsStore = {};
    setRoute(`/library/app/${activeAppId}/tab/GameInfo`);

    setConfirmedCompatibilityDefault(3);

    expect(active.steam_hw_compat_category_packed).toBe(0xa0);
    expect(overviews.get(otherAppId)?.steam_hw_compat_category_packed).toBe(0xbf);

    host.appStore = {
      ...(host.appStore as object),
      allApps: [active, overviews.get(otherAppId)],
    };
    setConfirmedCompatibilityDefault(2);

    expect(active.steam_hw_compat_category_packed).toBe(0xa0);
    expect(overviews.get(otherAppId)?.steam_hw_compat_category_packed).toBe(0xba);

    // Closing QAM leaves the exact Game Info tab selected, so the held status
    // must not be released. The direct history location is authoritative even
    // while currentRoutePath() still contains the stale Game Info route.
    flushDeferredCompatibilityPublications(`/library/app/${activeAppId}/tab/GameInfo`);
    expect(active.steam_hw_compat_category_packed).toBe(0xa0);

    flushDeferredCompatibilityPublications(`/library/app/${activeAppId}/tab/Activity`);
    expect(overviews.get(activeAppId)?.steam_hw_compat_category_packed).toBe(0xaa);
  });

  it("releases an active update with a newer editor choice instead of replaying the old default", () => {
    const appId = 9458;
    const overview = installCompatibilityOverview(appId, 0xa0);
    setRoute(`/library/app/${appId}/tab/GameInfo`);

    setConfirmedCompatibilityDefault(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);

    // Navigating to the editor is a real Game Info exit. Its later Save must
    // win over the global default that originally queued this update.
    metadataCache[String(appId)] = compatibilityMetadata(null, 1) as any;
    flushDeferredCompatibilityPublications(`/decky-metadata/${appId}`);

    expect(overview.steam_hw_compat_category_packed).toBe(0xa5);
  });

  it("keeps the held nibble on an incoming active-view replacement, then applies after exit", () => {
    const appId = 9459;
    const initial = installCompatibilityOverview(appId, 0x0a);
    let currentOverview: any = initial;
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = {
      allApps: [initial],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? currentOverview : null,
      UpdateAppOverview: (incoming: any) => {
        appInfoStore.OnAppOverviewChange([incoming]);
        currentOverview = {
          ...currentOverview,
          steam_hw_compat_category_packed: incoming.steam_hw_compat_category_packed(),
        };
        appStore.allApps = [currentOverview];
        return currentOverview;
      },
    };
    host.appStore = appStore;
    host.appDetailsStore = {};
    host.appInfoStore = appInfoStore;
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    metadataState.compatibilityDefault = 3;
    metadataState.compatibilityDefaultLoaded = true;
    unpatchers = [];
    installMetadataPatches(unpatchers);

    appStore.UpdateAppOverview(incomingOverview(appId, 0));
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x0a);

    flushDeferredCompatibilityPublications(`/library/app/${appId}/tab/Activity`);
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x0f);
  });

  it("preserves the held category when repeated global changes return to it before an active replacement", () => {
    const appId = 9464;
    const initial = installCompatibilityOverview(appId, 0x9a);
    let currentOverview: any = initial;
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = {
      allApps: [initial],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? currentOverview : null,
      UpdateAppOverview: (incoming: any) => {
        appInfoStore.OnAppOverviewChange([incoming]);
        currentOverview = {
          ...currentOverview,
          steam_hw_compat_category_packed: incoming.steam_hw_compat_category_packed(),
        };
        appStore.allApps = [currentOverview];
        return currentOverview;
      },
    };
    host.appStore = appStore;
    host.appDetailsStore = {};
    host.appInfoStore = appInfoStore;
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    metadataState.compatibilityDefaultLoaded = true;
    unpatchers = [];
    installMetadataPatches(unpatchers);

    setConfirmedCompatibilityDefault(3);
    setConfirmedCompatibilityDefault(2);
    appStore.UpdateAppOverview(incomingOverview(appId, 0x70));

    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x7a);
  });

  it("preserves the held numeric Unknown category on an incoming active replacement", () => {
    const appId = 9465;
    const initial = installCompatibilityOverview(appId, 0xb0);
    let currentOverview: any = initial;
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = {
      allApps: [initial],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? currentOverview : null,
      UpdateAppOverview: (incoming: any) => {
        appInfoStore.OnAppOverviewChange([incoming]);
        currentOverview = {
          ...currentOverview,
          steam_hw_compat_category_packed: incoming.steam_hw_compat_category_packed(),
        };
        appStore.allApps = [currentOverview];
        return currentOverview;
      },
    };
    host.appStore = appStore;
    host.appDetailsStore = {};
    host.appInfoStore = appInfoStore;
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    metadataState.compatibilityDefault = 0;
    metadataState.compatibilityDefaultLoaded = true;
    unpatchers = [];
    installMetadataPatches(unpatchers);

    appStore.UpdateAppOverview(incomingOverview(appId, 0xaf));

    expect(currentOverview.steam_hw_compat_category_packed).toBe(0xa0);
  });

  it("reconciles the retained held value when the latest reload policy collapses pending work", () => {
    const appId = 9460;
    const overview = installCompatibilityOverview(appId, 0xaa);
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    setConfirmedCompatibilityDefault(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0xaa);

    retainCompatibilityBaselinesForReload();
    cancelCompatibilityDefaultLoad();
    const replacement = {
      ...overview,
      steam_hw_compat_category_packed: 0x70,
    };
    const set = vi.fn();
    const host = globalThis as Record<string, unknown>;
    host.appStore = {
      allApps: [replacement],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? replacement : null,
      m_mapApps: {
        get: (candidate: number) => candidate === appId ? replacement : undefined,
        set,
      },
    };
    beginCompatibilityLifecycle();
    // Returning to the held Playable value removes the pending update. The
    // replacement still needs that retained held nibble before Game Info exits.
    metadataState.compatibilityDefault = 2;
    metadataState.compatibilityDefaultLoaded = true;

    expect(applyCompatibilityDefault()).toBe(false);
    expect(replacement.steam_hw_compat_category_packed).toBe(0x7a);
    expect(set).not.toHaveBeenCalled();

    flushDeferredCompatibilityPublications(`/library/app/${appId}/tab/Activity`);
    expect(replacement.steam_hw_compat_category_packed).toBe(0x7a);
  });

  it("reconciles a retained held value on an incoming reload replacement when pending work collapses", () => {
    const appId = 9466;
    const initial = installCompatibilityOverview(appId, 0xaa);
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    setConfirmedCompatibilityDefault(3);

    retainCompatibilityBaselinesForReload();
    cancelCompatibilityDefaultLoad();
    let currentOverview: any = {
      ...initial,
      steam_hw_compat_category_packed: 0x70,
    };
    const host = globalThis as Record<string, unknown>;
    const appInfoStore = { OnAppOverviewChange: vi.fn() };
    const appStore = {
      allApps: [currentOverview],
      GetAppOverviewByAppID: (candidate: number) => candidate === appId ? currentOverview : null,
      UpdateAppOverview: (incoming: any) => {
        appInfoStore.OnAppOverviewChange([incoming]);
        currentOverview = {
          ...currentOverview,
          steam_hw_compat_category_packed: incoming.steam_hw_compat_category_packed(),
        };
        appStore.allApps = [currentOverview];
        return currentOverview;
      },
    };
    host.appStore = appStore;
    host.appDetailsStore = {};
    host.appInfoStore = appInfoStore;
    beginCompatibilityLifecycle();
    metadataState.compatibilityDefault = 2;
    metadataState.compatibilityDefaultLoaded = true;
    unpatchers = [];
    installMetadataPatches(unpatchers);

    appStore.UpdateAppOverview(incomingOverview(appId, 0x70));
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x7a);

    flushDeferredCompatibilityPublications(`/library/app/${appId}/tab/Activity`);
    expect(currentOverview.steam_hw_compat_category_packed).toBe(0x7a);
  });

  it("clears a held update on real teardown instead of writing it later", () => {
    const appId = 9461;
    const overview = installCompatibilityOverview(appId, 0xa0);
    setRoute(`/library/app/${appId}/tab/GameInfo`);
    setConfirmedCompatibilityDefault(3);
    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);

    cancelCompatibilityDefaultLoad();
    metadataState.compatibilityDefault = 3;
    metadataState.compatibilityDefaultLoaded = true;
    flushDeferredCompatibilityPublications(`/library/home`);

    expect(overview.steam_hw_compat_category_packed).toBe(0xa0);
  });

  it("publishes only changed native shortcuts after a completed global batch", () => {
    class NativeOverview {
      appid = 0;
      app_type = 1073741824;
      steam_hw_compat_category_packed = 0;

      BIsShortcut() {
        return this.app_type === 1073741824;
      }

      BIsModOrShortcut() {
        return this.app_type === 1073741824;
      }
    }

    const first = new NativeOverview();
    first.appid = 9455;
    first.steam_hw_compat_category_packed = 0xa0;
    const second = new NativeOverview();
    second.appid = 9456;
    second.steam_hw_compat_category_packed = 0xb1;
    const official = new NativeOverview();
    official.appid = matchedSteamAppId;
    official.app_type = 0;
    official.steam_hw_compat_category_packed = 0xc2;
    const overviews = new Map([
      [first.appid, first],
      [second.appid, second],
      [official.appid, official],
    ]);
    const publications: Array<{ appId: number; first: number; second: number }> = [];
    const set = overviews.set.bind(overviews);
    vi.spyOn(overviews, "set").mockImplementation((appId, overview) => {
      publications.push({
        appId,
        first: first.steam_hw_compat_category_packed,
        second: second.steam_hw_compat_category_packed,
      });
      return set(appId, overview);
    });
    const host = globalThis as Record<string, unknown>;
    host.appStore = { allApps: [first, second, official], m_mapApps: overviews };
    host.appDetailsStore = {};
    const revisions: number[] = [];
    const unsubscribe = subscribeCompatibilityRevision(() => revisions.push(compatibilityRevisionSnapshot()));

    setConfirmedCompatibilityDefault(3);

    expect(first.steam_hw_compat_category_packed).toBe(0xaf);
    expect(second.steam_hw_compat_category_packed).toBe(0xbf);
    expect(official.steam_hw_compat_category_packed).toBe(0xc2);
    expect(publications).toEqual([
      { appId: first.appid, first: 0xaf, second: 0xbf },
      { appId: second.appid, first: 0xaf, second: 0xbf },
    ]);
    expect(overviews.get(first.appid)).not.toBe(first);
    expect(overviews.get(second.appid)).not.toBe(second);
    expect(overviews.get(official.appid)).toBe(official);
    expect(revisions).toEqual([1]);
    unsubscribe();
  });

  it.each([
    ["an official Steam game", false, undefined],
    ["missing metadata", true, undefined],
    ["unresolved Automatic metadata", true, compatibilityMetadata(null, null)],
    ["explicit Unknown metadata", true, compatibilityMetadata(null, 0)],
  ])("does not mutate compatibility state for %s", (_label, native, metadata) => {
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
