import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ fetchNoCors: vi.fn() }));

import { fetchNoCors } from "@decky/api";
import { ProtonDbRatingCache, PROTONDB_RATING_TTL_MS, type ProtonDbTierFetcher } from "./ratings";

const fetchMock = vi.mocked(fetchNoCors);
const caches: ProtonDbRatingCache[] = [];

const newCache = (fetcher?: ProtonDbTierFetcher) => {
  const cache = fetcher ? new ProtonDbRatingCache(fetcher) : new ProtonDbRatingCache();
  caches.push(cache);
  return cache;
};

// Settle Response stream decoding without advancing cache expiry deadlines.
const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0);

const mountEnabled = (cache: ProtonDbRatingCache) => {
  cache.mount();
  cache.setEnabled(true);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  fetchMock.mockReset();
});

afterEach(() => {
  for (const cache of caches.splice(0)) cache.stop();
  vi.useRealTimers();
});

describe("ProtonDbRatingCache", () => {
  it("waits for a mounted enabled cache and ignores invalid app IDs", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tier: "silver" }), { status: 200 }));
    const cache = newCache();
    cache.subscribeRating(0, vi.fn());
    cache.subscribeRating(122, vi.fn());
    expect(fetchMock).not.toHaveBeenCalled();

    cache.mount();
    expect(fetchMock).not.toHaveBeenCalled();
    cache.setEnabled(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flushMicrotasks();

    expect(cache.getRating(122)).toMatchObject({ tier: "silver", status: "ready" });
  });

  it("loads one summary for duplicate visible subscriptions and returns a stable immutable rating", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tier: "gold" }), { status: 200 }));
    const cache = newCache();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    mountEnabled(cache);

    cache.subscribeRating(570, listenerA);
    cache.subscribeRating(570, listenerB);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flushMicrotasks();
    const rating = cache.getRating(570);
    expect(rating).toEqual({ tier: "gold", status: "ready", updatedAt: Date.now() });
    expect(cache.getRating(570)).toBe(rating);
    expect(listenerA).toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalled();
  });

  it("defers an expired inactive rating until the game is viewed again", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ tier: "platinum" }), { status: 200 }));
    const cache = newCache();
    mountEnabled(cache);
    const unsubscribe = cache.subscribeRating(620, vi.fn());
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(PROTONDB_RATING_TTL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    cache.subscribeRating(620, vi.fn());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await flushMicrotasks();
    expect(cache.getRating(620)).toMatchObject({ tier: "platinum", status: "ready" });
  });

  it("updates a visible game's tier when its cached rating expires", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tier: "silver" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tier: "gold" }), { status: 200 }));
    const cache = newCache();
    mountEnabled(cache);
    cache.subscribeRating(620, vi.fn());
    await flushMicrotasks();
    expect(cache.getRating(620).tier).toBe("silver");
    await vi.advanceTimersByTimeAsync(PROTONDB_RATING_TTL_MS);
    expect(cache.getRating(620)).toMatchObject({ tier: "gold", status: "ready" });
  });

  it("preserves the previous tier and timestamp after a refresh failure", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tier: "silver" }), { status: 200 }))
      .mockRejectedValueOnce(new Error("offline"));
    const cache = newCache();
    mountEnabled(cache);
    cache.subscribeRating(440, vi.fn());
    await flushMicrotasks();
    const originalUpdatedAt = cache.getRating(440).updatedAt;

    await vi.advanceTimersByTimeAsync(PROTONDB_RATING_TTL_MS);
    await flushMicrotasks();

    expect(cache.getRating(440)).toEqual({ tier: "silver", status: "error", updatedAt: originalUpdatedAt });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("represents a missing report as a ready null tier rather than Borked", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const cache = newCache();
    mountEnabled(cache);
    cache.subscribeRating(730, vi.fn());
    await flushMicrotasks();

    expect(cache.getRating(730)).toEqual({ tier: null, status: "ready", updatedAt: Date.now() });
    await vi.advanceTimersByTimeAsync(PROTONDB_RATING_TTL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats ProtonDB's pending summary as no rating", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tier: "pending" }), { status: 200 }));
    const cache = newCache();
    mountEnabled(cache);
    cache.subscribeRating(808, vi.fn());
    await flushMicrotasks();

    expect(cache.getRating(808)).toMatchObject({ tier: null, status: "ready" });
  });

  it.each([
    ["server error", () => fetchMock.mockResolvedValue(new Response("{}", { status: 503 }))],
    ["missing tier", () => fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))],
    ["malformed JSON", () => fetchMock.mockResolvedValue(new Response("{", { status: 200 }))],
    [
      "invalid tier",
      () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ tier: "unknown" }), { status: 200 })),
    ],
    ["transport failure", () => fetchMock.mockRejectedValue(new Error("network down"))],
  ])("keeps %s distinct from a Borked rating", async (_label, arrange) => {
    arrange();
    const cache = newCache();
    mountEnabled(cache);
    cache.subscribeRating(911, vi.fn());
    await flushMicrotasks();

    expect(cache.getRating(911)).toEqual({ tier: null, status: "error", updatedAt: null });
  });

  it("times out requests and clears pending work on unload so late responses stay inert", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const cache = newCache();
    mountEnabled(cache);
    const listener = vi.fn();
    cache.subscribeRating(1000, listener);
    const notificationsBeforeUnload = listener.mock.calls.length;

    cache.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(cache.getRating(1000)).toEqual({ tier: null, status: "idle", updatedAt: null });
    resolveFetch(new Response(JSON.stringify({ tier: "bronze" }), { status: 200 }));
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledTimes(notificationsBeforeUnload);
    expect(cache.getRating(1000)).toEqual({ tier: null, status: "idle", updatedAt: null });
  });

  it("rejects the timed-out load without inventing a tier", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
    const cache = newCache();
    mountEnabled(cache);
    cache.subscribeRating(1200, vi.fn());

    await vi.advanceTimersByTimeAsync(5_000);
    expect(cache.getRating(1200)).toEqual({ tier: null, status: "error", updatedAt: null });
  });
});
