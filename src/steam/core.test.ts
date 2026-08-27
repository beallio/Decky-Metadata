import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ afterPatch: vi.fn(), findInReactTree: vi.fn() }));

import * as core from "./core";

const isCurrentGameDetailRoute = (routeContext: string, appId: number) =>
  (core as Record<string, unknown>).isCurrentGameDetailRoute as
    | ((context: string, id: number) => boolean)
    | undefined;

describe("isCurrentGameDetailRoute", () => {
  it.each([
    "/library/app/55150",
    "/library/details/55150/tab/GameInfo",
    "/library/all/app/55150",
    "/routes/library/app/55150",
    "/routes/library/details/55150/activity",
    "/routes/library/collection/app/55150",
    "/routes/library/app/55150 ?tab=GameInfo #activity https://steamloopback.host/routes/library/app/55150?tab=GameInfo#activity",
  ])("accepts only recognized library detail routes: %s", (routeContext) => {
    const classifier = isCurrentGameDetailRoute(routeContext, 55150);
    expect(typeof classifier).toBe("function");
    expect(classifier?.(routeContext, 55150)).toBe(true);
  });

  it.each([
    "/library/home",
    "/routes/library/home",
    "/controllerconfig/55150",
    "/library/collections?appid=55150",
    "/library/app/55151",
    "/library/app/551500",
    "?appid=55150",
    "https://store.steampowered.com/app/55150",
    "",
    "not a route",
    "/library/app/not-an-appid",
  ])("rejects a non-current or malformed route context: %s", (routeContext) => {
    const classifier = isCurrentGameDetailRoute(routeContext, 55150);
    expect(typeof classifier).toBe("function");
    expect(classifier?.(routeContext, 55150)).toBe(false);
  });
});

describe("currentRoutePath", () => {
  it("keeps the browser location when Steam's shared context does not expose Router", () => {
    const host = globalThis as Record<string, unknown>;
    const originalRouter = host.Router;
    const originalWindow = host.window;
    delete host.Router;
    host.window = { location: { pathname: "/routes/library/app/55150", search: "?tab=GameInfo", hash: "#activity" } };
    try {
      expect(core.currentRoutePath()).toContain("/routes/library/app/55150");
      expect(core.isCurrentGameDetailRoute(core.currentRoutePath(), 55150)).toBe(true);
    } finally {
      if (originalRouter === undefined) delete host.Router;
      else host.Router = originalRouter;
      if (originalWindow === undefined) delete host.window;
      else host.window = originalWindow;
    }
  });
});
