import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetadataData } from "../types";

const mocks = vi.hoisted(() => ({
  currentSteamLanguage: vi.fn(async () => "english"),
  refreshSteamActivityForApp: vi.fn(),
}));

vi.mock("@decky/ui", () => ({ findModuleChild: vi.fn() }));
vi.mock("../i18n", () => ({
  currentSteamLanguage: mocks.currentSteamLanguage,
  t: (key: string) => key,
}));
vi.mock("../backend", () => ({
  frontendLog: vi.fn(() => Promise.resolve()),
  getCommunityFallbackPage: vi.fn(),
  refreshSteamActivityForApp: mocks.refreshSteamActivityForApp,
}));
vi.mock("../log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  clearDeckyNativeActivityForApp,
  configureActivityMetadataLoader,
  deckyNativePartnerEventDiscussionUrl,
  installNativeActivityStorePatch,
  installNativeNewsHistoryRedirects,
  installNativePartnerEventStorePatch,
  refreshDeckyNativeActivityForApp,
  steamHttpHelperFromModule,
  steamActivityPayloadForApp,
} from "./activity";
import {
  compatibilityRevisionSnapshot,
  deckyNativeActivityCache,
  deckyNativePartnerEventCache,
  metadataCache,
  metadataState,
  patchInstallStatus,
  removeMetadataCacheEntry,
} from "./core";
const makeMetadata = (
  compatibilityOverride: number | null,
  compatibilityCategory: number | null,
  perDevice: Partial<Pick<MetadataData,
    "steamos_compat_category" | "steam_machine_compat_category" | "steam_frame_compat_category">> = {},
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
  ...perDevice,
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

type RepaintActivity = {
  appActivityByDay?: Array<{ events?: Array<{ preview?: { strSummary?: string } }> }>;
};

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
  const host = globalThis as Record<string, unknown>;
  const eventIdsByApp = host.__deckyNativePartnerEventIdsByApp as Map<number, Set<string>> | undefined;
  eventIdsByApp?.forEach((_ids, appId) => clearDeckyNativeActivityForApp(appId));
  Object.keys(metadataCache).forEach((key) => delete metadataCache[key]);
  deckyNativeActivityCache().clear();
  deckyNativePartnerEventCache().clear();
  eventIdsByApp?.clear();
  metadataState.compatibilityRevision = 0;
  metadataState.compatibilityLifecycleGeneration = 0;
  patchInstallStatus.activity = "pending";
  mocks.refreshSteamActivityForApp.mockReset();
  mocks.currentSteamLanguage.mockReset();
  mocks.currentSteamLanguage.mockResolvedValue("english");
  configureActivityMetadataLoader(async () => undefined, () => false);
  delete host.appStore;
  delete host.appActivityStore;
  delete host.appDetailsStore;
  delete host.SteamClient;
  delete host.partnerEventStore;
  delete host.__deckyNativePartnerEventStore;
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
      expect(mocks.refreshSteamActivityForApp).toHaveBeenCalledWith(appId, "english");
      expect(metadataCache[String(appId)]).toBe(refreshed);
    });

    expect(applyMetadata).not.toHaveBeenCalled();
    expect(compatibilityRevisionSnapshot()).toBe(0);
  });

  it("applies and publishes a change limited to a per-device category", async () => {
    const appId = 9613;
    installShortcut(appId);
    metadataCache[String(appId)] = makeMetadata(null, 1, { steamos_compat_category: 2 });
    const refreshed = makeMetadata(null, 1, { steamos_compat_category: 1 });
    mocks.refreshSteamActivityForApp.mockResolvedValue(refreshed);
    const applyMetadata = vi.fn(() => true);
    configureActivityMetadataLoader(async () => undefined, applyMetadata);

    await steamActivityPayloadForApp(appId);
    await vi.waitFor(() => expect(applyMetadata).toHaveBeenCalledWith(appId));

    expect(metadataCache[String(appId)]).toBe(refreshed);
    expect(compatibilityRevisionSnapshot()).toBe(1);
  });

  it("rebuilds native Activity when only the news body language changed", async () => {
    const appId = 9609;
    const gid = "12345678901234567";
    installShortcut(appId);
    metadataCache[String(appId)] = makeNewsMetadata("Unchanged headline", gid);
    const translated = makeNewsMetadata("Unchanged headline", gid);
    translated.steam_news![0] = {
      ...translated.steam_news![0],
      summary: "Corps traduit",
      body: "Corps traduit",
      raw_body: "Corps traduit",
    };
    mocks.refreshSteamActivityForApp.mockResolvedValue(translated);

    await steamActivityPayloadForApp(appId);
    await vi.waitFor(() => {
      const activity = deckyNativeActivityCache().get(appId) as RepaintActivity | undefined;
      expect(activity?.appActivityByDay?.[0]?.events?.[0]?.preview?.strSummary).toBe("Corps traduit");
    });
  });

  it("passes the current Steam language to the news refresh", async () => {
    const appId = 9610;
    installShortcut(appId);
    metadataCache[String(appId)] = makeMetadata(null, null);
    mocks.currentSteamLanguage.mockResolvedValue("french");
    mocks.refreshSteamActivityForApp.mockResolvedValue(makeMetadata(null, null));

    await steamActivityPayloadForApp(appId);

    await vi.waitFor(() => expect(mocks.refreshSteamActivityForApp).toHaveBeenCalledWith(appId, "french"));
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
    await vi.waitFor(() => expect(mocks.refreshSteamActivityForApp).toHaveBeenCalledWith(appId, "english"));
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

  it("does not restore metadata removed before a late refresh reply arrives", async () => {
    // Plugin replies can arrive out of commit order: the refresh saved first, Remove replied first.
    const appId = 9608;
    installShortcut(appId);
    metadataCache[String(appId)] = makeNewsMetadata("Old news", "12345678901234567");
    let resolveRefresh!: (metadata: MetadataData | null) => void;
    mocks.refreshSteamActivityForApp.mockReturnValue(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));

    await steamActivityPayloadForApp(appId);
    await vi.waitFor(() => expect(mocks.refreshSteamActivityForApp).toHaveBeenCalledWith(appId, "english"));
    removeMetadataCacheEntry(appId);
    resolveRefresh(makeNewsMetadata("Fresh news", "22345678901234567"));
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();

    expect(metadataCache[String(appId)]).toBeUndefined();
    expect(deckyNativeActivityCache().has(appId)).toBe(false);
  });
});

