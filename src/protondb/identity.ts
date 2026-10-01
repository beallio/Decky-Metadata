import { getNativeOverview, isNativeNonSteamShortcut } from "../steam/core";
import { findSteamAppIdByName } from "./steamSearch";

type Resolution = { name: string; promise: Promise<number | null> };
const resolutions = new Map<number, Resolution>();
let generation = 0;

export const resetProtonDbAppIdResolution = (): void => {
  generation += 1;
  resolutions.clear();
};

const steamAppId = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id < 0x80000000 ? id : null;
};

/** Native Steam IDs are direct; shortcuts use the local fork's name search. */
export const resolveProtonDbAppId = async (
  displayedAppId: number, overview: unknown,
): Promise<number | null> => {
  if (!Number.isSafeInteger(displayedAppId) || displayedAppId <= 0 || displayedAppId > 0xffffffff) return null;
  if (!overview || typeof overview !== "object" || Array.isArray(overview) ||
      !("appid" in overview) || overview.appid !== displayedAppId) return null;
  const native = getNativeOverview(displayedAppId) ?? overview;
  if (!("appid" in native) || native.appid !== displayedAppId ||
      !("app_type" in native) || typeof native.app_type !== "number" ||
      !Number.isSafeInteger(native.app_type)) return null;

  try {
    if (displayedAppId < 0x80000000 && !isNativeNonSteamShortcut(native)) return displayedAppId;
    if (!("display_name" in native) || typeof native.display_name !== "string" || !native.display_name.trim()) return null;
    const name = native.display_name;
    const existing = resolutions.get(displayedAppId);
    if (existing?.name === name) return existing.promise;
    const requestedGeneration = generation;
    const promise = findSteamAppIdByName(name).then(result => {
      if (generation !== requestedGeneration) return null;
      const current = getNativeOverview(displayedAppId);
      if (current && current.display_name !== name) return null;
      return steamAppId(result);
    });
    resolutions.set(displayedAppId, { name, promise });
    return promise;
  } catch {
    return null;
  }
};
