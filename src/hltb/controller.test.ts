import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../backend", () => ({
  getHltbSettings: vi.fn(), setHltbSettings: vi.fn(), clearHltbCache: vi.fn(), getHltbStats: vi.fn(),
  getProviderCache: vi.fn(),
}));

import { PluginConflictMonitor } from "../pluginConflicts";
import { HltbController } from "./controller";
import { DEFAULT_HLTB_SETTINGS, type HltbSettings } from "./settings";
import { HltbStore } from "./store";

const flush = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
const monitors: PluginConflictMonitor[] = [];
afterEach(() => { for (const monitor of monitors.splice(0)) monitor.stop(); });

const setup = (saved: Partial<HltbSettings>, conflict = false) => {
  const inventory = { plugins: conflict ? [{ name: "HLTB for Deck" }] : [], disabledPlugins: [] as { name: string }[] };
  const events = new EventTarget();
  const monitor = new PluginConflictMonitor(() => ({ deckyState: { publicState: () => inventory, eventBus: events } }));
  monitors.push(monitor);
  monitor.mount();
  const dispose = vi.fn();
  const install = vi.fn(() => dispose);
  let stored: HltbSettings = { ...DEFAULT_HLTB_SETTINGS, ...saved };
  const settings = {
    get: vi.fn(async () => stored),
    set: vi.fn(async (next: HltbSettings) => (stored = next)),
    clear: vi.fn(async () => ({ ok: true })),
  };
  const store = new HltbStore(vi.fn());
  const seed = vi.spyOn(store, "seed");
  const cache = { version: 1 as const, protondb: { ratings: {}, name_ids: {} }, hltb: { entries: {} } };
  const controller = new HltbController({ install }, store, monitor, async () => cache, settings);
  const setConflict = (value: boolean) => {
    inventory.plugins = value ? [{ name: "HLTB for Deck" }] : [];
    events.dispatchEvent(new Event("update"));
  };
  return { controller, install, dispose, settings, seed, setConflict };
};

describe("HltbController", () => {
  it("installs the game-page patch only while enabled and without a conflict", async () => {
    const { controller, install, dispose, setConflict } = setup({ enabled: false });
    controller.mount();
    await flush();
    expect(install).not.toHaveBeenCalled();
    expect(await controller.setSettings({ ...controller.getSnapshot().settings, enabled: true })).toBe(true);
    expect(install).toHaveBeenCalledTimes(1);
    setConflict(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().effectiveEnabled).toBe(false);
    setConflict(false);
    expect(install).toHaveBeenCalledTimes(2);
    controller.stop();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("will not turn on while HLTB for Deck is enabled", async () => {
    const { controller, install, settings } = setup({ enabled: false }, true);
    controller.mount();
    await flush();
    expect(await controller.setSettings({ ...controller.getSnapshot().settings, enabled: true })).toBe(false);
    expect(settings.set).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it("seeds saved times at start", async () => {
    const { controller, seed } = setup({ enabled: true });
    controller.mount();
    await flush();
    expect(seed).toHaveBeenCalledWith({});
  });

  it("keeps both changes when a toggle is pressed during a save", async () => {
    const { controller, settings } = setup({ enabled: true, store: true });
    controller.mount();
    await flush();

    const firstSave = deferred<HltbSettings>();
    settings.set.mockReturnValueOnce(firstSave.promise);
    const first = controller.setSettings({ ...controller.getSnapshot().settings, store: false });
    const second = controller.setSettings({ ...controller.getSnapshot().settings, showMain: false });

    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, store: false, showMain: false }, busy: true });
    expect(settings.set).toHaveBeenCalledTimes(1);
    expect(settings.set).toHaveBeenNthCalledWith(1, expect.objectContaining({ store: false, showMain: true }));

    firstSave.resolve({ ...DEFAULT_HLTB_SETTINGS, enabled: true, store: false });
    await flush();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(settings.set).toHaveBeenCalledTimes(2);
    expect(settings.set).toHaveBeenNthCalledWith(2, expect.objectContaining({ store: false, showMain: false }));
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, store: false, showMain: false }, busy: false });
  });

  it("saves at most two changes when three are pressed in a row", async () => {
    const { controller, settings } = setup({ enabled: true });
    controller.mount();
    await flush();

    const firstSave = deferred<HltbSettings>();
    settings.set.mockReturnValueOnce(firstSave.promise);
    const changes = [
      controller.setSettings({ ...controller.getSnapshot().settings, store: false }),
      controller.setSettings({ ...controller.getSnapshot().settings, style: "clean" }),
      controller.setSettings({ ...controller.getSnapshot().settings, hideViewDetails: true }),
    ];
    expect(controller.getSnapshot()).toMatchObject({ settings: { store: false, style: "clean", hideViewDetails: true }, busy: true });

    firstSave.resolve({ ...DEFAULT_HLTB_SETTINGS, enabled: true, store: false });
    await flush();
    expect(await Promise.all(changes)).toEqual([true, true, true]);
    expect(settings.set).toHaveBeenCalledTimes(2);
    expect(settings.set).toHaveBeenLastCalledWith(expect.objectContaining({ store: false, style: "clean", hideViewDetails: true }));
    expect(controller.getSnapshot()).toMatchObject({ settings: { store: false, style: "clean", hideViewDetails: true }, busy: false });
  });

  it("restores the saved settings and drops the queued change when a save fails", async () => {
    const { controller, settings } = setup({ enabled: true, store: true });
    controller.mount();
    await flush();

    const firstSave = deferred<HltbSettings>();
    settings.set.mockReturnValueOnce(firstSave.promise);
    const first = controller.setSettings({ ...controller.getSnapshot().settings, store: false });
    const queued = controller.setSettings({ ...controller.getSnapshot().settings, showMain: false });
    expect(controller.getSnapshot()).toMatchObject({ settings: { store: false, showMain: false }, busy: true });

    firstSave.reject(new Error("disk full"));
    await flush();
    expect(await first).toBe(false);
    expect(await queued).toBe(false);
    expect(settings.set).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, store: true, showMain: true }, busy: false });
    expect(controller.getSnapshot().settingsError).not.toBe("");
  });

  it("reports whether Clear HLTB cache worked", async () => {
    const { controller, settings } = setup({ enabled: true });
    controller.mount();
    await flush();
    const clearing = controller.clearCache();
    expect(controller.getSnapshot().cacheStatus).toBe("clearing");
    expect(await clearing).toBe(true);
    expect(controller.getSnapshot().cacheStatus).toBe("cleared");
    settings.clear.mockRejectedValueOnce(new Error("disk full"));
    expect(await controller.clearCache()).toBe(false);
    expect(controller.getSnapshot().cacheStatus).toBe("failed");
  });
});