describe("synthetic native Activity contract", () => {
  // The refresh returns a Steam-shaped object; only these render fields are asserted.
  type RenderableEvent = { BCanRender: () => boolean; preview: { strTitle: string; strSummary: string } };
  const renderableEvents = (activity: unknown): RenderableEvent[] =>
    ((activity as { appActivityByDay?: Array<{ events?: RenderableEvent[] }> } | null)
      ?.appActivityByDay ?? []).flatMap((day) => day.events ?? []);

  it("keeps every injected announcement renderable for the Steam feed card", async () => {
    const appId = 9606;
    installShortcut(appId);
    metadataCache[String(appId)] = makeNewsMetadata("Renderable news", "12345678901234567");

    const events = renderableEvents(await refreshDeckyNativeActivityForApp(appId));

    expect(events.length).toBeGreaterThan(0);
    // Steam's feed filters and gates cards through event.BCanRender(), then draws
    // the body from event.preview.
    expect(events.every((event) => event.BCanRender() === true)).toBe(true);
    expect(events[0].preview.strTitle).toBe("Renderable news");
    expect(events[0].preview.strSummary).toBe("Renderable news summary");
  });
});

describe("synthetic native Activity event discussion URL", () => {
  // The refresh returns the Steam-shaped Activity tree; only the event model is drilled below.
  type RenderableActivity = { appActivityByDay?: Array<{ events?: Array<{ eventModel?: Record<string, unknown> }> }> };
  const partnerEvent = async (appId: number, metadata: MetadataData) => {
    installShortcut(appId);
    metadataCache[String(appId)] = metadata;
    const activity = await refreshDeckyNativeActivityForApp(appId) as unknown as RenderableActivity | null;
    return activity?.appActivityByDay?.[0]?.events?.[0]?.eventModel;
  };

  // Steam's event overlay (sp.js) reads these from eventModel while rendering the detail
  // modal. A missing method throws "TypeError: X is not a function" and the whole event
  // view fails; GetDiscussionURL was missing and crashed the matched-shortcut card.
  const overlayMethods = [
    "BEventCanShowBroadcastWidget",
    "BHasSubTitle",
    "BHasTag",
    "BImageNeedScreenshotFallback",
    "BIsEventActionEnabled",
    "BIsUnlistedEvent",
    "GetCategoryAsString",
    "GetDescriptionWithFallback",
    "GetDiscussionURL",
    "GetEndTimeAndDateUnixSeconds",
    "GetNameWithFallback",
    "GetPostTimeAndDateUnixSeconds",
    "GetStartTimeAndDateUnixSeconds",
    "GetSteamAwardCategory",
    "GetSteamAwardNomineeCategories",
    "GetSubTitle",
  ];

  it("exposes every partner-event method the native overlay calls", async () => {
    const event = await partnerEvent(9610, makeNewsMetadata("Overlay news", "12345678901234567"));

    const missing = overlayMethods.filter((name) => typeof event?.[name] !== "function");

    expect(missing).toEqual([]);
  });

  it("answers GetDiscussionURL with the community announcement page", async () => {
    const event = await partnerEvent(9611, makeNewsMetadata("Discussion news", "12345678901234567"));

    expect(typeof event?.GetDiscussionURL).toBe("function");
    expect((event?.GetDiscussionURL as () => unknown)()).toBe(
      "https://steamcommunity.com/games/55150/announcements/detail/12345678901234567",
    );
  });
});

