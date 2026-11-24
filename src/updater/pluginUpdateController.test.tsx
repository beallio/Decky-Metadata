import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginUpdateCandidate,
  UpdateChannel,
  UpdateCheckContext,
  UpdateCheckResult,
  UpdateSettings,
  UpdateRpcResult,
} from "../types";
import {
  PluginUpdateControllerStore,
  type PluginUpdateControllerDeps,
} from "./pluginUpdateController";

vi.mock("@decky/api", () => ({ toaster: { toast: vi.fn() } }));
vi.mock("../i18n", () => ({
  t: (key: string) => key,
  translateBackendError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));
vi.mock("../backend", () => ({
  checkForPluginUpdate: vi.fn(),
  clearPendingUpdateInstall: vi.fn(),
  confirmUpdateInstallHandoff: vi.fn(),
  frontendLog: vi.fn(() => Promise.resolve(true)),
  getPluginVersion: vi.fn(),
  getUpdateCheckContext: vi.fn(),
  getUpdateSettings: vi.fn(),
  recordUpdateInstallRequested: vi.fn(),
  revalidatePluginUpdate: vi.fn(),
  setAutomaticUpdateChecks: vi.fn(),
  setUpdateChannel: vi.fn(),
}));
vi.mock("./deckyInstaller", () => ({
  invokeDeckyInstaller: vi.fn(),
  INSTALL_TYPE_UPDATE: 2,
  INSTALL_TYPE_DOWNGRADE: 3,
}));

const candidate = (
  channel: UpdateChannel = "stable",
  action: PluginUpdateCandidate["action"] = "update"
): PluginUpdateCandidate => ({
  version: "0.4.0",
  tag: "v0.4.0",
  channel,
  artifact_url: "zip",
  sha256: "a".repeat(64),
  release_url: "release",
  published_at: "now",
  action,
});

const context = (channel: UpdateChannel = "stable"): UpdateCheckContext => ({
  update_channel: channel,
  automatic_update_checks: true,
  installed_version: "0.3.1",
  effective_installed_version: "0.3.1",
  last_checked_at: null,
  last_checked_channel: null,
  last_available_tag: null,
  last_notified_tag: null,
  installed_release_tag: null,
  installed_release_published_at: null,
  pending_update_install: null,
  rate_limited_until: null,
});

const flushPromises = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createDeps = (
  overrides: Partial<PluginUpdateControllerDeps> = {}
): PluginUpdateControllerDeps => ({
  getPluginVersion: vi.fn(async () => "0.3.1"),
  getUpdateSettings: vi.fn(async (): Promise<UpdateRpcResult<UpdateSettings>> => ({
    update_channel: "stable",
    automatic_update_checks: true,
  })),
  getUpdateCheckContext: vi.fn(async (): Promise<UpdateRpcResult<UpdateCheckContext>> => ({
    status: "failed",
  })),
  checkForPluginUpdate: vi.fn(async (): Promise<UpdateCheckResult> => ({
    status: "current",
    checked_at: "now",
    channel: "stable",
  })),
  setUpdateChannel: vi.fn(async (channel: UpdateChannel): Promise<UpdateRpcResult<UpdateSettings>> => ({
    update_channel: channel,
    automatic_update_checks: true,
  })),
  setAutomaticUpdateChecks: vi.fn(async (enabled: boolean): Promise<UpdateRpcResult<UpdateSettings>> => ({
    update_channel: "stable",
    automatic_update_checks: enabled,
  })),
  clearPendingUpdateInstall: vi.fn(async (): Promise<UpdateRpcResult<UpdateCheckContext>> => ({
    status: "failed",
  })),
  confirmUpdateInstallHandoff: vi.fn(async (): Promise<UpdateRpcResult<UpdateCheckContext>> => context()),
  recordUpdateInstallRequested: vi.fn(async (): Promise<UpdateRpcResult<UpdateCheckContext>> => context()),
  revalidatePluginUpdate: vi.fn(async (value: PluginUpdateCandidate): Promise<UpdateRpcResult<PluginUpdateCandidate>> => value),
  invokeDeckyInstaller: vi.fn(async () => undefined),
  toast: vi.fn(),
  toastError: vi.fn(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
  ...overrides,
});

const createController = (overrides: Partial<PluginUpdateControllerDeps> = {}) => {
  const deps = createDeps(overrides);
  return { deps, controller: new PluginUpdateControllerStore(deps) };
};

describe("plugin update controller", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("shares one automatic check and one in-flight check between subscribers", async () => {
    const request = deferred<UpdateCheckResult>();
    const { deps, controller } = createController({
      checkForPluginUpdate: vi.fn(() => request.promise),
    });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = controller.subscribe(first);
    const unsubscribeSecond = controller.subscribe(second);
    await flushPromises();

    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().isChecking).toBe(true);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();

    request.resolve({ status: "current", checked_at: "now", channel: "stable" });
    await flushPromises();
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("keeps install state when all subscribers leave and a subscriber returns", async () => {
    const revalidation = deferred<UpdateRpcResult<PluginUpdateCandidate>>();
    const { controller } = createController({
      getUpdateSettings: vi.fn(async (): Promise<UpdateRpcResult<UpdateSettings>> => ({
        update_channel: "stable",
        automatic_update_checks: false,
      })),
      revalidatePluginUpdate: vi.fn(() => revalidation.promise),
    });
    const unsubscribe = controller.subscribe(() => undefined);
    await flushPromises();

    const install = controller.install(candidate());
    expect(controller.getSnapshot().isInstalling).toBe(true);
    unsubscribe();
    const unsubscribeAgain = controller.subscribe(() => undefined);
    expect(controller.getSnapshot().isInstalling).toBe(true);

    revalidation.resolve(candidate());
    await install;
    expect(controller.getSnapshot().pluginVersion).toBe("0.4.0");
    controller.dispose();
    unsubscribeAgain();
  });

  it("ignores a stale channel check and accepts the next manual check", async () => {
    const staleCheck = deferred<UpdateCheckResult>();
    const forcedResult: UpdateCheckResult = {
      status: "current",
      checked_at: "forced",
      channel: "development",
    };
    const manualResult: UpdateCheckResult = {
      status: "available",
      checked_at: "manual",
      channel: "development",
      candidate: candidate("development"),
    };
    let callCount = 0;
    const checkForPluginUpdate = vi.fn((_version: string, force: boolean) => {
      callCount += 1;
      if (!force) return staleCheck.promise;
      return Promise.resolve(callCount === 2 ? forcedResult : manualResult);
    });
    const { deps, controller } = createController({ checkForPluginUpdate });
    controller.subscribe(() => undefined);
    await flushPromises();
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(1);

    await controller.setUpdateChannel(true);
    await flushPromises();
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.checkForPluginUpdate).mock.calls[1][1]).toBe(true);

    staleCheck.resolve({
      status: "available",
      checked_at: "stale",
      channel: "stable",
      candidate: candidate(),
    });
    await flushPromises();
    expect(controller.getSnapshot().candidate).toBeNull();
    expect(controller.getSnapshot().checkResult?.checked_at).toBe("forced");

    await controller.checkNow();
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().candidate?.channel).toBe("development");
  });

  it("disposes pending requests without publishing state or leaving a timer", async () => {
    vi.useFakeTimers();
    const request = deferred<UpdateCheckResult>();
    const { controller } = createController({
      checkForPluginUpdate: vi.fn(() => request.promise),
    });
    controller.subscribe(() => undefined);
    await flushPromises();
    const beforeDispose = controller.getSnapshot();
    expect(vi.getTimerCount()).toBe(1);

    controller.dispose();
    request.resolve({ status: "current", checked_at: "late", channel: "stable" });
    await flushPromises();

    expect(controller.getSnapshot()).toBe(beforeDispose);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rolls back failed optimistic setting saves", async () => {
    const { controller } = createController({
      getUpdateSettings: vi.fn(async (): Promise<UpdateRpcResult<UpdateSettings>> => ({
        update_channel: "development",
        automatic_update_checks: false,
      })),
      setUpdateChannel: vi.fn(async (): Promise<UpdateRpcResult<UpdateSettings>> => ({
        status: "failed",
        message: "no",
      })),
      setAutomaticUpdateChecks: vi.fn(async (): Promise<UpdateRpcResult<UpdateSettings>> => ({
        status: "skipped",
      })),
    });
    controller.subscribe(() => undefined);
    await flushPromises();

    await controller.setUpdateChannel(false);
    await controller.setAutomaticUpdateChecks(true);
    expect(controller.getSnapshot().updateChannel).toBe("development");
    expect(controller.getSnapshot().automaticUpdateChecks).toBe(false);
  });

  it("records and confirms an install, then publishes the installed version", async () => {
    const update = candidate();
    const { deps, controller } = createController();
    controller.subscribe(() => undefined);
    await flushPromises();

    await controller.install(update);
    expect(deps.recordUpdateInstallRequested).toHaveBeenCalled();
    expect(deps.invokeDeckyInstaller).toHaveBeenCalledWith(
      "zip",
      "0.4.0",
      "a".repeat(64),
      2,
      expect.any(String)
    );
    expect(deps.confirmUpdateInstallHandoff).toHaveBeenCalledWith("0.4.0");
    expect(controller.getSnapshot().pluginVersion).toBe("0.4.0");
  });
  it("waits for first subscription and settings before its automatic check", async () => {
    const settings = deferred<UpdateRpcResult<UpdateSettings>>();
    const { deps, controller } = createController({
      getUpdateSettings: vi.fn(() => settings.promise),
    });
    expect(deps.getPluginVersion).not.toHaveBeenCalled();
    controller.subscribe(() => undefined);
    await flushPromises();
    expect(deps.checkForPluginUpdate).not.toHaveBeenCalled();

    settings.resolve({ update_channel: "stable", automatic_update_checks: true });
    await flushPromises();
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps manual checks available after automatic checks are turned off", async () => {
    const { deps, controller } = createController();
    controller.subscribe(() => undefined);
    await flushPromises();
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(1);

    await controller.setAutomaticUpdateChecks(false);
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(1);
    await controller.checkNow();
    expect(deps.checkForPluginUpdate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.checkForPluginUpdate).mock.calls[1][1]).toBe(true);
  });

  it("shows the handoff-pending state after three seconds", async () => {
    vi.useFakeTimers();
    const installer = deferred<unknown>();
    const { controller } = createController({
      invokeDeckyInstaller: vi.fn(() => installer.promise),
    });
    controller.subscribe(() => undefined);
    await flushPromises();

    const install = controller.install(candidate());
    await vi.advanceTimersByTimeAsync(3000);
    await install;
    expect(controller.getSnapshot().isHandoffPending).toBe(true);
    controller.dispose();
    installer.resolve(undefined);
    await flushPromises();
  });

  it("clears pending install state and reports installer failure", async () => {
    const { deps, controller } = createController({
      invokeDeckyInstaller: vi.fn(async () => {
        throw new Error("installer failed");
      }),
    });
    controller.subscribe(() => undefined);
    await flushPromises();

    await controller.install(candidate());
    expect(deps.clearPendingUpdateInstall).toHaveBeenCalledWith("0.4.0");
    expect(deps.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "updater.installation.failedTitle",
        body: "installer failed",
      })
    );
    expect(controller.getSnapshot().errorMessage).toBe("installer failed");
  });

  it.each([
    ["update", 2],
    ["downgrade_to_stable", 3],
  ] as const)("uses Decky install type %s for %s", async (action, expected) => {
    const update = candidate("stable", action);
    const { deps, controller } = createController();
    controller.subscribe(() => undefined);
    await flushPromises();

    await controller.install(update);
    expect(deps.invokeDeckyInstaller).toHaveBeenCalledWith(
      "zip",
      "0.4.0",
      "a".repeat(64),
      expected,
      expect.any(String)
    );
  });
});
