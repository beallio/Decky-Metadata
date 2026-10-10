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

const associationsMatch = (current: any, people: MetadataData["developers"]): boolean => {
  if (!Array.isArray(current) || current.length !== (people?.length || 0)) return false;
  for (let index = 0; index < current.length; index += 1) {
    const person = people![index];
    if (current[index]?.strName !== person.name || current[index]?.strURL !== (person.url || "")) return false;
  }
  return true;
};

const associationValues = (current: any, native: any, people: MetadataData["developers"]): any[] => {
  if (associationsMatch(current, people)) return current;
  if (associationsMatch(native, people)) return native;
  return people?.map((person) => ({ strName: person.name, strURL: person.url || "" })) || [];
};

const SCREENSHOT_FIELDS = [
  "appid", "id", "nScreenshotID", "strCaption", "strImageURL", "strThumbnailURL",
  "strURL", "url", "nWidth", "nHeight", "width", "height", "bSpoiler",
] as const;

const screenshotsMatch = (current: any, expected: any[]): boolean => {
  if (current === expected) return true;
  if (!Array.isArray(current) || current.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    for (const field of SCREENSHOT_FIELDS) {
      if (current[index]?.[field] !== expected[index]?.[field]) return false;
    }
  }
  return true;
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

  const description = metadata.short_description?.trim() ? metadata.short_description : metadata.description || "";
  if (
    appData.descriptionsData?.strFullDescription !== description ||
    appData.descriptionsData?.strSnippet !== description
  ) {
    appData.descriptionsData = { strFullDescription: description, strSnippet: description };
  }

  const previousAssociations = appData.associationData;
  const developers = associationValues(previousAssociations?.rgDevelopers, details.rgDevelopers, metadata.developers);
  const publishers = associationValues(previousAssociations?.rgPublishers, details.rgPublishers, metadata.publishers);
  const franchises = Array.isArray(previousAssociations?.rgFranchises) && previousAssociations.rgFranchises.length === 0
    ? previousAssociations.rgFranchises
    : Array.isArray(details.rgFranchises) && details.rgFranchises.length === 0
      ? details.rgFranchises
      : [];
  if (
    previousAssociations?.rgDevelopers !== developers ||
    previousAssociations?.rgPublishers !== publishers ||
    previousAssociations?.rgFranchises !== franchises
  ) {
    appData.associationData = { rgDevelopers: developers, rgPublishers: publishers, rgFranchises: franchises };
  }

  // Peer getters can read these observables inside Steam's DLC autorun. New
  // equivalent arrays would invalidate that autorun and re-render this page.
  if (details.strFullDescription !== description) details.strFullDescription = description;
  if (details.strSnippet !== description) details.strSnippet = description;
  if (!associationsMatch(details.rgDevelopers, metadata.developers)) details.rgDevelopers = developers;
  if (!associationsMatch(details.rgPublishers, metadata.publishers)) details.rgPublishers = publishers;
  if (!Array.isArray(details.rgFranchises) || details.rgFranchises.length !== 0) details.rgFranchises = franchises;

  // A matched shortcut can inherit Steam screenshot metadata without becoming
  // the real Steam application. Never advertise the shortcut appid as a
  // Community Market target; the quick-link policy independently removes any
  // stale native descriptor that SteamUI may already have rendered.
  if (hasMatchedSteamAppId(metadata) && details.bCommunityMarketPresence !== false) {
    details.bCommunityMarketPresence = false;
  }

  if (screenshots.length) {
    if (details.nScreenshots !== screenshots.length) details.nScreenshots = screenshots.length;
    if (!screenshotsMatch(details.vecScreenShots, screenshots)) details.vecScreenShots = screenshots;
    const previousScreenshots = appData.screenshots;
    if (
      !screenshotsMatch(previousScreenshots?.rgScreenshots, screenshots) ||
      !screenshotsMatch(previousScreenshots?.screenshots, screenshots) ||
      !screenshotsMatch(previousScreenshots?.vecScreenshots, screenshots) ||
      !screenshotsMatch(previousScreenshots?.vecScreenShots, screenshots)
    ) {
      appData.screenshots = {
        rgScreenshots: screenshots,
        screenshots,
        vecScreenshots: screenshots,
        vecScreenShots: screenshots,
      };
    }
  }

  return true;
};
