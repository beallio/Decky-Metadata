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
  steamActivityPayloadForApp,
} from "./activity";
import {
  compatibilityRevisionSnapshot,
  metadataCache,
  metadataState,
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
  metadataState.compatibilityRevision = 0;
  mocks.refreshSteamActivityForApp.mockReset();
  configureActivityMetadataLoader(async () => undefined, () => false);
  delete (globalThis as Record<string, unknown>).appStore;
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
});
