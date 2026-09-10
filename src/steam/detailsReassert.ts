import type { MetadataData } from "../types";

type SteamAppData = {
  details?: Record<string, any>;
  descriptionsData?: Record<string, any>;
  associationData?: Record<string, any>;
  screenshots?: Record<string, any>;
};

export const matchedSteamAppId = (metadata: Pick<MetadataData, "steam_appid"> | undefined): number | null => {
  const raw = metadata?.steam_appid;
  if (typeof raw === "boolean" || raw === null || raw === undefined) return null;
  const steamAppId = typeof raw === "string" ? Number(raw.trim()) : raw;
  return typeof steamAppId === "number" && Number.isSafeInteger(steamAppId) && steamAppId > 0
    ? steamAppId
    : null;
};

export const hasMatchedSteamAppId = (metadata: Pick<MetadataData, "steam_appid"> | undefined): boolean =>
  matchedSteamAppId(metadata) !== null;

/**
 * Reapply Decky's matched-game fields to a native app-data replacement.
 *
 * Steam rebuilds appData.details when another cache category arrives. The
 * replacement must be populated before GetAppData returns it to SteamUI;
 * otherwise observers can render the transient shortcut-only details and stay
 * there until a later navigation.
 */
export const reassertMatchedAppData = (
  appData: SteamAppData,
  metadata: MetadataData,
  screenshots: any[]
): boolean => {
  const details = appData?.details;
  if (!details) return false;

  const description = metadata.description || metadata.short_description || "";
  const descriptionsData = {
    strFullDescription: description,
    strSnippet: description,
  };
  const associationData = {
    rgDevelopers: (metadata.developers || []).map((developer) => ({
      strName: developer.name,
      strURL: developer.url || "",
    })),
    rgPublishers: (metadata.publishers || []).map((publisher) => ({
      strName: publisher.name,
      strURL: publisher.url || "",
    })),
    rgFranchises: [],
  };

  appData.descriptionsData = descriptionsData;
  appData.associationData = associationData;
  details.strFullDescription = description;
  details.strSnippet = description;
  details.rgDevelopers = associationData.rgDevelopers;
  details.rgPublishers = associationData.rgPublishers;
  details.rgFranchises = associationData.rgFranchises;

  // A matched shortcut can inherit Steam screenshot metadata without becoming
  // the real Steam application. Never advertise the shortcut appid as a
  // Community Market target; the quick-link policy independently removes any
  // stale native descriptor that SteamUI may already have rendered.
  if (hasMatchedSteamAppId(metadata)) {
    details.bCommunityMarketPresence = false;
  }

  if (screenshots.length) {
    details.nScreenshots = screenshots.length;
    details.vecScreenShots = screenshots;
  }

  return true;
};
