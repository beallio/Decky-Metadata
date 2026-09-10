import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  hookIndex: 0,
  hooks: [] as any[],
  effects: [] as Array<() => void | (() => void)>,
}));

const backend = vi.hoisted(() => ({
  clearMetadataCache: vi.fn(),
  getDebugLogging: vi.fn(),
  getDelistedIndexStatus: vi.fn(),
  getMissingMetadataCount: vi.fn(),
  getPluginLogs: vi.fn(),
  getPluginVersion: vi.fn(),
  getScanProgress: vi.fn(),
  getSystemVersions: vi.fn(),
  getUpdateSettings: vi.fn(),
  refreshDelistedIndex: vi.fn(),
  setAutomaticUpdateChecks: vi.fn(),
  setCompatibilityDefault: vi.fn(),
  setCompatibilityDefaultScope: vi.fn(),
  setDebugLogging: vi.fn(),
  setUpdateChannel: vi.fn(),
  startScanMissing: vi.fn(),
}));

const steam = vi.hoisted(() => ({
  metadataCache: {} as Record<string, unknown>,
  refreshMetadataCache: vi.fn(),
  getConnectedControllerTypes: vi.fn(),
  ensureCompatibilityDefault: vi.fn(),
  setConfirmedCompatibilityDefault: vi.fn(),
  setConfirmedCompatibilityDefaultScope: vi.fn(),
  compatibilityDefaultSnapshot: vi.fn(),
  compatibilityDefaultScopeSnapshot: vi.fn(),
  compatibilityDefaultLoadedSnapshot: vi.fn(),
  compatibilityLifecycleSnapshot: vi.fn(),
  isCompatibilityLifecycleCurrent: vi.fn(),
  subscribeCompatibilityRevision: vi.fn(),
}));

const games = vi.hoisted(() => ({ loadGames: vi.fn() }));
const ui = vi.hoisted(() => ({ getGamepadNavigationTrees: vi.fn(), showModal: vi.fn() }));
vi.mock("react", () => ({
  useCallback: (callback: any) => callback,
  useEffect: (callback: () => void | (() => void)) => {
    harness.effects.push(callback);
  },
  useRef: (initial: any) => {
    const index = harness.hookIndex++;
    const owner = harness.hooks;
    if (owner.length <= index) owner[index] = { current: initial };
    return owner[index];
  },
  useState: (initial: any) => {
    const index = harness.hookIndex++;
    const owner = harness.hooks;
    if (owner.length <= index) owner[index] = initial;
    return [
      owner[index],
      (value: any) => {
        owner[index] = typeof value === "function" ? value(owner[index]) : value;
      },
    ];
  },
}));

