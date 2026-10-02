import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  getTrailerSettings: vi.fn(),
  setTrailerSettings: vi.fn(),
  evalInBigPicture: vi.fn(),
  findIgnTrailer: vi.fn(),
}));
vi.mock("../backend", () => backend);
vi.mock("../steam/core", () => ({
  currentRoutePath: () => "/routes/library/home",
  getNativeOverview: () => null,
  isNativeNonSteamShortcut: () => false,
  metadataCache: {},
  metadataState: { metadataLoaded: true },
  metadataMatchRevisionSnapshot: () => 0,
  subscribeMetadataMatchChanges: () => () => undefined,
}));
vi.mock("../steam/metadataPatch", () => ({ ensureMetadataCache: async () => undefined }));

import { PluginConflictMonitor } from "../pluginConflicts";
import { DEFAULT_TRAILER_SETTINGS, TrailerController } from "./controller";
import type { TrailerSettings } from "../types";

const controllers: TrailerController[] = [];
const monitors: PluginConflictMonitor[] = [];
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
};

const fixture = (enabled: boolean) => {
  const inventory = { plugins: enabled ? [{ name: "TrailerHero" }] : [], disabledPlugins: [] };
  const eventBus = new EventTarget();
  const monitor = new PluginConflictMonitor(() => ({ deckyState: { publicState: () => inventory, eventBus } }));
  monitors.push(monitor);
  monitor.mount();
  const controller = new TrailerController(monitor);
  controllers.push(controller);
  return {
    controller,
    setConflict(value: boolean) {
      inventory.plugins = value ? [{ name: "TrailerHero" }] : [];
      eventBus.dispatchEvent(new Event("update"));
    },
  };
};

beforeEach(() => {
  backend.getTrailerSettings.mockReset().mockResolvedValue(DEFAULT_TRAILER_SETTINGS);
  backend.setTrailerSettings.mockReset().mockImplementation(async (settings: TrailerSettings) => settings);
  backend.evalInBigPicture.mockReset().mockResolvedValue({ runtimeMissing: true, status: "Steam UI unavailable" });
  backend.findIgnTrailer.mockReset().mockResolvedValue(null);
  vi.stubGlobal("window", {
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(), setTimeout, clearTimeout,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { documentElement: {}, defaultView: window });
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
  for (const monitor of monitors.splice(0)) monitor.stop();
  vi.unstubAllGlobals();
});

describe("trailer provider conflicts", () => {
  it("keeps a saved enabled preference paused and resumes it without a settings write", async () => {
    const persisted = { ...DEFAULT_TRAILER_SETTINGS, enabled: true, hideLogoDuringTrailer: true, quality: 1080 as const };
    backend.getTrailerSettings.mockResolvedValue(persisted);
    const { controller, setConflict } = fixture(true);
    controller.mount();
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, effectiveEnabled: false });
    expect(backend.findIgnTrailer).not.toHaveBeenCalled();

    setConflict(false);
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, effectiveEnabled: true });
    setConflict(true);
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, effectiveEnabled: false });
    expect(backend.setTrailerSettings).not.toHaveBeenCalled();
  });

  it("rejects a new enable request while blocked, but lets a paused saved preference be turned off", async () => {
    const blocked = fixture(true);
    blocked.controller.mount();
    await flush();
    expect(await blocked.controller.setEnabled(true)).toBe(false);
    expect(backend.setTrailerSettings).not.toHaveBeenCalled();
    blocked.controller.stop();

    backend.getTrailerSettings.mockResolvedValue({ ...DEFAULT_TRAILER_SETTINGS, enabled: true });
    const paused = fixture(true);
    paused.controller.mount();
    await flush();
    expect(await paused.controller.setEnabled(false)).toBe(true);
    paused.setConflict(false);
    await flush();
    expect(paused.controller.getSnapshot()).toMatchObject({ settings: { enabled: false }, effectiveEnabled: false });
  });

  it("does not let a settings load that finishes after detection start a conflicting runtime", async () => {
    const load = deferred<TrailerSettings>();
    backend.getTrailerSettings.mockReturnValue(load.promise);
    const { controller, setConflict } = fixture(false);
    controller.mount();
    setConflict(true);
    load.resolve({ ...DEFAULT_TRAILER_SETTINGS, enabled: true });
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true }, effectiveEnabled: false });
    expect(backend.evalInBigPicture).not.toHaveBeenCalled();
  });

  it("does not resume a pending enable save when the other provider appears before it finishes", async () => {
    const save = deferred<TrailerSettings>();
    backend.setTrailerSettings.mockReturnValue(save.promise);
    const { controller, setConflict } = fixture(false);
    controller.mount();
    await flush();
    const pending = controller.setEnabled(true);
    setConflict(true);
    save.resolve({ ...DEFAULT_TRAILER_SETTINGS, enabled: true });
    expect(await pending).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true }, busy: false, effectiveEnabled: false });
    setConflict(false);
    await flush();
    expect(controller.getSnapshot().effectiveEnabled).toBe(true);
    expect(backend.setTrailerSettings).toHaveBeenCalledTimes(1);
  });
});
