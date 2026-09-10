import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetadataData } from "../types";

const mocks = vi.hoisted(() => ({
  refreshSteamActivityForApp: vi.fn(),
}));

vi.mock("@decky/ui", () => ({ findModuleChild: vi.fn() }));
vi.mock("../backend", () => ({
  frontendLog: vi.fn(() => Promise.resolve()),
  getCommunityFallbackPage: vi.fn(),
  refreshSteamActivityForApp: mocks.refreshSteamActivityForApp,
}));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  configureActivityMetadataLoader,
  installNativeActivityStorePatch,
  refreshDeckyNativeActivityForApp,
  steamActivityPayloadForApp,
} from "./activity";
import {
  compatibilityRevisionSnapshot,
  deckyNativeActivityCache,
  metadataCache,
  metadataState,
  patchInstallStatus,
} from "./core";

const makeMetadata = (
  compatibilityOverride: number | null,
  compatibilityCategory: number | null,
): MetadataData => ({
  title: "Example",
  id: "example",
  description: "",
  store_categories: [],
  steam_dlc_appids: [],
  has_points_shop: false,
  steam_news: [],
  steam_news_enriched_at: 0,
  deck_compat_override: compatibilityOverride,
  deck_compat_category: compatibilityCategory,
} as MetadataData);

const makeNewsMetadata = (title: string, gid: string): MetadataData => ({
  ...makeMetadata(null, null),
  steam_appid: 55150,
  steam_news: [{
    id: gid,
    gid,
    title,
    summary: `${title} summary`,
    date: 1700000000,
    url: `https://store.steampowered.com/news/app/55150/view/${gid}`,
  }],
});

const activityNewsTitle = (activity: any) => activity?.appActivityByDay?.[0]?.events?.[0]?.eventModel?.GetNameWithFallback?.();

const installShortcut = (appId: number) => {
  const overview = {
    appid: appId,
    app_type: 1073741824,
    BIsShortcut: () => true,
    BIsModOrShortcut: () => true,
    steam_hw_compat_category_packed: 0,
  };
  (globalThis as Record<string, unknown>).appStore = {
    GetAppOverviewByAppID: (candidate: number) => candidate === appId ? overview : null,
  };
};

afterEach(() => {
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  deckyNativeActivityCache().clear();
  metadataState.compatibilityRevision = 0;
  metadataState.compatibilityLifecycleGeneration = 0;
  patchInstallStatus.activity = "pending";
  mocks.refreshSteamActivityForApp.mockReset();
  configureActivityMetadataLoader(async () => undefined, () => false);
  delete (globalThis as Record<string, unknown>).appStore;
  delete (globalThis as Record<string, unknown>).appActivityStore;
});

describe("activity compatibility refresh", () => {
  it("applies and publishes changed compatibility metadata", async () => {
    const appId = 9601;
    installShortcut(appId);
    metadataCache[String(appId)] = makeMetadata(null, 1);
    const refreshed = makeMetadata(null, 2);
    mocks.refreshSteamActivityForApp.mockResolvedValue(refreshed);
    const applyMetadata = vi.fn(() => true);
    configureActivityMetadataLoader(async () => undefined, applyMetadata);

    await steamActivityPayloadForApp(appId);
    await vi.waitFor(() => expect(applyMetadata).toHaveBeenCalledWith(appId));

    expect(metadataCache[String(appId)]).toBe(refreshed);
    expect(compatibilityRevisionSnapshot()).toBe(1);
  });

  it("does not apply or publish unchanged compatibility metadata", async () => {
    const appId = 9602;
    installShortcut(appId);
    metadataCache[String(appId)] = makeMetadata(3, 1);
    const refreshed = makeMetadata(3, 1);
    mocks.refreshSteamActivityForApp.mockResolvedValue(refreshed);
    const applyMetadata = vi.fn(() => true);
    configureActivityMetadataLoader(async () => undefined, applyMetadata);

    await steamActivityPayloadForApp(appId);
    await vi.waitFor(() => {
      expect(mocks.refreshSteamActivityForApp).toHaveBeenCalledWith(appId);
      expect(metadataCache[String(appId)]).toBe(refreshed);
    });

    expect(applyMetadata).not.toHaveBeenCalled();
    expect(compatibilityRevisionSnapshot()).toBe(0);
  });

  it("keeps a late activity refresh inert after the plugin lifecycle ends", async () => {
    const appId = 9606;
    installShortcut(appId);
    const existing = makeMetadata(null, 1);
    const refreshed = makeMetadata(null, 2);
    metadataCache[String(appId)] = existing;
    const applyMetadata = vi.fn(() => true);
    configureActivityMetadataLoader(async () => undefined, applyMetadata);
    metadataState.compatibilityLifecycleGeneration = 1;
    let resolveRefresh!: (metadata: MetadataData | null) => void;
    mocks.refreshSteamActivityForApp.mockReturnValue(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));

    await steamActivityPayloadForApp(appId);
    await vi.waitFor(() => expect(mocks.refreshSteamActivityForApp).toHaveBeenCalledWith(appId));
    metadataState.compatibilityLifecycleGeneration += 1;
    resolveRefresh(refreshed);
    await Promise.resolve();

    expect(metadataCache[String(appId)]).toBe(existing);
    expect(applyMetadata).not.toHaveBeenCalled();

    const nextAppId = 9607;
    installShortcut(nextAppId);
    metadataCache[String(nextAppId)] = existing;
    metadataState.compatibilityLifecycleGeneration += 1;
    mocks.refreshSteamActivityForApp.mockResolvedValue(refreshed);
    await steamActivityPayloadForApp(nextAppId);
    await vi.waitFor(() => expect(metadataCache[String(nextAppId)]).toBe(refreshed));
    expect(applyMetadata).toHaveBeenCalledWith(nextAppId);
  });
});

