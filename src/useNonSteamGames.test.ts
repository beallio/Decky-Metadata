import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const steam = vi.hoisted(() => ({ allNonSteamGames: vi.fn() }));
vi.mock("react", () => ({
  // Slots persist across calls like React state; mount() clears them, render() reuses them.
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values.push(initial);
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock("./steam", () => steam);

import { loadNonSteamGames, useNonSteamGames } from "./useNonSteamGames";

const mount = () => {
  state.values = []; state.effects = []; state.cursor = 0;
  useNonSteamGames();
  state.effects.forEach((effect) => effect());
};
const render = () => {
  state.cursor = 0;
  return useNonSteamGames();
};
const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };

describe("useNonSteamGames", () => {
  it("shows the last loaded list at once when the QAM page mounts again, then refreshes it", async () => {
    const first = [{ appid: 1, name: "One" }];
    steam.allNonSteamGames.mockResolvedValueOnce(first);
    mount();
    await flush();
    expect(render()).toMatchObject({ games: first, loaded: true });

    const second = [...first, { appid: 2, name: "Two" }];
    let resolve!: (games: unknown) => void;
    steam.allNonSteamGames.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    mount();
    expect(render()).toMatchObject({ games: first, loaded: false });

    resolve(second);
    await flush();
    expect(render()).toMatchObject({ games: second, loaded: true });
  });

  it("gives the startup preload and a QAM mount the same list while one load is running", async () => {
    const preloaded = [{ appid: 3, name: "Three" }];
    let resolve!: (games: unknown) => void;
    steam.allNonSteamGames.mockClear().mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const preload = loadNonSteamGames();
    mount();

    resolve(preloaded);
    await flush();
    expect(steam.allNonSteamGames).toHaveBeenCalledTimes(1);
    await expect(preload).resolves.toBe(preloaded);
    expect(render()).toMatchObject({ games: preloaded, loaded: true });
  });
});
