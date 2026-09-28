import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  evalInBigPicture: vi.fn(async () => ({ status: "Steam UI unavailable", runtimeMissing: true })),
  getTrailerSettings: vi.fn(async () => ({ enabled: false, audioEnabled: false, quality: "auto" })),
  setTrailerSettings: vi.fn(async (settings: unknown) => settings),
}));

const steam = vi.hoisted(() => ({
  route: "/routes/library/app/570",
  overview: new Map<number, unknown>(),
  metadataCache: {} as Record<string, unknown>,
  metadataState: { metadataLoaded: true },
  currentRoutePath: vi.fn(() => steam.route),
  getNativeOverview: vi.fn((appId: number) => steam.overview.get(appId) ?? null),
  isNativeNonSteamShortcut: vi.fn(() => true),
  metadataMatchRevisionSnapshot: vi.fn(() => 0),
  subscribeMetadataMatchChanges: vi.fn(() => () => undefined),
}));

vi.mock("../backend", () => backend);
vi.mock("../steam/core", () => steam);
vi.mock("../steam/metadataPatch", () => ({ ensureMetadataCache: vi.fn(async () => undefined) }));

import { DEFAULT_TRAILER_SETTINGS, TrailerController } from "./controller";
import type { TrailerSettings } from "../types";

const nativeOverview = (appid: number) => ({ appid, app_type: 1 });
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const mountController = (settings: Partial<TrailerSettings> = { enabled: true }, ownerId = "owner") => {
  const normalized = { ...DEFAULT_TRAILER_SETTINGS, ...settings };
  const controller = new TrailerController() as any;
  controller.mounted = true;
  controller.settingsLoaded = true;
  controller.settings = { ...normalized };
  controller.confirmedSettings = { ...normalized };
  controller.ownerId = ownerId;
  controller.identity = null;
  controller.status = "Waiting for a Steam game page";
  (window as any).__deckyMetadataTrailerRuntime = {
    product: "decky-metadata-trailer",
    ownerId,
    update: vi.fn(() => ({ status: "Trailer active" })),
    snapshot: vi.fn(() => ({ status: "Trailer active" })),
    destroy: vi.fn(),
  };
  controller.publishOwner();
  return controller as any;
};

