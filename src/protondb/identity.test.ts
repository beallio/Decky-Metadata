import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ afterPatch: vi.fn(), findInReactTree: vi.fn() }));

import type { MetadataData } from "../types";
import { isNativeNonSteamShortcut, metadataCache, NON_STEAM_APP_TYPE } from "../steam/core";
import { resolveProtonDbAppId } from "./identity";

const displayedAppId = 3_015_223_078;
const nativeOverview = (appid: number) => ({ appid, app_type: NON_STEAM_APP_TYPE });

const saveMatch = (appId: number, value: unknown) => {
  const record: MetadataData = {
    title: "Shortcut", id: "fixture", description: "", store_categories: [],
    steam_dlc_appids: [], has_points_shop: false,
  };
  // Model an unvalidated persisted field without weakening production types.
  Object.defineProperty(record, "steam_appid", { value, configurable: true });
  metadataCache[String(appId)] = record;
};

afterEach(() => {
  delete metadataCache[String(displayedAppId)];
  delete metadataCache["620"];
});

describe("resolveProtonDbAppId", () => {
  it("resolves a saved positive Steam ID only for the exact native shortcut overview", () => {
    saveMatch(displayedAppId, "570");
    const overview = nativeOverview(displayedAppId);

    expect(isNativeNonSteamShortcut(overview)).toBe(true);
    expect(resolveProtonDbAppId(displayedAppId, overview)).toBe(570);
  });

  it("uses the displayed ID for an exact official Steam overview", () => {
    saveMatch(620, 570);
    const officialOverview = { appid: 620, app_type: 1 };

    expect(isNativeNonSteamShortcut(officialOverview)).toBe(false);
    expect(resolveProtonDbAppId(620, officialOverview)).toBe(620);
  });

  it("hides an unmatched native shortcut", () => {
    expect(resolveProtonDbAppId(displayedAppId, nativeOverview(displayedAppId))).toBeNull();
  });

  it("rejects stale or non-exact overview identity", () => {
    saveMatch(displayedAppId, 570);

    expect(resolveProtonDbAppId(displayedAppId, nativeOverview(displayedAppId + 1))).toBeNull();
    expect(resolveProtonDbAppId(displayedAppId, { ...nativeOverview(displayedAppId), appid: String(displayedAppId) })).toBeNull();
    expect(resolveProtonDbAppId(displayedAppId, null)).toBeNull();
    expect(resolveProtonDbAppId(0, nativeOverview(displayedAppId))).toBeNull();

    expect(resolveProtonDbAppId(displayedAppId, { appid: displayedAppId, app_type: "0" })).toBeNull();
  });

  it.each([
    ["zero", 0],
    ["negative", -570],
    ["unsafe range", 0x80000000],
    ["whitespace", " 570"],
    ["decimal", "570.0"],
    ["exponent", "5.7e2"],
    ["nondigit", "570x"],
    ["boolean", true],
    ["null", null],
  ])("rejects malformed saved Steam IDs (%s)", (_label, value) => {
    saveMatch(displayedAppId, value);
    expect(resolveProtonDbAppId(displayedAppId, nativeOverview(displayedAppId))).toBeNull();
  });
});
