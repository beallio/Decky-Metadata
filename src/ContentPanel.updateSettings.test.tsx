import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrailerControllerSnapshot } from "./trailers/controller";
import type { ProtonDbBadgeSnapshot } from "./protondb/controller";

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
const ui = vi.hoisted(() => ({
  getFocusNavController: vi.fn(),
  getGamepadNavigationTrees: vi.fn(),
  showModal: vi.fn(),
}));
const trailer = vi.hoisted(() => ({
  subscribe: vi.fn(() => () => undefined),
  getSnapshot: vi.fn<() => TrailerControllerSnapshot>(() => ({
    settings: { enabled: false, audioEnabled: false, hideLogoDuringTrailer: false, quality: "auto", fadeInDelaySeconds: 3 },
    status: "Disabled",
    displayWidth: null,
    displayHeight: null,
    targetHeight: 720,
    settingsLoaded: false,
    busy: false,
    settingsError: "",
    matchRevision: 0,
    conflict: { pluginName: null, detectionAvailable: true },
    effectiveEnabled: false,
  })),
  setEnabled: vi.fn(),
  setAudioEnabled: vi.fn(),
  setHideLogoDuringTrailer: vi.fn(),
  setQuality: vi.fn(),
}));
const protonDb = vi.hoisted(() => ({
  getSnapshot: vi.fn<() => ProtonDbBadgeSnapshot>(),
  subscribe: vi.fn(),
  setSettings: vi.fn(),
}));
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
  getFocusNavController: ui.getFocusNavController,
  showModal: ui.showModal,
}));
vi.mock("./backend", () => backend);
vi.mock("./components/qam/CompatibilitySection", () => ({
  CompatibilitySection: "CompatibilitySection",
}));
vi.mock("./components/qam/GameTrailersSection", () => ({ GameTrailersSection: "GameTrailersSection" }));
vi.mock("./components/qam/LogsSection", () => ({ LogsSection: "LogsSection" }));
vi.mock("./components/qam/MiniAchievementsSection", () => ({ MiniAchievementsSection: "MiniAchievementsSection" }));
vi.mock("./components/qam/ProtonDbBadgesSection", () => ({ ProtonDbBadgesSection: "ProtonDbBadgesSection" }));
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
vi.mock("./trailers/controller", () => ({ trailerController: trailer }));
vi.mock("./steam/miniAchievementsController", () => ({
  miniAchievementsController: {
    getSnapshot: () => ({
      enabled: false, settingsLoaded: false, busy: false, settingsError: "",
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: false,
    }),
    subscribe: () => () => undefined,
    setEnabled: vi.fn(),
  },
}));
vi.mock("./protondb/controller", () => ({ protonDbBadgeController: protonDb }));
vi.mock("./styles", () => ({ qamPanelStyle: {} }));
vi.mock("./toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("./useNonSteamGames", () => ({
  useNonSteamGames: () => ({ games: [], loadGames: games.loadGames }),
}));

