import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
  ProgressBarWithInfo: "ProgressBarWithInfo",
}));
vi.mock("../../styles", () => ({
  ButtonLabel: "ButtonLabel",
  compactTextStyle: {},
  rowStackStyle: {},
}));
vi.mock("../../tokens", () => ({ space: { md: 8 } }));
// Components are invoked as plain functions here, so the i18n hook is replaced by non-React `t`.
vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useT: () => actual.t };
});

import { MetadataMaintenanceBody, MetadataScanBody } from "./MetadataSection";

const refreshDelisted = vi.fn();
const render = (overrides: Record<string, unknown> = {}) => {
  const props = {
    detectedCount: 3,
    savedCount: 2,
    missingCount: 1,
    scanBusy: false,
    scanMessage: "",
    scanCompleted: 0,
    scanTotal: 0,
    cacheBusy: false,
    delistedCountText: "Delisted games: 24",
    delistedDateText: "Last updated: 9/29/2026",
    delistedBusy: false,
    onRefreshMetadata: vi.fn(),
    onClearCache: vi.fn(),
    onRefreshDelisted: refreshDelisted,
    ...overrides,
  };
  return [
    MetadataScanBody(props as Parameters<typeof MetadataScanBody>[0]),
    MetadataMaintenanceBody(props as Parameters<typeof MetadataMaintenanceBody>[0]),
  ];
};

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

describe("MetadataMaintenanceBody delisted-games controls", () => {
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
  it("passes a count of 0 as text, because Steam's Field hides a falsy value", () => {
    const counts = nodes(render({ detectedCount: 0, savedCount: 0, missingCount: 0 }))
      .filter(node => node.type === "Field")
      .map(node => node.props.children);

    expect(counts).toEqual(["0", "0", "0"]);
  });

  it("makes the Settings metadata stat rows focusable and highlightable like Versions, while keeping QAM rows non-focusable", () => {
    const settingsFields = nodes(render({ inline: true })[0]).filter(node => node.type === "Field");
    expect(settingsFields).toHaveLength(3);
    expect(settingsFields.every(field => field.props.focusable === true && field.props.highlightOnFocus === true)).toBe(true);

    const qamFields = nodes(render({ inline: false })[0]).filter(node => node.type === "Field");
    expect(qamFields).toHaveLength(3);
    expect(qamFields.every(field => !field.props.focusable)).toBe(true);
  });
  it("shows scan progress from the completed and total counts", () => {
    const tree = render({
      scanBusy: true,
      scanMessage: "Scanning metadata",
      scanCompleted: 2,
      scanTotal: 4,
    });
    const progress = nodes(tree).find(node => node.type === "ProgressBarWithInfo");

    expect(progress.props.nProgress).toBe(50);
    expect(progress.props.sOperationText).toBe("Scanning metadata");
    expect(progress.props.childrenLayout).toBe("below");
    expect(progress.props.childrenContainerWidth).toBe("max");
    expect(progress.props.className).toBe("decky-metadata-scan-progress");

    const qamRows = nodes(tree[0]).filter(node => node.type === "PanelSectionRow");
    expect(qamRows.some(row => row.props?.children?.type === "ProgressBarWithInfo")).toBe(true);
  });
  it("disables Clear cache while a metadata scan is busy", () => {
    const onClearCache = vi.fn();
    const clearButton = nodes(render({ scanBusy: true, onClearCache })).find(node =>
      node.type === "ButtonItem" && node.props?.onClick === onClearCache
    );

    expect(clearButton.props.disabled).toBe(true);
  });

  it.each([false, true])("keeps Refresh metadata and Clear cache off until the fresh game list loads (inline %s)", (inline) => {
    const onRefreshMetadata = vi.fn();
    const onClearCache = vi.fn();
    const actions = (listReady: boolean) => {
      const tree = render({ inline, listReady, onRefreshMetadata, onClearCache });
      const disabled = (onClick: unknown) => nodes(tree).find(node => node.props?.onClick === onClick)?.props.disabled;
      return [disabled(onRefreshMetadata), disabled(onClearCache)];
    };

    expect(actions(false)).toEqual([true, true]);
    expect(actions(true)).toEqual([false, false]);
  });
});
