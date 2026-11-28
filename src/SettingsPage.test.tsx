import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
}));
// Each container hook returns a marker object so the test can follow it to the page that receives it.
const hooks = vi.hoisted(() => ({
  games: [{ appid: 1, name: "Game" }],
  scan: { busy: true, savedCount: 7, missingCount: 2 },
  maintenance: { cacheBusy: false, delistedCountText: "maintenance" },
  compatibility: { compatibilityDefault: "compatibility" },
  logs: { debugLogging: true },
  versions: { deckyVersion: "versions" },
  contextMenu: { settings: { gameIcon: true }, error: "", onChange: () => undefined },
  updates: { pluginVersion: "0.6.7", testingTabEnabled: false },
}));
const controller = (name: string) => {
  let listener: (() => void) | null = null;
  const store = {
    snapshot: { name, revision: 0, settings: {} } as Record<string, unknown>,
    getSnapshot: vi.fn(() => store.snapshot),
    setPanelVisible: vi.fn(),
    subscribe: vi.fn((next: () => void) => {
      listener = next;
      return () => { listener = null; };
    }),
    publish: (snapshot: Record<string, unknown>) => {
      store.snapshot = snapshot;
      listener?.();
    },
  };
  return store;
};
const controllers = vi.hoisted(() => ({} as Record<string, ReturnType<typeof controller>>));
const navigation = vi.hoisted(() => ({ NavigateBack: vi.fn() }));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (index >= harness.slots.length) {
      harness.slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    }
    return [harness.slots[index], (value: unknown) => { harness.slots[index] = value; }];
  },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection",
  Focusable: "Focusable",
  Navigation: navigation,
}));
vi.mock("react-icons/fa", () => ({
  FaBars: "FaBars", FaClock: "FaClock", FaFileAlt: "FaFileAlt", FaFlask: "FaFlask", FaImage: "FaImage", FaInfoCircle: "FaInfoCircle",
  FaPlayCircle: "FaPlayCircle", FaSyncAlt: "FaSyncAlt", FaTrophy: "FaTrophy",
}));
vi.mock("react-icons/fa6", () => ({ FaTags: "FaTags" }));
vi.mock("react-icons/si", () => ({ SiSteamdeck: "SiSteamdeck" }));
vi.mock("./protondb/Icon", () => ({ ProtonDbIcon: "ProtonDbIcon" }));
vi.mock("./components/qam/ArtworkSection", () => ({ ArtworkBody: "ArtworkBody" }));
vi.mock("./components/qam/CompatibilitySection", () => ({ CompatibilityBody: "CompatibilityBody" }));
vi.mock("./components/qam/ContextMenuSection", () => ({ ContextMenuBody: "ContextMenuBody" }));
vi.mock("./components/qam/GameTrailersSection", () => ({ GameTrailersBody: "GameTrailersBody" }));
vi.mock("./components/qam/HltbSection", () => ({ HltbBody: "HltbBody" }));
vi.mock("./components/qam/LogsSection", () => ({ LogsBody: "LogsBody" }));
vi.mock("./components/qam/MetadataSection", () => ({
  MetadataMaintenanceBody: "MetadataMaintenanceBody",
  MetadataScanBody: "MetadataScanBody",
}));
vi.mock("./components/qam/MiniAchievementsSection", () => ({ MiniAchievementsBody: "MiniAchievementsBody" }));
vi.mock("./components/qam/PluginUpdateSection", () => ({ PluginUpdateBody: "PluginUpdateBody" }));
vi.mock("./components/qam/ProtonDbBadgesSection", () => ({ ProtonDbBadgesBody: "ProtonDbBadgesBody" }));
vi.mock("./components/qam/TestingSection", () => ({ TestingBody: "TestingBody" }));
vi.mock("./components/qam/VersionsSection", () => ({ VersionsBody: "VersionsBody" }));
vi.mock("./settingsLayout", () => ({ SettingsLayout: "SettingsLayout" }));
vi.mock("./settingsRoute", () => ({
  consumeReloadSettingsTab: vi.fn(() => null),
  setActiveSettingsTab: vi.fn(),
}));
vi.mock("./i18n", () => ({
  currentSteamLanguage: vi.fn(),
  refreshLanguage: vi.fn(() => Promise.resolve("en-US")),
  useT: () => (key: string) => key,
}));
vi.mock("./metadataScan", () => ({ metadataScanStore: { start: vi.fn() } }));
vi.mock("./settings/scanView", () => ({ scanView: (scan: { busy: boolean }) => ({ scanBusy: scan.busy }) }));
vi.mock("./settings/useScanGames", () => ({ useScanGames: () => ({ games: hooks.games, scan: hooks.scan }) }));
vi.mock("./settings/useMetadataMaintenance", () => ({ useMetadataMaintenance: () => hooks.maintenance }));
vi.mock("./settings/useCompatibilityPolicy", () => ({ useCompatibilityPolicy: () => hooks.compatibility }));
vi.mock("./settings/useLogsSettings", () => ({ useLogsSettings: () => hooks.logs }));
vi.mock("./settings/useVersions", () => ({ useVersions: () => hooks.versions }));
vi.mock("./settings/useContextMenuSettings", () => ({ useContextMenuSettings: () => hooks.contextMenu }));
vi.mock("./updater/pluginUpdateController", () => ({ usePluginUpdateController: () => hooks.updates }));
vi.mock("./trailers/controller", () => ({ get trailerController() { return controllers.trailers; } }));
vi.mock("./steam/miniAchievementsController", () => ({
  get miniAchievementsController() { return controllers.miniAchievements; },
}));
vi.mock("./protondb/controller", () => ({ get protonDbBadgeController() { return controllers.protonDb; } }));
vi.mock("./artwork/controller", () => ({ get artworkController() { return controllers.artwork; } }));
vi.mock("./hltb/gameView", () => ({ get hltbController() { return controllers.hltb; } }));

