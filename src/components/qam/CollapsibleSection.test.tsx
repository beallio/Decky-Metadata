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
vi.mock("@decky/ui", () => ({
  Focusable: "Focusable",
  PanelSection: "PanelSection",
}));

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

  it("hides controls while closed and unmounts them again after closing", () => {
    const closed = render("Metadata");
    expect(header(closed).props["aria-expanded"]).toBe(false);
    expect(children(region(closed)).some(node => node.type === "span")).toBe(false);

    header(closed).props.onActivate();
    const open = render("Metadata");
    expect(header(open).props["aria-expanded"]).toBe(true);
    expect(children(region(open)).some(node => node.type === "span")).toBe(true);

    header(open).props.onActivate();
    const closedAgain = render("Metadata");
    expect(header(closedAgain).props["aria-expanded"]).toBe(false);
    expect(children(region(closedAgain)).some(node => node.type === "span")).toBe(false);
  });

  it("starts Versions open and allows its controls to be closed", () => {
    const open = render("Versions", true);
    expect(header(open).props["aria-expanded"]).toBe(true);
    expect(children(region(open)).some(node => node.type === "span")).toBe(true);
    header(open).props.onActivate();
    const closed = render("Versions", true);
    expect(header(closed).props["aria-expanded"]).toBe(false);
    expect(children(region(closed)).some(node => node.type === "span")).toBe(false);
  });

  it("uses the old heading look with the tint driven by Steam's gamepad focus class", () => {
    const tree = render("Metadata");
    expect(header(tree).props.className).toBe("decky-metadata-qam-section-heading");
    // An inline colour would beat the .gpfocus rule, so the look must stay in the stylesheet.
    expect(header(tree).props.style).toBeUndefined();
    expect(children(tree).find(node => node.type === "style").props.children)
      .toMatch(/\.decky-metadata-qam-section-heading\.gpfocus \{\s*background: rgba\(102, 182, 236, 0\.18\);\s*color: #fff;/);

    const scrollIntoView = vi.fn();
    const fakeHeading = {
      isConnected: true,
      scrollIntoView,
      ownerDocument: { defaultView: { requestAnimationFrame: (cb: () => void) => cb() } },
    };
    header(tree).props.onGamepadFocus({ currentTarget: fakeHeading });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});