import { Content, takeCompatibilityDropdownFocus } from "./ContentPanel";
import {
  clearCompatibilityDropdownReturn,
  clearCompatibilityPolicySave,
  compatibilityDropdownReturnOrigin,
  hasCompatibilityDropdownReturn,
  isCompatibilityDropdownSelectionReturn,
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

const compatibilitySection = (tree: any) =>
  children(tree).find((node) => node.type === "CompatibilitySection");

const gameTrailersSection = (tree: any) =>
  children(tree).find((node) => node.type === "GameTrailersSection");

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
  let frameCount = 0;
  let nativeFocusAvailableAt = 0;
  const documentListeners = new Map<string, Set<(event: any) => void>>();
  const qamDocument: any = {
    visibilityState: "visible",
    activeElement: null as unknown,
    defaultView: null as unknown,
    addEventListener: vi.fn((name: string, listener: (event: any) => void) => {
      const listeners = documentListeners.get(name) ?? new Set();
      listeners.add(listener);
      documentListeners.set(name, listeners);
    }),
    removeEventListener: vi.fn((name: string, listener: (event: any) => void) => {
      documentListeners.get(name)?.delete(listener);
    }),
  };
  qamDocument.defaultView = { closed: false, document: qamDocument };
  const makeButton = () => ({
    className: "",
    disabled: false,
    isConnected: true,
    ownerDocument: qamDocument,
  });
  const categoryButton = makeButton();
  const scopeButton = makeButton();
  const qualityButton = makeButton();
  const protonDbButton = makeButton();
  const control = (button: typeof categoryButton) => ({
    ownerDocument: qamDocument,
    querySelector: vi.fn(() => button),
  });
  const categoryA = control(categoryButton);
  const scopeA = control(scopeButton);
  const categoryB = control(categoryButton);
  const scopeB = control(scopeButton);
  const qualityA = control(qualityButton);
  const qualityB = control(qualityButton);
  const protonDbA = control(protonDbButton);
  const protonDbB = control(protonDbButton);
  let navContextActive = true;
  const navigationTree = {
    Root: {
      m_rgChildren: [
        {
          Element: categoryButton,
          BTakeFocus: () => {
            categoryButton.className = "gpfocus";
            qamDocument.activeElement = categoryButton;
            return true;
          },
        },
        {
          Element: scopeButton,
          BTakeFocus: () => {
            scopeButton.className = "gpfocus";
            qamDocument.activeElement = scopeButton;
            return true;
          },
        },
        {
          Element: qualityButton,
          BTakeFocus: () => {
            if (!navContextActive) return true;
            qualityButton.className = "gpfocus";
            qamDocument.activeElement = qualityButton;
            return true;
          },
        },
        {
          Element: protonDbButton,
          BTakeFocus: () => {
            protonDbButton.className = "gpfocus";
            qamDocument.activeElement = protonDbButton;
            return true;
          },
        },
      ],
    },
  };
  const focusContext = { m_rgGamepadNavigationTrees: [navigationTree] };
  const focusNav = {
    m_ActiveContext: focusContext as typeof focusContext | null,
    m_LastActiveContext: focusContext,
    BCanActivateContext: vi.fn(() => true),
    FindAnActiveContext: vi.fn(() => {
      navContextActive = true;
      focusNav.m_ActiveContext = focusContext;
      return focusContext;
    }),
  };
  ui.getFocusNavController.mockReturnValue(focusNav);
  ui.getGamepadNavigationTrees.mockImplementation(() =>
    frameCount >= nativeFocusAvailableAt ? [navigationTree] : [],
  );
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: (time: number) => void) => {
      frames.push((time) => {
        frameCount += 1;
        callback(time);
      });
      return frames.length;
    },
    cancelAnimationFrame: vi.fn(),
  });
  return {
    categoryA,
    scopeA,
    categoryB,
    scopeB,
    qualityA,
    qualityB,
    categoryButton,
    scopeButton,
    qualityButton,
    protonDbButton,
    protonDbA,
    protonDbB,
    focusNav,
    loseNavContext: () => {
      navContextActive = false;
      focusNav.m_ActiveContext = null;
      qualityButton.className = "";
      qamDocument.activeElement = null;
    },
    delayNativeFocusUntil: (frame: number) => { nativeFocusAvailableAt = frame; },
    stealNativeFocusSilently: () => {
      qualityButton.className = "";
      qamDocument.activeElement = null;
    },
    dispatchKeyDown: (key: string) => {
      for (const listener of documentListeners.get("keydown") ?? []) listener({ key });
    },
    dispatchButtonDown: (button = 1) => {
      for (const listener of documentListeners.get("vgp_onbuttondown") ?? []) {
        listener({ type: "vgp_onbuttondown", detail: { button } });
      }
    },
    listenerCount: (name: string) => documentListeners.get(name)?.size ?? 0,
    advanceFrames: (count: number) => {
      for (let attempt = 0; attempt < count && frames.length; attempt += 1) {
        frames.shift()?.(attempt);
      }
    },
    flushFrames: () => {
      for (let attempt = 0; attempt < 200 && frames.length; attempt += 1) {
        frames.shift()?.(attempt);
        frameCount += 1;
      }
    },
  };
};

