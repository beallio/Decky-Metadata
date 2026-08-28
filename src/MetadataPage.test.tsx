import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  applyFetchedMetadata: vi.fn(),
  enrichSteamApp: vi.fn(),
  getMetadata: vi.fn(),
  removeMetadata: vi.fn(),
  saveMetadata: vi.fn(),
  searchMetadata: vi.fn(),
}));

const steam = vi.hoisted(() => ({
  appName: vi.fn(() => "Shortcut"),
  applyMetadata: vi.fn(),
  cleanTitle: vi.fn((value: string) => value.trim()),
  getOverview: vi.fn(() => ({ app_type: 1073741824, BIsShortcut: () => true })),
  isNonSteamApp: vi.fn(() => true),
  metadataCache: {} as Record<string, any>,
  refreshCompatibilitySurfaces: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarn: vi.fn(),
}));

const state = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));

vi.mock("@decky/ui", () => ({
  DropdownItem: "DropdownItem",
  Focusable: "Focusable",
  Navigation: { NavigateBack: vi.fn() },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ScrollPanel: "ScrollPanel",
  TextField: "TextField",
  ToggleField: "ToggleField",
  useParams: () => ({ appid: "100" }),
}));

vi.mock("./backend", () => backend);
vi.mock("./steam", () => steam);
vi.mock("./steam/gamepadTextArea", () => ({ getGamepadTextArea: () => null }));
vi.mock("./toast", () => toast);
vi.mock("react", () => ({
  useCallback: (callback: any) => callback,
  useEffect: () => undefined,
  useMemo: (factory: any) => factory(),
  useRef: () => ({ current: null }),
  useState: (initial: any) => {
    const slot = state.cursor++;
    if (state.values[slot] === undefined) state.values[slot] = initial;
    return [
      state.values[slot],
      (next: any) => {
        state.values[slot] =
          typeof next === "function" ? next(state.values[slot]) : next;
      },
    ];
  },
}));

import { MetadataPage } from "./MetadataPage";
import { metadataTemplate } from "./metadataForm";

const makeMetadata = (overrides: Record<string, unknown> = {}) => ({
  ...metadataTemplate("Shortcut"),
  ...overrides,
});

const walk = (node: any, predicate: (candidate: any) => boolean): any[] => {
  if (node == null || typeof node !== "object") return [];
  const matched = predicate(node) ? [node] : [];
  const children = node.props?.children;
  const childNodes = Array.isArray(children) ? children : [children];
  return matched.concat(...childNodes.flatMap((child) => walk(child, predicate)));
};

const renderPage = () => {
  state.cursor = 0;
  return MetadataPage() as any;
};

const dropdown = (page: any) =>
  walk(page, (node) => node.type === "DropdownItem")[0];

const saveButton = (page: any) =>
  walk(
    page,
    (node) =>
      typeof node.props?.className === "string" &&
      node.props.className.includes("decky-metadata-editor__action--save")
  )[0];

describe("MetadataPage compatibility status", () => {
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    Object.keys(steam.metadataCache).forEach((key) => delete steam.metadataCache[key]);
    vi.clearAllMocks();
    steam.appName.mockReturnValue("Shortcut");
    steam.cleanTitle.mockImplementation((value: string) => value.trim());
    steam.getOverview.mockReturnValue({ app_type: 1073741824, BIsShortcut: () => true });
    steam.isNonSteamApp.mockReturnValue(true);
  });

  it("shows the native dropdown in the required order with Automatic's Valve status", () => {
    state.values[0] = makeMetadata({ deck_compat_category: 3 });

    const control = dropdown(renderPage());

    expect(control.props.label).toBe("Compatibility status");
    expect(control.props.rgOptions).toEqual([
      { data: null, label: "Automatic" },
      { data: 3, label: "Verified" },
      { data: 2, label: "Playable" },
      { data: 1, label: "Unsupported" },
      { data: 0, label: "Unknown" },
    ]);
    expect(control.props.selectedOption).toBeNull();
    expect(control.props.renderButtonValue()).toBe("Automatic (Valve: Verified)");
  });

  it("keeps explicit Unknown selected instead of treating zero as Automatic", () => {
    state.values[0] = makeMetadata({ deck_compat_override: 0 });

    const control = dropdown(renderPage());

    expect(control.props.selectedOption).toBe(0);
    expect(control.props.renderButtonValue()).toBe("Unknown");
  });

  it("saves a dropdown change atomically and refreshes after success", async () => {
    state.values[0] = makeMetadata({ deck_compat_category: 3 });
    const saved = makeMetadata({ deck_compat_category: 3, deck_compat_override: 0 });
    backend.saveMetadata.mockResolvedValue(saved);

    dropdown(renderPage()).props.onChange({ data: 0 });
    const page = renderPage();

    expect(dropdown(page).props.selectedOption).toBe(0);
    await saveButton(page).props.onClick();

    expect(backend.saveMetadata).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ deck_compat_override: 0 })
    );
    expect(steam.metadataCache["100"]).toBe(saved);
    expect(steam.applyMetadata).toHaveBeenCalledWith(100);
    expect(steam.refreshCompatibilitySurfaces).toHaveBeenCalledWith(100);
    expect(toast.toastSuccess).toHaveBeenCalledWith("Saved", "Metadata saved");
    expect(dropdown(renderPage()).props.selectedOption).toBe(0);
  });

  it("does not change cache or runtime compatibility when save fails", async () => {
    const persisted = makeMetadata({ deck_compat_override: 3 });
    state.values[0] = persisted;
    steam.metadataCache["100"] = persisted;
    backend.saveMetadata.mockRejectedValue(new Error("backend unavailable"));

    dropdown(renderPage()).props.onChange({ data: 0 });
    await saveButton(renderPage()).props.onClick();

    expect(steam.metadataCache["100"]).toBe(persisted);
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
    expect(toast.toastError).toHaveBeenCalledWith(
      "Save failed",
      expect.stringContaining("backend unavailable")
    );
  });

  it("does not expose the dropdown for an official Steam game", () => {
    steam.isNonSteamApp.mockReturnValue(false);

    expect(dropdown(renderPage())).toBeUndefined();
  });
});
