import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ saveMetadata: vi.fn() }));
const steam = vi.hoisted(() => ({
  appName: vi.fn(() => "Shortcut"),
  applyMetadata: vi.fn(),
  getOverview: vi.fn(() => ({ app_type: 1073741824, BIsShortcut: () => true })),
  getNativeOverview: vi.fn(() => ({ app_type: 1073741824, BIsShortcut: () => true })),
  isNativeNonSteamShortcut: vi.fn(() => true),
  metadataCache: {} as Record<string, any>,
  refreshCompatibilitySurfaces: vi.fn(),
  ensureMetadataCache: vi.fn(() => Promise.resolve()),
}));
const toast = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
const ui = vi.hoisted(() => ({ close: vi.fn(), showModal: vi.fn(() => ({ Close: ui.close })) }));
const react = vi.hoisted(() => ({ useState: vi.fn(() => [false, vi.fn()]) }));

vi.mock("@decky/ui", () => ({
  DialogButton: "DialogButton",
  Focusable: "Focusable",
  NavEntryPositionPreferences: { PREFERRED_CHILD: "preferred-child" },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  showModal: ui.showModal,
}));
vi.mock("./backend", () => backend);
vi.mock("./steam/core", () => ({
  appName: steam.appName,
  getOverview: steam.getOverview,
  getNativeOverview: steam.getNativeOverview,
  isNativeNonSteamShortcut: steam.isNativeNonSteamShortcut,
  metadataCache: steam.metadataCache,
}));
vi.mock("./steam/metadataPatch", () => ({
  applyMetadata: steam.applyMetadata,
  ensureMetadataCache: steam.ensureMetadataCache,
  refreshCompatibilitySurfaces: steam.refreshCompatibilitySurfaces,
}));
vi.mock("./toast", () => toast);
vi.mock("react", () => react);

import {
  CompatibilityStatusModal,
  openCompatibilityStatusModal,
  saveCompatibilityOverride,
} from "./compatibilityStatusModal";

const choiceRows = (modal: any) => modal.props.children[1].props.children;

afterEach(() => {
  Object.keys(steam.metadataCache).forEach((key) => delete steam.metadataCache[key]);
  backend.saveMetadata.mockReset();
  steam.applyMetadata.mockReset();
  steam.refreshCompatibilitySurfaces.mockReset();
  steam.ensureMetadataCache.mockReset();
  steam.ensureMetadataCache.mockResolvedValue(undefined);
  steam.getNativeOverview.mockReturnValue({ app_type: 1073741824, BIsShortcut: () => true });
  steam.isNativeNonSteamShortcut.mockReturnValue(true);
  ui.showModal.mockReset();
  ui.showModal.mockReturnValue({ Close: ui.close });
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
    const labels = choiceRows(modal).map((row: any) => row.props.children.props.children);
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
    const official = { appid: 400, app_type: 0, BIsShortcut: () => false };
    const shortcut = { appid: 2155012430, app_type: 1073741824, BIsShortcut: () => true };
    steam.getOverview.mockReturnValue(shortcut as any);
    steam.getNativeOverview.mockReturnValue(official as any);
    (steam.isNativeNonSteamShortcut as any).mockImplementation(
      (overview: any) => Number(overview?.app_type) === 1073741824
    );

    await expect(saveCompatibilityOverride(400, 3)).rejects.toThrow("non-Steam games");

    expect(backend.saveMetadata).not.toHaveBeenCalled();
    expect(steam.metadataCache["400"]).toBeUndefined();
    expect(steam.getNativeOverview).toHaveBeenCalledWith(400);
  });

  it("waits for the authoritative cache before opening or saving an override", async () => {
    let finishCacheLoad: (() => void) | undefined;
    let finishSave: (() => void) | undefined;
    const cacheReady = new Promise<void>((resolve) => { finishCacheLoad = resolve; });
    const saveReady = new Promise<void>((resolve) => { finishSave = resolve; });
    steam.ensureMetadataCache.mockReturnValue(cacheReady);
    const richRecord = {
      title: "Existing title",
      id: "existing-id",
      description: "Existing description",
      store_categories: [22],
      steam_dlc_appids: [123],
      has_points_shop: true,
      deck_compat_category: 2,
    };
    backend.saveMetadata.mockImplementation(async (_appId: number, metadata: any) => {
      await saveReady;
      return metadata;
    });

    const opening = openCompatibilityStatusModal(500);
    const saving = saveCompatibilityOverride(500, 3);
    expect(ui.showModal).not.toHaveBeenCalled();
    expect(backend.saveMetadata).not.toHaveBeenCalled();

    steam.metadataCache["500"] = richRecord;
    finishCacheLoad?.();
    await opening;

    const modalElement = (ui.showModal as any).mock.calls[0]?.[0] as any;
    const modal = modalElement.type(modalElement.props) as any;
    const labels = choiceRows(modal).map((row: any) => row.props.children.props.children);
    expect(labels[0]).toBe("Selected: Automatic (Valve: Playable)");
    expect(backend.saveMetadata).toHaveBeenCalledWith(500, {
      ...richRecord,
      deck_compat_override: 3,
    });
    finishSave?.();
    await saving;
    expect(steam.metadataCache["500"]).toEqual({
      ...richRecord,
      deck_compat_override: 3,
    });
  });

  it("groups choices into native vertical gamepad flow and restores menu focus on close", async () => {
    const launcher = {} as EventTarget;

    await openCompatibilityStatusModal(600, launcher);

    const modalElement = (ui.showModal as any).mock.calls[0]?.[0] as any;
    const modal = modalElement.type(modalElement.props) as any;
    const choiceFlow = modal.props.children[1];
    const rows = choiceRows(modal);

    expect(choiceFlow.type).toBe("Focusable");
    expect(choiceFlow.props["flow-children"]).toBe("vertical");
    expect(choiceFlow.props.navEntryPreferPosition).toBe("preferred-child");
    expect(rows.map((row: any) => row.props.children.props.children)).toEqual([
      "Selected: Automatic",
      "Verified",
      "Playable",
      "Unsupported",
      "Unknown",
    ]);
    expect(rows.map((row: any) => row.props.children.props.preferredFocus)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(ui.showModal).toHaveBeenCalledWith(expect.anything(), launcher);
  });
});
