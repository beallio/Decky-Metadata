import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ToggleField: "ToggleField",
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
import type { DeckCompatibilityCategory } from "../../types";

type Node = { type?: unknown; props?: { children?: unknown; [key: string]: unknown } };

const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== "object") return [];
  const element = node as Node;
  return [element, ...nodes(element.props?.children)];
};

const text = (node: unknown): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node !== "object") return "";
  return text((node as Node).props?.children);
};

const onCompatibilityDefaultMatchedOnlyChange = vi.fn();

const render = (overrides: {
  compatibilityDefault?: DeckCompatibilityCategory | null;
  compatibilityDefaultLoaded?: boolean;
  compatibilityDefaultBusy?: boolean;
  compatibilityDefaultMatchedOnly?: boolean;
  compatibilityDefaultScopeBusy?: boolean;
} = {}) => MetadataSection({
  detectedCount: 3,
  savedCount: 2,
  missingCount: 1,
  scanBusy: false,
  scanMessage: "",
  scanStatusKind: "idle",
  cacheBusy: false,
  compatibilityDefault: 3,
  compatibilityDefaultLoaded: true,
  compatibilityDefaultBusy: false,
  compatibilityDefaultError: "",
  compatibilityDefaultMatchedOnly: false,
  compatibilityDefaultScopeBusy: false,
  onRefreshMetadata: vi.fn(),
  onClearCache: vi.fn(),
  onCompatibilityDefaultChange: vi.fn(),
  onCompatibilityDefaultMatchedOnlyChange,
  onCompatibilityDefaultMenuWillOpen: vi.fn(),
  onCompatibilityDefaultControlRef: vi.fn(),
  ...overrides,
});

const toggle = (overrides: Parameters<typeof render>[0] = {}) => {
  const found = nodes(render(overrides)).find((node) => node.type === "ToggleField");
  if (!found?.props) throw new Error("matched-games-only toggle is missing");
  return found.props;
};

describe("MetadataSection matched-games-only scope", () => {
  it("reflects the loaded scope and forwards a change", () => {
    expect(toggle().checked).toBe(false);
    expect(toggle({ compatibilityDefaultMatchedOnly: true }).checked).toBe(true);

    (toggle().onChange as (value: boolean) => void)(true);
    expect(onCompatibilityDefaultMatchedOnlyChange).toHaveBeenCalledWith(true);
  });

  it("disables the scope while it cannot be applied or saved", () => {
    expect(toggle().disabled).toBe(false);
    // Automatic has no default to scope.
    expect(toggle({ compatibilityDefault: null }).disabled).toBe(true);
    expect(toggle({ compatibilityDefaultLoaded: false }).disabled).toBe(true);
    expect(toggle({ compatibilityDefaultBusy: true }).disabled).toBe(true);
    expect(toggle({ compatibilityDefaultScopeBusy: true }).disabled).toBe(true);
  });

  it("describes the narrowed scope in the section copy", () => {
    expect(text(render())).toContain("existing and new non-Steam shortcuts, including games with a Steam match");
    expect(text(render({ compatibilityDefaultMatchedOnly: true })))
      .toContain("non-Steam shortcuts that have saved metadata");
  });
});
