import { getNativeOverview, isNativeNonSteamShortcut, metadataCache } from "../steam/core";
import { findSteamAppIdByName } from "./steamSearch";

type Resolution = { name: string; promise: Promise<number | null>; id?: number | null };
const resolutions = new Map<number, Resolution>();
let generation = 0;

export const resetProtonDbAppIdResolution = (): void => {
  generation += 1;
  resolutions.clear();
};

const steamAppId = (value: unknown): number | null => {
  if (typeof value === "string" && !/^\d{1,10}$/.test(value)) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id < 0x80000000 ? id : null;
};

export const savedProtonDbAppId = (displayedAppId: number): number | null =>
  steamAppId(metadataCache[String(displayedAppId)]?.steam_appid);

/** Read known identity without making navigation wait for an effect or Promise. */
export const getResolvedProtonDbAppId = (
  displayedAppId: number, overview: unknown,
): number | null | undefined => {
  if (!Number.isSafeInteger(displayedAppId) || displayedAppId <= 0 || displayedAppId > 0xffffffff) return null;
  if (!overview || typeof overview !== "object" || Array.isArray(overview) ||
      !("appid" in overview) || overview.appid !== displayedAppId) return null;
  const native = getNativeOverview(displayedAppId) ?? overview;
  if (!("appid" in native) || native.appid !== displayedAppId ||
      !("app_type" in native) || typeof native.app_type !== "number" ||
      !Number.isSafeInteger(native.app_type)) return null;

  try {
    if (displayedAppId < 0x80000000 && !isNativeNonSteamShortcut(native)) return displayedAppId;
    const savedId = savedProtonDbAppId(displayedAppId);
    if (savedId !== null) return savedId;
    if (!("display_name" in native) || typeof native.display_name !== "string" || !native.display_name.trim()) return null;
    const resolution = resolutions.get(displayedAppId);
    return resolution?.name === native.display_name ? resolution.id : undefined;
  } catch {
    return null;
  }
};

/** Native Steam IDs are direct; shortcuts prefer a saved ID before fork name search. */
export const resolveProtonDbAppId = async (
  displayedAppId: number, overview: unknown,
): Promise<number | null> => {
  const knownId = getResolvedProtonDbAppId(displayedAppId, overview);
  if (knownId !== undefined) return knownId;
  const native = (getNativeOverview(displayedAppId) ?? overview) as { display_name: string };
  const name = native.display_name;
  const requestedGeneration = generation;
  try {
    let resolution = resolutions.get(displayedAppId);
    if (resolution?.name !== name) {
      const promise = findSteamAppIdByName(name).then(result => {
        if (generation !== requestedGeneration) return null;
        const current = getNativeOverview(displayedAppId);
        if (current && current.display_name !== name) return null;
        const id = steamAppId(result);
        if (resolution) resolution.id = id;
        return id;
      });
      resolution = { name, promise };
      resolutions.set(displayedAppId, resolution);
    }
    const result = await resolution.promise;
    if (generation !== requestedGeneration) return null;
    return savedProtonDbAppId(displayedAppId) ?? result;
  } catch {
    return null;
  }
};
