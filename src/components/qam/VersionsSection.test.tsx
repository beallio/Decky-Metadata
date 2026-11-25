import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DialogControlsSection: "DialogControlsSection",
  Field: "Field",
}));
vi.mock("../../styles", () => ({ compactTextStyle: {} }));
// Components are invoked as plain functions here, so the i18n hook is replaced by non-React `t`.
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useT: () => actual.t };
});

import { VersionsBody } from "./VersionsSection";

const text = (node: any): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
};
type TestNode = { type?: unknown; props?: Record<string, unknown> };
type FieldNode = TestNode & { type: "Field"; props: Record<string, unknown> };

const nodes = (node: unknown): TestNode[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== "object") return [];
  const element = node as TestNode;
  return [element, ...nodes(element.props?.children)];
};

const fields = (tree: unknown): FieldNode[] =>
  nodes(tree).filter((node): node is FieldNode => node.type === "Field" && node.props !== undefined);

describe("VersionsBody", () => {
  const render = (controllerTypes: number[]) => VersionsBody({
    pluginVersion: "0.3.0",
    deckyVersion: "3.0",
    steamosVersion: "3.5",
    controllerTypes,
  });

  it("renders each version value in its own labeled Field", () => {
    const items = fields(render([]));
    expect(items.map(({ props }) => props.label)).toEqual([
      "Decky Metadata",
      "Decky",
      "SteamOS",
      "Controller Types",
    ]);
    expect(items.map(({ props }) => text(props.children))).toEqual([
      "0.3.0",
      "3.0",
      "3.5",
      "Unknown",
    ]);
  });

  it("renders deterministic sorted controller types in the controller Field", () => {
    expect(text(fields(render([102, 4, 1, 102]))[3].props.children))
      .toBe("Type 1, Steam Deck (4), Legion Go S (102)");
  });

  it("renders known labels for Legion Go S", () => {
    expect(text(fields(render([102]))[3].props.children)).toBe("Legion Go S (102)");
  });

  it("renders unknown controller types as numeric labels", () => {
    expect(text(fields(render([999]))[3].props.children)).toBe("Type 999");
  });

  it("renders Unknown when no controller data is available", () => {
    expect(text(fields(render([]))[3].props.children)).toBe("Unknown");
  });
});
