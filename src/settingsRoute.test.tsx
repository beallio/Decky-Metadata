import { describe, expect, it, vi } from "vitest";

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

describe("openSettings", () => {
  it("closes the QAM before it opens the Settings route", () => {
    openSettings();

    expect(calls).toEqual(["CloseSideMenus", `Navigate ${SETTINGS_ROUTE}`]);
  });
});