vi.mock("@decky/ui", () => ({
  Focusable: "Focusable",
  NavEntryPositionPreferences: { PREFERRED_CHILD: "preferred" },
  getGamepadNavigationTrees: ui.getGamepadNavigationTrees,
  showModal: ui.showModal,
}));
vi.mock("./backend", () => backend);
vi.mock("./components/qam/DelistedIndexSection", () => ({
  DelistedIndexSection: "DelistedIndexSection",
}));
vi.mock("./components/qam/LogsSection", () => ({ LogsSection: "LogsSection" }));
vi.mock("./components/qam/MetadataSection", () => ({
  MetadataSection: "MetadataSection",
}));
vi.mock("./components/qam/PluginLogModal", () => ({
  PluginLogModal: "PluginLogModal",
}));
vi.mock("./components/qam/PluginUpdateSection", () => ({
  PluginUpdateSection: "PluginUpdateSection",
}));
vi.mock("./components/qam/VersionsSection", () => ({
  VersionsSection: "VersionsSection",
}));
vi.mock("./log", () => ({
  info: vi.fn(),
  setVerboseLogging: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("./steam", () => steam);
vi.mock("./styles", () => ({ qamPanelStyle: {} }));
vi.mock("./toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("./useNonSteamGames", () => ({
  useNonSteamGames: () => ({ games: [], loadGames: games.loadGames }),
}));

import { Content } from "./ContentPanel";
import {
  clearCompatibilityDropdownReturn,
  clearCompatibilityPolicySave,
  compatibilityDropdownReturnOrigin,
} from "./qamCompatibilityFocus";

const render = () => {
  harness.hookIndex = 0;
  harness.effects.length = 0;
  return Content();
};

const remount = () => {
  harness.hookIndex = 0;
  harness.hooks = [];
  harness.effects = [];
  return Content();
};

const importReloadedContent = async () => {
  vi.resetModules();
  const { Content: ReloadedContent } = await import("./ContentPanel");
  return () => {
    harness.hookIndex = 0;
    harness.hooks = [];
    harness.effects = [];
    return ReloadedContent();
  };
};

const children = (node: any): any[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  return [node, ...children(node.props?.children)];
};

const updateSection = (tree: any) =>
  children(tree).find((node) => node.type === "PluginUpdateSection");

const versionsSection = (tree: any) =>
  children(tree).find((node) => node.type === "VersionsSection");

const metadataSection = (tree: any) =>
  children(tree).find((node) => node.type === "MetadataSection");

const runEffects = () => {
  for (const effect of [...harness.effects]) effect();
};

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const makeFocusControls = () => {
  const frames: Array<(time: number) => void> = [];
  const qamDocument = {
    visibilityState: "visible",
    activeElement: null as unknown,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const makeButton = () => ({
    className: "",
    disabled: false,
    isConnected: true,
    ownerDocument: qamDocument,
  });
  const categoryButton = makeButton();
  const scopeButton = makeButton();
  const control = (button: typeof categoryButton) => ({
    ownerDocument: qamDocument,
    querySelector: vi.fn(() => button),
  });
  const categoryA = control(categoryButton);
  const scopeA = control(scopeButton);
  const categoryB = control(categoryButton);
  const scopeB = control(scopeButton);
  ui.getGamepadNavigationTrees.mockReturnValue([{
    Root: {
      m_rgChildren: [
        {
          Element: categoryButton,
          BTakeFocus: () => {
            categoryButton.className = "gpfocus";
            return true;
          },
        },
        {
          Element: scopeButton,
          BTakeFocus: () => {
            scopeButton.className = "gpfocus";
            return true;
          },
        },
      ],
    },
  }]);
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: (time: number) => void) => {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame: vi.fn(),
  });
  return {
    categoryA,
    scopeA,
    categoryB,
    scopeB,
    categoryButton,
    scopeButton,
    flushFrames: () => {
      for (let attempt = 0; attempt < 200 && frames.length; attempt += 1) {
        frames.shift()?.(attempt);
      }
    },
  };
};

const remountReturnedDropdown = async (origin: "category" | "scope") => {
  const controls = makeFocusControls();
  render();
  runEffects();
  await flushPromises();
  const first = metadataSection(render());
  first.props.onCompatibilityDefaultControlRef(controls.categoryA);
  first.props.onCompatibilityDefaultScopeControlRef(controls.scopeA);
  render();
  first.props.onCompatibilityDefaultMenuWillOpen(origin);
  if (origin === "category") {
    first.props.onCompatibilityDefaultControlRef(null);
  } else {
    first.props.onCompatibilityDefaultScopeControlRef(null);
  }

  remount();
  const returned = metadataSection(render());
  returned.props.onCompatibilityDefaultControlRef(controls.categoryB);
  returned.props.onCompatibilityDefaultScopeControlRef(controls.scopeB);
  render();
  runEffects();
  await flushPromises();
  return { controls, first, returned: () => metadataSection(render()) };
};

