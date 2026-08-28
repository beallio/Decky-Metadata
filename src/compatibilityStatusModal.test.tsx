import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ saveMetadata: vi.fn() }));
const steam = vi.hoisted(() => ({
  appName: vi.fn(() => "Shortcut"),
  applyMetadata: vi.fn(),
  getOverview: vi.fn(() => ({ app_type: 1073741824, BIsShortcut: () => true })),
  isNativeNonSteamShortcut: vi.fn(() => true),
  metadataCache: {} as Record<string, any>,
  refreshCompatibilitySurfaces: vi.fn(),
}));
const toast = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
const ui = vi.hoisted(() => ({ close: vi.fn(), showModal: vi.fn(() => ({ Close: ui.close })) }));
const react = vi.hoisted(() => ({ useState: vi.fn(() => [false, vi.fn()]) }));

vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  showModal: ui.showModal,
}));
vi.mock("./backend", () => backend);
vi.mock("./steam/core", () => ({
  appName: steam.appName,
  getOverview: steam.getOverview,
  isNativeNonSteamShortcut: steam.isNativeNonSteamShortcut,
  metadataCache: steam.metadataCache,
}));
vi.mock("./steam/metadataPatch", () => ({
  applyMetadata: steam.applyMetadata,
  refreshCompatibilitySurfaces: steam.refreshCompatibilitySurfaces,
}));
vi.mock("./toast", () => toast);
vi.mock("react", () => react);

import {
  CompatibilityStatusModal,
  saveCompatibilityOverride,
} from "./compatibilityStatusModal";

afterEach(() => {
  Object.keys(steam.metadataCache).forEach((key) => delete steam.metadataCache[key]);
  backend.saveMetadata.mockReset();
  steam.applyMetadata.mockReset();
  steam.refreshCompatibilitySurfaces.mockReset();
  steam.isNativeNonSteamShortcut.mockReturnValue(true);
});

describe("compatibility status selector", () => {
  it("saves Automatic as null and displays Valve's resolved status", async () => {
    steam.metadataCache["100"] = {
      title: "Shortcut",
      id: "shortcut",
      description: "",
      store_categories: [],
      steam_dlc_appids: [],
      has_points_shop: false,
      deck_compat_category: 3,
      deck_compat_override: 0,
    };
    backend.saveMetadata.mockResolvedValue({ ...steam.metadataCache["100"], deck_compat_override: null });

    await saveCompatibilityOverride(100, null);

    expect(backend.saveMetadata).toHaveBeenCalledWith(100, expect.objectContaining({ deck_compat_override: null }));
    expect(steam.metadataCache["100"].deck_compat_override).toBeNull();
    expect(steam.applyMetadata).toHaveBeenCalledWith(100);
    expect(steam.refreshCompatibilitySurfaces).toHaveBeenCalledWith(100);

    const modal = CompatibilityStatusModal({ appId: 100, closeModal: vi.fn() }) as any;
    const labels = modal.props.children[1].map((row: any) => row.props.children.props.children);
    expect(labels).toEqual([
      "Selected: Automatic (Valve: Verified)",
      "Verified",
      "Playable",
      "Unsupported",
      "Unknown",
    ]);
  });

  it("creates the normal metadata shell for an explicit Unknown override", async () => {
    backend.saveMetadata.mockResolvedValue({ deck_compat_override: 0 });

    await saveCompatibilityOverride(200, 0);

    expect(backend.saveMetadata).toHaveBeenCalledWith(200, expect.objectContaining({
      title: "Shortcut",
      source: "Manual",
      deck_compat_override: 0,
    }));
    expect(steam.metadataCache["200"]).toEqual({ deck_compat_override: 0 });
  });

  it("keeps cache and runtime state unchanged when the save fails", async () => {
    const original = {
      title: "Shortcut",
      id: "shortcut",
      description: "",
      store_categories: [],
      steam_dlc_appids: [],
      has_points_shop: false,
      deck_compat_override: 3,
    };
    steam.metadataCache["300"] = original;
    backend.saveMetadata.mockRejectedValue(new Error("backend unavailable"));

    await expect(saveCompatibilityOverride(300, 1)).rejects.toThrow("backend unavailable");

    expect(steam.metadataCache["300"]).toBe(original);
    expect(steam.applyMetadata).not.toHaveBeenCalled();
    expect(steam.refreshCompatibilitySurfaces).not.toHaveBeenCalled();
  });

  it("rejects official Steam games before attempting a save", async () => {
    steam.isNativeNonSteamShortcut.mockReturnValue(false);

    await expect(saveCompatibilityOverride(400, 3)).rejects.toThrow("non-Steam games");

    expect(backend.saveMetadata).not.toHaveBeenCalled();
  });
});
