/// <reference lib="es2024.promise" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNoCors } from "@decky/api";

const fixtures = vi.hoisted(() => ({
  native: new Map<number, { appid: number; app_type: number; display_name: string }>(),
  metadataCache: {} as Record<string, { steam_appid: number }>,
}));
vi.mock("@decky/api", () => ({ fetchNoCors: vi.fn() }));
vi.mock("../steam/core", () => ({
  getNativeOverview: (id: number) => fixtures.native.get(id) ?? null,
  isNativeNonSteamShortcut: (overview: { app_type: number }) => overview.app_type === 1073741824,
  metadataCache: fixtures.metadataCache,
}));

import { resetProtonDbAppIdResolution, resolveProtonDbAppId } from "./identity";

const shortcutId = 3015223078;
const native = (name: string, id = shortcutId) => {
  const overview = { appid: id, app_type: 1073741824, display_name: name };
  fixtures.native.set(id, overview);
  return overview;
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const steamGame = (name: string, id: number) => response({ items: [{ type: "app", name, id }] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchNoCors).mockReset();
  fixtures.native.clear();
  Object.keys(fixtures.metadataCache).forEach(key => delete fixtures.metadataCache[key]);
  resetProtonDbAppIdResolution();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("fork-aligned ProtonDB identity", () => {
  it("keeps native Steam identity direct rather than resolving a saved metadata alias", async () => {
    const overview = { appid: 620, app_type: 1, display_name: "Portal 2" };
    fixtures.native.set(620, overview);
    fixtures.metadataCache["620"] = { steam_appid: 570 };
    vi.mocked(fetchNoCors).mockRejectedValue(new Error("No name request is valid for this native Steam game"));
    expect(await resolveProtonDbAppId(620, overview)).toBe(620);
    expect(fetchNoCors).not.toHaveBeenCalled();
  });

  it("uses the fork's normalized title and marker matching instead of a saved pin", async () => {
    const overview = native("Assassin's Creed: Director's Cut");
    fixtures.metadataCache[String(shortcutId)] = { steam_appid: 570 };
    vi.mocked(fetchNoCors).mockResolvedValue(response({ items: [
      { type: "app", name: "Assassin's Creed: Director's Cut Edition Demo", id: 100 },
      { type: "app", name: "Assassin's Creed™: Director's Cut Edition", id: 15100 },
    ] }));
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBe(15100);
  });

  it("finds a delisted shortcut through the exact Steam-first Algolia fallback", async () => {
    const overview = native("TRANSFORMERS: Devastation");
    vi.mocked(fetchNoCors)
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ hits: [
        { name: "TRANSFORMERS: Devastation Demo", objectID: "123" },
        { name: "TRANSFORMERS: Devastation", objectID: "338930" },
      ] }));
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBe(338930);
    const [steamRequest, algoliaRequest] = vi.mocked(fetchNoCors).mock.calls;
    expect(new URL(steamRequest[0]).searchParams.get("term")).toBe(overview.display_name);
    expect(new URL(steamRequest[0]).searchParams.get("l")).toBe("english");
    expect(JSON.parse(String(algoliaRequest[1]?.body))).toMatchObject({
      query: overview.display_name, restrictSearchableAttributes: ["name"], facetFilters: [["appType:Game"]],
    });
  });

  it.each(["transport", "invalid-json", "malformed-items", "http-error"])("does not bypass Steam %s failure with a second provider", async failure => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const overview = native("TRANSFORMERS: Devastation");
    if (failure === "transport") vi.mocked(fetchNoCors).mockRejectedValue(new Error("offline"));
    else if (failure === "invalid-json") vi.mocked(fetchNoCors).mockResolvedValue(new Response("not JSON"));
    else if (failure === "malformed-items") vi.mocked(fetchNoCors).mockResolvedValue(response({ items: null }));
    else vi.mocked(fetchNoCors).mockResolvedValue(response({}, 503));
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBeNull();
    expect(fetchNoCors).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER])( "rejects a noncanonical Steam source ID %s", async id => {
    const overview = native("Hades");
    vi.mocked(fetchNoCors).mockResolvedValue(steamGame("Hades", id));
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBeNull();
  });

  it("rejects a stale overview rather than searching another game's name", async () => {
    const overview = native("Hades");
    expect(await resolveProtonDbAppId(shortcutId, { ...overview, appid: shortcutId + 1 })).toBeNull();
    expect(fetchNoCors).not.toHaveBeenCalled();
  });

  it("deduplicates simultaneous requests but resolves a renamed shortcut again", async () => {
    const overview = native("Hades");
    vi.mocked(fetchNoCors).mockResolvedValueOnce(steamGame("Hades", 1145360));
    expect(await Promise.all([resolveProtonDbAppId(shortcutId, overview), resolveProtonDbAppId(shortcutId, overview)])).toEqual([1145360, 1145360]);
    expect(fetchNoCors).toHaveBeenCalledTimes(1);
    overview.display_name = "Brotato";
    vi.mocked(fetchNoCors).mockResolvedValueOnce(steamGame("Brotato", 1942280));
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBe(1942280);
  });

  it("does not let an old lifecycle replace a new resolution", async () => {
    const overview = native("Hades");
    const pending = Promise.withResolvers<Response>();
    vi.mocked(fetchNoCors).mockImplementationOnce(() => pending.promise);
    const old = resolveProtonDbAppId(shortcutId, overview);
    resetProtonDbAppIdResolution();
    vi.mocked(fetchNoCors).mockResolvedValueOnce(steamGame("Hades", 1145360));
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBe(1145360);
    pending.resolve(steamGame("Hades", 123));
    expect(await old).toBeNull();
    expect(await resolveProtonDbAppId(shortcutId, overview)).toBe(1145360);
  });
});