describe("TrailerController behavior", () => {
  beforeEach(() => {
    steam.route = "/routes/library/app/570";
    steam.overview.clear();
    steam.metadataCache = {};
    steam.currentRoutePath.mockImplementation(() => steam.route);
    steam.getNativeOverview.mockImplementation((appId: number) => steam.overview.get(appId) ?? null);
    steam.isNativeNonSteamShortcut.mockReturnValue(true);
    backend.evalInBigPicture.mockReset().mockResolvedValue({ status: "Steam UI unavailable", runtimeMissing: true });
    backend.getTrailerSettings.mockReset().mockResolvedValue({ enabled: false, audioEnabled: false, quality: "auto" });
    backend.setTrailerSettings.mockReset().mockImplementation(async (settings: unknown) => settings);
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 10), clearInterval: vi.fn(),
      setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      CustomEvent,
    });
    vi.stubGlobal("document", { documentElement: {}, defaultView: window });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps controller identity valid on the root route while the QAM hash is open", async () => {
    steam.route = "/routes/library/app/570#quickaccess";
    steam.overview.set(570, nativeOverview(570));
    const controller = mountController();

    await controller.refreshPageIdentity();

    expect(controller.identity).toEqual({ pageAppId: 570, sourceAppId: 570 });
    expect((window as any).__deckyMetadataTrailerOwner.identity).toEqual(controller.identity);
    controller.stop();
  });

  it("retries a missing native overview after leaving and returning to the same page", async () => {
    const controller = mountController();
    await controller.refreshPageIdentity();
    expect(controller.identity).toBeNull();
    const initialLookups = steam.getNativeOverview.mock.calls.filter(([appId]) => appId === 570).length;

    steam.route = "/routes/library/home";
    await controller.refreshPageIdentity();
    expect(steam.getNativeOverview.mock.calls.filter(([appId]) => appId === 570)).toHaveLength(initialLookups);
    steam.overview.set(570, nativeOverview(570));
    steam.route = "/routes/library/app/570#quickaccess";
    await controller.refreshPageIdentity();

    expect(steam.getNativeOverview.mock.calls.filter(([appId]) => appId === 570)).toHaveLength(initialLookups + 1);
    expect(controller.identity).toEqual({ pageAppId: 570, sourceAppId: 570 });
    controller.stop();
  });

  it("rolls back a failed settings save after the route changes", async () => {
    steam.overview.set(570, nativeOverview(570));
    steam.overview.set(571, nativeOverview(571));
    const save = deferred<unknown>();
    backend.setTrailerSettings.mockReturnValue(save.promise);
    const controller = mountController({ enabled: false, audioEnabled: false, quality: "auto" });
    await controller.refreshPageIdentity();

    const pending = controller.setEnabled(true);
    await flush();
    const transactionRevision = controller.settingsRevision;
    steam.route = "/routes/library/app/571";
    await controller.refreshPageIdentity();
    expect(controller.settingsRevision).toBeGreaterThan(transactionRevision);

    save.reject(new Error("disk unavailable"));
    expect(await pending).toBe(false);
    expect(controller.settings.enabled).toBe(false);
    expect(controller.identity).toEqual({ pageAppId: 571, sourceAppId: 571 });
    expect((window as any).__deckyMetadataTrailerOwner.identity).toEqual(controller.identity);
    controller.stop();
  });

  it("rolls back a failed save after a same-page Steam match changes", async () => {
    const shortcutId = 0x80000010;
    steam.route = `/routes/library/app/${shortcutId}`;
    steam.overview.set(shortcutId, { appid: shortcutId, app_type: 1073741824 });
    steam.metadataCache[String(shortcutId)] = { steam_appid: 570 };
    const save = deferred<unknown>();
    backend.setTrailerSettings.mockReturnValue(save.promise);
    const controller = mountController({ enabled: true, audioEnabled: false, quality: "auto" });
    await controller.refreshPageIdentity();

    const pending = controller.setAudioEnabled(true);
    await flush();
    steam.metadataCache[String(shortcutId)] = { steam_appid: 571 };
    await controller.refreshPageIdentity();

    save.reject(new Error("disk unavailable"));
    expect(await pending).toBe(false);
    expect(controller.settings.audioEnabled).toBe(false);
    expect(controller.identity).toEqual({ pageAppId: shortcutId, sourceAppId: 571 });
    controller.stop();
  });

  it("keeps the logo preference available before trailer playback is enabled", async () => {
    const controller = mountController({ enabled: false });

    expect(await controller.setHideLogoDuringTrailer(true)).toBe(true);
    expect(controller.settings).toMatchObject({ enabled: false, hideLogoDuringTrailer: true });
    expect((window as any).__deckyMetadataTrailerOwner.settings.hideLogoDuringTrailer).toBe(true);
    controller.stop();
  });

  it("saves the fade-in delay and updates the live owner without changing playback identity", async () => {
    steam.overview.set(570, nativeOverview(570));
    const controller = mountController();
    await controller.refreshPageIdentity();

    expect(await controller.setFadeInDelaySeconds(0)).toBe(true);
    expect(controller.identity).toEqual({ pageAppId: 570, sourceAppId: 570 });
    expect(backend.setTrailerSettings).toHaveBeenCalledWith(expect.objectContaining({ fadeInDelaySeconds: 0 }));
    expect((window as any).__deckyMetadataTrailerRuntime.update).toHaveBeenCalledWith(
      expect.objectContaining({ fadeInDelaySeconds: 0 }), expect.any(Number), controller.identity,
    );
    controller.stop();
  });

  it("restores the previous logo preference when its save fails during playback", async () => {
    steam.overview.set(570, nativeOverview(570));
    const save = deferred<unknown>();
    backend.setTrailerSettings.mockReturnValue(save.promise);
    const controller = mountController();
    await controller.refreshPageIdentity();

    const pending = controller.setHideLogoDuringTrailer(true);
    await flush();
    expect(controller.settings.hideLogoDuringTrailer).toBe(true);
    expect(controller.identity).toEqual({ pageAppId: 570, sourceAppId: 570 });

    save.reject(new Error("disk unavailable"));
    expect(await pending).toBe(false);
    expect(controller.settings.hideLogoDuringTrailer).toBe(false);
    expect((window as any).__deckyMetadataTrailerOwner.settings.hideLogoDuringTrailer).toBe(false);
    expect(controller.settingsError).toContain("could not be saved");
    controller.stop();
  });

  it("keeps a retired mount inert when its deferred save rejects after a new mount", async () => {
    const save = deferred<unknown>();
    backend.setTrailerSettings.mockReturnValue(save.promise);
    const retired = mountController({ enabled: false, audioEnabled: false, quality: "auto" }, "retired");
    const pending = retired.setEnabled(true);
    await flush();
    retired.stop();

    const current = mountController({ enabled: false, audioEnabled: false, quality: "auto" }, "current");
    save.reject(new Error("old write failed"));
    await pending;

    expect((window as any).__deckyMetadataTrailerOwner).toMatchObject({ ownerId: "current", active: true });
    expect(current.settings.enabled).toBe(false);
    expect(retired.settings.enabled).toBe(true);
    current.stop();
  });

  it("queues two west audio presses while the first settings write is pending", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    backend.setTrailerSettings
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = mountController();
    const runtime = (window as any).__deckyMetadataTrailerRuntime;

    controller.handleAudioChange({ detail: { ownerId: "owner", settingsRevision: 0, audioEnabled: true } });
    await flush();
    expect(controller.settings.audioEnabled).toBe(true);
    controller.handleAudioChange({ detail: {
      ownerId: "owner", settingsRevision: controller.settingsRevision, audioEnabled: false,
    } });
    await flush();
    expect(controller.settings.audioEnabled).toBe(false);
    expect(backend.setTrailerSettings).toHaveBeenCalledTimes(1);

    first.resolve(undefined);
    await flush();
    expect(backend.setTrailerSettings).toHaveBeenCalledTimes(2);
    second.resolve(undefined);
    await flush();

    expect(backend.setTrailerSettings.mock.calls.map(([value]) => (value as any).audioEnabled)).toEqual([true, false]);
    expect(controller.settings.audioEnabled).toBe(false);
    expect(controller.settingsBusy).toBe(false);
    expect(runtime.update).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it("skips a retired mount's queued settings write after a replacement saves newer state", async () => {
    const firstWrite = deferred<unknown>();
    const persistedAudioValues: boolean[] = [];
    let writeCount = 0;
    backend.setTrailerSettings.mockImplementation(async (value: unknown) => {
      const audioEnabled = (value as { audioEnabled: boolean }).audioEnabled;
      writeCount += 1;
      if (writeCount === 1) await firstWrite.promise;
      persistedAudioValues.push(audioEnabled);
      return value;
    });

    const retired = mountController({ enabled: true, audioEnabled: false, quality: "auto" }, "retired");
    retired.handleAudioChange({ detail: { ownerId: "retired", settingsRevision: 0, audioEnabled: true } });
    await flush();
    retired.handleAudioChange({ detail: {
      ownerId: "retired", settingsRevision: retired.settingsRevision, audioEnabled: false,
    } });
    await flush();
    expect(backend.setTrailerSettings).toHaveBeenCalledTimes(1);

    retired.stop();
    const current = mountController({ enabled: true, audioEnabled: false, quality: "auto" }, "current");
    await current.setAudioEnabled(true);
    expect(persistedAudioValues).toEqual([true]);

    firstWrite.resolve(undefined);
    await retired.settingsSaveQueue;

    expect(backend.setTrailerSettings).toHaveBeenCalledTimes(2);
    expect(persistedAudioValues).toEqual([true, true]);
    current.stop();
  });
});
