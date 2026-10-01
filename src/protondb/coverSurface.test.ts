import { describe, expect, it } from "vitest";

import { protonDbCoverSurface } from "./coverSurface";

describe("native cover surface route classification", () => {
  it.each([
    "/library", "/library/", "/library/tab/DesktopApps", "/library/tab/AllApps",
    "/library/tab/Installed", "/library/collections/123", "/routes/library/tab/DesktopApps",
  ])("retains Library badges on native grid route %s", path => {
    expect(protonDbCoverSurface(path)).toBe("library");
  });

  it.each(["/library/home", "/library/home/", "/routes/library/home"])("keeps Home independent on %s", path => {
    expect(protonDbCoverSurface(path)).toBe("home");
  });

  it.each([
    undefined, "/steamweb", "/library/app/338930", "/library/details/338930",
    "/library/collection/app/338930", "/library/homebrew", "/library/tabbed",
  ])("does not treat non-grid route %s as a cover surface", path => {
    expect(protonDbCoverSurface(path)).toBeNull();
  });
});
