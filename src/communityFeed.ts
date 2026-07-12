import type { CommunityFallbackPage } from "./types";

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

export const fallbackPageToNativeHub = (appId: number, fallback: CommunityFallbackPage) => ({
  cached: fallback.source === "metadata",
  hub: fallback.items.map((item, index) => {
    const sourceLabel = fallback.source === "steam-scrape"
      ? item.author ? `Steam Community · ${item.author}` : "Steam Community"
      : item.author || "Metadata";
    return {
      published_file_id: syntheticCommunityId(appId, fallback.page, index),
      type: 5,
      title: item.title,
      preview_image_url: item.image_url,
      full_image_url: item.image_url,
      image_width: item.width,
      image_height: item.height,
      comment_count: 0,
      votes_for: 0,
      content_descriptorids: [],
      spoiler_tag: null,
      description: item.description,
      rating_stars: 0,
      maybe_inappropriate_sex: 0,
      maybe_inappropriate_violence: 0,
      youtube_video_id: null,
      creator: { name: sourceLabel, steamid: "0", avatar: "", online_state: 0 },
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

export const allSyntheticCommunityIds = (value: unknown): boolean => {
  const ids = Array.isArray(value) ? value : [];
  return ids.length > 0 && ids.every((id) => String(id).startsWith("90909"));
};

export const communityDetailFetcherMethodNames = (module: unknown): string[] => {
  if (!module || (typeof module !== "object" && typeof module !== "function")) return [];
  let keys: string[];
  try {
    keys = Object.keys(module);
  } catch (_error) {
    return [];
  }
  const methods: string[] = [];
  for (const key of keys) {
    let candidate: unknown;
    try {
      candidate = (module as Record<string, unknown>)[key];
    } catch (_error) {
      continue;
    }
    if (typeof candidate !== "function") continue;
    let source: string;
    try {
      source = Function.prototype.toString.call(candidate);
    } catch (_error) {
      continue;
    }
    if (
      /\bInit\s*\(/.test(source) &&
      /published[_-]?file|publishedfile/i.test(source) &&
      /queryFn/.test(source) &&
      /detail|comment|reaction/i.test(source)
    ) {
      methods.push(key);
    }
  }
  return methods;
};

export const shieldSyntheticCommunityCall = <T>(
  original: (...args: unknown[]) => T,
  args: unknown[],
  emptyResult: T
): T => {
  const ids = args.find(Array.isArray);
  return allSyntheticCommunityIds(ids) ? emptyResult : original(...args);
};
