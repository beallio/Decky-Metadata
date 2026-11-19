import { beforeEach, describe, expect, it, vi } from "vitest";

let state: unknown[] = [];
let hookIndex = 0;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useId: () => "section-id",
    useState: (initial: unknown) => {
      const index = hookIndex++;
      if (state.length <= index) state[index] = initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === "function"
          ? (value as (previous: unknown) => unknown)(state[index])
          : value;
      }];
    },
  };
});
vi.mock("@decky/ui", () => ({ Focusable: "Focusable", PanelSection: "PanelSection" }));

import { CollapsibleSection } from "./CollapsibleSection";

const children = (node: any): any[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(children);
  if (typeof node !== "object") return [];
  return [node, ...children(node.props?.children)];
};

const render = (title: string, defaultExpanded = false) => {
  hookIndex = 0;
  return CollapsibleSection({ title, icon: <span />, defaultExpanded, children: <span>Section controls</span> });
};

const header = (tree: any) => children(tree).find(node => node.type === "Focusable");
const region = (tree: any) => children(tree).find(node => node.props?.role === "region");

describe("QAM collapsible sections", () => {
  beforeEach(() => { state = []; hookIndex = 0; });

  it("hides Metadata controls until activation and removes them again when closed", () => {
    const closed = render("Metadata");
    expect(header(closed).props["aria-expanded"]).toBe(false);
    expect(children(region(closed)).some(node => node.type === "PanelSection")).toBe(false);

    header(closed).props.onActivate();
    const open = render("Metadata");
    expect(header(open).props["aria-expanded"]).toBe(true);
    expect(children(region(open)).some(node => node.type === "PanelSection")).toBe(true);

    header(open).props.onActivate();
    const closedAgain = render("Metadata");
    expect(header(closedAgain).props["aria-expanded"]).toBe(false);
    expect(children(region(closedAgain)).some(node => node.type === "PanelSection")).toBe(false);
  });

  it("starts Versions open and allows its controls to be closed", () => {
    const open = render("Versions", true);
    expect(header(open).props["aria-expanded"]).toBe(true);
    expect(children(region(open)).some(node => node.type === "PanelSection")).toBe(true);
    header(open).props.onActivate();
    const closed = render("Versions", true);
    expect(header(closed).props["aria-expanded"]).toBe(false);
    expect(children(region(closed)).some(node => node.type === "PanelSection")).toBe(false);
  });

  it("highlights on gamepad focus/blur even without DOM focus events", () => {
    const initial = render("Metadata");
    expect(header(initial).props.style.background).toBeUndefined();

    const scrollIntoView = vi.fn();
    const fakeHeading = {
      isConnected: true,
      scrollIntoView,
      ownerDocument: { defaultView: { requestAnimationFrame: (cb: () => void) => cb() } },
    };
    header(initial).props.onGamepadFocus({ currentTarget: fakeHeading });
    const focused = render("Metadata");
    expect(header(focused).props.style.background).toBe("rgba(102, 182, 236, 0.18)");
    expect(header(focused).props.style.color).toBe("#fff");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

    header(focused).props.onGamepadBlur();
    const blurred = render("Metadata");
    expect(header(blurred).props.style.background).toBeUndefined();
    expect(header(blurred).props.style.color).toBe("#aeb8c4");
  });
});
