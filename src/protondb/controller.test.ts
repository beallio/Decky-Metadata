import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ fetchNoCors: vi.fn() }));
vi.mock("@decky/ui", () => ({ afterPatch: vi.fn(), findInReactTree: vi.fn() }));

const backend = vi.hoisted(() => ({
  getProtonDbBadgeSettings: vi.fn(),
  setProtonDbBadgeSettings: vi.fn(),
}));
vi.mock("../backend", () => backend);

import {
  DEFAULT_PROTON_DB_BADGE_SETTINGS,
  ProtonDbBadgeController,
  type ProtonDbBadgeSettingsStore,
} from "./controller";
import { ProtonDbRatingCache } from "./ratings";
import type { ProtonDbBadgeSettings } from "../types";

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
const newController = (store: ProtonDbBadgeSettingsStore) => {
  const controller = new ProtonDbBadgeController(store, new ProtonDbRatingCache(async () => null));
  controllers.push(controller);
  return controller;
};

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
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
    expect(controller.getSnapshot()).toEqual({
      settings: persisted,
      settingsLoaded: true,
      busy: false,
      settingsError: "disk full",
    });
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
    expect(controller.getSnapshot()).toEqual({
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
      visible = snapshot.settingsLoaded && snapshot.settings.enabled;
    });
    controller.mount();
    await flushMicrotasks();
    expect(visible).toBe(true);
    controller.stop();
    expect(visible).toBe(false);
  });

});