const remountReturnedDropdown = async (origin: "category" | "scope" | "quality") => {
  const controls = makeFocusControls();
  render();
  runEffects();
  await flushPromises();
  const first = compatibilitySection(render());
  const firstTrailers = gameTrailersSection(render());
  first.props.onCompatibilityDefaultControlRef(controls.categoryA);
  first.props.onCompatibilityDefaultScopeControlRef(controls.scopeA);
  render();
  if (origin === "quality") {
    firstTrailers.props.onQualityMenuWillOpen();
    firstTrailers.props.onQualityControlRef(controls.qualityA);
    firstTrailers.props.onQualityControlRef(null);
  } else {
    first.props.onCompatibilityDefaultMenuWillOpen(origin);
  }
  if (origin === "category") {
    first.props.onCompatibilityDefaultControlRef(null);
  } else if (origin === "scope") {
    first.props.onCompatibilityDefaultScopeControlRef(null);
  }

  remount();
  const returned = compatibilitySection(render());
  const returnedTrailers = gameTrailersSection(render());
  returned.props.onCompatibilityDefaultControlRef(controls.categoryB);
  returned.props.onCompatibilityDefaultScopeControlRef(controls.scopeB);
  if (origin === "quality") returnedTrailers.props.onQualityControlRef(controls.qualityB);
  render();
  runEffects();
  await flushPromises();
  return { controls, first, returned: () => compatibilitySection(render()) };
};

