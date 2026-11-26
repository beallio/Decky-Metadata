import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySteamArtworkSlot,
  clearSteamArtworkSlot,
  hasCustomArtworkApi,
  STEAM_ARTWORK_ASSET_TYPE,
} from "./customArtwork";

describe("customArtwork SteamClient bridge", () => {
  const originalSteamClient = (globalThis as any).SteamClient;

  afterEach(() => {
    (globalThis as any).SteamClient = originalSteamClient;
  });

  it("maps grid slots to SteamClient assetType numbers", async () => {
    const SetCustomArtworkForApp = vi.fn().mockResolvedValue(undefined);
    const ClearCustomArtworkForApp = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).SteamClient = {
      Apps: { SetCustomArtworkForApp, ClearCustomArtworkForApp },
    };

    expect(hasCustomArtworkApi()).toBe(true);
    await applySteamArtworkSlot(2800000001, "cover", { base64: "AA==", ext: "jpg", file_path: null });
    await applySteamArtworkSlot(2800000001, "wide", { base64: "BB==", ext: "jpg", file_path: null });
    await applySteamArtworkSlot(2800000001, "hero", { base64: "CC==", ext: "jpg", file_path: null });
    await applySteamArtworkSlot(2800000001, "logo", { base64: "DD==", ext: "png", file_path: null });

    expect(SetCustomArtworkForApp).toHaveBeenNthCalledWith(1, 2800000001, "AA==", "jpg", STEAM_ARTWORK_ASSET_TYPE.cover);
    expect(SetCustomArtworkForApp).toHaveBeenNthCalledWith(2, 2800000001, "BB==", "jpg", STEAM_ARTWORK_ASSET_TYPE.wide);
    expect(SetCustomArtworkForApp).toHaveBeenNthCalledWith(3, 2800000001, "CC==", "jpg", STEAM_ARTWORK_ASSET_TYPE.hero);
    expect(SetCustomArtworkForApp).toHaveBeenNthCalledWith(4, 2800000001, "DD==", "png", STEAM_ARTWORK_ASSET_TYPE.logo);

    await clearSteamArtworkSlot(2800000001, "hero");
    expect(ClearCustomArtworkForApp).toHaveBeenCalledWith(2800000001, STEAM_ARTWORK_ASSET_TYPE.hero);
  });

  it("prefers SetShortcutIcon for icon apply/clear and falls back to assetType 4", async () => {
    const SetShortcutIcon = vi.fn().mockResolvedValue(undefined);
    const SetCustomArtworkForApp = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).SteamClient = {
      Apps: { SetShortcutIcon, SetCustomArtworkForApp },
    };

    await applySteamArtworkSlot(2800000001, "icon", {
      base64: "EE==",
      ext: "jpg",
      file_path: "/home/deck/.local/share/Steam/userdata/1/config/grid/2800000001_icon.jpg",
    });
    expect(SetShortcutIcon).toHaveBeenCalledWith(
      2800000001,
      "/home/deck/.local/share/Steam/userdata/1/config/grid/2800000001_icon.jpg",
    );
    expect(SetCustomArtworkForApp).not.toHaveBeenCalled();

    await clearSteamArtworkSlot(2800000001, "icon");
    expect(SetShortcutIcon).toHaveBeenLastCalledWith(2800000001, "");

    (globalThis as any).SteamClient = { Apps: { SetCustomArtworkForApp } };
    await applySteamArtworkSlot(2800000001, "icon", {
      base64: "EE==",
      ext: "jpg",
      file_path: null,
    });
    expect(SetCustomArtworkForApp).toHaveBeenCalledWith(2800000001, "EE==", "jpg", 4);
  });

  it("rejects with stable error codes when SteamClient API is absent", async () => {
    (globalThis as any).SteamClient = {};
    await expect(
      applySteamArtworkSlot(2800000001, "cover", { base64: "AA==", ext: "jpg", file_path: null }),
    ).rejects.toThrow("artwork_api_unavailable");
    await expect(clearSteamArtworkSlot(2800000001, "cover")).rejects.toThrow("artwork_api_unavailable");
  });
});
