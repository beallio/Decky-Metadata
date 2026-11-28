import type {
  ArtworkSlot,
  FetchedArtworkAsset,
  SteamInternals,
  SteamLogoAnchor,
  SteamLogoPosition,
} from "../types";
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
    const isShortcut = normalizedId >= 0x80000000;
    // shortcut: Steam Gaming Mode updates shortcut icons via SetShortcutIcon when given a local path,
    // while native Steam games (and builds without SetShortcutIcon) use SetCustomArtworkForApp(assetType=4).
    if (isShortcut && typeof apps.SetShortcutIcon === "function" && asset.file_path) {
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
    const isShortcut = normalizedId >= 0x80000000;
    if (isShortcut && typeof apps.SetShortcutIcon === "function") {
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

export const STEAM_LOGO_ANCHORS: readonly SteamLogoAnchor[] = [
  "UpperLeft",
  "BottomLeft",
  "UpperCenter",
  "CenterCenter",
  "BottomCenter",
];

export const DEFAULT_LOGO_POSITION: SteamLogoPosition = {
  pinnedPosition: "BottomLeft",
  nWidthPct: 50,
  nHeightPct: 50,
};

export const hasLogoPositionApi = (): boolean =>
  typeof steamInternals().appDetailsStore?.SaveCustomLogoPosition === "function" &&
  typeof steamInternals().appStore?.GetAppOverviewByAppID === "function";

export function getCustomLogoPosition(appId: number): SteamLogoPosition {
  const normalizedId = validAppId(appId);
  if (!normalizedId) return { ...DEFAULT_LOGO_POSITION };
  try {
    const internals = steamInternals();
    const overview = internals.appStore?.GetAppOverviewByAppID?.(normalizedId);
    const raw =
      (overview && internals.appDetailsStore?.GetCustomLogoPosition?.(overview)) ??
      internals.appDetailsStore?.GetAppData?.(normalizedId)?.customImageInfo?.logoPosition ??
      internals.appDetailsStore?.GetAppDetails?.(normalizedId)?.libraryAssets?.logoPosition;
    if (!raw || typeof raw !== "object") return { ...DEFAULT_LOGO_POSITION };
    const anchor = STEAM_LOGO_ANCHORS.includes(raw.pinnedPosition as SteamLogoAnchor)
      ? (raw.pinnedPosition as SteamLogoAnchor)
      : DEFAULT_LOGO_POSITION.pinnedPosition;
    const nWidthPct =
      typeof raw.nWidthPct === "number" && Number.isFinite(raw.nWidthPct)
        ? Math.min(100, Math.max(10, Math.round(raw.nWidthPct)))
        : DEFAULT_LOGO_POSITION.nWidthPct;
    const nHeightPct =
      typeof raw.nHeightPct === "number" && Number.isFinite(raw.nHeightPct)
        ? Math.min(100, Math.max(10, Math.round(raw.nHeightPct)))
        : DEFAULT_LOGO_POSITION.nHeightPct;
    return { pinnedPosition: anchor, nWidthPct, nHeightPct };
  } catch {
    return { ...DEFAULT_LOGO_POSITION };
  }
}

export async function saveCustomLogoPosition(
  appId: number,
  position: SteamLogoPosition,
): Promise<void> {
  const normalizedId = validAppId(appId);
  if (!normalizedId) throw new Error("invalid_shortcut_app_id");
  const overview = steamInternals().appStore?.GetAppOverviewByAppID?.(normalizedId);
  const save = steamInternals().appDetailsStore?.SaveCustomLogoPosition;
  if (!overview || typeof save !== "function") {
    throw new Error("artwork_logo_position_unavailable");
  }
  await save.call(steamInternals().appDetailsStore, overview, {
    pinnedPosition: position.pinnedPosition,
    nWidthPct: Math.min(100, Math.max(10, Math.round(position.nWidthPct))),
    nHeightPct: Math.min(100, Math.max(10, Math.round(position.nHeightPct))),
  });
}

export async function clearCustomLogoPosition(appId: number): Promise<void> {
  const normalizedId = validAppId(appId);
  if (!normalizedId) throw new Error("invalid_shortcut_app_id");
  const overview = steamInternals().appStore?.GetAppOverviewByAppID?.(normalizedId);
  const clear = steamInternals().appDetailsStore?.ClearCustomLogoPosition;
  if (!overview || typeof clear !== "function") {
    throw new Error("artwork_logo_position_unavailable");
  }
  await clear.call(steamInternals().appDetailsStore, overview);
}
