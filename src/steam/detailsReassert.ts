import type { MetadataData } from "../types";

type SteamAppData = {
  details?: Record<string, any>;
  descriptionsData?: Record<string, any>;
  associationData?: Record<string, any>;
  screenshots?: Record<string, any>;
};

export const hasMatchedSteamAppId = (metadata: MetadataData | undefined): boolean => {
  const steamAppId = Number(metadata?.steam_appid);
  return Number.isFinite(steamAppId) && steamAppId > 0;
};

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

  if (screenshots.length) {
    details.nScreenshots = screenshots.length;
    details.vecScreenShots = screenshots;
  }

  return true;
};
