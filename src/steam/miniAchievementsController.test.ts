import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  getMiniAchievementsEnabled: vi.fn<() => Promise<boolean>>(),
  setMiniAchievementsEnabled: vi.fn<(enabled: boolean) => Promise<boolean>>(),
}));
vi.mock("../backend", () => backend);
vi.mock("../log", () => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("./miniAchievements", () => ({ installMiniAchievementsPatch: () => () => undefined }));

import { MiniAchievementsController } from "./miniAchievementsController";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); };

let controller: MiniAchievementsController;
beforeEach(() => {
  backend.getMiniAchievementsEnabled.mockReset().mockResolvedValue(false);
  backend.setMiniAchievementsEnabled.mockReset().mockImplementation(async enabled => enabled);
  controller = new MiniAchievementsController();
});
afterEach(() => controller.stop());

describe("mini-achievements saved state", () => {
  it("keeps the toggle unavailable until the saved preference has loaded", async () => {
    const load = deferred<boolean>();
    backend.getMiniAchievementsEnabled.mockReturnValue(load.promise);
    controller.mount();
    expect(controller.getSnapshot()).toMatchObject({ enabled: false, settingsLoaded: false, busy: false });
    expect(await controller.setEnabled(true)).toBe(false);
    load.resolve(true);
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ enabled: true, settingsLoaded: true, busy: false });
  });

  it("does not report an enable as confirmed while its save is pending", async () => {
    controller.mount();
    await flush();
    const save = deferred<boolean>();
    backend.setMiniAchievementsEnabled.mockReturnValue(save.promise);
    const enabling = controller.setEnabled(true);
    expect(controller.getSnapshot()).toMatchObject({ enabled: false, busy: true });
    expect(await controller.setEnabled(false)).toBe(false);
    save.resolve(true);
    expect(await enabling).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ enabled: true, busy: false, settingsError: "" });
  });

  it("retains the confirmed enabled preference after a failed disable and permits another attempt", async () => {
    backend.getMiniAchievementsEnabled.mockResolvedValue(true);
    controller.mount();
    await flush();
    backend.setMiniAchievementsEnabled.mockRejectedValueOnce(new Error("disk unavailable"));
    expect(await controller.setEnabled(false)).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ enabled: true, busy: false, settingsLoaded: true });
    expect(controller.getSnapshot().settingsError).toContain("disk unavailable");
    expect(await controller.setEnabled(false)).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ enabled: false, busy: false, settingsError: "" });
  });

  it("does not let a prior mount's delayed load override the current saved preference", async () => {
    const oldLoad = deferred<boolean>();
    backend.getMiniAchievementsEnabled.mockReturnValueOnce(oldLoad.promise);
    controller.mount();
    controller.stop();
    controller.mount();
    await flush();
    oldLoad.resolve(true);
    await flush();
    expect(controller.getSnapshot()).toEqual({ enabled: false, settingsLoaded: true, busy: false, settingsError: "" });
  });

  it("ignores a save completion after unload and a new mount", async () => {
    controller.mount();
    await flush();
    const oldSave = deferred<boolean>();
    backend.setMiniAchievementsEnabled.mockReturnValue(oldSave.promise);
    const enabling = controller.setEnabled(true);
    controller.stop();
    controller.mount();
    await flush();
    oldSave.resolve(true);
    expect(await enabling).toBe(false);
    expect(controller.getSnapshot()).toEqual({ enabled: false, settingsLoaded: true, busy: false, settingsError: "" });
  });

  it("keeps an unavailable preference disabled rather than claiming a saved default", async () => {
    backend.getMiniAchievementsEnabled.mockRejectedValue(new Error("settings unavailable"));
    controller.mount();
    await flush();
    expect(controller.getSnapshot()).toMatchObject({ enabled: false, settingsLoaded: false, busy: false });
    expect(controller.getSnapshot().settingsError).toContain("settings unavailable");
    expect(await controller.setEnabled(true)).toBe(false);
  });
});