describe("deckyNativePartnerEventDiscussionUrl", () => {
  const newsUrl = "https://store.steampowered.com/news/app/1942280/view/677389136248701284";

  it("prefers the community announcement page when the Steam appid and gid are known", () => {
    expect(deckyNativePartnerEventDiscussionUrl(1942280, "677389136248701284", newsUrl)).toBe(
      "https://steamcommunity.com/games/1942280/announcements/detail/677389136248701284",
    );
  });

  it("falls back to the news url when the appid or gid is unknown", () => {
    expect(deckyNativePartnerEventDiscussionUrl(1942280, "", newsUrl)).toBe(newsUrl);
    expect(deckyNativePartnerEventDiscussionUrl(0, "677389136248701284", newsUrl)).toBe(newsUrl);
  });

  it("returns an empty string like native when nothing is known", () => {
    expect(deckyNativePartnerEventDiscussionUrl(0, "", "")).toBe("");
  });
});

describe("mounted Activity repaint", () => {
  it("reads the observable Activity map for the requested shortcut only", async () => {
    const appId = 9612;
    const nativeAppId = 9613;
    (globalThis as Record<string, unknown>).appStore = {
      GetAppOverviewByAppID: (candidate: number) =>
        candidate === appId
          ? { appid: appId, app_type: 1073741824, BIsShortcut: () => true, BIsModOrShortcut: () => true }
          : candidate === nativeAppId
            ? { appid: nativeAppId, app_type: 0, BIsShortcut: () => false, BIsModOrShortcut: () => false }
            : null,
    };
    const reads: number[] = [];
    const store = {
      m_mapAppActivity: {
        get: (candidate: number) => {
          reads.push(candidate);
          return undefined;
        },
        set: () => undefined,
        has: () => false,
        delete: () => undefined,
      },
      GetAppActivity: vi.fn((_appId: number) => ({ nativeSteamActivity: true })),
    };
    (globalThis as Record<string, unknown>).appActivityStore = store;
    metadataCache[String(appId)] = makeNewsMetadata("Repaint card", "12345678901234567");
    await refreshDeckyNativeActivityForApp(appId, store);

    const unpatchers: Array<() => void> = [];
    installNativeActivityStorePatch(unpatchers);

    expect(store.GetAppActivity(appId)).toMatchObject({ __deckyNativeActivity: true });
    expect(reads).toEqual([appId]);

    expect(store.GetAppActivity(nativeAppId)).toEqual({ nativeSteamActivity: true });
    expect(reads).toEqual([appId]);

    unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
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

  it("patches the same Steam store again after a plugin reload", () => {
    const store = { GetAppActivity: (_appId: number) => undefined };
    const originalGetAppActivity = store.GetAppActivity;
    (globalThis as Record<string, unknown>).appActivityStore = store;
    for (let load = 0; load < 2; load += 1) {
      const unpatchers: Array<() => void> = [];
      installNativeActivityStorePatch(unpatchers);
      expect(store.GetAppActivity).not.toBe(originalGetAppActivity);
      unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
      expect(store.GetAppActivity).toBe(originalGetAppActivity);
    }
  });
});

describe("native news history navigation", () => {
  it("uses the replacement close for its tracked news entry after fifteen seconds", async () => {
    const appId = 9710;
    installShortcut(appId);
    metadataCache[String(appId)] = makeNewsMetadata("Tracked news", "42345678901234567");
    const activity = await refreshDeckyNativeActivityForApp(appId) as {
      appActivityByDay?: Array<{ events?: Array<{ eventModel?: { GID?: string } }> }>;
    } | null;
    const eventId = activity?.appActivityByDay?.[0]?.events?.[0]?.eventModel?.GID;
    expect(eventId).toBeTruthy();

    const host = globalThis as Record<string, unknown>;
    const originalRouter = host.Router;
    const originalWindow = host.window;
    const path = `/library/app/${appId}`;
    const browserWindow = {
      history: null,
      location: { pathname: path },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const history: {
      location: { pathname: string; state: unknown };
      push: (target: string, state: unknown) => unknown;
      back: () => unknown;
      replace: (target: string, state: unknown) => unknown;
    } = {
      location: { pathname: path, state: null },
      push: vi.fn((_target: string, _state: unknown) => undefined),
      back: vi.fn(() => undefined),
      replace: vi.fn((_target: string, _state: unknown) => undefined),
    };
    history.replace = vi.fn((target: string, state: unknown) => {
      history.location = { pathname: target, state };
      browserWindow.location.pathname = target;
      return "replaced";
    });
    const originalReplace = history.replace;
    host.Router = { WindowStore: { GamepadUIMainWindowInstance: { m_history: history } } };
    host.window = browserWindow as unknown as Window;
    const state = { event_to_show: { appid: appId, eventid: eventId } };
    const unpatchers: Array<() => void> = [];
    vi.useFakeTimers();
    try {
      installNativeNewsHistoryRedirects(unpatchers);
      history.push(path, state);
      vi.advanceTimersByTime(16_000);
      history.replace(path, {});

      expect(history.back).not.toHaveBeenCalled();
      expect(originalReplace).toHaveBeenCalledTimes(2);

      history.push(path, state);
      history.replace("/library/app/9711", {});
      history.location = { pathname: path, state };
      history.replace(path, {});

      expect(history.back).toHaveBeenCalledTimes(1);
    } finally {
      unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
      vi.useRealTimers();
      if (originalRouter === undefined) delete host.Router;
      else host.Router = originalRouter;
      if (originalWindow === undefined) delete host.window;
      else host.window = originalWindow;
    }
  });

  it("keeps a later window.history wrapper installed on unpatch", () => {
    const host = globalThis as Record<string, unknown>;
    const originalRouter = host.Router;
    const originalWindow = host.window;
    const originalPushState = vi.fn((_state: unknown, _title: string, _url?: string | URL | null) => "original");
    const browserHistory = {
      state: null as unknown,
      back: vi.fn(),
      pushState: originalPushState,
      replaceState: vi.fn(),
    };
    host.Router = undefined;
    host.window = {
      history: browserHistory,
      location: { pathname: "/library/home" },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const unpatchers: Array<() => void> = [];
    try {
      installNativeNewsHistoryRedirects(unpatchers);
      const pluginWrapper = browserHistory.pushState;
      const laterWrapper = vi.fn((state: unknown, title: string, url?: string | URL | null) =>
        pluginWrapper.call(browserHistory, state, title, url),
      );
      browserHistory.pushState = laterWrapper;

      unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
      (browserHistory as any).pushState(null, "", "/library/home");

      expect(laterWrapper).toHaveBeenCalledTimes(1);
      expect(originalPushState).toHaveBeenCalledTimes(1);
    } finally {
      unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
      if (originalRouter === undefined) delete host.Router;
      else host.Router = originalRouter;
      if (originalWindow === undefined) delete host.window;
      else host.window = originalWindow;
    }
  });
});

describe("synthetic PartnerEvent lifecycle", () => {
  it("drops superseded and cleared app events from Steam indexes and unload", async () => {
    const appId = 9701;
    const otherAppId = 9702;
    const oldGid = "12345678901234567";
    const replacementGid = "22345678901234567";
    const otherGid = "32345678901234567";
    const shortcuts = new Map([
      [appId, { appid: appId, app_type: 1073741824, BIsShortcut: () => true }],
      [otherAppId, { appid: otherAppId, app_type: 1073741824, BIsShortcut: () => true }],
    ]);
    const partnerStore = {
      m_mapExistingEvents: new Map<string, unknown>(),
      m_mapAnnouncementBodyToEvent: new Map<string, string>(),
      m_mapAppIDToGIDs: new Map<number, string[]>(),
      m_mapClanToGIDs: new Map<number, string[]>(),
    };
    const host = globalThis as Record<string, unknown>;
    host.appStore = { GetAppOverviewByAppID: (candidate: number) => shortcuts.get(candidate) };
    host.partnerEventStore = partnerStore;
    metadataCache[String(appId)] = makeNewsMetadata("First old", oldGid);
    metadataCache[String(otherAppId)] = makeNewsMetadata("Other", otherGid);

    await refreshDeckyNativeActivityForApp(appId);
    await refreshDeckyNativeActivityForApp(otherAppId);
    expect(partnerStore.m_mapExistingEvents.has(`old_announce_${oldGid}`)).toBe(true);
    expect(partnerStore.m_mapAppIDToGIDs.get(55150)).toEqual(
      expect.arrayContaining([`old_announce_${oldGid}`, `old_announce_${otherGid}`]),
    );

    metadataCache[String(appId)] = makeNewsMetadata("First replacement", replacementGid);
    await refreshDeckyNativeActivityForApp(appId);
    expect(deckyNativePartnerEventCache().has(`old_announce_${oldGid}`)).toBe(false);
    expect(partnerStore.m_mapExistingEvents.has(`old_announce_${oldGid}`)).toBe(false);
    expect(partnerStore.m_mapAnnouncementBodyToEvent.has(`old_announce_${oldGid}`)).toBe(false);
    expect(partnerStore.m_mapAppIDToGIDs.get(55150)).toEqual(
      expect.arrayContaining([`old_announce_${replacementGid}`, `old_announce_${otherGid}`]),
    );
    expect(partnerStore.m_mapAppIDToGIDs.get(55150)).not.toContain(`old_announce_${oldGid}`);

    clearDeckyNativeActivityForApp(appId);
    expect(deckyNativePartnerEventCache().has(`old_announce_${replacementGid}`)).toBe(false);
    expect(partnerStore.m_mapAppIDToGIDs.get(55150)).toEqual([`old_announce_${otherGid}`]);

    host.SteamClient = {};
    host.appDetailsStore = {};
    const unpatchers: Array<() => void> = [];
    try {
      installNativePartnerEventStorePatch(unpatchers);
    } finally {
      unpatchers.splice(0).reverse().forEach((unpatch) => unpatch());
    }
    expect(deckyNativePartnerEventCache().size).toBe(0);
    expect(partnerStore.m_mapExistingEvents.size).toBe(0);
    expect(partnerStore.m_mapAnnouncementBodyToEvent.size).toBe(0);
    expect(partnerStore.m_mapAppIDToGIDs.size).toBe(0);
    expect(partnerStore.m_mapClanToGIDs.size).toBe(0);
  });
});

describe("steamHttpHelperFromModule", () => {
  class HttpHelper {
    AxiosWrapper() { return undefined; }
    get() { return undefined; }
    post() { return undefined; }
  }

  it("finds the helper under any export name, as stable (g) and beta (Ij) name it", () => {
    const stable = new HttpHelper();
    const beta = new HttpHelper();
    expect(steamHttpHelperFromModule({ g: stable })).toBe(stable);
    expect(steamHttpHelperFromModule({ a: 1, Ij: beta })).toBe(beta);
  });

  it("still finds a helper whose get/post the plugin already replaced", () => {
    const helper = new HttpHelper() as any;
    helper.get = () => "patched";
    expect(steamHttpHelperFromModule({ g: helper })).toBe(helper);
  });

  it("ignores plain get/post objects and axios-style clients without AxiosWrapper", () => {
    const plain = { get: () => undefined, post: () => undefined };
    const axiosLike = { get: () => undefined, post: () => undefined, request: () => undefined };
    expect(steamHttpHelperFromModule({ g: plain, v: axiosLike })).toBeUndefined();
    expect(steamHttpHelperFromModule(null)).toBeUndefined();
  });
});