describe("Content update settings", () => {
  it("does not call Steam focus on a detached QAM document", () => {
    const controls = makeFocusControls();
    controls.qualityButton.ownerDocument.defaultView = null;

    expect(takeCompatibilityDropdownFocus(controls.qualityA as unknown as HTMLElement)).toBe(false);
    expect(controls.qualityButton.className).toBe("");
  });

  it("reactivates the Quick Access context before returning quality focus", () => {
    const controls = makeFocusControls();
    controls.loseNavContext();

    expect(takeCompatibilityDropdownFocus(controls.qualityA as unknown as HTMLElement)).toBe(true);
    expect(controls.focusNav.FindAnActiveContext).toHaveBeenCalledOnce();
    expect(controls.qualityButton.className).toContain("gpfocus");
  });

  beforeEach(() => {
    vi.resetAllMocks();
    harness.hookIndex = 0;
    harness.hooks = [];
    harness.effects = [];
    trailer.getSnapshot.mockReturnValue({
      settings: { enabled: false, audioEnabled: false, hideLogoDuringTrailer: false, quality: "auto", fadeInDelaySeconds: 3 },
      status: "Disabled", displayWidth: null, displayHeight: null, targetHeight: 720,
      settingsLoaded: true, busy: false, settingsError: "", matchRevision: 0,
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: false,
    });
    trailer.setQuality.mockResolvedValue(true);
    protonDb.getSnapshot.mockReturnValue({
      settings: {
        enabled: true, home: true, library: true, gameView: true, store: true,
        focusOnly: false, coverPosition: "bottom-left",
      },
      settingsLoaded: true, busy: false, settingsError: "",
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: true,
    });
    protonDb.subscribe.mockReturnValue(() => undefined);
    protonDb.setSettings.mockResolvedValue(true);
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

  it("picks up badge preferences that finish loading between panel render and subscription", () => {
    const ready = protonDb.getSnapshot();
    protonDb.getSnapshot.mockReturnValue({ ...ready, settingsLoaded: false, busy: true });
    render();
    protonDb.getSnapshot.mockReturnValue(ready);
    runEffects();
    const section = children(render()).find(node => node.type === "ProtonDbBadgesSection");
    expect(section.props.snapshot.settingsLoaded).toBe(true);
    expect(section.props.snapshot.busy).toBe(false);
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

    const loaded = compatibilitySection(render());
    expect(loaded.props.compatibilityDefault).toBe(3);
    expect(loaded.props.compatibilityDefaultLoaded).toBe(true);
    loaded.props.onCompatibilityDefaultChange(2);
    await flushPromises();

    expect(backend.setCompatibilityDefault).toHaveBeenCalledWith(2);
    expect(steam.setConfirmedCompatibilityDefault).toHaveBeenCalledWith(2, 1);
    expect(compatibilitySection(render()).props.compatibilityDefault).toBe(2);
  });

  it("keeps the confirmed global compatibility default after a failed save", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultSnapshot.mockReturnValue(3);
    backend.setCompatibilityDefault.mockRejectedValue(new Error("disk unavailable"));
    render();
    runEffects();
    await flushPromises();

    compatibilitySection(render()).props.onCompatibilityDefaultChange(2);
    await flushPromises();

    const afterFailure = compatibilitySection(render());
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

    compatibilitySection(render()).props.onCompatibilityDefaultChange(2);
    steam.isCompatibilityLifecycleCurrent.mockReturnValue(false);
    resolveSave(2);
    await flushPromises();

    expect(steam.setConfirmedCompatibilityDefault).not.toHaveBeenCalled();
    expect(compatibilitySection(render()).props.compatibilityDefault).toBe(3);
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
    expect(compatibilitySection(render()).props.compatibilityDefaultLoaded).toBe(false);
    expect(compatibilitySection(render()).props.compatibilityDefaultError).toContain("initial load failed");

    steam.compatibilityDefaultSnapshot.mockReturnValue(2);
    steam.compatibilityDefaultLoadedSnapshot.mockReturnValue(true);
    notify();

    const recovered = compatibilitySection(render());
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

    const loaded = compatibilitySection(render());
    expect(loaded.props.compatibilityDefaultScope).toBe("all");
    loaded.props.onCompatibilityDefaultScopeChange("steam");
    await flushPromises();

    expect(backend.setCompatibilityDefaultScope).toHaveBeenCalledWith("steam");
    expect(steam.setConfirmedCompatibilityDefaultScope).toHaveBeenCalledWith("steam", 1);
    expect(compatibilitySection(render()).props.compatibilityDefaultScope).toBe("steam");
  });

  it("restores the previous scope and reports the failure after a failed scope save", async () => {
    steam.ensureCompatibilityDefault.mockResolvedValue(3);
    steam.compatibilityDefaultScopeSnapshot.mockReturnValue("metadata");
    backend.setCompatibilityDefaultScope.mockRejectedValue(new Error("disk unavailable"));
    render();
    runEffects();
    await flushPromises();

    compatibilitySection(render()).props.onCompatibilityDefaultScopeChange("all");
    await flushPromises();

    const afterFailure = compatibilitySection(render());
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

    const loaded = compatibilitySection(render());
    loaded.props.onCompatibilityDefaultScopeChange("steam");
    // Controller activation can arrive again before React has rendered busy.
    loaded.props.onCompatibilityDefaultScopeChange("all");
    compatibilitySection(render()).props.onCompatibilityDefaultChange(null);
    expect(backend.setCompatibilityDefaultScope).toHaveBeenCalledTimes(1);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    finishScope("steam");
    await flushPromises();
    const saved = compatibilitySection(render());
    expect(saved.props.compatibilityDefaultScope).toBe("steam");
    expect(saved.props.compatibilityDefault).toBe(3);
    expect(saved.props.compatibilityDefaultScopeBusy).toBe(false);

    backend.setCompatibilityDefault.mockResolvedValue(null);
    saved.props.onCompatibilityDefaultChange(null);
    await flushPromises();
    expect(compatibilitySection(render()).props.compatibilityDefault).toBeNull();
    expect(compatibilitySection(render()).props.compatibilityDefaultScope).toBe("steam");
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

  it("returns native focus to Video quality after cancellation", async () => {
    const { controls } = await remountReturnedDropdown("quality");
    render();
    runEffects();
    controls.flushFrames();
    expect(controls.qualityButton.className).toContain("gpfocus");
    expect(controls.categoryButton.className).not.toContain("gpfocus");
    expect(controls.scopeButton.className).not.toContain("gpfocus");
  });

  it("releases the dropdown handoff when B leaves visible QAM, not while its popup is open", async () => {
    const { controls } = await remountReturnedDropdown("quality");
    render();
    runEffects();
    controls.flushFrames();
    expect(controls.qualityButton.className).toContain("gpfocus");
    expect(hasCompatibilityDropdownReturn()).toBe(true);

    const qamDocument = controls.qualityButton.ownerDocument;
    qamDocument.visibilityState = "hidden";
    controls.dispatchButtonDown(2);
    expect(hasCompatibilityDropdownReturn()).toBe(true);

    qamDocument.visibilityState = "visible";
    controls.dispatchButtonDown(2);
    expect(hasCompatibilityDropdownReturn()).toBe(false);
  });

  it("keeps the focus handoff armed when the controller opens the quality popup", async () => {
    const { controls, returned } = await remountReturnedDropdown("quality");
    returned();

    const section = gameTrailersSection(render());
    section.props.onQualityMenuWillOpen();
    await section.props.onQualityChange("auto");
    controls.dispatchButtonDown(1);

    expect(hasCompatibilityDropdownReturn()).toBe(true);
    controls.flushFrames();
    expect(controls.qualityButton.className).toContain("gpfocus");
    controls.dispatchButtonDown(10);
    expect(hasCompatibilityDropdownReturn()).toBe(false);
  });

  it("returns native focus to Video quality after a selection", async () => {
    const controls = makeFocusControls();
    render();
    runEffects();
    await flushPromises();
    const first = gameTrailersSection(render());
    first.props.onQualityMenuWillOpen();
    first.props.onQualityControlRef(controls.qualityA);
    first.props.onQualityControlRef(null);
    await first.props.onQualityChange(1080);

    remount();
    const returned = gameTrailersSection(render());
    returned.props.onQualityControlRef(controls.qualityB);
    render();
    runEffects();
    await flushPromises();
    controls.flushFrames();

    expect(trailer.setQuality).toHaveBeenCalledWith(1080);
    expect(controls.qualityButton.className).toContain("gpfocus");
  });

  it("returns native focus to the ProtonDB cover position after selecting a corner", async () => {
    const controls = makeFocusControls();
    render();
    runEffects();
    await flushPromises();
    const first = children(render()).find(node => node.type === "ProtonDbBadgesSection");
    first.props.onCoverPositionMenuWillOpen();
    first.props.onCoverPositionControlRef(controls.protonDbA);
    first.props.onCoverPositionControlRef(null);
    await first.props.onCoverPositionChange("top-right");
    remount();
    const returned = children(render()).find(node => node.type === "ProtonDbBadgesSection");
    expect(returned.props.initiallyExpanded).toBe(true);
    returned.props.onCoverPositionControlRef(controls.protonDbB);
    render();
    runEffects();
    await flushPromises();
    controls.flushFrames();
    expect(controls.protonDbButton.className).toContain("gpfocus");
    expect(controls.qualityButton.className).not.toContain("gpfocus");
    expect(controls.categoryButton.className).not.toContain("gpfocus");
  });

  it("keeps an async Auto handoff through remount and releases on navigation after status churn", async () => {
    const controls = makeFocusControls();
    controls.delayNativeFocusUntil(24);
    trailer.getSnapshot.mockReturnValue({
      settings: { enabled: true, audioEnabled: true, hideLogoDuringTrailer: false, quality: 1080, fadeInDelaySeconds: 3 },
      status: "Trailer: Fixture",
      displayWidth: 1280,
      displayHeight: 800,
      targetHeight: 1080,
      settingsLoaded: true,
      busy: false,
      settingsError: "",
      matchRevision: 0,
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: true,
    });
    render();
    runEffects();
    await flushPromises();

    const first = gameTrailersSection(render());
    first.props.onQualityMenuWillOpen();
    first.props.onQualityControlRef(controls.qualityA);
    first.props.onQualityControlRef(null);
    const save = deferred<boolean>();
    trailer.setQuality.mockReturnValue(save.promise);
    const changingQuality = first.props.onQualityChange("auto");
    expect(isCompatibilityDropdownSelectionReturn()).toBe(false);

    trailer.getSnapshot.mockReturnValue({
      settings: { enabled: true, audioEnabled: true, hideLogoDuringTrailer: false, quality: 1080, fadeInDelaySeconds: 3 },
      status: "Checking the new display target",
      displayWidth: 1280,
      displayHeight: 800,
      targetHeight: 1080,
      settingsLoaded: true,
      busy: true,
      settingsError: "",
      matchRevision: 0,
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: true,
    });
    remount();
    let returned = gameTrailersSection(render());
    returned.props.onQualityControlRef(controls.qualityB);
    render();
    runEffects();
    controls.advanceFrames(30);
    expect(controls.qualityButton.className).not.toContain("gpfocus");

    save.resolve(true);
    await changingQuality;
    expect(isCompatibilityDropdownSelectionReturn()).toBe(true);
    trailer.getSnapshot.mockReturnValue({
      settings: { enabled: true, audioEnabled: true, hideLogoDuringTrailer: false, quality: "auto", fadeInDelaySeconds: 3 },
      status: "Trailer: Fixture",
      displayWidth: 1280,
      displayHeight: 800,
      targetHeight: 800,
      settingsLoaded: true,
      busy: false,
      settingsError: "",
      matchRevision: 0,
      conflict: { pluginName: null, detectionAvailable: true }, effectiveEnabled: true,
    });
    remount();
    returned = gameTrailersSection(render());
    returned.props.onQualityControlRef(controls.qualityB);
    render();
    runEffects();
    controls.advanceFrames(80);

    expect(trailer.setQuality).toHaveBeenCalledWith("auto");
    expect(controls.qualityButton.className).toContain("gpfocus");
    expect(controls.qualityButton.ownerDocument.activeElement).toBe(controls.qualityButton);
    expect(hasCompatibilityDropdownReturn()).toBe(true);

    // A playback status refresh can leave the row in the tree but remove its
    // native focus. The next D-pad action belongs to Steam, not the return lease.
    const updatedSnapshot = trailer.getSnapshot();
    trailer.getSnapshot.mockReturnValue({
      ...updatedSnapshot,
      status: "Trailer playback status refreshed",
    });
    render();
    runEffects();
    controls.stealNativeFocusSilently();
    controls.dispatchButtonDown(10);

    expect(hasCompatibilityDropdownReturn()).toBe(false);
    expect(controls.listenerCount("keydown")).toBe(0);
    expect(controls.listenerCount("vgp_onbuttondown")).toBe(0);
    expect(controls.listenerCount("pointerdown")).toBe(0);
    controls.advanceFrames(20);
    expect(controls.qualityButton.className).not.toContain("gpfocus");
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
    const first = compatibilitySection(render());
    first.props.onCompatibilityDefaultMenuWillOpen("scope");
    first.props.onCompatibilityDefaultScopeChange("metadata");

    const renderReloaded = await importReloadedContent();
    const reloadedFocus = await import("./qamCompatibilityFocus");
    expect(reloadedFocus.compatibilityDropdownReturnOrigin()).toBe("scope");
    renderReloaded();
    runEffects();
    await flushPromises();
    const pending = compatibilitySection(renderReloaded());
    expect(pending.props.compatibilityDefaultScopeBusy).toBe(true);
    pending.props.onCompatibilityDefaultChange(2);
    expect(backend.setCompatibilityDefault).not.toHaveBeenCalled();

    save.resolve("metadata");
    await flushPromises();
    renderReloaded();
    runEffects();
    const settled = compatibilitySection(renderReloaded());
    expect(settled.props.compatibilityDefault).toBe(3);
    expect(settled.props.compatibilityDefaultScope).toBe("metadata");
    expect(settled.props.compatibilityDefaultScopeBusy).toBe(false);

    confirmedCategory = null;
    revisionListeners.forEach((listener) => listener());
    const automatic = compatibilitySection(renderReloaded());
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
    compatibilitySection(render()).props.onCompatibilityDefaultScopeChange("steam");

    const renderReloaded = await importReloadedContent();
    renderReloaded();
    runEffects();
    await flushPromises();
    expect(compatibilitySection(renderReloaded()).props.compatibilityDefaultScopeBusy).toBe(true);

    save.reject(new Error("disk unavailable"));
    await flushPromises();
    renderReloaded();
    runEffects();
    const failed = compatibilitySection(renderReloaded());
    expect(failed.props.compatibilityDefaultScopeBusy).toBe(false);
    expect(failed.props.compatibilityDefaultScope).toBe("all");
    expect(failed.props.compatibilityDefaultError).toContain("disk unavailable");
  });

  it("records the dropdown that must receive focus after its popup closes", async () => {
    render();
    runEffects();
    await flushPromises();

    const section = compatibilitySection(render());
    section.props.onCompatibilityDefaultMenuWillOpen("category");
    expect(compatibilityDropdownReturnOrigin()).toBe("category");
    section.props.onCompatibilityDefaultMenuWillOpen("scope");
    expect(compatibilityDropdownReturnOrigin()).toBe("scope");
  });


});
