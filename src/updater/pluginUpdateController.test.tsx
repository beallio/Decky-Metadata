import { beforeEach, describe, expect, it, vi } from "vitest";

let hookIndex = 0;
let hooks: any[] = [];
let setters: any[] = [];
const effects: Array<() => void | (() => void)> = [];

vi.mock("react", () => ({
  useReducer: (reducer: any, initial: any) => {
    const index = hookIndex++;
    if (hooks.length <= index) {
      hooks[index] = initial;
      setters[index] = (action: any) => {
        hooks[index] = reducer(hooks[index], action);
      };
    }
    return [hooks[index], setters[index]];
  },
  useRef: (initial: any) => {
    const index = hookIndex++;
    if (hooks.length <= index) hooks[index] = { current: initial };
    return hooks[index];
  },
  useCallback: (callback: any, deps: any[]) => {
    const index = hookIndex++;
    const previous = hooks[index];
    const changed = !previous || deps.some((dep, i) => dep !== previous.deps[i]);
    if (changed) hooks[index] = { callback, deps };
    return hooks[index].callback;
  },
  useEffect: (callback: any) => {
    effects.push(callback);
  },
}));

vi.mock("@decky/api", () => ({ toaster: { toast: vi.fn() } }));
vi.mock("../backend", () => ({
  checkForPluginUpdate: vi.fn(),
  clearPendingUpdateInstall: vi.fn(),
  confirmUpdateInstallHandoff: vi.fn(),
  frontendLog: vi.fn(() => Promise.resolve(true)),
  getUpdateCheckContext: vi.fn(),
  recordUpdateInstallRequested: vi.fn(),
  revalidatePluginUpdate: vi.fn(),
}));
vi.mock("./deckyInstaller", () => ({
  invokeDeckyInstaller: vi.fn(),
  INSTALL_TYPE_UPDATE: 2,
  INSTALL_TYPE_DOWNGRADE: 3,
}));

import { toaster } from "@decky/api";
import * as backend from "../backend";
import * as installer from "./deckyInstaller";
import { usePluginUpdateController } from "./pluginUpdateController";

const candidate = (action: "update" | "downgrade_to_stable" = "update") => ({
  version: "0.4.0",
  tag: "v0.4.0",
  channel: "stable" as const,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action,
});

function render(updateChannel: "stable" | "development" = "stable", settingsLoaded = true) {
  hookIndex = 0;
  effects.length = 0;
  return usePluginUpdateController({
    currentVersion: "0.3.1",
    updateChannel,
    automaticUpdateChecks: true,
    settingsLoaded,
  });
}

describe("plugin update controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    hookIndex = 0;
    hooks = [];
    setters = [];
    effects.length = 0;
    vi.mocked(backend.getUpdateCheckContext).mockResolvedValue({ status: "failed" });
    vi.mocked(backend.clearPendingUpdateInstall).mockResolvedValue({ status: "failed" });
    vi.mocked(backend.confirmUpdateInstallHandoff).mockResolvedValue({} as any);
    vi.mocked(backend.recordUpdateInstallRequested).mockResolvedValue({} as any);
  });

  it("checks, records, installs, and confirms a happy-path update", async () => {
    const update = candidate();
    vi.mocked(backend.checkForPluginUpdate).mockResolvedValue({
      status: "available",
      checked_at: "now",
      channel: "stable",
      candidate: update,
    });
    vi.mocked(backend.revalidatePluginUpdate).mockResolvedValue(update);
    vi.mocked(installer.invokeDeckyInstaller).mockResolvedValue(undefined);
    const controller = render();
    await controller.checkNow();
    await controller.install(update);
    expect(backend.recordUpdateInstallRequested).toHaveBeenCalled();
    expect(installer.invokeDeckyInstaller).toHaveBeenCalledWith(
      "zip",
      "0.4.0",
      "a".repeat(64),
      2,
      expect.any(String)
    );
    expect(backend.confirmUpdateInstallHandoff).toHaveBeenCalledWith("0.4.0");
  });

  it("enters handoff pending when Decky has not resolved after three seconds", async () => {
    vi.useFakeTimers();
    const update = candidate();
    vi.mocked(backend.revalidatePluginUpdate).mockResolvedValue(update);
    vi.mocked(installer.invokeDeckyInstaller).mockReturnValue(new Promise(() => {}));
    const installPromise = render().install(update);
    await vi.advanceTimersByTimeAsync(3000);
    await installPromise;
    expect(render().isHandoffPending).toBe(true);
  });

  it("rolls back pending state and surfaces an installer rejection", async () => {
    const update = candidate();
    vi.mocked(backend.revalidatePluginUpdate).mockResolvedValue(update);
    vi.mocked(installer.invokeDeckyInstaller).mockRejectedValue(new Error("installer failed"));
    vi.mocked(backend.clearPendingUpdateInstall).mockResolvedValue({} as any);
    await render().install(update);
    expect(backend.clearPendingUpdateInstall).toHaveBeenCalledWith("0.4.0");
    expect(toaster.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Installation Failed", body: "installer failed" })
    );
    expect(render().errorMessage).toBe("installer failed");
  });

  it.each([
    ["update", 2],
    ["downgrade_to_stable", 3],
  ] as const)("uses the correct Decky install type for %s", async (action, expected) => {
    const update = candidate(action);
    vi.mocked(backend.revalidatePluginUpdate).mockResolvedValue(update);
    vi.mocked(installer.invokeDeckyInstaller).mockResolvedValue(undefined);
    await render().install(update);
    expect(installer.invokeDeckyInstaller).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expected,
      expect.anything()
    );
  });

  it("does not automatically check when the version arrives before settings", async () => {
    render("stable", false);
    for (const effect of effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.checkForPluginUpdate).not.toHaveBeenCalled();
  });

  it("discards a result when the channel changes during the check", async () => {
    let resolveCheck: (value: any) => void = () => {};
    vi.mocked(backend.checkForPluginUpdate).mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    const check = render("stable").checkNow();
    render("development");
    for (const effect of effects) effect();
    resolveCheck({
      status: "available",
      checked_at: "now",
      channel: "stable",
      candidate: candidate(),
    });
    await check;
    expect(render("development").candidate).toBeNull();
  });
});
