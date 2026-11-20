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

    // Shaped like Steam's v0 factory in older clients: its source names both virtual-keyboard hooks.
    const olderFactory = () => {
      "virtualKeyboardProps BIsElementValidForInput";
    };
    // Newer clients moved BIsElementValidForInput into a helper; the factory keeps its forwardRef.
    const newerFactory = () => {
      "n.forwardRef(function(z,p){const{virtualKeyboardProps:C,props:{refKeyboardHandle:k}}=g(z)})";
    };
    // The newer props-splitting helper names both hooks but returns a plain object, not a component.
    const propsHelper = () => {
      "const{BIsElementValidForInput:s,...c}=e;return{virtualKeyboardProps:{BIsElementValidForInput:s},props:c}";
    };
    // A different factory (e.g. the non-input element factory) lacks them.
    const otherFactory = () => {
      "bDOMElementFocusByDefault forwardRef";
    };

    expect(predicate(olderFactory)).toBe(true);
    expect(predicate(newerFactory)).toBe(true);
    expect(predicate(propsHelper)).toBe(false);
    expect(predicate(otherFactory)).toBe(false);
    expect(predicate("not-a-function")).toBe(false);
  });

  it("returns null when the factory yields something React cannot render", async () => {
    mocks.findModuleExport.mockReturnValue(() => ({ virtualKeyboardProps: {}, props: {} }));

    const { getGamepadTextArea } = await loadFresh();

    expect(getGamepadTextArea()).toBeNull();
  });

  it("accepts a forwardRef component object", async () => {
    const component = { $$typeof: Symbol.for("react.forward_ref"), render: () => null };
    mocks.findModuleExport.mockReturnValue(() => component);

    const { getGamepadTextArea } = await loadFresh();

    expect(getGamepadTextArea()).toBe(component);
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
