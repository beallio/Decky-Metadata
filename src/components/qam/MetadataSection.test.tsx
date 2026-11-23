import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
  ProgressBarItem: "ProgressBarItem",
}));
vi.mock("../../styles", () => ({
  ButtonLabel: "ButtonLabel",
  compactTextStyle: {},
  inlineStatusStyle: () => ({}),
  rowStackStyle: {},
  sectionHeadingStyle: {},
}));
vi.mock("../../tokens", () => ({ space: { md: 8 } }));
// Components are invoked as plain functions here, so the i18n hook is replaced by non-React `t`.
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useT: () => actual.t };
});

import { MetadataSection } from "./MetadataSection";

const refreshDelisted = vi.fn();
const render = (overrides: Partial<Parameters<typeof MetadataSection>[0]> = {}) => MetadataSection({
  detectedCount: 3,
  savedCount: 2,
  missingCount: 1,
  scanBusy: false,
  scanMessage: "",
  scanCompleted: 0,
  scanTotal: 0,
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
  return `${text(node.props?.label)}${text(node.props?.description)}${text(node.props?.children)}`;
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

  it("keeps delisted index details in the refresh action description", () => {
    const withDate = refreshButton(render());
    expect(text(withDate.props.description)).toContain("Delisted games: 24");
    expect(text(withDate.props.description)).toContain("Last updated: 9/29/2026");

    const withoutDate = refreshButton(render({ delistedDateText: "" }));
    expect(text(withoutDate.props.description)).toContain("Delisted games: 24");
    expect(text(withoutDate.props.description)).not.toContain("Last updated:");
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
  it("shows scan progress from the completed and total counts", () => {
    const progress = nodes(render({
      scanBusy: true,
      scanMessage: "Scanning metadata",
      scanCompleted: 2,
      scanTotal: 4,
    })).find(node => node.type === "ProgressBarItem");

    expect(progress.props.nProgress).toBe(50);
    expect(progress.props.description).toBe("Scanning metadata");
  });
  it("disables Clear cache while a metadata scan is busy", () => {
    const onClearCache = vi.fn();
    const clearButton = nodes(render({ scanBusy: true, onClearCache })).find(node =>
      node.type === "ButtonItem" && node.props?.onClick === onClearCache
    );

    expect(clearButton.props.disabled).toBe(true);
  });

});
