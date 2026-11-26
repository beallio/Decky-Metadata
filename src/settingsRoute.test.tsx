import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  Focusable: "Focusable",
  staticClasses: { Title: "title" },
  Navigation: {
    CloseSideMenus: () => calls.push("CloseSideMenus"),
    Navigate: (route: string) => calls.push(`Navigate ${route}`),
  },
}));
vi.mock("./i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useT: () => actual.t };
});

import {
  consumeReloadSettingsTab,
  openSettings,
  refreshOpenSettingsRoute,
  rememberSettingsTabForReload,
  setActiveSettingsTab,
  SETTINGS_ROUTE,
  SettingsTitleView,
} from "./settingsRoute";

const store = (pathname: string, replace?: ReturnType<typeof vi.fn>, state?: unknown) => ({
  GamepadUIMainWindowInstance: { m_history: { location: { pathname, search: "", hash: "", state }, replace } },
});
const setRoute = (pathname: string, replace?: ReturnType<typeof vi.fn>, state?: unknown) =>
  vi.stubGlobal("SteamUIStore", { WindowStore: store(pathname, replace, state) });

describe("openSettings", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes the QAM before it opens the Settings route", () => {
    setRoute("/library/home");
    openSettings();

    expect(calls).toEqual(["CloseSideMenus", `Navigate ${SETTINGS_ROUTE}`]);
  });

  it("only closes the QAM when Settings is already open, so one B still leaves", () => {
    setRoute(SETTINGS_ROUTE);
    openSettings();

    expect(calls).toEqual(["CloseSideMenus"]);
  });

  it.each([
    ["SteamUIStore.m_WindowStore", () => vi.stubGlobal("SteamUIStore", { m_WindowStore: store(SETTINGS_ROUTE) })],
    ["Router.WindowStore", () => vi.stubGlobal("Router", { WindowStore: store(SETTINGS_ROUTE) })],
    ["a /routes/ prefix", () => setRoute(`/routes${SETTINGS_ROUTE}`)],
  ])("recognizes open Settings through %s", (_name, stub) => {
    stub();
    openSettings();

    expect(calls).toEqual(["CloseSideMenus"]);
  });

  it("still opens Settings when no window store is found", () => {
    openSettings();

    expect(calls).toEqual(["CloseSideMenus", `Navigate ${SETTINGS_ROUTE}`]);
  });
});

describe("refreshOpenSettingsRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActiveSettingsTab(null);
    consumeReloadSettingsTab();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rebuilds routes and replaces the open Settings location without pushing a duplicate entry", () => {
    const replace = vi.fn();
    const state = { FocusNavHistoryID: "State_1" };
    setRoute(SETTINGS_ROUTE, replace, state);
    const routes = { addRoute: vi.fn(), removeRoute: vi.fn() };

    refreshOpenSettingsRoute(routes);

    expect(routes.addRoute).toHaveBeenCalledOnce();
    const sentinel = routes.addRoute.mock.calls[0][0] as string;
    expect(sentinel).toMatch(/^\/decky-metadata-settings-reload-/);
    expect(replace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(replace).toHaveBeenCalledWith({ pathname: SETTINGS_ROUTE, search: "", hash: "", state });
    expect(routes.removeRoute).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(routes.removeRoute).toHaveBeenCalledWith(sentinel);
  });

  it("does nothing when another route is active", () => {
    const replace = vi.fn();
    setRoute("/library/home", replace);
    const routes = { addRoute: vi.fn(), removeRoute: vi.fn() };

    refreshOpenSettingsRoute(routes);
    vi.runAllTimers();

    expect(routes.addRoute).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("cancels pending replacement and cleans up the sentinel on dismount", () => {
    const replace = vi.fn();
    setRoute(SETTINGS_ROUTE, replace);
    const routes = { addRoute: vi.fn(), removeRoute: vi.fn() };

    const cancel = refreshOpenSettingsRoute(routes);
    const sentinel = routes.addRoute.mock.calls[0][0] as string;
    cancel();
    vi.runAllTimers();

    expect(replace).not.toHaveBeenCalled();
    expect(routes.removeRoute).toHaveBeenCalledTimes(1);
    expect(routes.removeRoute).toHaveBeenCalledWith(sentinel);
  });

  it("remembers the active Settings tab across an in-place reload and consumes it once", () => {
    setRoute(SETTINGS_ROUTE);
    setActiveSettingsTab("updates");
    rememberSettingsTabForReload();

    expect(consumeReloadSettingsTab()).toBe("updates");
    expect(consumeReloadSettingsTab()).toBeNull();
  });

  it("drops a stale saved tab after the reload window expires", () => {
    setRoute(SETTINGS_ROUTE);
    setActiveSettingsTab("testing");
    rememberSettingsTabForReload();

    vi.advanceTimersByTime(20_000);
    expect(consumeReloadSettingsTab()).toBeNull();
  });
});

describe("SettingsTitleView", () => {
  it("centers the QAM gear button icon", () => {
    const tree = SettingsTitleView() as { props?: { children?: unknown } };
    type TestNode = { type?: unknown; props?: { children?: unknown; style?: unknown } };
    const nodes = (node: unknown): TestNode[] =>
      node == null ? [] : Array.isArray(node) ? node.flatMap(nodes) : typeof node === "object"
        ? [node as TestNode, ...nodes((node as TestNode).props?.children)]
        : [];
    const button = nodes(tree).find((node) => node.type === "DialogButton");
    expect(button.props?.style).toMatchObject({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "28px",
      width: "40px",
      minWidth: 0,
      padding: 0,
    });
  });
});

