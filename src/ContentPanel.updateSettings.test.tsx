import { beforeEach, describe, expect, it, vi } from "vitest";

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
  setDebugLogging: vi.fn(),
  setUpdateChannel: vi.fn(),
  startScanMissing: vi.fn(),
}));

const steam = vi.hoisted(() => ({
  metadataCache: {} as Record<string, unknown>,
  refreshMetadataCache: vi.fn(),
}));

const games = vi.hoisted(() => ({ loadGames: vi.fn() }));

vi.mock("react", () => ({
  useCallback: (callback: any) => callback,
  useEffect: (callback: () => void | (() => void)) => {
    harness.effects.push(callback);
  },
  useRef: (initial: any) => {
    const index = harness.hookIndex++;
    if (harness.hooks.length <= index) harness.hooks[index] = { current: initial };
    return harness.hooks[index];
  },
  useState: (initial: any) => {
    const index = harness.hookIndex++;
    if (harness.hooks.length <= index) harness.hooks[index] = initial;
    return [
      harness.hooks[index],
      (value: any) => {
        harness.hooks[index] =
          typeof value === "function" ? value(harness.hooks[index]) : value;
      },
    ];
  },
}));

vi.mock("@decky/ui", () => ({
  Focusable: "Focusable",
  NavEntryPositionPreferences: { PREFERRED_CHILD: "preferred" },
  getGamepadNavigationTrees: vi.fn(() => []),
  showModal: vi.fn(),
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

const render = () => {
  harness.hookIndex = 0;
  harness.effects.length = 0;
  return Content();
};

const children = (node: any): any[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  return [node, ...children(node.props?.children)];
};

const updateSection = (tree: any) =>
  children(tree).find((node) => node.type === "PluginUpdateSection");

const runEffects = () => {
  for (const effect of [...harness.effects]) effect();
};

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe("Content update settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.hookIndex = 0;
    harness.hooks = [];
    harness.effects = [];
    games.loadGames.mockResolvedValue([]);
    steam.refreshMetadataCache.mockResolvedValue(undefined);
    backend.getDebugLogging.mockResolvedValue(false);
    backend.getDelistedIndexStatus.mockResolvedValue({ count: 0, fetched_at: 0 });
    backend.getMissingMetadataCount.mockResolvedValue(0);
    backend.getPluginVersion.mockResolvedValue("0.3.1");
    backend.getSystemVersions.mockResolvedValue({ decky: "", steamos: "" });
  });

  it("falls back to defaults and marks settings loaded after a failed envelope", async () => {
    backend.getUpdateSettings.mockResolvedValue({ status: "failed" });
    render();
    runEffects();
    await flushPromises();

    const section = updateSection(render());
    expect(section.props.updateChannel).toBe("stable");
    expect(section.props.automaticUpdateChecks).toBe(true);
    expect(section.props.settingsLoaded).toBe(true);
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
});