import { SettingsPage } from "./SettingsPage";

type Node = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };
const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const element = node as Node;
  return [element, ...nodes(element.props?.children)];
};
type Page = { id: string; label: string; separatorBefore?: boolean; content: unknown };

// Re-run the component on the current state slots, as a React re-render would.
const render = () => {
  harness.cursor = 0;
  harness.effects = [];
  return SettingsPage() as ReactElement<Record<string, unknown>>;
};
const layout = (root: ReactElement<Record<string, unknown>>) =>
  nodes(root).find((node) => node.type === "SettingsLayout")!.props as {
    pages: Page[];
    page: string;
    onPageRequested: (id: string) => void;
  };
const body = (root: ReactElement<Record<string, unknown>>, id: string, type: string) =>
  nodes(layout(root).pages.find((page) => page.id === id)!.content).find((node) => node.type === type)!.props!;
// Mount a tab component on fresh hook slots, as React does when the native layout shows that page.
const mountTab = (id: string) => {
  const element = layout(render()).pages.find((page) => page.id === id)!.content as ReactElement<Record<string, unknown>>;
  const Tab = element.type as (props: Record<string, unknown>) => ReactElement<Record<string, unknown>>;
  const renderTab = () => {
    harness.cursor = 0;
    harness.effects = [];
    return Tab(element.props);
  };
  harness.slots = [];
  renderTab();
  const cleanups = harness.effects.map((effect) => effect());
  return { render: renderTab, unmount: () => cleanups.forEach((cleanup) => typeof cleanup === "function" && cleanup()) };
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.slots = [];
  hooks.updates.testingTabEnabled = false;
  for (const name of ["trailers", "miniAchievements", "protonDb", "hltb", "artwork"]) controllers[name] = controller(name);
  (controllers.artwork as any).refreshSummary = vi.fn();
  (controllers.artwork as any).setSettings = vi.fn();
  (controllers.artwork as any).runBulk = vi.fn();
});

describe("SettingsPage", () => {
  it("lists the QAM sections in order, with Logs, Updates and Versions after a separator", () => {
    const pages = layout(render()).pages;

    expect(pages.map((page) => page.id)).toEqual([
      "metadata", "artwork", "compat", "protondb", "hltb", "trailers", "miniAchievements", "contextMenu",
      "logs", "updates", "versions",
    ]);
    expect(pages.filter((page) => page.separatorBefore).map((page) => page.id)).toEqual(["logs"]);
  });

  it("shows the Testing tab after Updates only when enabled", () => {
    hooks.updates.testingTabEnabled = true;
    const pages = layout(render()).pages;

    expect(pages.map((page) => page.id)).toEqual([
      "metadata", "artwork", "compat", "protondb", "hltb", "trailers", "miniAchievements", "contextMenu",
      "logs", "updates", "testing", "versions",
    ]);

    layout(render()).onPageRequested("testing");
    expect(layout(render()).page).toBe("testing");

    hooks.updates.testingTabEnabled = false;
    expect(layout(render()).page).toBe("updates");
  });

  it("gives each page the state of the hook that owns it", () => {
    const root = render();

    expect(body(root, "metadata", "MetadataScanBody")).toMatchObject({
      scanBusy: true, detectedCount: 1, savedCount: 7, missingCount: 2,
    });
    expect(body(root, "metadata", "MetadataMaintenanceBody")).toMatchObject({ scanBusy: true, ...hooks.maintenance });
    expect(body(root, "compat", "CompatibilityBody")).toMatchObject(hooks.compatibility);
    expect(body(root, "contextMenu", "ContextMenuBody")).toMatchObject(hooks.contextMenu);
    expect(body(root, "logs", "LogsBody")).toMatchObject(hooks.logs);
    expect(mountTab("versions").render().props).toMatchObject({ pluginVersion: "0.6.7", ...hooks.versions });
  });

  it("keeps the requested page across renders", () => {
    layout(render()).onPageRequested("logs");

    expect(layout(render()).page).toBe("logs");
  });

  it("shows controller changes that happen after a feature tab subscribes", () => {
    const trailers = mountTab("trailers");
    controllers.trailers.publish({ name: "trailers", revision: 1 });
    expect(trailers.render().props.state).toMatchObject({ revision: 1 });

    const hltb = mountTab("hltb");
    controllers.hltb.publish({ name: "hltb", revision: 1, settings: { style: "clean" } });
    expect(hltb.render().props.settings).toEqual({ style: "clean" });
  });

  it("checks trailer status quickly only while the Game trailers tab is shown", () => {
    const inactive = layout(render()).pages.find((page) => page.id === "trailers")!.content as ReactElement<Record<string, unknown>>;
    expect(inactive.props.visible).toBe(false);
    layout(render()).onPageRequested("trailers");
    const trailers = mountTab("trailers");
    expect(controllers.trailers.setPanelVisible).toHaveBeenLastCalledWith(true);

    trailers.unmount();
    expect(controllers.trailers.setPanelVisible).toHaveBeenLastCalledWith(false);
  });

  it("leaves Settings with B from the tab list", () => {
    (render().props.onCancelButton as () => void)();

    expect(navigation.NavigateBack).toHaveBeenCalledOnce();
  });
});
