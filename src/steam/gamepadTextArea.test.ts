import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findModuleExport: vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: mocks.findModuleExport }));

// gamepadTextArea caches its resolution at module scope, so reload the module
// per test to exercise a fresh resolve.
async function loadFresh() {
  vi.resetModules();
  return import("./gamepadTextArea");
}

afterEach(() => {
  mocks.findModuleExport.mockReset();
});

describe("getGamepadTextArea", () => {
  it("builds the textarea from Steam's resolved element factory", async () => {
    const component = () => null;
    const factory = vi.fn(() => component);
    mocks.findModuleExport.mockReturnValue(factory);

    const { getGamepadTextArea } = await loadFresh();

    expect(getGamepadTextArea()).toBe(component);
    expect(factory).toHaveBeenCalledWith("textarea");
  });

  it("matches only the factory carrying the virtual-keyboard plumbing", async () => {
    let predicate: (e: any) => boolean = () => false;
    mocks.findModuleExport.mockImplementation((pred: any) => {
      predicate = pred;
      return () => () => null;
    });

    const { getGamepadTextArea } = await loadFresh();
    getGamepadTextArea();

    // Shaped like Steam's v0 factory: its source names both virtual-keyboard hooks.
    const factoryLike = () => {
      "virtualKeyboardProps BIsElementValidForInput";
    };
    // A different factory (e.g. the non-input element factory) lacks them.
    const otherFactory = () => {
      "bDOMElementFocusByDefault";
    };

    expect(predicate(factoryLike)).toBe(true);
    expect(predicate(otherFactory)).toBe(false);
    expect(predicate("not-a-function")).toBe(false);
  });

  it("returns null when no matching module is found", async () => {
    mocks.findModuleExport.mockReturnValue(undefined);

    const { getGamepadTextArea } = await loadFresh();

    expect(getGamepadTextArea()).toBeNull();
  });

  it("returns null (never throws) when resolution fails", async () => {
    mocks.findModuleExport.mockImplementation(() => {
      throw new Error("webpack modules unavailable");
    });

    const { getGamepadTextArea } = await loadFresh();

    expect(getGamepadTextArea()).toBeNull();
  });

  it("resolves once and caches the result", async () => {
    mocks.findModuleExport.mockReturnValue(() => () => null);

    const { getGamepadTextArea } = await loadFresh();
    getGamepadTextArea();
    getGamepadTextArea();

    expect(mocks.findModuleExport).toHaveBeenCalledTimes(1);
  });
});
