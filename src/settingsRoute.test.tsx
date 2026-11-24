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

import { openSettings, SETTINGS_ROUTE } from "./settingsRoute";

const setRoute = (pathname: string) =>
  vi.stubGlobal("SteamUIStore", { WindowStore: { GamepadUIMainWindowInstance: { m_history: { location: { pathname } } } } });

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
});
