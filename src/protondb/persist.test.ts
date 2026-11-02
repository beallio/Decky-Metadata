import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../backend", () => ({ putProtonDbCache: vi.fn() }));

import { ProtonDbCacheWriter } from "./persist";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ProtonDbCacheWriter", () => {
  it("sends changes from one second in a single save, newest value per game", async () => {
    const put = vi.fn(async () => ({ ok: true }));
    const writer = new ProtonDbCacheWriter(put, 1_000);
    writer.rating(570, "gold", 1);
    writer.rating(570, "silver", 2);
    writer.name(3015223078, "Hades", 1145360, 3);
    await vi.advanceTimersByTimeAsync(999);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(put.mock.calls).toEqual([[
      { "570": { tier: "silver", updated_at: 2 } },
      { "3015223078": { name: "Hades", steam_appid: 1145360, resolved_at: 3 } },
    ]]);
  });

  it("saves pending changes immediately on flush and sends nothing when empty", () => {
    const put = vi.fn(async () => ({ ok: true }));
    const writer = new ProtonDbCacheWriter(put, 1_000);
    writer.flush();
    writer.rating(10, null, 5);
    writer.flush();

    expect(put.mock.calls).toEqual([[{ "10": { tier: null, updated_at: 5 } }, {}]]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