describe("Content update settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    harness.hookIndex = 0;
    harness.hooks = [];
    harness.effects = [];
    games.loadGames.mockResolvedValue([]);
    steam.refreshMetadataCache.mockResolvedValue(undefined);
    steam.ensureCompatibilityDefault.mockResolvedValue(null);
    steam.setConfirmedCompatibilityDefault.mockImplementation((value: unknown) => value);
    steam.setConfirmedCompatibilityDefaultScope.mockImplementation((value: unknown) => value);
    steam.compatibilityDefaultSnapshot.mockReturnValue(null);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("all");
    steam.compatibilityDefaultLoadedSnapshot.mockReturnValue(false);
    steam.compatibilityLifecycleSnapshot.mockReturnValue(1);
    steam.isCompatibilityLifecycleCurrent.mockReturnValue(true);
    steam.subscribeCompatibilityRevision.mockReturnValue(() => undefined);
    backend.getDebugLogging.mockResolvedValue(false);
    backend.getDelistedIndexStatus.mockResolvedValue({ count: 0, fetched_at: 0 });
    backend.getMissingMetadataCount.mockResolvedValue(0);
    backend.getPluginVersion.mockResolvedValue("0.3.1");
    backend.getSystemVersions.mockResolvedValue({ decky: "", steamos: "" });
    backend.getUpdateSettings.mockResolvedValue({
      update_channel: "stable",
      automatic_update_checks: true,
    });
  });

  afterEach(() => {
    clearCompatibilityDropdownReturn();
    clearCompatibilityPolicySave();
    vi.unstubAllGlobals();
  });

  it("falls back to defaults and marks settings loaded after a failed envelope", async () => {
    backend.getUpdateSettings.mockResolvedValue({ status: "failed" });
    steam.getConnectedControllerTypes.mockReturnValue([4, 102]);
    render();
    runEffects();
    await flushPromises();

    const section = updateSection(render());
    expect(section.props.updateChannel).toBe("stable");
    expect(section.props.automaticUpdateChecks).toBe(true);
    expect(section.props.settingsLoaded).toBe(true);
    expect(versionsSection(render()).props.controllerTypes).toEqual([4, 102]);
  });

  it("rolls both optimistic toggles back after failed or skipped saves", async () => {
    backend.getUpdateSettings.mockResolvedValue({
      update_channel: "development",
      automatic_update_checks: false,
    });
    backend.setUpdateChannel.mockResolvedValue({ status: "failed", message: "no" });
    backend.setAutomaticUpdateChecks.mockResolvedValue({ status: "skipped" });

    render();
    runEffects();
    await flushPromises();

    const section = updateSection(render());
    section.props.onToggleUpdateChannel(false);
    section.props.onToggleAutomaticUpdateChecks(true);
    await flushPromises();

    const rolledBack = updateSection(render());
    expect(rolledBack.props.updateChannel).toBe("development");
    expect(rolledBack.props.automaticUpdateChecks).toBe(false);
  });

  it("keeps the global compatibility default disabled until it loads, then applies only a confirmed save", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultSnapshot.mockReturnValue(3);
    steam.setConfirmedCompatibilityDefault.mockImplementation((value: 0 | 1 | 2 | 3 | null) => {
      steam.compatibilityDefaultSnapshot.mockReturnValue(value);
      return value;
    });
    backend.setCompatibilityDefault.mockResolvedValue(2);
    render();
    runEffects();
    await flushPromises();

    const loaded = metadataSection(render());
    expect(loaded.props.compatibilityDefault).toBe(3);
    expect(loaded.props.compatibilityDefaultLoaded).toBe(true);
    loaded.props.onCompatibilityDefaultChange(2);
    await flushPromises();

    expect(backend.setCompatibilityDefault).toHaveBeenCalledWith(2);
    expect(steam.setConfirmedCompatibilityDefault).toHaveBeenCalledWith(2, 1);
    expect(metadataSection(render()).props.compatibilityDefault).toBe(2);
  });

  it("keeps the confirmed global compatibility default after a failed save", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultSnapshot.mockReturnValue(3);
    backend.setCompatibilityDefault.mockRejectedValue(new Error("disk unavailable"));
    render();
    runEffects();
    await flushPromises();

    metadataSection(render()).props.onCompatibilityDefaultChange(2);
    await flushPromises();

    const afterFailure = metadataSection(render());
    expect(afterFailure.props.compatibilityDefault).toBe(3);
    expect(afterFailure.props.compatibilityDefaultError).toContain("disk unavailable");
    expect(steam.setConfirmedCompatibilityDefault).not.toHaveBeenCalled();
  });

  it("does not apply a late save acknowledgement after the shared plugin lifecycle ends", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    let resolveSave!: (value: 0 | 1 | 2 | 3 | null) => void;
    backend.setCompatibilityDefault.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    render();
    runEffects();
    await flushPromises();

    metadataSection(render()).props.onCompatibilityDefaultChange(2);
    steam.isCompatibilityLifecycleCurrent.mockReturnValue(false);
    resolveSave(2);
    await flushPromises();

    expect(steam.setConfirmedCompatibilityDefault).not.toHaveBeenCalled();
    expect(metadataSection(render()).props.compatibilityDefault).toBe(3);
  });

  it("recovers the mounted QAM when bootstrap later confirms the shared setting", async () => {
    steam.ensureCompatibilityDefault.mockRejectedValue(new Error("initial load failed"));
    let notify!: () => void;
    steam.subscribeCompatibilityRevision.mockImplementation((listener: () => void) => {
      notify = listener;
      return () => undefined;
    });
    render();
    runEffects();
    await flushPromises();
    expect(metadataSection(render()).props.compatibilityDefaultLoaded).toBe(false);
    expect(metadataSection(render()).props.compatibilityDefaultError).toContain("initial load failed");

    steam.compatibilityDefaultSnapshot.mockReturnValue(2);
    steam.compatibilityDefaultLoadedSnapshot.mockReturnValue(true);
    notify();

    const recovered = metadataSection(render());
    expect(recovered.props.compatibilityDefault).toBe(2);
    expect(recovered.props.compatibilityDefaultLoaded).toBe(true);
    expect(recovered.props.compatibilityDefaultError).toBe("");
  });

  it("publishes only a backend-confirmed compatibility scope", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("all");
    steam.setConfirmedCompatibilityDefaultScope.mockImplementation((value: "steam" | "no-steam" | "metadata" | "all") => {
      steam.compatibilityDefaultScopeSnapshot.mockReturnValue(value);
      return value;
    });
    backend.setCompatibilityDefaultScope.mockResolvedValue("steam");
    render();
    runEffects();
    await flushPromises();

    const loaded = metadataSection(render());
    expect(loaded.props.compatibilityDefaultScope).toBe("all");
    loaded.props.onCompatibilityDefaultScopeChange("steam");
    await flushPromises();

    expect(backend.setCompatibilityDefaultScope).toHaveBeenCalledWith("steam");
    expect(steam.setConfirmedCompatibilityDefaultScope).toHaveBeenCalledWith("steam", 1);
    expect(metadataSection(render()).props.compatibilityDefaultScope).toBe("steam");
  });

  it("restores the previous scope and reports the failure after a failed scope save", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("metadata");
    backend.setCompatibilityDefaultScope.mockRejectedValue(new Error("disk unavailable"));
    render();
    runEffects();
    await flushPromises();

    metadataSection(render()).props.onCompatibilityDefaultScopeChange("all");
    await flushPromises();

    const afterFailure = metadataSection(render());
    expect(afterFailure.props.compatibilityDefaultScope).toBe("metadata");
    expect(afterFailure.props.compatibilityDefaultError).toContain("disk unavailable");
    expect(steam.setConfirmedCompatibilityDefaultScope).not.toHaveBeenCalled();
  });

  it("blocks overlapping policy saves until the scope request finishes", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultSnapshot.mockReturnValue(3);
    steam.setConfirmedCompatibilityDefault.mockImplementation((value: 0 | 1 | 2 | 3 | null) => {
      steam.compatibilityDefaultSnapshot.mockReturnValue(value);
      return value;
    });
    steam.setConfirmedCompatibilityDefaultScope.mockImplementation((value: "steam" | "no-steam" | "metadata" | "all") => {
      steam.compatibilityDefaultScopeSnapshot.mockReturnValue(value);
      return value;
    });
    let finishScope!: (value: "steam" | "no-steam" | "metadata" | "all") => void;
    backend.setCompatibilityDefaultScope.mockReturnValue(new Promise<"steam" | "no-steam" | "metadata" | "all">((resolve) => {
      finishScope = resolve;
    }));
    render();
    runEffects();
    await flushPromises();

    const loaded = metadataSection(render());
    loaded.props.onCompatibilityDefaultScopeChange("steam");
    // Controller activation can arrive again before React has rendered busy.
    loaded.props.onCompatibilityDefaultScopeChange("all");
    metadataSection(render()).props.onCompatibilityDefaultChange(null);
    expect(backend.setCompatibilityDefaultScope).toHaveBeenCalledTimes(1);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    finishScope("steam");
    await flushPromises();
    const saved = metadataSection(render());
    expect(saved.props.compatibilityDefaultScope).toBe("steam");
    expect(saved.props.compatibilityDefault).toBe(3);
    expect(saved.props.compatibilityDefaultScopeBusy).toBe(false);

    backend.setCompatibilityDefault.mockResolvedValue(null);
    saved.props.onCompatibilityDefaultChange(null);
    await flushPromises();
    expect(metadataSection(render()).props.compatibilityDefault).toBeNull();
    expect(metadataSection(render()).props.compatibilityDefaultScope).toBe("steam");
  });

  it("keeps a deferred scope save busy and visible after the QAM remounts", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("all");
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);
    steam.setConfirmedCompatibilityDefaultScope.mockImplementation((value: unknown) => {
      steam.compatibilityDefaultScopeSnapshot.mockReturnValue(value);
      return value;
    });

    const { controls, first, returned } = await remountReturnedDropdown("scope");
    first.props.onCompatibilityDefaultScopeChange("steam");

    const pending = returned();
    expect(pending.props.compatibilityDefaultScopeBusy).toBe(true);
    expect(pending.props.compatibilityDefaultScope).toBe("steam");
    pending.props.onCompatibilityDefaultChange(2);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    save.resolve("steam");
    await flushPromises();
    render();
    runEffects();
    controls.flushFrames();
    const settled = returned();
    expect(settled.props.compatibilityDefaultScopeBusy).toBe(false);
    expect(settled.props.compatibilityDefaultScope).toBe("steam");
    expect(controls.scopeButton.className).toContain("gpfocus");
    expect(controls.categoryButton.className).not.toContain("gpfocus");
  });

  it("restores a remounted QAM after its deferred scope save fails", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("all");
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);

    const { controls, first, returned } = await remountReturnedDropdown("scope");
    first.props.onCompatibilityDefaultScopeChange("steam");
    expect(returned().props.compatibilityDefaultScopeBusy).toBe(true);

    save.reject(new Error("disk unavailable"));
    await flushPromises();
    render();
    runEffects();
    controls.flushFrames();
    const failed = returned();
    expect(failed.props.compatibilityDefaultScopeBusy).toBe(false);
    expect(failed.props.compatibilityDefaultScope).toBe("all");
    expect(failed.props.compatibilityDefaultError).toContain("disk unavailable");
    expect(controls.scopeButton.className).toContain("gpfocus");
  });

  it("returns native focus to the category dropdown after its popup is cancelled", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    const { controls } = await remountReturnedDropdown("category");
    render();
    runEffects();
    controls.flushFrames();
    expect(controls.categoryButton.className).toContain("gpfocus");
    expect(controls.scopeButton.className).not.toContain("gpfocus");
  });

  it("does not allow a second policy save while a remounted QAM is busy", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("all");
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);

    const { first, returned } = await remountReturnedDropdown("scope");
    first.props.onCompatibilityDefaultScopeChange("steam");
    const returnedSection = returned();
    expect(returnedSection.props.compatibilityDefaultScopeBusy).toBe(true);
    returnedSection.props.onCompatibilityDefaultChange(2);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();
  });

  it("shares a settled policy transaction across reloaded QAM bundles without overriding Automatic", async () => {
    let confirmedCategory: 0 | 1 | 2 | 3 | null = 3;
    let confirmedScope: "steam" | "no-steam" | "metadata" | "all" = "all";
    const revisionListeners = new Set<() => void>();
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    steam.compatibilityDefaultSnapshot.mockImplementation(() => confirmedCategory);
    steam.compatibilityDefaultScopeSnapshot.mockImplementation(() => confirmedScope);
    steam.compatibilityDefaultLoadedSnapshot.mockReturnValue(true);
    steam.ensureCompatibilityDefault.mockImplementation(async () => confirmedCategory);
    steam.subscribeCompatibilityRevision.mockImplementation((listener: () => void) => {
      revisionListeners.add(listener);
      return () => revisionListeners.delete(listener);
    });
    steam.setConfirmedCompatibilityDefault.mockImplementation((value: 0 | 1 | 2 | 3 | null) => {
      confirmedCategory = value;
      return value;
    });
    steam.setConfirmedCompatibilityDefaultScope.mockImplementation((value: typeof confirmedScope) => {
      confirmedScope = value;
      return value;
    });
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);

    render();
    runEffects();
    await flushPromises();
    const first = metadataSection(render());
    first.props.onCompatibilityDefaultMenuWillOpen("scope");
    first.props.onCompatibilityDefaultScopeChange("metadata");

    const renderReloaded = await importReloadedContent();
    const reloadedFocus = await import("./qamCompatibilityFocus");
    expect(reloadedFocus.compatibilityDropdownReturnOrigin()).toBe("scope");
    renderReloaded();
    runEffects();
    await flushPromises();
    const pending = metadataSection(renderReloaded());
    expect(pending.props.compatibilityDefaultScopeBusy).toBe(true);
    pending.props.onCompatibilityDefaultChange(2);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    save.resolve("metadata");
    await flushPromises();
    renderReloaded();
    runEffects();
    const settled = metadataSection(renderReloaded());
    expect(settled.props.compatibilityDefault).toBe(3);
    expect(settled.props.compatibilityDefaultScope).toBe("metadata");
    expect(settled.props.compatibilityDefaultScopeBusy).toBe(false);

    confirmedCategory = null;
    revisionListeners.forEach((listener) => listener());
    const automatic = metadataSection(renderReloaded());
    expect(automatic.props.compatibilityDefault).toBeNull();
    expect(automatic.props.compatibilityDefaultScope).toBe("metadata");
    expect(automatic.props.compatibilityDefaultScopeBusy).toBe(false);
    expect(automatic.props.compatibilityDefault).toBeNull();
  });

  it("reports a retained bundle's failed policy save in the returned QAM", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    const save = deferred<"steam" | "no-steam" | "metadata" | "all">();
    backend.setCompatibilityDefaultScope.mockReturnValue(save.promise);

    render();
    runEffects();
    await flushPromises();
    metadataSection(render()).props.onCompatibilityDefaultScopeChange("steam");

    const renderReloaded = await importReloadedContent();
    renderReloaded();
    runEffects();
    await flushPromises();
    expect(metadataSection(renderReloaded()).props.compatibilityDefaultScopeBusy).toBe(true);

    save.reject(new Error("disk unavailable"));
    await flushPromises();
    renderReloaded();
    runEffects();
    const failed = metadataSection(renderReloaded());
    expect(failed.props.compatibilityDefaultScopeBusy).toBe(false);
    expect(failed.props.compatibilityDefaultScope).toBe("all");
    expect(failed.props.compatibilityDefaultError).toContain("disk unavailable");
  });

  it("records the dropdown that must receive focus after its popup closes", async () => {
    render();
    runEffects();
    await flushPromises();

    const section = metadataSection(render());
    section.props.onCompatibilityDefaultMenuWillOpen("category");
    expect(compatibilityDropdownReturnOrigin()).toBe("category");
    section.props.onCompatibilityDefaultMenuWillOpen("scope");
    expect(compatibilityDropdownReturnOrigin()).toBe("scope");
  });


});
