import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const deps = vi.hoisted(() => ({
  getEditorHeaderSettings: vi.fn(),
  setEditorHeaderSettings: vi.fn(),
}));
vi.mock("react", () => ({
  // Slots persist across calls like React state; mount() clears them, render() reuses them.
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values.push(initial);
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values.push({ current: initial });
    return state.values[index];
  },
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock("../backend", () => deps);
vi.mock("../i18n", () => ({ translateBackendError: (error: unknown) => `translated:${String(error)}` }));

import { useContextMenuSettings } from "./useContextMenuSettings";

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const mount = () => {
  state.values = []; state.effects = []; state.cursor = 0;
  useContextMenuSettings();
  state.effects.forEach((effect) => effect());
};
const render = () => {
  state.cursor = 0;
  return useContextMenuSettings();
};

afterEach(() => vi.clearAllMocks());

describe("useContextMenuSettings", () => {
  it("loads the settings, saves a toggle, and rolls a failed save back with its error", async () => {
    deps.getEditorHeaderSettings.mockResolvedValue({ gameIcon: false, steamIconFallback: false });
    deps.setEditorHeaderSettings.mockRejectedValue("disk full");
    mount();
    expect(render().settings).toBeNull();
    await flush();
    expect(render().settings).toEqual({ gameIcon: false, steamIconFallback: false });

    render().onChange("gameIcon", true);
    expect(render().settings).toEqual({ gameIcon: true, steamIconFallback: false });
    expect(deps.setEditorHeaderSettings).toHaveBeenCalledWith({ gameIcon: true, steamIconFallback: false });
    await flush();

    expect(render()).toMatchObject({ settings: { gameIcon: false, steamIconFallback: false }, error: "translated:disk full" });
  });

  it("rolls two failed quick toggles back to the saved settings, not to the first unsaved toggle", async () => {
    deps.getEditorHeaderSettings.mockResolvedValue({ gameIcon: false, steamIconFallback: false });
    deps.setEditorHeaderSettings.mockRejectedValue("disk full");
    mount();
    await flush();

    render().onChange("gameIcon", true);
    render().onChange("steamIconFallback", true);
    await flush();

    expect(render().settings).toEqual({ gameIcon: false, steamIconFallback: false });
  });

  it("rolls a failed toggle back to an earlier toggle that saved", async () => {
    deps.getEditorHeaderSettings.mockResolvedValue({ gameIcon: false, steamIconFallback: false });
    deps.setEditorHeaderSettings.mockResolvedValueOnce(undefined).mockRejectedValueOnce("disk full");
    mount();
    await flush();

    render().onChange("gameIcon", true);
    render().onChange("steamIconFallback", true);
    await flush();

    expect(render().settings).toEqual({ gameIcon: true, steamIconFallback: false });
  });
});
