import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  Field: "Field",
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
}));
vi.mock("../../styles", () => ({ compactTextStyle: {} }));

import { VersionsSection } from "./VersionsSection";

const text = (node: any): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
};

describe("VersionsSection", () => {
  const render = (controllerTypes: number[]) => VersionsSection({
    pluginVersion: "0.3.0",
    deckyVersion: "3.0",
    steamosVersion: "3.5",
    controllerTypes,
  });

  it("renders known Decky metadata and SteamOS version values", () => {
    const tree = render([]);
    const content = text(tree);
    expect(content).toContain("Decky Metadata: 0.3.0");
    expect(content).toContain("Decky: 3.0");
    expect(content).toContain("SteamOS: 3.5");
  });

  it("renders deterministic sorted controller types", () => {
    const output = text(render([102, 4, 1, 102]));
    expect(output).toContain("Controller Types: Type 1, Steam Deck (4), Legion Go S (102)");
  });

  it("renders known labels for Legion Go S", () => {
    const output = text(render([102]));
    expect(output).toContain("Controller Types: Legion Go S (102)");
  });

  it("renders unknown controller types as numeric labels", () => {
    const output = text(render([999]));
    expect(output).toContain("Controller Types: Type 999");
  });

  it("renders Unknown when no controller data is available", () => {
    const output = text(render([]));
    expect(output).toContain("Controller Types: Unknown");
  });
});
