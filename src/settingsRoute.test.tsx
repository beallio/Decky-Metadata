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

import { openSettings, SETTINGS_ROUTE, SettingsTitleView } from "./settingsRoute";

const store = (pathname: string) => ({ GamepadUIMainWindowInstance: { m_history: { location: { pathname } } } });
const setRoute = (pathname: string) => vi.stubGlobal("SteamUIStore", { WindowStore: store(pathname) });

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

