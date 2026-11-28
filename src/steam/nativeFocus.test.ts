import { describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ getFocusNavController: vi.fn(), getGamepadNavigationTrees: vi.fn() }));
vi.mock("@decky/ui", () => ui);
vi.mock("../log", () => ({ warn: vi.fn() }));

import { nativeFocusedElement } from "./nativeFocus";

const controllerFocusing = (element: unknown) => ({
  m_ActiveContext: { m_LastActiveFocusNavTree: { GetLastFocusedNode: () => ({ m_element: element }) } },
});

describe("nativeFocusedElement", () => {
  it("returns Steam's focused element even though it comes from another window", () => {
    // Big Picture's elements fail `instanceof Element` here; anything with `closest` is accepted.
    const element = { closest: () => null };
    ui.getFocusNavController.mockReturnValue(controllerFocusing(element));
    expect(nativeFocusedElement()).toBe(element);
  });

  it("returns null without an active navigation context, a non-element, or a throwing controller", () => {
    ui.getFocusNavController.mockReturnValue({ m_ActiveContext: null, m_LastActiveContext: controllerFocusing({ closest: () => null }).m_ActiveContext });
    expect(nativeFocusedElement()).toBeNull();
    ui.getFocusNavController.mockReturnValue(controllerFocusing({ id: "not an element" }));
    expect(nativeFocusedElement()).toBeNull();
    ui.getFocusNavController.mockImplementation(() => {
      throw new Error("not ready");
    });
    expect(nativeFocusedElement()).toBeNull();
  });
});
