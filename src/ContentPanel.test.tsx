import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataScanSnapshot } from "./metadataScan";
import type { ReactElement } from "react";

const harness = vi.hoisted(() => ({
  hookIndex: 0,
  hooks: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
}));
const games = vi.hoisted(() => ({
  detected: [] as Array<{ appid: number; name: string }>,
}));
const metadataScan = vi.hoisted(() => ({
  snapshot: {
    progress: null,
    busy: false,
    statusKind: "idle",
    error: null,
    completedRevision: 0,
    savedCount: 0,
    missingCount: 0,
  } as MetadataScanSnapshot,
  start: vi.fn(),
}));
const i18n = vi.hoisted(() => ({
  currentSteamLanguage: vi.fn(() => Promise.resolve("english")),
}));
const ui = vi.hoisted(() => ({
  getFocusNavController: vi.fn(),
  getGamepadNavigationTrees: vi.fn(),
}));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void | (() => void)) => {
    harness.effects.push(callback);
  },
  useRef: (initial: unknown) => {
    const index = harness.hookIndex++;
    if (harness.hooks.length <= index) harness.hooks[index] = { current: initial };
    return harness.hooks[index];
  },
}));
vi.mock("@decky/ui", () => ({
  Focusable: "Focusable",
  NavEntryPositionPreferences: { PREFERRED_CHILD: "preferred" },
  getFocusNavController: ui.getFocusNavController,
  getGamepadNavigationTrees: ui.getGamepadNavigationTrees,
}));
vi.mock("./components/qam/MetadataSection", () => ({
  MetadataScanBody: "MetadataScanBody",
}));
vi.mock("./components/qam/QamActions", () => ({
  QamInstallRow: "QamInstallRow",
  OpenSettingsButton: "OpenSettingsButton",
}));
vi.mock("./log", () => ({ warn: vi.fn() }));
vi.mock("./metadataScan", () => ({
  metadataScanStore: metadataScan,
  scanCompleteMessage: (progress: { message?: string }) => progress.message ?? "",
}));
vi.mock("./i18n", () => ({
  currentSteamLanguage: i18n.currentSteamLanguage,
  refreshLanguage: vi.fn(() => Promise.resolve("en-US")),
  translateBackendError: (error: unknown) => String(error),
  translateProgress: (progress: { message?: string } | null | undefined) => progress?.message ?? "",
}));
vi.mock("./styles", () => ({ qamPanelStyle: {} }));
vi.mock("./settings/useScanGames", () => ({
  useScanGames: () => ({ games: games.detected, scan: metadataScan.snapshot }),
}));

import { Content, takeNativeFocus } from "./ContentPanel";

const render = (): ReactElement<Record<string, unknown>> => {
  harness.hookIndex = 0;
  harness.effects.length = 0;
  return Content();
};

type TestNode = {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
};
const children = (node: unknown): TestNode[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  const element = node as TestNode;
  return [element, ...children(element.props?.children)];
};

const runEffects = () => {
  for (const effect of [...harness.effects]) effect();
};

type FakePanelDocument = {
  visibilityState: "visible" | "hidden";
  defaultView: { closed: boolean; document: FakePanelDocument } | null;
  addEventListener: (name: string, listener: () => void) => void;
  removeEventListener: (name: string, listener: () => void) => void;
};

const makePanelElement = () => {
  const listeners = new Map<string, Array<() => void>>();
  const panelDocument: FakePanelDocument = {
    visibilityState: "visible",
    defaultView: null,
    addEventListener: vi.fn((name: string, listener: () => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(listener);
      listeners.set(name, existing);
    }),
    removeEventListener: vi.fn((name: string, listener: () => void) => {
      listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== listener));
    }),
  };
  panelDocument.defaultView = { closed: false, document: panelDocument };
  return {
    // Steam-only DOM APIs make this minimal fake a structural stand-in.
    element: { ownerDocument: panelDocument as unknown as Document, parentElement: null } as unknown as HTMLDivElement,
    panelDocument,
    dispatchVisibilityChange: () => {
      for (const listener of listeners.get("visibilitychange") ?? []) listener();
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.hookIndex = 0;
  harness.hooks = [];
  harness.effects = [];
  games.detected = [];
  metadataScan.snapshot = {
    progress: null,
    busy: false,
    statusKind: "idle",
    error: null,
    completedRevision: 0,
    savedCount: 0,
    missingCount: 0,
  };
  metadataScan.start.mockResolvedValue(undefined);
  i18n.currentSteamLanguage.mockResolvedValue("english");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QAM content", () => {
  it("keeps initial focus on the panel and takes Steam focus through BTakeFocus", () => {
    const { element } = makePanelElement();
    const focus = vi.fn(() => true);
    ui.getFocusNavController.mockReturnValue({ m_ActiveContext: {} });
    ui.getGamepadNavigationTrees.mockReturnValue([{ Root: { Element: element, BTakeFocus: focus } }]);
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("window", { requestAnimationFrame, cancelAnimationFrame: vi.fn() });

    const root = render();
    expect(root.props.preferredFocus).toBe(true);
    expect(root.props.navEntryPreferPosition).toBe("preferred");
    const focusPanel = root.props.ref as (element: HTMLDivElement | null) => void;
    focusPanel(element);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    frames[0]?.(0);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not take native focus from a hidden panel document", () => {
    const { element, panelDocument } = makePanelElement();
    panelDocument.visibilityState = "hidden";
    const focus = vi.fn();
    ui.getGamepadNavigationTrees.mockReturnValue([{ Root: { Element: element, BTakeFocus: focus } }]);

    expect(takeNativeFocus(element)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("reactivates Steam's inactive QAM context before it takes focus", () => {
    const { element } = makePanelElement();
    const calls: string[] = [];
    ui.getFocusNavController.mockReturnValue({
      m_ActiveContext: null,
      m_LastActiveContext: {},
      FindAnActiveContext: () => calls.push("reactivate"),
    });
    ui.getGamepadNavigationTrees.mockReturnValue([
      { Root: { Element: element, BTakeFocus: () => calls.push("focus") > 0 } },
    ]);

    expect(takeNativeFocus(element)).toBe(true);
    expect(calls).toEqual(["reactivate", "focus"]);
  });

  it("maps the scan snapshot and starts a scan with the current games", () => {
    const game = { appid: 42, name: "Example" };
    games.detected = [game];
    metadataScan.snapshot = {
      progress: {
        running: true,
        status: "running",
        total: 4,
        completed: 2,
        assigned: 1,
        failed: 0,
        current: "Scanning metadata",
        message: "",
      },
      busy: true,
      statusKind: "active",
      error: null,
      completedRevision: 0,
      savedCount: 7,
      missingCount: 3,
    };

    const root = render();
    const body = children(root).find((node) => node.type === "MetadataScanBody");
    if (!body?.props) throw new Error("MetadataScanBody did not render");
    expect(body.props).toMatchObject({
      detectedCount: 1,
      savedCount: 7,
      missingCount: 3,
      scanBusy: true,
      scanCompleted: 2,
      scanTotal: 4,
      scanMessage: "Scanning metadata",
      scanStatusKind: "active",
    });
    expect(children(root).map((node) => node.type)).toEqual([
      "Focusable",
      "MetadataScanBody",
      "QamInstallRow",
      "OpenSettingsButton",
    ]);

    runEffects();
    const refreshMetadata = body.props.onRefreshMetadata;
    if (typeof refreshMetadata !== "function") throw new Error("Metadata refresh action did not render");
    refreshMetadata();
    expect(metadataScan.start).toHaveBeenCalledWith([game], i18n.currentSteamLanguage);
  });
});
