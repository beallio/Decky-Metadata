import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSection: "PanelSection",
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
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../../types";

type Node = { type?: unknown; props?: { children?: unknown; [key: string]: unknown } };

const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== "object") return [];
  const element = node as Node;
  return [element, ...nodes(element.props?.children)];
};


const onCompatibilityDefaultScopeChange = vi.fn();
const onCompatibilityDefaultMenuWillOpen = vi.fn();

const render = (overrides: {
  compatibilityDefault?: DeckCompatibilityCategory | null;
  compatibilityDefaultLoaded?: boolean;
  compatibilityDefaultBusy?: boolean;
  compatibilityDefaultScope?: CompatibilityDefaultScope;
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
  compatibilityDefaultScope: "all",
  compatibilityDefaultScopeBusy: false,
  onRefreshMetadata: vi.fn(),
  onClearCache: vi.fn(),
  onCompatibilityDefaultChange: vi.fn(),
  onCompatibilityDefaultScopeChange,
  onCompatibilityDefaultMenuWillOpen,
  onCompatibilityDefaultControlRef: vi.fn(),
  onCompatibilityDefaultScopeControlRef: vi.fn(),
  ...overrides,
});

const scopeDropdown = (overrides: Parameters<typeof render>[0] = {}) => {
  const found = nodes(render(overrides)).find((node) =>
    node.type === "DropdownItem" && node.props?.label === "Apply default to"
  );
  if (!found?.props) throw new Error("compatibility scope dropdown is missing");
  return found.props;
};

describe("MetadataSection compatibility default scope", () => {

  it("disables the scope while it cannot be applied or saved", () => {
    expect(scopeDropdown().disabled).toBe(false);
    // Automatic has no default to scope.
    expect(scopeDropdown({ compatibilityDefault: null }).disabled).toBe(true);
    expect(scopeDropdown({ compatibilityDefaultLoaded: false }).disabled).toBe(true);
    expect(scopeDropdown({ compatibilityDefaultBusy: true }).disabled).toBe(true);
    expect(scopeDropdown({ compatibilityDefaultScopeBusy: true }).disabled).toBe(true);
    const dropdown = nodes(render({ compatibilityDefaultScopeBusy: true }))
      .find((node) => node.type === "DropdownItem" && node.props?.label === "Default compatibility status");
    expect(dropdown?.props?.disabled).toBe(true);
  });

  it("uses the native readable four-option scope dropdown", () => {
    const dropdown = scopeDropdown({ compatibilityDefaultScope: "no-steam" });
    expect(dropdown.layout).toBe("below");
    expect(dropdown.childrenContainerWidth).toBe("max");
    expect(dropdown.rgOptions).toEqual([
      { data: "steam", label: "Steam-matched games" },
      { data: "no-steam", label: "Saved games without a Steam ID" },
      { data: "metadata", label: "All games with saved metadata" },
      { data: "all", label: "All non-Steam games" },
    ]);
    expect((dropdown.renderButtonValue as any)().props.children).toBe("Saved games without a Steam ID");
    (dropdown.onMenuWillOpen as any)();
    expect(onCompatibilityDefaultMenuWillOpen).toHaveBeenCalledWith("scope");
  });

});
