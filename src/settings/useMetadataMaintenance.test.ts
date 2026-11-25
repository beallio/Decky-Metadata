import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameOption } from "../types";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const deps = vi.hoisted(() => ({
  clearMetadataCache: vi.fn(),
  getDelistedIndexStatus: vi.fn(),
  refreshDelistedIndex: vi.fn(),
  busy: false,
  calls: [] as string[],
  refreshCounts: vi.fn(),
  start: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  hltbReset: vi.fn(),
}));
vi.mock("react", () => ({
  // Slots persist across calls like React state; mount() clears them, render() reuses them.
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values.push(initial);
    return [state.values[index], (value: unknown) => {
      state.values[index] = typeof value === "function" ? (value as (old: unknown) => unknown)(state.values[index]) : value;
    }];
  },
  useEffect: (effect: () => void) => state.effects.push(effect),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("../backend", () => ({
  clearMetadataCache: deps.clearMetadataCache,
  getDelistedIndexStatus: deps.getDelistedIndexStatus,
  refreshDelistedIndex: deps.refreshDelistedIndex,
}));
vi.mock("../metadataScan", () => ({
  metadataScanStore: {
    getSnapshot: () => ({ busy: deps.busy }),
    refreshCounts: deps.refreshCounts,
    start: deps.start,
  },
}));
vi.mock("../hltb/store", () => ({ hltbStore: { reset: deps.hltbReset } }));
vi.mock("../toast", () => ({ toastSuccess: deps.toastSuccess, toastError: deps.toastError }));
vi.mock("../log", () => ({ warn: vi.fn() }));
vi.mock("../i18n", () => ({
  currentSteamLanguage: vi.fn(),
  formatDate: () => "2026-11-23",
  formatNumber: (value: number) => String(value),
  translateBackendError: (error: unknown) => `translated:${error instanceof Error ? error.message : String(error)}`,
  useT: () => (key: string) => key,
}));

import { useMetadataMaintenance } from "./useMetadataMaintenance";

const games = [{ appid: 1, name: "Game" }] as unknown as GameOption[];
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const mount = (loaded = true) => {
  state.values = []; state.effects = []; state.cursor = 0;
  const hook = useMetadataMaintenance(games, loaded);
  state.effects.forEach((effect) => effect());
  return hook;
};
// Re-run the hook on the current state slots, as a React re-render would.
const render = () => {
  state.cursor = 0;
  return useMetadataMaintenance(games, true);
};

afterEach(() => {
  vi.clearAllMocks();
  deps.busy = false;
  deps.calls = [];
});

describe("useMetadataMaintenance", () => {
  it("ignores Clear cache while a metadata scan runs", async () => {
    deps.getDelistedIndexStatus.mockResolvedValue(null);
    deps.busy = true;
    await mount().onClearCache();
    expect(deps.clearMetadataCache).not.toHaveBeenCalled();
  });

  it("ignores Clear cache until the fresh game list loads, so the rescan never uses an old list", async () => {
    deps.getDelistedIndexStatus.mockResolvedValue(null);
    await mount(false).onClearCache();
    expect(deps.clearMetadataCache).not.toHaveBeenCalled();
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("clears, refreshes the shared counts, then starts a new scan", async () => {
    deps.getDelistedIndexStatus.mockResolvedValue(null);
    deps.clearMetadataCache.mockImplementation(async () => { deps.calls.push("clear"); });
    deps.refreshCounts.mockImplementation(async () => { deps.calls.push("refreshCounts"); });
    deps.start.mockImplementation(async () => { deps.calls.push("start"); });

    await mount().onClearCache();

    expect(deps.calls).toEqual(["clear", "refreshCounts", "start"]);
    expect(deps.refreshCounts).toHaveBeenCalledWith(games);
    expect(deps.hltbReset).toHaveBeenCalledOnce();
    expect(deps.toastSuccess).toHaveBeenCalledOnce();
    expect(render().cacheBusy).toBe(false);
  });

  it("shows a busy backend error and starts no scan", async () => {
    deps.getDelistedIndexStatus.mockResolvedValue(null);
    deps.clearMetadataCache.mockRejectedValue(new Error("metadata_scan_busy"));

    await mount().onClearCache();

    expect(deps.toastError).toHaveBeenCalledWith("panel.toast.cacheClearFailed", "translated:metadata_scan_busy");
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("loads the delisted status on mount and after a refresh", async () => {
    deps.getDelistedIndexStatus.mockResolvedValueOnce({ count: 0, fetched_at: 0 })
      .mockResolvedValueOnce({ count: 42, fetched_at: 1795400000 });
    deps.refreshDelistedIndex.mockResolvedValue({ ok: true });
    mount();
    await flush();
    expect(render().delistedCountText).toBe("panel.delistedNotDownloaded");

    await render().onRefreshDelisted();

    expect(render()).toMatchObject({ delistedCountText: "panel.delistedCount", delistedDateText: "panel.delistedLastUpdated" });
  });
});
