import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  afterPatch: vi.fn(),
  findInReactTree: vi.fn(),
}));

import {
  classifyShortcutNameState,
  nativeShortcutName,
  setShortcutNameAndWait,
} from "./shortcutNames";

const APP_ID = 2312439508;

const shortcut = (display_name = "Original™") => ({
  appid: APP_ID,
  app_type: 1073741824,
  display_name,
  BIsShortcut: () => true,
});

const installNativeStore = (overview: any, setShortcutName?: (appId: number, name: string) => void) => {
  (globalThis as any).appStore = { allApps: [overview] };
  (globalThis as any).SteamClient = { Apps: { SetShortcutName: setShortcutName } };
};

describe("shortcut name Steam boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installNativeStore(shortcut());
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).appStore;
    delete (globalThis as any).SteamClient;
  });

  it("reads the native name verbatim except edge whitespace", () => {
    installNativeStore(shortcut("  Name™  "));
    expect(nativeShortcutName(APP_ID)).toBe("Name™");
  });

  it.each([
    [null, "Original", "Steam", "unmanaged"],
    [{ original_name: "Original", applied_name: "Steam", steam_appid: 1, updated_at: 1 }, "Steam", "Steam", "managed"],
    [{ original_name: "Original", applied_name: "Steam", steam_appid: 1, updated_at: 1 }, "Original", "Steam", "restored"],
    [{ original_name: "Original", applied_name: "Steam", steam_appid: 1, updated_at: 1 }, "Changed elsewhere", "Steam", "diverged"],
  ])("classifies saved state fail-closed", (state, current, _target, expected) => {
    expect(classifyShortcutNameState(current as string, state as any)).toBe(expected);
  });

  it("rejects official apps, missing APIs, races, and empty targets without a native write", async () => {
    const setShortcutName = vi.fn();
    installNativeStore({ appid: APP_ID, display_name: "Official" }, setShortcutName);
    await expect(setShortcutNameAndWait(APP_ID, "Official", "Steam")).rejects.toThrow("native shortcut");
    installNativeStore(shortcut("Current"), undefined);
    await expect(setShortcutNameAndWait(APP_ID, "Current", "Steam")).rejects.toThrow("unavailable");
    installNativeStore(shortcut("Changed"), setShortcutName);
    await expect(setShortcutNameAndWait(APP_ID, "Current", "Steam")).rejects.toThrow("changed");
    await expect(setShortcutNameAndWait(APP_ID, "Changed", " ")).rejects.toThrow("target");
    expect(setShortcutName).not.toHaveBeenCalled();
  });

  it("resolves only after Steam exposes the requested exact name and writes once", async () => {
    const overview = shortcut("Original™");
    const setShortcutName = vi.fn((_appId: number, name: string) => {
      setTimeout(() => {
        overview.display_name = name;
      }, 500);
    });
    installNativeStore(overview, setShortcutName);

    const pending = setShortcutNameAndWait(APP_ID, "Original™", "Steam™");
    await vi.advanceTimersByTimeAsync(600);
    await expect(pending).resolves.toBe("Steam™");
    expect(setShortcutName).toHaveBeenCalledTimes(1);
    expect(setShortcutName).toHaveBeenCalledWith(APP_ID, "Steam™");
  });

  it("times out when Steam never reports the requested name and never retries the write", async () => {
    const setShortcutName = vi.fn();
    installNativeStore(shortcut("Original"), setShortcutName);
    const pending = setShortcutNameAndWait(APP_ID, "Original", "Steam");
    const rejection = expect(pending).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(3_100);
    await rejection;
    expect(setShortcutName).toHaveBeenCalledTimes(1);
  });
});
