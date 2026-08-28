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

import { metadataCache, metadataState } from "./core";
import {
  applyMetadata,
  effectiveCompatibilityCategory,
  installMetadataPatches,
  refreshCompatibilitySurfaces,
  refreshMetadataCache,
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
  metadataState.compatibilityRevision = 0;
  delete (globalThis as Record<string, unknown>).appStore;
  delete (globalThis as Record<string, unknown>).appDetailsStore;
  delete (globalThis as Record<string, unknown>).Router;
  delete (globalThis as Record<string, unknown>).window;
  mocks.afterPatch.mockClear();
  mocks.getAllMetadata.mockReset();
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

    applyMetadata(appId);

    expect(overview.steam_hw_compat_category_packed).toBe(0xa0 | category | (category << 2));
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

  it("replaces the current route with its complete location to refresh compatibility surfaces", () => {
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

    expect(refreshCompatibilitySurfaces(2155012430)).toBe(1);
    expect(replace).toHaveBeenCalledWith(
      "/routes/library/app/2155012430?tab=GameInfo#compatibility",
      { source: "test", deckyMetadataCompatibilityRevision: 1 }
    );
  });

  it("does not fail when Steam's router history is absent", () => {
    expect(() => refreshCompatibilitySurfaces(2155012430)).not.toThrow();
  });
});
