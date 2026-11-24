import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], effects: [] as (() => void)[] }));
const deps = vi.hoisted(() => ({
  getSystemVersions: vi.fn<() => Promise<{ decky?: string; steamos?: string }>>(),
  getConnectedControllerTypes: vi.fn<() => number[]>(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = state.values.length;
    state.values.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock("../backend", () => deps);
vi.mock("../steam", () => ({ getConnectedControllerTypes: deps.getConnectedControllerTypes }));
import { useVersions } from "./useVersions";

afterEach(() => { vi.clearAllMocks(); state.values = []; state.effects = []; });

describe("useVersions", () => {
  it("loads versions and controllers once", async () => {
    deps.getSystemVersions.mockResolvedValue({ decky: "1", steamos: "2" });
    deps.getConnectedControllerTypes.mockReturnValue([3]);
    const result = useVersions();
    state.effects.forEach((effect) => effect());
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(deps.getSystemVersions).toHaveBeenCalledTimes(1);
    expect(deps.getConnectedControllerTypes).toHaveBeenCalledTimes(1);
    expect(state.values).toEqual(["1", "2", [3]]);
    expect(result).toEqual({ deckyVersion: "", steamosVersion: "", controllerTypes: [] });
  });
});
