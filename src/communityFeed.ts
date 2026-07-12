import type { CommunityFallbackPage } from "./types";

const PLAYHUB_COMMUNITY_YOUTUBE_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_IGN_ICON = "data:image/png;base64,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";
const PLAYHUB_COMMUNITY_RAWG_ICON = "data:image/png;base64,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";

const PLAYHUB_COMMUNITY_STEAM_ICON = "https://store.steampowered.com/favicon.ico";

export const rewriteCommunityFeedUrlForSteamApp = (
  url: string,
  steamAppId: number | null | undefined
): string | null => {
  const cleanSteamAppId = Number(steamAppId || 0);
  if (cleanSteamAppId <= 0) return null;
  if (!/library\/appcommunityfeed\/\d+/.test(String(url || ""))) return null;
  return String(url || "").replace(/appcommunityfeed\/\d+/, `appcommunityfeed/${cleanSteamAppId}`);
};

const pageFromValue = (value: unknown): number | null => {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(Math.trunc(parsed), 100));
};

const pageFromTransportValue = (value: unknown, depth = 0): number | null => {
  if (depth > 3 || value == null) return null;
  if (value instanceof URLSearchParams) {
    for (const key of ["p", "page", "itemspage", "screenshotspage"]) {
      const page = pageFromValue(value.get(key));
      if (page) return page;
    }
    return null;
  }
  if (typeof value === "string") {
    const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : value;
    const params = new URLSearchParams(query);
    for (const key of ["p", "page", "itemspage", "screenshotspage"]) {
      const page = pageFromValue(params.get(key));
      if (page) return page;
    }
    const cursorPage = value.match(/(?:^|[^a-z])page[_:=/-]?(\d+)/i)?.[1];
    return pageFromValue(cursorPage);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["p", "page", "itemspage", "screenshotspage"]) {
      const page = pageFromValue(record[key]);
      if (page) return page;
    }
    for (const key of ["body", "data", "params", "cursor"]) {
      const page = pageFromTransportValue(record[key], depth + 1);
      if (page) return page;
    }
  }
  return null;
};

export const requestedCommunityPage = (url: string, transportArgs: unknown[] = []) => {
  for (const value of transportArgs) {
    const page = pageFromTransportValue(value);
    if (page) return page;
  }
  return pageFromTransportValue(url) || 1;
};

export const nativeHubHasContent = (response: unknown): response is { hub: unknown[] } =>
  Boolean(response && typeof response === "object" && Array.isArray((response as { hub?: unknown[] }).hub) && (response as { hub: unknown[] }).hub.length);

export const syntheticCommunityId = (appId: number, page: number, index: number) => {
  const cleanAppId = String(Math.max(0, Math.trunc(Number(appId) || 0))).padStart(10, "0").slice(-10);
  const cleanPage = String(Math.max(1, Math.min(Math.trunc(Number(page) || 1), 100))).padStart(3, "0");
  const cleanIndex = String(Math.max(0, Math.trunc(Number(index) || 0))).padStart(2, "0").slice(-2);
  return `90909${cleanAppId}${cleanPage}${cleanIndex}`;
};

const communityProviderIcon = (source?: string) => {
  const cleanSource = String(source || "").trim().toLowerCase();
  if (cleanSource.includes("steam")) return PLAYHUB_COMMUNITY_STEAM_ICON;
  if (cleanSource.includes("youtube")) return PLAYHUB_COMMUNITY_YOUTUBE_ICON;
  if (cleanSource.includes("rawg")) return PLAYHUB_COMMUNITY_RAWG_ICON;
  return PLAYHUB_COMMUNITY_IGN_ICON;
};

const communityCreator = (source: string, avatar: string) => ({
  steamid: "76561197960287930",
  name: source || "Playhub Metadata",
  avatar,
  avatar_url: avatar,
  avatar_medium: avatar,
  avatar_full: avatar,
  avatarFullURL: avatar,
});

export const fallbackPageToNativeHub = (appId: number, fallback: CommunityFallbackPage) => ({
  cached: fallback.source === "metadata",
  hub: fallback.items.map((item, index) => {
    const isVideo = Boolean(item.youtube_id);
    const sourceLabel = isVideo
      ? item.author || "YouTube"
      : fallback.source === "steam-scrape"
      ? item.author ? `Steam Community · ${item.author}` : "Steam Community"
      : item.author || "Metadata";
    const providerIcon = communityProviderIcon(sourceLabel);
    const itemLink = item.link || item.image_url;
    const publishedFileId = syntheticCommunityId(appId, fallback.page, index);
    return {
      appid: appId,
      consumer_appid: appId,
      published_file_id: publishedFileId,
      publishedfileid: publishedFileId,
      type: isVideo ? 2 : 5,
      title: item.title,
      preview_image_url: item.image_url,
      full_image_url: item.image_url,
      image_width: item.width,
      image_height: item.height,
      url: itemLink,
      link: itemLink,
      external_url: itemLink,
      strURL: itemLink,
      ...(isVideo ? { youtube_video_id: item.youtube_id } : {}),
      avatar: providerIcon,
      avatar_url: providerIcon,
      creator_avatar_url: providerIcon,
      author_avatar_url: providerIcon,
      owner_avatar_url: providerIcon,
      content_descriptorids: [],
      spoiler_tag: false,
      description: item.description,
      creator: communityCreator(sourceLabel, providerIcon),
      author: sourceLabel,
      time_created: Math.floor(Date.now() / 1000) - index * 60,
      votes_up: 0,
      votes_down: 0,
      num_comments_public: 0,
      reactions: [],
    };
  }),
});

export type CommunityFeedDecisionOptions = {
  appId: number;
  page: number;
  originalArgs: unknown[];
  rewrittenArgs?: unknown[] | null;
  nativeRequest: (args: unknown[]) => Promise<unknown>;
  fallbackRequest: (appId: number, page: number) => Promise<CommunityFallbackPage>;
  onFallbackError?: (error: unknown) => void;
};

export const resolveCommunityFeed = async ({
  appId,
  page,
  originalArgs,
  rewrittenArgs,
  nativeRequest,
  fallbackRequest,
  onFallbackError,
}: CommunityFeedDecisionOptions): Promise<unknown> => {
  const nativeArgs = rewrittenArgs || originalArgs;
  let native: unknown;
  let nativeError: unknown;
  try {
    native = await nativeRequest(nativeArgs);
    if (nativeHubHasContent(native)) return native;
  } catch (error) {
    nativeError = error;
  }

  try {
    const fallback = await fallbackRequest(appId, page);
    if (fallback.items.length) return fallbackPageToNativeHub(appId, fallback);
  } catch (error) {
    onFallbackError?.(error);
    // Native preservation rules below intentionally handle fallback failures.
  }
  if (!nativeError) return native;
  if (rewrittenArgs) return nativeRequest(originalArgs);
  throw nativeError;
};

export const resolveCommunityRequest = (
  options: CommunityFeedDecisionOptions & { isNonSteam: boolean }
): Promise<unknown> =>
  options.isNonSteam
    ? resolveCommunityFeed(options)
    : options.nativeRequest(options.originalArgs);
