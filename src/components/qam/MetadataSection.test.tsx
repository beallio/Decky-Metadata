import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
}));
vi.mock("../../styles", () => ({
  ButtonLabel: "ButtonLabel",
  compactTextStyle: {},
  inlineStatusStyle: () => ({}),
  rowStackStyle: {},
  sectionHeadingStyle: {},
}));
vi.mock("../../tokens", () => ({ space: { md: 8 } }));

import { MetadataSection } from "./MetadataSection";

const refreshDelisted = vi.fn();
const render = (overrides: Partial<Parameters<typeof MetadataSection>[0]> = {}) => MetadataSection({
  detectedCount: 3,
  savedCount: 2,
  missingCount: 1,
  scanBusy: false,
  scanMessage: "",
  scanStatusKind: "idle",
  cacheBusy: false,
  delistedCountText: "Delisted games: 24",
  delistedDateText: "Last updated: 9/29/2026",
  delistedBusy: false,
  onRefreshMetadata: vi.fn(),
  onClearCache: vi.fn(),
  onRefreshDelisted: refreshDelisted,
  ...overrides,
});

const nodes = (node: any): any[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
};
const text = (node: any): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
};

const refreshButton = (tree: any) => nodes(tree).find(node =>
  node.type === "ButtonItem" && node.props?.onClick === refreshDelisted
);

describe("Metadata delisted-games subsection", () => {
  beforeEach(() => refreshDelisted.mockClear());

  it("shows the saved index count and date and refreshes that index", () => {
    const tree = render();
    expect(text(tree)).toContain("Metadata cache");
    expect(text(tree)).toContain("Delisted Steam games");
    expect(text(tree)).toContain("Delisted games: 24");
    expect(text(tree)).toContain("Last updated: 9/29/2026");
    expect(nodes(tree).some(node => node.type === "DropdownItem")).toBe(false);
    expect(refreshButton(tree).props.disabled).toBe(false);
    refreshButton(tree).props.onClick();
    expect(refreshDelisted).toHaveBeenCalledOnce();
  });

  it("places the delisted refresh action before its details with or without a date", () => {
    for (const date of ["Last updated: 9/29/2026", ""]) {
      const rows = nodes(render({ delistedDateText: date }))
        .filter((node) => node.type === "PanelSectionRow");
      const heading = rows.findIndex((row) => text(row) === "Delisted Steam games");
      const action = rows.findIndex((row) =>
        nodes(row).some((node) => node.type === "ButtonItem" && node.props?.onClick === refreshDelisted)
      );
      const count = rows.findIndex((row) => text(row) === "Delisted games: 24");
      expect(action).toBe(heading + 1);
      expect(count).toBe(action + 1);
      if (date) {
        expect(rows.findIndex((row) => text(row) === date)).toBe(count + 1);
      }
    }
  });

  it("shows an unavailable index without an old date and disables a busy refresh", () => {
    const tree = render({
      delistedCountText: "Delisted Steam games not downloaded yet",
      delistedDateText: "",
      delistedBusy: true,
    });
    expect(text(tree)).toContain("Delisted Steam games not downloaded yet");
    expect(text(tree)).not.toContain("Last updated:");
    expect(refreshButton(tree).props.disabled).toBe(true);
    expect(text(refreshButton(tree))).toContain("Refreshing...");
  });
});
