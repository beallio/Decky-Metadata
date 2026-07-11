import { describe, expect, it } from "vitest";
import {
  findChildElements,
  isInfoSectionBoundary,
  isQuickLinksElement,
  isReactElement,
} from "./reactTreeWalk";

const el = (type: any, props: Record<string, any> = {}): any => ({
  $$typeof: Symbol.for("react.element"),
  type,
  props,
});

describe("findChildElements", () => {
  it("finds elements by predicate through nested children arrays", () => {
    const target = el("span", { id: "target" });
    const tree = el("div", { children: [el("div", { children: [target, el("p")] })] });
    const out: any[] = [];
    findChildElements(tree, (n) => n.props?.id === "target", out);
    expect(out).toEqual([target]);
  });

  it("does not descend past a matched element", () => {
    const inner = el("span", { id: "match" });
    const outer = el("div", { id: "match", children: inner });
    const out: any[] = [];
    findChildElements(outer, (n) => n.props?.id === "match", out);
    expect(out).toEqual([outer]);
  });

  // The renderer-wedging hazard: props other than children (e.g. overview,
  // details) reference MobX stores whose keys must never be enumerated during
  // an observer render. The walker must not touch them.
  it("never enumerates non-children props (MobX store safety)", () => {
    let touched = false;
    const observable = new Proxy(
      {},
      {
        ownKeys() { touched = true; return []; },
        get() { touched = true; return undefined; },
        has() { touched = true; return false; },
      }
    );
    const tree = el("div", { overview: observable, details: observable, children: el("span") });
    const out: any[] = [];
    findChildElements(tree, () => false, out);
    expect(touched).toBe(false);
  });

  it("ignores plain objects that are not React elements", () => {
    const target = el("a", { id: "t" });
    const tree = el("div", { children: [{ notAnElement: true }, target] });
    const out: any[] = [];
    findChildElements(tree, (n) => n.props?.id === "t", out);
    expect(out).toEqual([target]);
  });

  it("survives a throwing predicate and keeps walking", () => {
    const target = el("b", { id: "t" });
    const tree = el("div", { children: [el("x"), target] });
    const out: any[] = [];
    findChildElements(
      tree,
      (n) => {
        if (n.type === "x") throw new Error("boom");
        return n.props?.id === "t";
      },
      out
    );
    expect(out).toEqual([target]);
  });

  it("terminates on cyclic children within the node budget", () => {
    const a: any = el("div", {});
    a.props.children = a;
    const out: any[] = [];
    expect(() => findChildElements(a, () => false, out)).not.toThrow();
  });
});

describe("predicates", () => {
  it("isReactElement accepts elements and rejects plain objects", () => {
    expect(isReactElement(el("div"))).toBe(true);
    expect(isReactElement({})).toBe(false);
    expect(isReactElement(null)).toBe(false);
  });

  it("isQuickLinksElement matches the links-row prop signature", () => {
    expect(
      isQuickLinksElement(el(() => null, { overview: {}, details: {}, workshopVisible: false, marketPresence: false }))
    ).toBe(true);
    expect(isQuickLinksElement(el(() => null, { overview: {}, details: {} }))).toBe(false);
  });

  it("isInfoSectionBoundary matches function components with overview+details and skips our wrappers", () => {
    const fn = () => null;
    expect(isInfoSectionBoundary(el(fn, { overview: {}, details: {} }))).toBe(true);
    const wrapped: any = () => null;
    wrapped.__dmQuickLinksWrapper = true;
    expect(isInfoSectionBoundary(el(wrapped, { overview: {}, details: {} }))).toBe(false);
    class C { render() { return null; } }
    (C.prototype as any).isReactComponent = {};
    expect(isInfoSectionBoundary(el(C, { overview: {}, details: {} }))).toBe(false);
  });
});
