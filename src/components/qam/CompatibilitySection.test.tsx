import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  DropdownItem: "DropdownItem",
  Field: "Field",
  PanelSectionRow: "PanelSectionRow",
}));
vi.mock("../../styles", () => ({
  compactTextStyle: {},
  inlineStatusStyle: () => ({}),
}));

import { CompatibilitySection } from "./CompatibilitySection";
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
} = {}) => CompatibilitySection({
  compatibilityDefault: 3,
  compatibilityDefaultLoaded: true,
  compatibilityDefaultBusy: false,
  compatibilityDefaultError: "",
  compatibilityDefaultScope: "all",
  compatibilityDefaultScopeBusy: false,
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

describe("CompatibilitySection default scope", () => {

  it("disables the scope while it cannot be applied or saved", () => {
    expect(scopeDropdown().disabled).toBe(false);
    // Automatic has no default to scope.
    expect(scopeDropdown({ compatibilityDefault: null }).disabled).toBe(true);
    expect(scopeDropdown({ compatibilityDefaultLoaded: false }).disabled).toBe(true);
    expect(scopeDropdown({ compatibilityDefaultBusy: true }).disabled).toBe(true);
    expect(scopeDropdown({ compatibilityDefaultScopeBusy: true }).disabled).toBe(true);
    const automaticScope = scopeDropdown({
      compatibilityDefault: null,
      compatibilityDefaultScope: "metadata",
    });
    expect(automaticScope.disabled).toBe(true);
    expect((automaticScope.renderButtonValue as any)().props.children)
      .toBe("All games with saved metadata");
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

  it("keeps the selected compatibility label complete and prepares native focus return", () => {
    const categoryDropdown = (category: DeckCompatibilityCategory | null) =>
      nodes(render({ compatibilityDefault: category })).find((node) =>
        node.type === "DropdownItem" && node.props?.label === "Default compatibility status"
      )?.props;
    const automatic = categoryDropdown(null);
    expect(automatic?.renderButtonValue).toBeTypeOf("function");
    expect((automatic?.renderButtonValue as any)().props.children).toBe(
      "Automatic — use matched Steam status",
    );
    expect((categoryDropdown(3)?.renderButtonValue as any)().props.children).toBe("Verified");
    onCompatibilityDefaultMenuWillOpen.mockClear();
    (automatic?.onMenuWillOpen as any)();
    expect(onCompatibilityDefaultMenuWillOpen).toHaveBeenCalledWith("category");
  });

});
