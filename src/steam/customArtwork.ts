import type { ArtworkSlot, FetchedArtworkAsset, SteamInternals } from "../types";
import * as log from "../log";

const steamInternals = () => globalThis as unknown as SteamInternals;

/** SteamClient.Apps.SetCustomArtworkForApp / ClearCustomArtworkForApp asset type IDs. */
export const STEAM_ARTWORK_ASSET_TYPE: Record<ArtworkSlot, number> = {
  cover: 0,
  hero: 1,
  logo: 2,
  wide: 3,
  icon: 4,
};

export const ARTWORK_SLOT_ORDER: readonly ArtworkSlot[] = [
  "cover",
  "wide",
  "hero",
  "logo",
  "icon",
];

const validAppId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 0xffffffff ? id : null;
};

export const hasCustomArtworkApi = (): boolean =>
  typeof steamInternals().SteamClient?.Apps?.SetCustomArtworkForApp === "function";

export const hasShortcutIconApi = (): boolean =>
  typeof steamInternals().SteamClient?.Apps?.SetShortcutIcon === "function" ||
  hasCustomArtworkApi();

/** Apply one downloaded Steam asset live via SteamClient.Apps. */
export async function applySteamArtworkSlot(
  appId: number,
  slot: ArtworkSlot,
  asset: Pick<FetchedArtworkAsset, "base64" | "ext" | "file_path">,
): Promise<void> {
  const normalizedId = validAppId(appId);
  if (!normalizedId) throw new Error("invalid_shortcut_app_id");
  const apps = steamInternals().SteamClient?.Apps;
  if (!apps) throw new Error("artwork_api_unavailable");

  if (slot === "icon") {
    // shortcut: Steam Gaming Mode updates shortcut icons via SetShortcutIcon when given a local path,
    // falling back to assetType 4 when SetShortcutIcon is unavailable on a build.
    if (typeof apps.SetShortcutIcon === "function" && asset.file_path) {
      try {
        await apps.SetShortcutIcon.call(apps, normalizedId, asset.file_path);
        return;
      } catch (error) {
        log.warn("artwork", "SetShortcutIcon failed, trying SetCustomArtworkForApp", error);
      }
    }
    if (typeof apps.SetCustomArtworkForApp === "function") {
      try {
        await apps.SetCustomArtworkForApp.call(
          apps,
          normalizedId,
          asset.base64,
          asset.ext,
          STEAM_ARTWORK_ASSET_TYPE.icon,
        );
        return;
      } catch (error) {
        log.warn("artwork", "SetCustomArtworkForApp(icon) failed", error);
        throw new Error("artwork_apply_failed");
      }
    }
    throw new Error("artwork_api_unavailable");
  }

  if (typeof apps.SetCustomArtworkForApp !== "function") {
    throw new Error("artwork_api_unavailable");
  }
  try {
    await apps.SetCustomArtworkForApp.call(
      apps,
      normalizedId,
      asset.base64,
      asset.ext,
      STEAM_ARTWORK_ASSET_TYPE[slot],
    );
  } catch (error) {
    log.warn("artwork", `SetCustomArtworkForApp(${slot}) failed`, error);
    throw new Error("artwork_apply_failed");
  }
}

/** Clear one artwork slot live via SteamClient.Apps. */
export async function clearSteamArtworkSlot(appId: number, slot: ArtworkSlot): Promise<void> {
  const normalizedId = validAppId(appId);
  if (!normalizedId) throw new Error("invalid_shortcut_app_id");
  const apps = steamInternals().SteamClient?.Apps;
  if (!apps) throw new Error("artwork_api_unavailable");

  if (slot === "icon") {
    if (typeof apps.SetShortcutIcon === "function") {
      try {
        await apps.SetShortcutIcon.call(apps, normalizedId, "");
        return;
      } catch (error) {
        log.warn("artwork", "SetShortcutIcon clear failed", error);
      }
    }
    if (typeof apps.ClearCustomArtworkForApp === "function") {
      try {
        await apps.ClearCustomArtworkForApp.call(apps, normalizedId, STEAM_ARTWORK_ASSET_TYPE.icon);
        return;
      } catch (error) {
        log.warn("artwork", "ClearCustomArtworkForApp(icon) failed", error);
        throw new Error("artwork_clear_failed");
      }
    }
    throw new Error("artwork_api_unavailable");
  }

  if (typeof apps.ClearCustomArtworkForApp !== "function") {
    throw new Error("artwork_api_unavailable");
  }
  try {
    await apps.ClearCustomArtworkForApp.call(apps, normalizedId, STEAM_ARTWORK_ASSET_TYPE[slot]);
  } catch (error) {
    log.warn("artwork", `ClearCustomArtworkForApp(${slot}) failed`, error);
    throw new Error("artwork_clear_failed");
  }
}