describe("native Activity metadata removal", () => {
  it("removes stale injected cards for absent or empty metadata without disturbing other Activity", async () => {
    const appId = 9603;
    const otherNewsAppId = 9604;
    const nativeSteamAppId = 9605;
    const shortcuts = new Map<number, any>([
      [appId, {
        appid: appId,
        app_type: 1073741824,
        BIsShortcut: () => true,
        BIsModOrShortcut: () => true,
      }],
      [otherNewsAppId, {
        appid: otherNewsAppId,
        app_type: 1073741824,
        BIsShortcut: () => true,
        BIsModOrShortcut: () => true,
      }],
      [nativeSteamAppId, {
        appid: nativeSteamAppId,
        app_type: 0,
        BIsShortcut: () => false,
        BIsModOrShortcut: () => false,
      }],
    ]);
    (globalThis as Record<string, unknown>).appStore = {
      GetAppOverviewByAppID: (candidate: number) => shortcuts.get(candidate) || null,
    };
    const nativeSteamActivity = { nativeSteamActivity: true };
    const store = {
      m_mapAppActivity: new Map<number, any>([[nativeSteamAppId, nativeSteamActivity]]),
      GetAppActivity(appId: number) {
        return this.m_mapAppActivity.get(appId);
      },
    };
    const originalGetAppActivity = store.GetAppActivity;
    (globalThis as Record<string, unknown>).appActivityStore = store;
    const unpatchers: Array<() => void> = [];
    installNativeActivityStorePatch(unpatchers);

    metadataCache[String(appId)] = makeNewsMetadata("Old plugin card", "12345678901234567");
    metadataCache[String(otherNewsAppId)] = makeNewsMetadata("Other plugin card", "22345678901234567");
    await refreshDeckyNativeActivityForApp(appId, store);
    await refreshDeckyNativeActivityForApp(otherNewsAppId, store);

    expect(activityNewsTitle(store.GetAppActivity(appId))).toBe("Old plugin card");
    expect(activityNewsTitle(store.GetAppActivity(otherNewsAppId))).toBe("Other plugin card");
    expect(store.GetAppActivity(nativeSteamAppId)).toBe(nativeSteamActivity);

    delete metadataCache[String(appId)];
    await refreshDeckyNativeActivityForApp(appId, store);

    expect(originalGetAppActivity.call(store, appId)).toBeUndefined();
    expect(activityNewsTitle(store.GetAppActivity(otherNewsAppId))).toBe("Other plugin card");
    expect(store.GetAppActivity(nativeSteamAppId)).toBe(nativeSteamActivity);

    metadataCache[String(appId)] = makeNewsMetadata("Old plugin card", "12345678901234567");
    await refreshDeckyNativeActivityForApp(appId, store);
    metadataCache[String(appId)] = makeMetadata(null, null);
    await refreshDeckyNativeActivityForApp(appId, store);

    expect(originalGetAppActivity.call(store, appId)).toBeUndefined();
    metadataCache[String(appId)] = makeNewsMetadata("Old plugin card", "12345678901234567");
    await refreshDeckyNativeActivityForApp(appId, store);
    const nativeTargetActivity = { nativeTargetActivity: true };
    store.m_mapAppActivity.set(appId, nativeTargetActivity);
    delete metadataCache[String(appId)];
    await refreshDeckyNativeActivityForApp(appId, store);

    expect(originalGetAppActivity.call(store, appId)).toBe(nativeTargetActivity);
    metadataCache[String(appId)] = makeNewsMetadata("Restored plugin card", "32345678901234567");
    await refreshDeckyNativeActivityForApp(appId, store);
    expect(activityNewsTitle(store.GetAppActivity(appId))).toBe("Restored plugin card");
    expect(activityNewsTitle(store.GetAppActivity(otherNewsAppId))).toBe("Other plugin card");
    expect(store.GetAppActivity(nativeSteamAppId)).toBe(nativeSteamActivity);

    unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
  });
});
