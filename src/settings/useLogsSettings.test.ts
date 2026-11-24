import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const deps = vi.hoisted(() => ({
  getDebugLogging: vi.fn<() => Promise<boolean>>(),
  setDebugLogging: vi.fn<(value: boolean) => Promise<boolean>>(),
  getPluginLogs: vi.fn<() => Promise<string>>(),
  setVerboseLogging: vi.fn(), showModal: vi.fn(), toastError: vi.fn(),
}));
vi.mock("react", () => ({
  // Slots persist across calls like React state; mount() clears them, render() reuses them.
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values.push(initial);
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock("../backend", () => deps);
vi.mock("../log", () => ({ setVerboseLogging: deps.setVerboseLogging, info: vi.fn(), warn: vi.fn() }));
vi.mock("@decky/ui", () => ({ showModal: deps.showModal }));
vi.mock("../components/qam/PluginLogModal", () => ({ PluginLogModal: "PluginLogModal" }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));
vi.mock("../toast", () => ({ toastError: deps.toastError }));

import { useLogsSettings } from "./useLogsSettings";

const mount = () => {
  state.values = []; state.effects = []; state.cursor = 0;
  useLogsSettings();
  state.effects.forEach((effect) => effect());
};
const render = () => {
  state.cursor = 0;
  return useLogsSettings();
};
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

afterEach(() => { vi.clearAllMocks(); state.values = []; state.effects = []; });

describe("useLogsSettings", () => {
  it("keeps debug logging not loaded until its setting loads, then applies it", async () => {
    let resolve!: (value: boolean) => void;
    deps.getDebugLogging.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount();
    expect(render().debugLoggingLoaded).toBe(false);

    resolve(true);
    await flush();

    expect(render()).toMatchObject({ debugLogging: true, debugLoggingLoaded: true });
    expect(deps.setVerboseLogging).toHaveBeenCalledWith(true);
  });

  it("saves a toggle and applies the saved value to verbose logging", async () => {
    deps.getDebugLogging.mockResolvedValue(false);
    deps.setDebugLogging.mockResolvedValue(true);
    mount();
    await flush();

    await render().onToggleDebugLogging(true);

    expect(deps.setDebugLogging).toHaveBeenCalledWith(true);
    expect(deps.setVerboseLogging).toHaveBeenLastCalledWith(true);
    expect(render().debugLogging).toBe(true);
  });
});
