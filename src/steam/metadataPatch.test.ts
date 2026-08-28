import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterPatch: vi.fn((target: Record<string, unknown>, method: string, handler: Function) => {
    const original = target[method] as Function;
    target[method] = function (this: unknown, ...args: unknown[]) {
      return handler.call(this, args, original.apply(this, args));
    };
    return { unpatch: () => { target[method] = original; } };
  }),
}));

vi.mock("@decky/ui", () => ({ afterPatch: mocks.afterPatch, findModuleChild: vi.fn() }));
vi.mock("../backend", () => ({
  autoFetchMetadata: vi.fn(),
  fetchMetadata: vi.fn(),
  frontendLog: vi.fn(() => Promise.resolve()),
  getAllMetadata: vi.fn(),
  saveMetadata: vi.fn(),
}));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import { metadataCache, metadataState } from "./core";
import { installMetadataPatches } from "./metadataPatch";

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
  delete metadataCache[String(matchedShortcutAppId)];
  metadataState.bypassCounter = 0;
  metadataState.routeShield = null;
  delete (globalThis as Record<string, unknown>).appStore;
  delete (globalThis as Record<string, unknown>).appDetailsStore;
  delete (globalThis as Record<string, unknown>).Router;
  delete (globalThis as Record<string, unknown>).window;
  mocks.afterPatch.mockClear();
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

  it("preserves receiver, arguments, return value, and unload restoration", () => {
    const { original, overview } = installWithOverview("/routes/library/home");
    expect(overview.BIsModOrShortcut("sentinel")).toBe(true);
    expect(original).toHaveBeenLastCalledWith("sentinel");
    unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
    expect(overview.BIsModOrShortcut("restored")).toBe(true);
    expect(original).toHaveBeenLastCalledWith("restored");
  });
});
