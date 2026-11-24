import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  effects: [] as { effect: () => void; deps: unknown[] }[],
  previous: new Map<number, unknown[]>(),
}));
const mocks = vi.hoisted(() => ({
  games: { games: [] as unknown[], loaded: false, loadGames: vi.fn() },
  snapshot: { completedRevision: 0 },
  refreshCounts: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (effect: () => void, deps: unknown[]) => state.effects.push({ effect, deps }),
}));
vi.mock("../useNonSteamGames", () => ({ useNonSteamGames: () => mocks.games }));
vi.mock("../metadataScan", () => ({
  metadataScanStore: { refreshCounts: mocks.refreshCounts },
  useMetadataScan: () => mocks.snapshot,
}));
vi.mock("../log", () => ({ warn: mocks.warn }));

import { useScanGames } from "./useScanGames";

// Render, then run only effects whose dependencies changed since the last render, as React does.
const render = () => {
  state.effects = [];
  const result = useScanGames();
  state.effects.forEach(({ effect, deps }, index) => {
    const old = state.previous.get(index);
    if (!old || deps.some((dep, i) => dep !== old[i])) effect();
    state.previous.set(index, deps);
  });
  return result;
};
const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };

afterEach(() => {
  vi.clearAllMocks();
  state.previous.clear();
  mocks.games = { games: [], loaded: false, loadGames: vi.fn() };
  mocks.snapshot = { completedRevision: 0 };
});

describe("useScanGames", () => {
  it("counts only after the games list loads, and logs a failed count instead of rejecting", async () => {
    mocks.refreshCounts.mockRejectedValue(new Error("cache unavailable"));
    render();
    expect(mocks.refreshCounts).not.toHaveBeenCalled();

    const games = [{ appid: 1, name: "Game" }];
    mocks.games = { ...mocks.games, games, loaded: true };
    render();
    await flush();

    expect(mocks.refreshCounts).toHaveBeenCalledExactlyOnceWith(games);
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it("reloads the games list after each finished scan", () => {
    mocks.refreshCounts.mockResolvedValue(undefined);
    mocks.games = { ...mocks.games, loaded: true };
    render();
    expect(mocks.games.loadGames).not.toHaveBeenCalled();

    mocks.snapshot = { completedRevision: 1 };
    render();

    expect(mocks.games.loadGames).toHaveBeenCalledOnce();
  });
});
