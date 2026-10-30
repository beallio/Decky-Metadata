/// <reference lib="es2024.promise" />
import { describe, expect, it, vi } from "vitest";

vi.mock("../backend", () => ({ getHltbStats: vi.fn() }));

import type { HltbEntry, HltbStatsResult } from "../backend";
import { HLTB_MATCHED_TTL_MS, HltbStore, type HltbInputs } from "./store";

const now = 1_800_000_000_000;
const inputs: HltbInputs = { steam: 620, title: "Portal 2", pinned: null };
const entry = (changes: Partial<HltbEntry> = {}): HltbEntry => ({
  status: "matched", hltb_id: 7231, game_name: "Portal 2", stats: { main: 1, plus: 2, complete: 3, all: 4 },
  steam_appid_used: 620, title_used: "Portal 2", pinned_id_used: null, fetched_at: now - 1000, ...changes,
});
const deferred = () => Promise.withResolvers<HltbStatsResult>();
const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

describe("HltbStore", () => {
  it("shows fresh saved times without a request and old ones while asking for a refresh", () => {
    const store = new HltbStore(vi.fn());
    store.seed({ "620": entry(), "570": entry({ steam_appid_used: 570, fetched_at: now - HLTB_MATCHED_TTL_MS }) });
    expect(store.view(620, inputs, now)).toEqual({ entry: entry(), needsFetch: false });
    const expired = store.view(570, { ...inputs, steam: 570 }, now);
    expect(expired.entry?.hltb_id).toBe(7231);
    expect(expired.needsFetch).toBe(true);
  });

  it("never shows a saved game for other inputs", () => {
    const store = new HltbStore(vi.fn());
    store.seed({ "620": entry() });
    for (const changed of [{ ...inputs, steam: 570 }, { ...inputs, title: "Portal" }, { ...inputs, pinned: 42 }]) {
      expect(store.view(620, changed, now)).toEqual({ entry: null, needsFetch: true });
    }
  });

  it("sends one lookup per game at a time and stores the result", async () => {
    const pending = deferred();
    const fetch = vi.fn(() => pending.promise);
    const store = new HltbStore(fetch);
    const listener = vi.fn();
    store.subscribe(620, listener);
    store.request(620, false, inputs, now);
    store.request(620, false, inputs, now);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(620, false, "Portal 2");
    pending.resolve(entry({ fetched_at: now }));
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.view(620, inputs, now).entry?.fetched_at).toBe(now);
  });

  it("waits after a failed lookup and stops asking for a removed game until its inputs change", async () => {
    const fetch = vi.fn<(...args: unknown[]) => Promise<HltbStatsResult>>()
      .mockResolvedValueOnce({ status: "error", retry_after_ms: 60_000 })
      .mockResolvedValueOnce({ status: "blocked" });
    const store = new HltbStore(fetch);
    store.request(620, false, inputs, now);
    await settle();
    store.request(620, false, inputs, Date.now());
    expect(fetch).toHaveBeenCalledTimes(1);
    store.request(621, true, inputs, now);
    await settle();
    expect(store.view(621, inputs, now)).toEqual({ entry: null, needsFetch: false });
    expect(store.view(621, { ...inputs, pinned: 42 }, now).needsFetch).toBe(true);
  });

  it("stops showing a cached title match after Remove metadata", async () => {
    const fetch = vi.fn<(...args: unknown[]) => Promise<HltbStatsResult>>().mockResolvedValue({ status: "blocked" });
    const store = new HltbStore(fetch);
    const titleOnly = { steam: null, title: "Hades", pinned: null };
    store.seed({ "3000000002": entry({ steam_appid_used: null, title_used: "Hades" }) });
    expect(store.view(3000000002, titleOnly, now).entry?.hltb_id).toBe(7231);
    store.forget(3000000002);
    expect(store.view(3000000002, titleOnly, now)).toEqual({ entry: null, needsFetch: true });
    store.request(3000000002, true, titleOnly, now);
    await settle();
    expect(store.view(3000000002, titleOnly, now)).toEqual({ entry: null, needsFetch: false });
  });

  it("ignores a lookup that finishes after a reset", async () => {
    const pending = deferred();
    const store = new HltbStore(vi.fn(() => pending.promise));
    store.request(620, false, inputs, now);
    store.reset();
    pending.resolve(entry());
    await settle();
    expect(store.view(620, inputs, now).entry).toBeNull();
  });
});
