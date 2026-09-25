import { describe, expect, it } from "vitest";

import { resolveTrailerSource } from "./source";

const nativeGame = { appid: 55150, app_type: 1 };
const shortcut = { appid: 0x80000010, app_type: 1073741824 };
const root = (appId: number) => `/routes/library/app/${appId}`;

describe("resolveTrailerSource", () => {
  it("uses a native game's own id after route and hero agreement", () => {
    expect(resolveTrailerSource({
      route: root(55150), heroAppId: 55150, overview: nativeGame, metadata: null, hydrated: true,
    })).toEqual({ pageAppId: 55150, sourceAppId: 55150, kind: "steam" });
  });

  it("uses a saved Steam match for a native shortcut and keeps its page id", () => {
    expect(resolveTrailerSource({
      route: root(0x80000010), heroAppId: 0x80000010, overview: shortcut,
      metadata: { steam_appid: 55150 }, hydrated: true,
    })).toEqual({ pageAppId: 0x80000010, sourceAppId: 55150, kind: "shortcut" });
  });

  it.each([
    ["unmatched shortcut", { steam_appid: null }],
    ["malformed id", { steam_appid: "not-an-id" }],
    ["shortcut-domain source id", { steam_appid: 0x80000010 }],
  ])("rejects %s", (_name, metadata) => {
    expect(resolveTrailerSource({
      route: root(0x80000010), heroAppId: 0x80000010, overview: shortcut, metadata, hydrated: true,
    })).toBeNull();
  });

  it.each([
    ["a record before cache hydration", { route: root(0x80000010), heroAppId: 0x80000010,
      overview: shortcut, metadata: { steam_appid: 55150 }, hydrated: false }],
    ["a stale hero", { route: root(55150), heroAppId: 55151, overview: nativeGame,
      metadata: null, hydrated: true }],
    ["another app's hero", { route: root(55150), heroAppId: 55151, overview: nativeGame,
      metadata: null, hydrated: true }],
    ["a detail subpage", { route: `${root(55150)}/activity`, heroAppId: 55150,
      overview: nativeGame, metadata: null, hydrated: true }],
    ["Game Info tab", { route: `${root(55150)}?tab=GameInfo`, heroAppId: 55150,
      overview: nativeGame, metadata: null, hydrated: true }],
    ["Home", { route: "/routes/library/home", heroAppId: 55150,
      overview: nativeGame, metadata: null, hydrated: true }],
    ["a collection grid", { route: "/routes/library/collection/Favorites", heroAppId: 55150,
      overview: nativeGame, metadata: null, hydrated: true }],
    ["the store", { route: "/routes/store/app/55150", heroAppId: 55150,
      overview: nativeGame, metadata: null, hydrated: true }],
    ["the editor", { route: "/decky-metadata/55150", heroAppId: 55150,
      overview: nativeGame, metadata: null, hydrated: true }],
  ])("rejects %s", (_name, context) => {
    expect(resolveTrailerSource(context)).toBeNull();
  });

  it("does not treat a patched official overview as a native shortcut", () => {
    expect(resolveTrailerSource({
      route: root(55150), heroAppId: 55150,
      overview: { appid: 55150, app_type: 1073741824 }, metadata: { steam_appid: 55151 }, hydrated: true,
    })).toBeNull();
  });
});
