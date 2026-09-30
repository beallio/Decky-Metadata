import { isNativeNonSteamShortcut, metadataCache } from "../steam/core";

const canonicalSavedSteamAppId = (value: unknown): number | null => {
  if (typeof value === "string" && !/^\d{1,10}$/.test(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;

  const steamAppId = Number(value);
  return Number.isSafeInteger(steamAppId) && steamAppId > 0 && steamAppId < 0x80000000
    ? steamAppId
    : null;
};

export const resolveProtonDbAppId = (displayedAppId: number, overview: unknown): number | null => {
  if (!Number.isSafeInteger(displayedAppId) || displayedAppId <= 0 || displayedAppId > 0xffffffff) {
    return null;
  }
  if (!overview || typeof overview !== "object" || Array.isArray(overview)) return null;
  if (!("appid" in overview) || overview.appid !== displayedAppId) return null;
  if (
    !("app_type" in overview) ||
    typeof overview.app_type !== "number" ||
    !Number.isSafeInteger(overview.app_type)
  ) {
    return null;
  }

  try {
    if (isNativeNonSteamShortcut(overview)) {
      const metadataKey = String(displayedAppId);
      if (!Object.prototype.hasOwnProperty.call(metadataCache, metadataKey)) return null;
      return canonicalSavedSteamAppId(metadataCache[metadataKey]?.steam_appid);
    }
    return displayedAppId < 0x80000000 ? displayedAppId : null;
  } catch {
    return null;
  }
};
