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

  it("hides and shows one game from its menu and seeds saved times at start", async () => {
    const { controller, seed } = setup({ enabled: true });
    controller.mount();
    await flush();
    expect(seed).toHaveBeenCalledWith({});
    await controller.toggleHidden(620);
    expect(controller.getSnapshot().settings.hiddenAppIds).toEqual([620]);
    await controller.toggleHidden(620);
    expect(controller.getSnapshot().settings.hiddenAppIds).toEqual([]);
  });
});
