import type { SteamOverride } from "../types";

const MAX_STEAM_APP_ID = 0x7fffffff;

const validPositiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_STEAM_APP_ID ? id : null;
};

const overrides = new Map<number, SteamOverride>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // One unmounting view cannot block other listeners.
    }
  }
};

export const getSteamOverrideCached = (appId: number): SteamOverride | undefined => {
  const id = validPositiveId(appId);
  return id === null ? undefined : overrides.get(id);
};

export const getSteamHltbOverride = (appId: number): number | null =>
  validPositiveId(getSteamOverrideCached(appId)?.hltb_game_id);

export const setSteamOverrideCached = (appId: number, value: SteamOverride | null): void => {
  const id = validPositiveId(appId);
  if (id === null) return;
  const hltbId = validPositiveId(value?.hltb_game_id);
  if (hltbId === null) {
    if (!overrides.delete(id)) return;
  } else {
    const previous = overrides.get(id);
    if (previous?.hltb_game_id === hltbId) return;
    overrides.set(id, { hltb_game_id: hltbId });
  }
  notify();
};

export const replaceSteamOverrides = (entries: Record<string, SteamOverride> | null | undefined): void => {
  overrides.clear();
  if (entries && typeof entries === "object") {
    for (const [key, entry] of Object.entries(entries)) {
      const appId = validPositiveId(key);
      const hltbId = validPositiveId(entry?.hltb_game_id);
      if (appId !== null && hltbId !== null) {
        overrides.set(appId, { hltb_game_id: hltbId });
      }
    }
  }
  notify();
};

export const clearSteamOverrideCache = (): void => {
  if (overrides.size === 0) return;
  overrides.clear();
  notify();
};

export const subscribeSteamOverrides = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
