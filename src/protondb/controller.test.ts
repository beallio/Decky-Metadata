import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ fetchNoCors: vi.fn() }));
vi.mock("@decky/ui", () => ({ afterPatch: vi.fn(), findInReactTree: vi.fn() }));

const backend = vi.hoisted(() => ({
  getProtonDbBadgeSettings: vi.fn(),
  setProtonDbBadgeSettings: vi.fn(),
  getProviderCache: vi.fn(async () => ({ version: 1, protondb: { ratings: {}, name_ids: {} }, hltb: { entries: {} } })),
  putProtonDbCache: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../backend", () => backend);

import {
  DEFAULT_PROTON_DB_BADGE_SETTINGS,
  ProtonDbBadgeController,
  type ProtonDbBadgeSettingsStore,
} from "./controller";
import { ProtonDbRatingCache } from "./ratings";
import type { ProtonDbBadgeSettings } from "../types";
import { PluginConflictMonitor, type PluginConflictSource } from "../pluginConflicts";

const settings = (changes: Partial<ProtonDbBadgeSettings> = {}): ProtonDbBadgeSettings => ({
  ...DEFAULT_PROTON_DB_BADGE_SETTINGS,
  ...changes,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const controllers: ProtonDbBadgeController[] = [];
const newController = (
  store: ProtonDbBadgeSettingsStore,
  conflicts?: PluginConflictSource,
  ratings = new ProtonDbRatingCache(async () => null),
) => {
  const controller = new ProtonDbBadgeController(store, ratings, conflicts);
  controllers.push(controller);
  return controller;
};

const conflictMonitors: PluginConflictMonitor[] = [];
const conflictFixture = (enabled: boolean) => {
  const inventory = { plugins: enabled ? [{ name: "ProtonDB Badges" }] : [], disabledPlugins: [] };
  const eventBus = new EventTarget();
  const monitor = new PluginConflictMonitor(() => ({ deckyState: { publicState: () => inventory, eventBus } }));
  conflictMonitors.push(monitor);
  monitor.mount();
  return {
    monitor,
    setEnabled(value: boolean) {
      inventory.plugins = value ? [{ name: "ProtonDB Badges" }] : [];
      eventBus.dispatchEvent(new Event("update"));
    },
  };
};

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
  for (const monitor of conflictMonitors.splice(0)) monitor.stop();
});

describe("ProtonDbBadgeController", () => {
  it("keeps controls unavailable and exposes the saved-settings load error", async () => {
    const store = {
      get: vi.fn().mockRejectedValue(new Error("settings store unavailable")),
      set: vi.fn(),
    } as unknown as ProtonDbBadgeSettingsStore;
    const controller = newController(store);

    controller.mount();
    expect(controller.getSnapshot()).toMatchObject({ busy: true, settingsLoaded: false });
    await flushMicrotasks();

    expect(controller.getSnapshot()).toMatchObject({
      settingsLoaded: false,
      busy: false,
      settingsError: "settings store unavailable",
    });
    expect(await controller.setSettings(settings({ enabled: true }))).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("retains the persisted settings after a save fails", async () => {
    const persisted = settings({ enabled: true, focusOnly: true, coverPosition: "top-right" });
    const store = {
      get: vi.fn().mockResolvedValue(persisted),
      set: vi.fn().mockRejectedValue(new Error("disk full")),
    } as unknown as ProtonDbBadgeSettingsStore;
    const controller = newController(store);
    controller.mount();
    await flushMicrotasks();

    const saved = await controller.setSettings(settings({ enabled: false, focusOnly: false }));

    expect(saved).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      settings: persisted,
      settingsLoaded: true,
      busy: false,
      settingsError: "disk full",
    });
  });

  it("keeps a change made during a save and persists both", async () => {
    const firstSave = deferred<ProtonDbBadgeSettings>();
    const set = vi.fn(async (value: ProtonDbBadgeSettings) => value);
    set.mockReturnValueOnce(firstSave.promise);
    const controller = newController({ get: async () => settings(), set });
    controller.mount();
    await flushMicrotasks();

    const first = controller.setSettings(settings({ enabled: true, home: false }));
    const second = controller.setSettings({ ...controller.getSnapshot().settings, library: false });

    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, home: false, library: false }, busy: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenNthCalledWith(1, settings({ enabled: true, home: false }));

    firstSave.resolve(settings({ enabled: true, home: false }));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(2, settings({ enabled: true, home: false, library: false }));
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, home: false, library: false }, busy: false });
  });

  it("collapses three quick changes into at most two saves", async () => {
    const firstSave = deferred<ProtonDbBadgeSettings>();
    const set = vi.fn(async (value: ProtonDbBadgeSettings) => value);
    set.mockReturnValueOnce(firstSave.promise);
    const controller = newController({ get: async () => settings(), set });
    controller.mount();
    await flushMicrotasks();

    const changes = [
      controller.setSettings(settings({ enabled: true })),
      controller.setSettings({ ...controller.getSnapshot().settings, home: false }),
      controller.setSettings({ ...controller.getSnapshot().settings, library: false }),
    ];
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, home: false, library: false }, busy: true });

    firstSave.resolve(settings({ enabled: true }));
    expect(await Promise.all(changes)).toEqual([true, true, true]);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenLastCalledWith(settings({ enabled: true, home: false, library: false }));
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true, home: false, library: false }, busy: false });
  });

  it("restores the saved settings and drops the queued change when a save fails", async () => {
    const persisted = settings({ enabled: true, home: true });
    const firstSave = deferred<ProtonDbBadgeSettings>();
    const set = vi.fn(async (value: ProtonDbBadgeSettings) => value);
    set.mockReturnValueOnce(firstSave.promise);
    const controller = newController({ get: async () => persisted, set });
    controller.mount();
    await flushMicrotasks();

    const first = controller.setSettings(settings({ enabled: true, home: false }));
    const queued = controller.setSettings({ ...controller.getSnapshot().settings, library: false });
    expect(controller.getSnapshot()).toMatchObject({ settings: { home: false, library: false }, busy: true });

    firstSave.reject(new Error("disk full"));
    await flushMicrotasks();
    expect(await first).toBe(false);
    expect(await queued).toBe(false);
    expect(set).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, busy: false, settingsError: "disk full" });
  });

  it("ignores an older settings load that completes after a later mount", async () => {
    const firstLoad = deferred<ProtonDbBadgeSettings>();
    const newerSettings = settings({ enabled: true, store: false });
    const store: ProtonDbBadgeSettingsStore = {
      get: vi.fn()
        .mockReturnValueOnce(firstLoad.promise)
        .mockResolvedValueOnce(newerSettings),
      set: vi.fn(),
    };
    const controller = newController(store);

    controller.mount();
    controller.stop();
    controller.mount();
    await flushMicrotasks();
    expect(controller.getSnapshot().settings).toEqual(newerSettings);

    firstLoad.resolve(settings({ enabled: false, home: false }));
    await flushMicrotasks();
    expect(controller.getSnapshot()).toMatchObject({
      settings: newerSettings,
      settingsLoaded: true,
      busy: false,
      settingsError: "",
    });
  });

  it("removes enabled display state from mounted consumers when the plugin stops", async () => {
    const store: ProtonDbBadgeSettingsStore = {
      get: async () => settings({ enabled: true }),
      set: async value => value,
    };
    const controller = newController(store);
    let visible = false;
    controller.subscribe(() => {
      const snapshot = controller.getSnapshot();
      visible = snapshot.effectiveEnabled;
    });
    controller.mount();
    await flushMicrotasks();
    expect(visible).toBe(true);
    controller.stop();
    expect(visible).toBe(false);
  });

  it("preserves a saved enabled preference while blocking ratings until the other provider is disabled", async () => {
    const conflict = conflictFixture(true);
    const persisted = settings({ enabled: true, coverPosition: "top-right" });
    const store: ProtonDbBadgeSettingsStore = { get: async () => persisted, set: vi.fn(async value => value) };
    const fetchTier = vi.fn(async () => "gold" as const);
    const controller = newController(store, conflict.monitor, new ProtonDbRatingCache(fetchTier));
    controller.mount();
    await flushMicrotasks();
    const unsubscribe = controller.subscribeRating(570, () => undefined);
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, effectiveEnabled: false });
    expect(fetchTier).not.toHaveBeenCalled();

    conflict.setEnabled(false);
    await flushMicrotasks();
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, effectiveEnabled: true });
    expect(controller.getRating(570).tier).toBe("gold");
    expect(store.set).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("suspends an active provider without changing settings and prevents new requests", async () => {
    const conflict = conflictFixture(false);
    const persisted = settings({ enabled: true });
    const store: ProtonDbBadgeSettingsStore = { get: async () => persisted, set: vi.fn(async value => value) };
    const fetchTier = vi.fn(async () => "silver" as const);
    const controller = newController(store, conflict.monitor, new ProtonDbRatingCache(fetchTier));
    controller.mount();
    await flushMicrotasks();
    controller.subscribeRating(570, () => undefined);
    await flushMicrotasks();
    expect(controller.getRating(570).tier).toBe("silver");

    conflict.setEnabled(true);
    controller.subscribeRating(571, () => undefined);
    await flushMicrotasks();
    expect(controller.getSnapshot()).toMatchObject({ settings: persisted, effectiveEnabled: false });
    expect(fetchTier.mock.calls).toEqual([[570]]);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("rejects enabling during a conflict but allows the saved preference to be turned off", async () => {
    const conflict = conflictFixture(true);
    const store: ProtonDbBadgeSettingsStore = { get: async () => settings(), set: vi.fn(async value => value) };
    const controller = newController(store, conflict.monitor);
    controller.mount();
    await flushMicrotasks();
    expect(await controller.setSettings(settings({ enabled: true }))).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
    controller.stop();

    const savedOn: ProtonDbBadgeSettingsStore = {
      get: async () => settings({ enabled: true }),
      set: vi.fn(async value => value),
    };
    const paused = newController(savedOn, conflict.monitor);
    paused.mount();
    await flushMicrotasks();
    expect(await paused.setSettings(settings({ enabled: false }))).toBe(true);
    conflict.setEnabled(false);
    expect(paused.getSnapshot()).toMatchObject({ settings: { enabled: false }, effectiveEnabled: false });
  });

  it("does not let a pending settings load bypass a newly detected conflict", async () => {
    const conflict = conflictFixture(false);
    const load = deferred<ProtonDbBadgeSettings>();
    const store: ProtonDbBadgeSettingsStore = { get: () => load.promise, set: async value => value };
    const controller = newController(store, conflict.monitor);
    controller.mount();
    conflict.setEnabled(true);
    load.resolve(settings({ enabled: true }));
    await flushMicrotasks();
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true }, effectiveEnabled: false });
    conflict.setEnabled(false);
    expect(controller.getSnapshot().effectiveEnabled).toBe(true);
  });

  it("keeps a pending enable save paused when the competing provider appears before confirmation", async () => {
    const conflict = conflictFixture(false);
    const save = deferred<ProtonDbBadgeSettings>();
    const store: ProtonDbBadgeSettingsStore = { get: async () => settings(), set: () => save.promise };
    const controller = newController(store, conflict.monitor);
    controller.mount();
    await flushMicrotasks();
    const pending = controller.setSettings(settings({ enabled: true }));
    conflict.setEnabled(true);
    save.resolve(settings({ enabled: true }));
    expect(await pending).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ settings: { enabled: true }, effectiveEnabled: false });
    conflict.setEnabled(false);
    expect(controller.getSnapshot().effectiveEnabled).toBe(true);
  });

});
