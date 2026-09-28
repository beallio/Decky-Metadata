import type { MetadataData } from "../types";

export const SHORTCUT_APP_ID_BOUNDARY = 0x80000000;

export type TrailerSource = {
  pageAppId: number;
  sourceAppId: number | null;
  kind: "steam" | "shortcut";
};

export type TrailerSourceContext = {
  route: string;
  heroAppId: number | null | undefined;
  overview: unknown;
  metadata: Partial<Pick<MetadataData, "steam_appid" | "source" | "source_url" | "title">> | null | undefined;
  hydrated: boolean;
};

export const parseTrailerRootRoute = (route: string): number | null => {
  const routeText = String(route || "").trim();
  const hashes = [...routeText.matchAll(/#([^\s]*)/g)].map((match) => match[1].toLowerCase());
  if (hashes.some((hash) => hash && hash !== "quickaccess") || /\b(?:tab|page|section|subpage)=/i.test(routeText)) return null;
  const first = routeText.split(/\s+/, 1)[0];
  if (!first) return null;
  let path: string;
  try {
    const parsed = new URL(first, "https://steamloopback.host/");
    if (parsed.hostname !== "steamloopback.host") return null;
    if ((parsed.hash && parsed.hash.toLowerCase() !== "#quickaccess") ||
        ["tab", "page", "section", "subpage"].some((key) => parsed.searchParams.has(key))) return null;
    path = parsed.pathname.replace(/^\/routes(?=\/)/i, "");
  } catch {
    return null;
  }
  const match = path.match(/^\/library\/(?:app|details)\/(\d{1,10})\/?$/i)
    ?? path.match(/^\/library\/collection\/[^/]+\/(\d{1,10})\/?$/i)
    ?? path.match(/^\/library\/collection\/[^/]+\/app\/(\d{1,10})\/?$/i);
  if (!match) return null;
  const appId = Number(match[1]);
  return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : null;
};

const nativeOverviewAppId = (value: unknown): number | null => {
  if (!value || typeof value !== "object") return null;
  const appId = Number((value as { appid?: unknown }).appid);
  return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : null;
};

const isNativeShortcut = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const overview = value as {
    app_type?: unknown;
    BIsShortcut?: () => unknown;
  };
  if (Number(overview.app_type) === 1073741824) return true;
  try {
    return overview.BIsShortcut?.() === true;
  } catch {
    return false;
  }
};

const validSteamAppId = (value: unknown): number | null => {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d{1,10}$/.test(value))) return null;
  const appId = Number(value);
  return Number.isSafeInteger(appId) && appId > 0 && appId < SHORTCUT_APP_ID_BOUNDARY
    ? appId
    : null;
};

const trailerTitle = (value: unknown): string => {
  const title = typeof value === "string" ? value.trim() : "";
  return title.length <= 200 ? title : "";
};

export const nativeTrailerGameTitle = (overview: unknown): string => {
  if (!overview || typeof overview !== "object") return "";
  const app = overview as Record<string, unknown>;
  return trailerTitle(app.display_name) || trailerTitle(app.localized_name) ||
    trailerTitle(app.name) || trailerTitle(app.strDisplayName);
};

export const ignGameUrl = (metadata: TrailerSourceContext["metadata"]): string | null => {
  if (metadata?.source !== "IGN" || typeof metadata.source_url !== "string") return null;
  const url = metadata.source_url.trim();
  return /^https:\/\/www\.ign\.com\/games\/[a-z0-9][a-z0-9-]{0,119}\/?$/i.test(url)
    ? url.replace(/\/$/, "") : null;
};

/** Resolve a trailer source only after Steam's native page and visible hero agree. */
export const resolveTrailerSource = (context: TrailerSourceContext): TrailerSource | null => {
  if (!context.hydrated) return null;
  const pageAppId = parseTrailerRootRoute(context.route);
  if (!pageAppId || context.heroAppId !== pageAppId) return null;
  if (nativeOverviewAppId(context.overview) !== pageAppId) return null;

  if (pageAppId < SHORTCUT_APP_ID_BOUNDARY) {
    return isNativeShortcut(context.overview)
      ? null
      : { pageAppId, sourceAppId: pageAppId, kind: "steam" };
  }
  if (!isNativeShortcut(context.overview)) return null;
  const sourceAppId = validSteamAppId(context.metadata?.steam_appid);
  if (!sourceAppId && !nativeTrailerGameTitle(context.overview) &&
      !(typeof context.metadata?.title === "string" && context.metadata.title.trim()) &&
      !ignGameUrl(context.metadata)) return null;
  return { pageAppId, sourceAppId, kind: "shortcut" };
};
