import { findModuleChild } from "@decky/ui";
import type { QuickLinkResources } from "./quickLinkPolicy";

type SteamUrlBuilder = {
  BuildStoreAppDlcURL: (steamAppid: number, tracking?: string | null) => string;
  BuildAppPointsShopURL: (steamAppid: number) => string;
};

let cachedSteamUrlBuilder: SteamUrlBuilder | null | undefined;

const asSteamUrlBuilder = (candidate: any): SteamUrlBuilder | undefined => {
  if (
    candidate &&
    typeof candidate.BuildStoreAppDlcURL === "function" &&
    typeof candidate.BuildAppPointsShopURL === "function"
  ) {
    return candidate as SteamUrlBuilder;
  }
  if (!candidate || typeof candidate !== "object") return undefined;
  for (const key in candidate) {
    try {
      const nested = candidate[key];
      if (
        nested &&
        typeof nested.BuildStoreAppDlcURL === "function" &&
        typeof nested.BuildAppPointsShopURL === "function"
      ) {
        return nested as SteamUrlBuilder;
      }
    } catch (_error) {
      continue;
    }
  }
  return undefined;
};

const steamUrlBuilder = (): SteamUrlBuilder | null => {
  if (cachedSteamUrlBuilder !== undefined) return cachedSteamUrlBuilder;
  try {
    cachedSteamUrlBuilder = findModuleChild(asSteamUrlBuilder) || null;
  } catch (_error) {
    cachedSteamUrlBuilder = null;
  }
  return cachedSteamUrlBuilder;
};

const localizeSteamToken = (token: string, fallback: string): string => {
  try {
    const manager = (globalThis as any)?.LocalizationManager;
    const localized = manager?.LocalizeString?.(token);
    if (typeof localized === "string" && localized && localized !== token) {
      return localized;
    }
  } catch (_error) {
    // Deterministic English labels remain valid when localization is unavailable.
  }
  return fallback;
};

export const resolveQuickLinkResources = (): QuickLinkResources => {
  const builder = steamUrlBuilder();
  return {
    buildDlcUrl: (steamAppid) => {
      try {
        const url = builder?.BuildStoreAppDlcURL(steamAppid, "primarylinks");
        if (typeof url === "string" && url) return url;
      } catch (_error) {
        // Fall back to the stable public Steam URL.
      }
      return `https://store.steampowered.com/dlc/${steamAppid}/`;
    },
    buildPointsShopUrl: (steamAppid) => {
      try {
        const url = builder?.BuildAppPointsShopURL(steamAppid);
        if (typeof url === "string" && url) return url;
      } catch (_error) {
        // Fall back to the stable public Steam URL.
      }
      return `https://store.steampowered.com/points/shop/app/${steamAppid}`;
    },
    localize: localizeSteamToken,
  };
};
