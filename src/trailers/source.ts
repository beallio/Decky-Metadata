import type { MetadataData } from "../types";

export const SHORTCUT_APP_ID_BOUNDARY = 0x80000000;

export type TrailerSource = {
  pageAppId: number;
  sourceAppId: number;
  kind: "steam" | "shortcut";
};

export type TrailerSourceContext = {
  route: string;
  heroAppId: number | null | undefined;
  overview: unknown;
  metadata: Pick<MetadataData, "steam_appid"> | null | undefined;
  hydrated: boolean;
};

export const parseTrailerRootRoute = (route: string): number | null => {
  const routeText = String(route || "").trim();
  if (routeText.includes("#") || /\b(?:tab|page|section|subpage)=/i.test(routeText)) return null;
  const first = routeText.split(/\s+/, 1)[0];
  if (!first) return null;
  let path: string;
  try {
    const parsed = new URL(first, "https://steamloopback.host/");
    if (parsed.hostname !== "steamloopback.host") return null;
    if (parsed.hash || ["tab", "page", "section", "subpage"].some((key) => parsed.searchParams.has(key))) return null;
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
  return sourceAppId ? { pageAppId, sourceAppId, kind: "shortcut" } : null;
};
