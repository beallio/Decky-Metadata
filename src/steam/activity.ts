import { findModuleChild } from "@decky/ui";
import { frontendLog } from "../backend";
import { rewriteCommunityFeedUrlForSteamApp } from "../communityFeed";
import { MetadataData, NativePartnerEvent, NativePartnerEventStore } from "../types";
import * as log from "../log";
import {
  DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY,
  Unpatch,
  activityAppIdFromUrl,
  currentGameDetailAppId,
  currentRoutePath,
  deckyNativeActivityCache,
  deckyNativePartnerEventCache,
  deckyNativePartnerEventStore,
  gameDetailAppIdFromPath,
  getOverview,
  hasActivityStore,
  hasSteamInternals,
  historyPathFromArgs,
  historyStateFromArgs,
  isNonSteamApp,
  metadataCache,
  patchInstallStatus,
  patchMethod,
  rewriteSteamLinkToMatchedApp,
  steamInternals,
} from "./core";

let ensureMetadataCacheFn: () => Promise<void> = async () => undefined;
export const configureActivityMetadataLoader = (ensureMetadataCache: () => Promise<void>) => {
  ensureMetadataCacheFn = ensureMetadataCache;
};

const isDeckyCommunityId = (value: unknown) =>
  typeof value === "string" && value.startsWith("90909");

const deckyActivityId = (appId: number, index: number, date: number) =>
  `decky-activity-${appId}-${date || 0}-${index}`;

const numericSteamNewsGid = (value: unknown) => {
  const text = String(value || "");
  const direct = text.match(/^\d{8,}$/);
  if (direct) return direct[0];
  const fromUrl = text.match(/(?:announcements\/detail|news\/app\/\d+\/view)\/(\d{8,})/i);
  if (fromUrl?.[1]) return fromUrl[1];
  const fromOldAnnouncement = text.match(/old_announce_(\d{8,})/i);
  if (fromOldAnnouncement?.[1]) return fromOldAnnouncement[1];
  const anyNumericGid = text.match(/\b(\d{8,})\b/);
  return anyNumericGid?.[1] || "";
};

const cleanSteamNewsDisplayText = (value: unknown) =>
  String(value || "")
    .replace(/\[previewyoutube=[A-Za-z0-9_-]{11}(?:;[^\]]*)?\]\s*\[\/previewyoutube\]/gi, " ")
    .replace(/\[previewyoutube=[^\]]+\]/gi, " ")
    .replace(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/\d+\/[^\s<>\)\]\[]+/gi, " ")
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, " ")
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[\/?(?:p|br|hr|quote|spoiler|table|tr|td|th|img|url|h1|h2|h3|h4|b|i|u|s|strike|list|\*|code|noparse|previewyoutube|video|youtube|size|color|font|center|left|right)[^\]]*\]/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const steamNewsRawBodyForModal = (value: unknown) =>
  String(value || "")
    .replace(/\\\//g, "/")
    .trim();

const steamAppHeaderImage = (steamAppId?: number | null) =>
  steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg` : "";

const steamNewsImageCandidatesForMetadata = (_metadata: MetadataData, news: NonNullable<MetadataData["steam_news"]>[number]) => {
  const rawSources = Array.isArray(news.image_sources) ? news.image_sources : [];
  return Array.from(new Set([
    news.image,
    news.image_url,
    news.preview_image_url,
    ...rawSources,
  ].map(cleanSteamImageUrl).filter(Boolean)));
};

const steamNewsImageForMetadata = (metadata: MetadataData, news: NonNullable<MetadataData["steam_news"]>[number]) =>
  steamNewsImageCandidatesForMetadata(metadata, news)[0] || "";

const normaliseActivityNewsKeyText = (value: unknown) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");

const uniqueSteamNewsForActivity = (metadata: MetadataData) => {
  const seen = new Set<string>();
  return (metadata.steam_news || [])
    .filter((item) => item?.url && item?.title)
    .filter((item) => {
      const title = normaliseActivityNewsKeyText(item.title);
      const summary = normaliseActivityNewsKeyText(item.summary || "").slice(0, 160);
      const canonicalUrl = String(item.url || "").replace(/[?#].*$/, "").toLocaleLowerCase("en-US");
      const day = Math.floor((Number(item.date || 0) || 0) / 86400);
      const key = `${title}|${canonicalUrl || day}|${summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
};

const steamActivityNewsItemsFromMetadata = (appId: number, metadata: MetadataData) =>
  uniqueSteamNewsForActivity(metadata)
    .map((news, index) => {
      const date = Number(news.date || 0) || Math.floor(Date.now() / 1000) - index * 60;
      const imageCandidates = steamNewsImageCandidatesForMetadata(metadata, news);
      const imageUrl = imageCandidates[0] || "";
      const fallbackImageUrl = steamAppHeaderImage(metadata.steam_appid);
      const displayImageUrl = imageUrl || fallbackImageUrl;
      const eventType = normalizeDeckySteamActivityType(news.event_type || news.type);
      const eventTags = deckySteamActivityTypeTags(eventType);
      const eventLabel = deckySteamActivityTypeLabel(eventType);
      const rawBody = steamNewsRawBodyForModal(news.raw_body || news.body || news.summary || "");
      const summary = eventType === 12 ? "" : cleanSteamNewsDisplayText(news.summary || news.title || "");
      const title = cleanSteamNewsDisplayText(news.title || metadata.title || "Steam news");
      const url = news.url || metadata.steam_store_url || "";
      const id = deckyActivityId(appId, index, date);
      const steamGid = numericSteamNewsGid(news.gid || news.news_id || news.announcement_gid || news.event_gid || news.id || news.url);
      const eventGid = numericSteamNewsGid(news.event_gid || news.gid || news.news_id || news.announcement_gid || news.id || news.url);
      const jsondata = JSON.stringify({
        localized_title_image: displayImageUrl,
        localized_capsule_image: displayImageUrl,
        localized_spotlight_image: displayImageUrl,
        localized_summary: summary,
        localized_body: rawBody,
        store_url: url,
      });
      return {
        appid: appId,
        gid: steamGid || id,
        id,
        news_id: steamGid || id,
        announcement_gid: steamGid || id,
        clan_steamid: "103582791429521412",
        event_name: title,
        event_type: eventType,
        type: eventType,
        title,
        headline: title,
        description: summary,
        summary,
        body: cleanSteamNewsDisplayText(news.body || summary),
        raw_body: rawBody,
        contents: summary,
        url,
        external_url: url,
        link: url,
        image: displayImageUrl,
        image_url: displayImageUrl,
        event_image_url: imageUrl,
        image_sources: imageCandidates,
        fallback_image_url: fallbackImageUrl,
        header_image_url: fallbackImageUrl,
        capsule: displayImageUrl,
        capsule_image: displayImageUrl,
        preview_image_url: displayImageUrl,
        full_image_url: displayImageUrl || url,
        rtime32_start_time: date,
        rtime32_end_time: date,
        rtime32_last_modified: date,
        posttime: date,
        published: date,
        time_created: date,
        date,
        feedlabel: news.feedLabel || news.author || eventLabel,
        author: news.author || news.feedLabel || eventLabel,
        comment_count: 0,
        upvotes: 0,
        downvotes: 0,
        jsondata,
        announcement_body: {
          gid: steamGid || id,
          clanid: "0",
          posterid: "0",
          headline: title,
          posttime: date,
          updatetime: date,
          body: rawBody || summary,
          commentcount: 0,
          tags: eventTags,
          language: 0,
          hidden: 0,
          forum_topic_id: "0",
          event_gid: eventGid || steamGid || id,
          voteupcount: 0,
          votedowncount: 0,
        },
      };
    });

export const steamActivityPayloadForApp = async (appId: number) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  await ensureMetadataCacheFn();
  let metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  const items = metadata ? steamActivityNewsItemsFromMetadata(appId, metadata) : [];
  if (!items.length) return null;
  // Steam client internals changed names across versions. Return a deliberately
  // redundant shape so the native Activity store can read the same cards through
  // the field name it expects, while keeping the items Steam-like.
  return {
    events: items,
    rgEvents: items,
    rgNews: items,
    rgActivity: items,
    rgFeedItems: items,
    activity: items,
    activities: items,
    news: items,
    items,
    results: items,
    count: items.length,
    bHasMore: false,
    success: 1,
  };
};


const STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE = 1002;
const STEAM_PARTNER_EVENT_TYPE_NEWS = 28;
const DECKY_SUPPORTED_STEAM_ACTIVITY_TYPES = new Set([12, 13, 14, 15, 23, 24, 25, 28, 35]);
const DECKY_STEAM_ACTIVITY_TYPE_LABELS: Record<number, string> = {
  12: "Minor update / Patch notes",
  13: "Update",
  14: "Major update",
  15: "Downloadable content",
  23: "Event: Loot",
  24: "Event: Perks",
  25: "Event: Challenge",
  28: "News",
  35: "In-game event",
};
const DECKY_STEAM_ACTIVITY_TYPE_TAGS: Record<number, string[]> = {
  12: ["patchnotes", "update", "decky_metadata"],
  13: ["update", "decky_metadata"],
  14: ["majorupdate", "update", "decky_metadata"],
  15: ["dlc", "release", "decky_metadata"],
  23: ["loot", "event", "decky_metadata"],
  24: ["perks", "event", "decky_metadata"],
  25: ["challenge", "event", "decky_metadata"],
  28: ["news", "decky_metadata"],
  35: ["ingame", "event", "decky_metadata"],
};
const normalizeDeckySteamActivityType = (value: unknown) => {
  const type = Number(value || 0) || STEAM_PARTNER_EVENT_TYPE_NEWS;
  return DECKY_SUPPORTED_STEAM_ACTIVITY_TYPES.has(type) ? type : STEAM_PARTNER_EVENT_TYPE_NEWS;
};
const deckySteamActivityTypeLabel = (type: number) => DECKY_STEAM_ACTIVITY_TYPE_LABELS[type] || "News";
const deckySteamActivityTypeTags = (type: number) => DECKY_STEAM_ACTIVITY_TYPE_TAGS[type] || DECKY_STEAM_ACTIVITY_TYPE_TAGS[28];
const isDeckyPatchNoteActivity = (item: any) => normalizeDeckySteamActivityType(item?.event_type || item?.type) === 12;
type DeckyNativeActivityDay = {
  isValid: boolean;
  events: any[];
  GetLatestEventTime: () => number;
  GetEarliestEventTime: () => number;
  BHasEvents?: () => boolean;
};

const fakeSteamId = (accountId = 0, steamId64 = "76561197960287930") => ({
  GetAccountID: () => accountId,
  ConvertTo64BitString: () => steamId64,
  toString: () => steamId64,
});

const toSteamClanImageUrl = (value: unknown) => {
  const text = String(value || "").trim().replace(/\\\//g, "/");
  const match = text.match(/\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/(\d+)\/([^\s<>\)\]\[]+)/i);
  if (!match) return text;
  return `https://clan.cloudflare.steamstatic.com/images/${match[1]}/${match[2].replace(/[\"'.,;:]+$/g, "")}`;
};

const cleanSteamImageUrl = (value: unknown) => {
  let text = String(value || "").trim();
  if (!text) return "";
  try {
    text = decodeURIComponent(text);
  } catch (_error) {
    // Keep the original URL if it is not URI encoded.
  }
  text = text.replace(/\\\//g, "/").replace(/&amp;/gi, "&").trim();
  text = text.replace(/\[\/?img\].*$/i, "").replace(/[\]\)>.,;:'"]+$/g, "").trim();
  text = toSteamClanImageUrl(text);
  if (text.startsWith("//")) text = `https:${text}`;
  if (text.startsWith("http://")) text = text.replace(/^http:\/\//i, "https://");
  return /^https:\/\//i.test(text) ? text : "";
};



const collectSteamNewsImages = (steamAppId: number, item: any) => {
  const values = [
    item.image,
    item.image_url,
    item.preview_image_url,
    item.full_image_url,
    item.capsule_image,
    item.capsule,
    item.localized_title_image,
    item.localized_capsule_image,
    item.localized_spotlight_image,
    item.header_image_url,
    item.fallback_image_url,
  ];
  if (Array.isArray(item.image_sources)) values.push(...item.image_sources);
  // Keep the explicit fallback at the end: cards with no embedded artwork should
  // still show the game header, but embedded/event-specific images stay first.
  return Array.from(new Set(values.map(cleanSteamImageUrl).filter(Boolean)));
};

const uniqueNonEmptyStrings = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const deckyNativePartnerEventKeys = (event: any) => {
  const gid = numericSteamNewsGid(event?.AnnouncementGID || event?.announcement_gid || event?.announcementGID || event?.gid || event?.GID || event?.url);
  const oldAnnouncementGid = gid ? `old_announce_${gid}` : "";
  return uniqueNonEmptyStrings([
    event?.GID,
    event?.gid,
    event?.event_gid,
    event?.AnnouncementGID,
    event?.announcement_gid,
    event?.announcementGID,
    gid,
    oldAnnouncementGid,
  ]);
};

const collectNativePartnerEventStores = (): NativePartnerEventStore[] => {
  const host = steamInternals();
  const stores: NativePartnerEventStore[] = [];
  const add = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const c = candidate as NativePartnerEventStore;
    const looksLikeStore =
      typeof c.GetClanEventModel === "function" ||
      typeof c.GetClanEventFromAnnouncementGID === "function" ||
      typeof c.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
      c.m_mapExistingEvents?.set;
    if (looksLikeStore && !stores.includes(c)) stores.push(c);
  };

  add(host.partnerEventStore);
  add(host.g_PartnerEventStore);
  add(host.g_PartnerEventSummaryStore);
  add(host[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY]);

  try {
    const discovered = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      for (const prop in module) {
        const candidate = module[prop];
        if (
          candidate &&
          typeof candidate === "object" &&
          (typeof candidate.GetClanEventFromAnnouncementGID === "function" ||
            typeof candidate.LoadPartnerEventFromAnnoucementGIDAndClanSteamID === "function" ||
            typeof candidate.GetClanEventModel === "function")
        ) {
          return candidate;
        }
      }
      return undefined;
    });
    add(discovered);
  } catch (_error) {
    // Decky may not expose the module yet. The interval installer retries.
  }

  if (stores[0]) host[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY] = stores[0];
  return stores;
};

const registerDeckyNativePartnerEventInSteamStore = (event: any, partnerStore?: any) => {
  const store = partnerStore || deckyNativePartnerEventStore();
  if (!store || !event) return;
  const keys = deckyNativePartnerEventKeys(event);
  const numericGid = numericSteamNewsGid(event?.AnnouncementGID || event?.announcement_gid || event?.GID || event?.gid);
  const canonicalEventGid = String(event?.GID || (numericGid ? `old_announce_${numericGid}` : "")).trim();
  try {
    if (store.m_mapExistingEvents?.set) {
      keys.forEach((key) => store.m_mapExistingEvents.set(key, event));
    }
    if (numericGid && store.m_mapAnnouncementBodyToEvent?.set) {
      store.m_mapAnnouncementBodyToEvent.set(numericGid, canonicalEventGid || numericGid);
      store.m_mapAnnouncementBodyToEvent.set(String(numericGid), canonicalEventGid || numericGid);
      store.m_mapAnnouncementBodyToEvent.set(`old_announce_${numericGid}`, canonicalEventGid || `old_announce_${numericGid}`);
    }
    const appendToMapList = (map: any, key: unknown, value: string) => {
      if (!map?.get || !map?.set || !key || !value) return;
      const mapKey = typeof key === "number" ? key : Number(key);
      const actualKey = Number.isFinite(mapKey) && mapKey > 0 ? mapKey : key;
      const current = map.get(actualKey) || [];
      if (Array.isArray(current) && !current.includes(value)) {
        map.set(actualKey, [...current, value]);
      }
    };
    appendToMapList(store.m_mapAppIDToGIDs, event.appid, canonicalEventGid);
    appendToMapList(store.m_mapAppIDToGIDs, event.reference_appid || event.steam_appid, canonicalEventGid);
    const clanAccountId = event.clanSteamID?.GetAccountID?.();
    appendToMapList(store.m_mapClanToGIDs, clanAccountId, canonicalEventGid);
    if (canonicalEventGid && typeof store.GetPartnerEventChangeCallback === "function") {
      store.GetPartnerEventChangeCallback(canonicalEventGid)?.Dispatch?.(event);
    }
  } catch (error) {
    log.warn("patch", "unable to register native PartnerEvent", error);
  }
};

const rememberDeckyNativePartnerEvent = (event: any) => {
  const cache = deckyNativePartnerEventCache();
  deckyNativePartnerEventKeys(event).forEach((key) => cache.set(String(key), event));
  const stores = collectNativePartnerEventStores();
  if (stores.length) stores.forEach((store) => registerDeckyNativePartnerEventInSteamStore(event, store));
  else registerDeckyNativePartnerEventInSteamStore(event);
};

const cloneDeckyNativePartnerEventForRoute = (event: any, requestedKey?: unknown) => {
  if (!event) return null;
  const raw = String(requestedKey || "").trim();
  const numericGid = numericSteamNewsGid(raw || event?.AnnouncementGID || event?.announcement_gid || event?.GID || event?.gid);
  // Steam's event overlay validates with a strict `event.GID == initialEventID` check.
  // Activity cards, old announcements and Store News routes may pass either the numeric
  // announcement id or the `old_announce_<gid>` event id, so return a route-local
  // clone whose GID matches the key Steam asked for while keeping AnnouncementGID
  // numeric for the real announcement data.
  const routeGid = raw || String(event?.GID || (numericGid ? `old_announce_${numericGid}` : "0"));
  return {
    ...event,
    GID: routeGid,
    gid: routeGid,
    event_gid: routeGid,
    AnnouncementGID: numericGid || event?.AnnouncementGID || event?.announcement_gid || "0",
    announcement_gid: numericGid || event?.announcement_gid || event?.AnnouncementGID || "0",
    announcementGID: numericGid || event?.announcementGID || event?.AnnouncementGID || "0",
    GetAnnouncementGID: () => numericGid || event?.AnnouncementGID || event?.announcement_gid || "0",
  };
};

export const deckyNativePartnerEventForGid = (value: unknown, cloneForRoute = false) => {
  const raw = String(value || "").trim();
  const gid = numericSteamNewsGid(raw);
  const cache = deckyNativePartnerEventCache();
  const event = (raw && cache.get(raw)) || (gid && (cache.get(String(gid)) || cache.get(`old_announce_${gid}`))) || null;
  return cloneForRoute ? cloneDeckyNativePartnerEventForRoute(event, raw || gid) : event;
};

const makeDeckyNativePartnerEvent = (appId: number, steamAppId: number, item: any, index: number) => {
  const date = Number(item.date || item.posttime || item.published || 0) || Math.floor(Date.now() / 1000) - index * 60;
  const announcementGid = numericSteamNewsGid(item.announcement_gid || item.news_id || item.gid || item.id || item.url);
  const eventGid = numericSteamNewsGid(item.event_gid || "");
  const gid = announcementGid || eventGid;
  const nativeEventGid = eventGid && eventGid !== announcementGid ? eventGid : gid ? `old_announce_${gid}` : "0";
  const isOldAnnouncement = nativeEventGid.startsWith("old_announce_");
  const title = cleanSteamNewsDisplayText(item.title || item.event_name || item.headline || "Steam News");
  const summary = cleanSteamNewsDisplayText(item.summary || item.description || item.body || title);
  const body = cleanSteamNewsDisplayText(item.body || item.content || item.description || item.summary || title);
  const images = collectSteamNewsImages(steamAppId, item);
  const primaryImage = images[0] || "";
  const clanSteamID = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
  const type = normalizeDeckySteamActivityType(item.event_type || item.type);
  const isPatchNote = type === 12;
  const eventLabel = deckySteamActivityTypeLabel(type);
  const eventTags = deckySteamActivityTypeTags(type);
  const modalBody = steamNewsRawBodyForModal(item.raw_body || item.rawBody || item.body_html || item.body_raw || item.body || body || summary);
  const activitySummary = isPatchNote ? "" : summary;
  const announcementUrl = item.url || item.external_url || item.link || (steamAppId && announcementGid ? `https://steamcommunity.com/games/${steamAppId}/announcements/detail/${announcementGid}` : steamAppId && eventGid ? `https://store.steampowered.com/news/app/${steamAppId}/view/${eventGid}` : "");
  const jsondata = {
    // Keep the detail viewer from rendering a duplicated non-clickable preview
    // paragraph above Steam's real BBCode/HTML body.
    localized_summary: [""],
    localized_subtitle: [""],
    localized_body: [modalBody],
    localized_title_image: [primaryImage],
    localized_capsule_image: [primaryImage],
    localized_spotlight_image: [primaryImage],
    library_spotlight: true,
    library_spotlight_text: true,
    referenced_appids: steamAppId ? [steamAppId] : [],
  };
  const partnerEvent: NativePartnerEvent = {
    __deckyNativePartnerEvent: true,
    GID: nativeEventGid,
    gid: nativeEventGid,
    event_gid: nativeEventGid,
    AnnouncementGID: announcementGid || gid || "0",
    announcement_gid: announcementGid || gid || "0",
    announcementGID: announcementGid || gid || "0",
    appid: appId,
    reference_appid: steamAppId || appId,
    steam_appid: steamAppId || appId,
    type,
    event_type: type,
    bOldAnnouncement: isOldAnnouncement,
    bLoaded: true,
    loadedAllLanguages: true,
    visibility_state: 2,
    postTime: date,
    createTime: date,
    startTime: date,
    endTime: date,
    visibilityStartTime: date,
    visibilityEndTime: date + 86400 * 365,
    rtime32_moderator_reviewed: date,
    rtime32_start_time: date,
    rtime32_end_time: date,
    rtime32_last_modified: date,
    nVotesUp: Number(item.upvotes || 0) || 0,
    nVotesDown: Number(item.downvotes || 0) || 0,
    nCommentCount: Number(item.comment_count || 0) || 0,
    forumTopicGID: item.forumTopicGID || item.forum_topic_id || "0",
    clanSteamID,
    announcementClanSteamID: clanSteamID,
    jsondata,
    name: new Map([[0, title]]),
    description: new Map([[0, modalBody || body || summary]]),
    timestamp_loc_updated: new Map([[0, date]]),
    vecTags: eventTags,
    tags: eventTags,
    BHasTag: (tag: string) => eventTags.includes(String(tag || "")),
    BHasTagStartingWith: (prefix: string) => eventTags.some((tag) => tag.startsWith(String(prefix || ""))),
    GetAllTags: () => eventTags,
    BMatchesAllTags: (tags?: string[]) => !Array.isArray(tags) || tags.every((tag) => eventTags.includes(String(tag || ""))),
    BInRealmGlobal: () => true,
    BInRealmChina: () => false,
    BIsLanguageValidForRealms: () => true,
    GetNameWithFallback: () => title,
    GetGameTitle: () => title,
    GetDescriptionWithFallback: () => modalBody || body || summary,
    GetSummaryWithFallback: () => activitySummary,
    GetSummary: () => activitySummary,
    BHasSummary: () => !!activitySummary,
    GetSubTitle: () => "",
    BHasSubTitle: () => false,
    GetSubTitleWithLanguageFallback: () => "",
    GetSubTitleWithSummaryFallback: () => "",
    GetCategoryAsString: () => eventLabel,
    GetEventTypeAsString: () => eventLabel,
    GetImgArray: () => images,
    GetImageHash: () => null,
    GetImageHashAndExt: () => null,
    GetImageFromBeginningOfDescription: () => primaryImage || "",
    GetImageURL: () => primaryImage,
    GetImageURLWithFallback: () => primaryImage || images[0] || "",
    GetImageForSizeAsArrayWithFallback: (_size?: string, _language?: string, _format?: string, skipFallback?: boolean) => {
      const out = images.slice();
      if (!skipFallback && steamAppId) {
        out.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`);
        out.push(`https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`);
      }
      return Array.from(new Set(out.map(cleanSteamImageUrl).filter(Boolean)));
    },
    BImageNeedScreenshotFallback: () => images.length === 0,
    BHasSomeImage: () => images.length > 0,
    BHasImage: () => images.length > 0,
    GetFallbackArtworkScreenshot: () => images[0] || (steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg` : ""),
    GetStartTimeAndDateUnixSeconds: () => date,
    GetEndTimeAndDateUnixSeconds: () => date,
    GetPostTimeAndDateUnixSeconds: () => date,
    GetAnnouncementGID: () => announcementGid || gid || "0",
    BHasAnnouncementGID: () => !!(announcementGid || gid),
    GetAppID: () => appId,
    GetReferenceAppID: () => steamAppId || appId,
    GetStoreAppID: () => steamAppId || appId,
    BIsPartnerEvent: () => false,
    BIsOGGEvent: () => !!steamAppId,
    BIsEventInFuture: () => false,
    BHasEventEnded: () => false,
    BIsEventActionEnabled: () => false,
    BShowLibrarySpotlight: () => false,
    BShowLibrarySpotlightText: () => false,
    BIsImageSafeForAllAges: () => true,
    BHasBroadcastEnabled: () => false,
    BEventCanShowBroadcastWidget: () => false,
    BHasBroadcastForceBanner: () => false,
    BSaleShowBroadcastAtTopOfPage: () => false,
    GetVisibilityStartTimeAndDateUnixSeconds: () => date,
    BHasForumTopicGID: () => false,
    GetForumTopicURL: () => "",
    GetAppIDOrReferenceAppID: () => steamAppId || appId,
    GetEventType: () => type,
    BIsVisibleEvent: () => true,
    BIsStagedEvent: () => false,
    BIsUnlistedEvent: () => false,
    BHasEmailEnabled: () => false,
    BHasSaleEnabled: () => false,
    BHasSaleVanity: () => false,
    GetSaleVanity: () => "",
    BHasSaleUpdateLandingPageVanity: () => false,
    GetSaleUpdateLandingPageVanity: () => "",
    GetSaleURL: () => null,
    GetSaleSections: () => [],
    GenerateDynamicSaleSections: () => [],
    GetSaleSectionIncludingFooterSections: () => null,
    GetSaleSectionByID: () => null,
    GetSaleSectionCount: () => 0,
    GetSaleSectionsByType: () => [],
    GetSaleSectionFirstMatchByType: () => null,
    GetSaleItemOfType: () => null,
    GetSaleItemCountOfType: () => 0,
    GetSaleFeaturedAppsCount: () => 0,
    GetSaleFeaturedAppsAndDemosCount: () => 0,
    GetSaleFeaturedBundlesCount: () => 0,
    GetSaleFeaturedPackagesCount: () => 0,
    GetSaleFeaturedApps: () => [],
    GetSaleFeaturedAppsAndDemos: () => [],
    GetSaleFeaturedBundles: () => [],
    GetSaleFeaturedPackages: () => [],
    GetTaggedItems: () => [],
    BHasScheduleEnabled: () => false,
    BAllowedSteamStoreSpotlight: () => false,
    BHasLibaryHomeSpotlight: () => false,
    BHasLibraryHomeSpotlight: () => false,
    BHasSaleProductBanners: () => false,
    GetSteamAwardCategory: () => 0,
    GetSteamAwardNomineeCategories: () => [],
    BIsLockedToGameOwners: () => false,
    GetRequiredAppIDs: () => [],
    GetRequiredPackageIDs: () => [],
    BUseSubscriptionLayout: () => false,
    BIsLockedToPartnerAppRights: () => false,
    GetRequiredPartnerAppRights: () => undefined,
    GetValveAccessLog: () => [],
    BUsesContentHubForItemSource: () => false,
    GetContentHubType: () => undefined,
    GetContentHubCategory: () => undefined,
    GetContentHubTag: () => undefined,
    GetContentHub: () => undefined,
    BContentHubDiscountedOnly: () => false,
    BIsBackgroundImageGroupingEnabled: () => false,
    GetSalePageGroupDefinition: () => undefined,
    GetSalePageBackgroundImageGroupCount: () => 0,
    GetAllSalePageGroups: () => [],
    GetSalePageBackgroundGroup: () => undefined,
    GetIncludedRealmList: () => [0],
    BIsValidForRealm: () => true,
    BIsNextFest: () => false,
    GetLastUpdateTime: () => date,
    GetLastUpdaterSteamIDStr: () => "",
    GetStoreOrCommunityURL: () => announcementUrl,
    GetCommunityDiscussionURL: () => announcementUrl,
    GetStoreNewsURL: () => steamAppId && (announcementGid || eventGid || gid) ? `https://store.steampowered.com/news/app/${steamAppId}/view/${announcementGid || eventGid || gid}` : announcementUrl,
    url: announcementUrl,
  };
  rememberDeckyNativePartnerEvent(partnerEvent);
  return partnerEvent;
};

const makeDeckyNativeActivityEvent = (appId: number, metadata: MetadataData, item: any, index: number) => {
  const steamAppId = Number(metadata.steam_appid || item.appid || appId) || appId;
  const partnerEvent = makeDeckyNativePartnerEvent(appId, steamAppId, item, index);
  const date = Number(partnerEvent.postTime || 0) || Math.floor(Date.now() / 1000) - index * 60;
  const gid = numericSteamNewsGid(partnerEvent.GID || item.url) || String(date);
  const actor = fakeSteamId(0, String(item.clan_steamid || "103582791429521412"));
  return {
    __deckyNativeActivityEvent: true,
    gameid: String(appId),
    unUniqueID: Number(`${String(gid).slice(-8)}${index}`.slice(-9)) || date + index,
    rtEventTime: date,
    steamIDActor: actor,
    steamIDTarget: fakeSteamId(),
    eEventType: STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE,
    eEventSubType: 0,
    eGameActivityType: 0,
    bIsGameActivity: false,
    commentThreads: [],
    activeThread: 0,
    get appid() {
      return appId;
    },
    get referenceAppID() {
      return steamAppId || appId;
    },
    get announcementGID() {
      return gid;
    },
    get clan_announcementid() {
      return gid;
    },
    get eventModel() {
      return partnerEvent;
    },
    get forumTopicGID() {
      return partnerEvent.forumTopicGID;
    },
    get upvotes() {
      return partnerEvent.nVotesUp;
    },
    get downvotes() {
      return partnerEvent.nVotesDown;
    },
    get comment_count() {
      return partnerEvent.nCommentCount;
    },
    BIsValid: () => true,
    IsEventLoaded: () => true,
    GetEvent: async () => partnerEvent,
    ReloadEvent: async () => partnerEvent,
    GetParentalFeature: () => 0,
    BUserCanDelete: () => false,
    BSupportsCommentThreads: () => false,
    GetActiveCommentThread: () => null,
    SetActiveCommentThread: () => undefined,
  };
};

const makeDeckyNativeActivity = (appId: number, metadata: MetadataData) => {
  const items = steamActivityNewsItemsFromMetadata(appId, metadata)
    .filter((item: any) => numericSteamNewsGid(item.gid || item.news_id || item.announcement_gid || item.id || item.url));
  if (!items.length) return null;
  const events = items
    .map((item, index) => makeDeckyNativeActivityEvent(appId, metadata, item, index))
    .sort((a, b) => Number(b.rtEventTime || 0) - Number(a.rtEventTime || 0));
  const grouped = new Map<number, any[]>();
  for (const event of events) {
    const day = Math.floor(Number(event.rtEventTime || 0) / 86400) * 86400;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(event);
  }
  const days: DeckyNativeActivityDay[] = Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, dayEvents]) => ({
      isValid: dayEvents.length > 0,
      events: dayEvents,
      GetLatestEventTime: () => Math.max(...dayEvents.map((event) => Number(event.rtEventTime || 0))),
      GetEarliestEventTime: () => Math.min(...dayEvents.map((event) => Number(event.rtEventTime || 0))),
      BHasEvents: () => dayEvents.length > 0,
    }));
  const latest = events[0]?.rtEventTime || 0;
  const earliest = events[events.length - 1]?.rtEventTime || latest;
  return {
    __deckyNativeActivity: true,
    appid: appId,
    m_bNoMoreHistoryAvailable: true,
    lastAddedEventType: STEAM_POSTED_ANNOUNCEMENT_EVENT_TYPE,
    lastAddedPartnerEvent: null,
    get appActivityByDay() {
      return days;
    },
    get latest_user_news_time() {
      return latest;
    },
    get earliest_user_news_time() {
      return earliest;
    },
    get latest_game_activity_time() {
      return 0;
    },
    get earliest_game_activity_time() {
      return 0;
    },
    BHasEvents: () => events.length > 0,
    SortEvents: () => undefined,
    RequestStoreItems: async () => undefined,
    MergeUserNews: async () => undefined,
    MergeGameActivity: () => undefined,
    GetAchievementMapCache: () => "[]",
    GetUserNewsCache: () => [],
    GetGameActivityCache: () => [],
  };
};

const getDeckyNativeActivityForApp = (appId: number) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  const cached = deckyNativeActivityCache().get(appId);
  if (cached) return cached;
  const metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  const native = makeDeckyNativeActivity(appId, metadata);
  if (native) deckyNativeActivityCache().set(appId, native);
  return native;
};

export const refreshDeckyNativeActivityForApp = async (appId: number, store?: any) => {
  const overview = getOverview(appId);
  if (!appId || !isNonSteamApp(overview)) return null;
  await ensureMetadataCacheFn();
  let metadata = metadataCache[String(appId)];
  if (!metadata) return null;
  const native = metadata ? makeDeckyNativeActivity(appId, metadata) : null;
  if (!native) return null;
  deckyNativeActivityCache().set(appId, native);
  const appActivityStore = store || (globalThis as any).appActivityStore;
  try {
    if (appActivityStore?.m_mapAppActivity?.set) appActivityStore.m_mapAppActivity.set(appId, native);
  } catch (_error) {
    // If Steam changes the store shape, GetAppActivity still returns our cache.
  }
  return native;
};

export const installNativeActivityStorePatch = (unpatchers: Unpatch[]) => {
  let attempts = 0;
  const tryInstall = (): boolean => {
    if (!hasActivityStore()) {
      if (patchInstallStatus.activity === "pending") {
        patchInstallStatus.activity = "skipped-missing-internal";
        log.warn("patch", "activity UI patch skipped", { status: patchInstallStatus.activity });
      }
      return true;
    }
    const store = (globalThis as any).appActivityStore;
    if (!store || store.__deckyNativeActivityPatched) return !!store?.__deckyNativeActivityPatched;
    try {
      store.__deckyNativeActivityPatched = true;
      unpatchers.push(
        patchMethod(store, "GetAppActivity", (_thisValue, original, args) => {
          const appId = Number(args[0]);
          const native = getDeckyNativeActivityForApp(appId);
          if (native) return native;
          if (appId && isNonSteamApp(getOverview(appId))) {
            void refreshDeckyNativeActivityForApp(appId, store);
          }
          return original(...args);
        })
      );
      for (const methodName of ["RequestRestoreActivity", "RestoreActivity", "FetchLatestActivity", "FetchLatestActivityFromServer", "FetchActivityHistory"] as const) {
        if (typeof store[methodName] !== "function") continue;
        unpatchers.push(
          patchMethod(store, methodName, (_thisValue, original, args) => {
            const appId = Number(args[0]);
            const native = getDeckyNativeActivityForApp(appId);
            if (native) return methodName.includes("History") || methodName.includes("Server") || methodName.includes("Restore") ? Promise.resolve(native) : undefined;
            if (appId && isNonSteamApp(getOverview(appId))) {
              void refreshDeckyNativeActivityForApp(appId, store);
            }
            return original(...args);
          })
        );
      }
      patchInstallStatus.activity = "installed";
      log.info("patch", "activity store patch installed", { status: patchInstallStatus.activity });
      return true;
    } catch (error) {
      patchInstallStatus.activity = "failed";
      log.warn("patch", "activity store patch failed", { status: patchInstallStatus.activity }, error);
      return true;
    }
  };
  if (tryInstall()) return;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryInstall() || attempts >= 40) window.clearInterval(timer);
  }, 500);
  unpatchers.push(() => window.clearInterval(timer));
};

export const installNativePartnerEventStorePatch = (unpatchers: Unpatch[]) => {
  let attempts = 0;
  const patchedStores = new WeakSet<object>();

  const patchOneStore = (partnerStore: any): boolean => {
    if (!partnerStore || typeof partnerStore !== "object") return false;
    (globalThis as any)[DECKY_NATIVE_PARTNER_STORE_WINDOW_KEY] = partnerStore;
    for (const event of deckyNativePartnerEventCache().values()) registerDeckyNativePartnerEventInSteamStore(event, partnerStore);
    if (partnerStore.__deckyNativePartnerEventsPatched || patchedStores.has(partnerStore)) return true;
    partnerStore.__deckyNativePartnerEventsPatched = true;
    patchedStores.add(partnerStore);

    const maybePatch = (methodName: string, handler: (original: (...args: any[]) => any, args: any[]) => any) => {
      if (typeof partnerStore[methodName] !== "function") return;
      unpatchers.push(
        patchMethod(partnerStore, methodName, (_thisValue, original, args) => handler(original, args))
      );
    };

    maybePatch("GetClanEventFromAnnouncementGID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], false);
      return event || original(...args);
    });
    maybePatch("BHasClanAnnouncementGID", (original, args) => {
      if (deckyNativePartnerEventForGid(args[0])) return true;
      return original(...args);
    });
    maybePatch("GetClanEventGIDFromAnnouncementGID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], false);
      return event?.GID || original(...args);
    });
    maybePatch("GetClanEventModel", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], true);
      return event || original(...args);
    });
    maybePatch("BHasClanEventModel", (original, args) => {
      if (deckyNativePartnerEventForGid(args[0])) return true;
      return original(...args);
    });
    maybePatch("GetClanEventGIDs", (original, args) => {
      const originalResult = original(...args) || [];
      const accountId = args[0]?.GetAccountID?.();
      const deckyGids = Array.from(deckyNativePartnerEventCache().values())
        .filter((event: any) => !accountId || event?.clanSteamID?.GetAccountID?.() === accountId)
        .map((event: any) => event?.GID)
        .filter(Boolean);
      return Array.from(new Set([...originalResult, ...deckyGids]));
    });
    maybePatch("GetClanEventGIDsForApp", (original, args) => {
      const appId = Number(args[0]);
      const originalResult = original(...args) || [];
      const deckyGids = Array.from(deckyNativePartnerEventCache().values())
        .filter((event: any) => Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId)
        .map((event: any) => event?.GID)
        .filter(Boolean);
      return Array.from(new Set([...originalResult, ...deckyGids]));
    });
    maybePatch("GetRankedClanEvents", (original, args) => {
      const originalResult = original(...args) || [];
      const clanAccountId = args[0]?.GetAccountID?.();
      const appId = Number(args[1] || 0);
      const deckyEvents = Array.from(deckyNativePartnerEventCache().values()).filter((event: any) => {
        const clanMatches = !clanAccountId || event?.clanSteamID?.GetAccountID?.() === clanAccountId;
        const appMatches = !appId || Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId;
        return clanMatches && appMatches;
      });
      return Array.from(new Map([...originalResult, ...deckyEvents].map((event: any) => [String(event?.GID || event?.AnnouncementGID), event])).values());
    });
    maybePatch("LoadPartnerEventFromAnnoucementGID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], false);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventFromAnnoucementGIDAndClanSteamID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[1] || args[0], false);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventFromClanEventGID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], true);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventFromClanEventGIDAndClanSteamID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[1] || args[0], true);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadPartnerEventGeneric", (original, args) => {
      // Real Steam signature is (clanSteamID, appid, eventGID, announcementGID, ...).
      const requestKey = args.find((arg) => deckyNativePartnerEventForGid(arg));
      const event = deckyNativePartnerEventForGid(requestKey, !!args[2]);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadHiddenPartnerEvent", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], true);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadHiddenPartnerEventByAnnouncementGID", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[0], false);
      if (event) return Promise.resolve(event);
      return original(...args);
    });
    maybePatch("LoadAdjacentPartnerEvents", (original, args) => {
      const requestedId = args[0];
      const appId = Number(args[2] || 0);
      const direct = deckyNativePartnerEventForGid(requestedId, true);
      if (direct) return Promise.resolve([direct]);
      const appEvents = Array.from(deckyNativePartnerEventCache().values()).filter((event: any) => {
        return appId && (Number(event?.appid) === appId || Number(event?.reference_appid || event?.steam_appid) === appId);
      });
      if (appEvents.length) return Promise.resolve(appEvents);
      return original(...args);
    });
    maybePatch("LoadBatchPartnerEventsByEventGIDsOrAnnouncementGIDs", (original, args) => {
      const eventGids = Array.isArray(args[0]) ? args[0] : [];
      const announcementGids = Array.isArray(args[1]) ? args[1] : [];
      const hits: any[] = [];
      const missingEventGids: any[] = [];
      const missingAnnouncementGids: any[] = [];
      eventGids.forEach((gid: any) => {
        const event = deckyNativePartnerEventForGid(gid, true);
        if (event) hits.push(event);
        else missingEventGids.push(gid);
      });
      announcementGids.forEach((gid: any) => {
        const event = deckyNativePartnerEventForGid(gid, false);
        if (event) hits.push(event);
        else missingAnnouncementGids.push(gid);
      });
      if (!hits.length) return original(...args);
      if (!missingEventGids.length && !missingAnnouncementGids.length) return Promise.resolve(hits);
      return Promise.resolve(original(missingEventGids, missingAnnouncementGids, args[2])).then((rest: any) => [...hits, ...((Array.isArray(rest) && rest) || [])]);
    });
    maybePatch("FlushEventFromCache", (original, args) => {
      const event = deckyNativePartnerEventForGid(args[1] || args[0]);
      if (event) return undefined;
      return original(...args);
    });
    return true;
  };

  const tryInstall = (): boolean => {
    if (!hasSteamInternals()) {
      if (patchInstallStatus.partnerEvents === "pending") {
        patchInstallStatus.partnerEvents = "skipped-missing-internal";
        log.warn("patch", "partner events UI patch skipped", { status: patchInstallStatus.partnerEvents });
      }
      return true;
    }
    try {
      const stores = collectNativePartnerEventStores();
      let patchedAny = false;
      for (const store of stores) patchedAny = patchOneStore(store) || patchedAny;
      if (patchedAny) {
        patchInstallStatus.partnerEvents = "installed";
        log.info("patch", "partner event store patch installed", { status: patchInstallStatus.partnerEvents });
      }
      return patchedAny;
    } catch (error) {
      patchInstallStatus.partnerEvents = "failed";
      log.warn("patch", "partner event store patch failed", { status: patchInstallStatus.partnerEvents }, error);
      return true;
    }
  };

  if (tryInstall()) return;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryInstall() || attempts >= 80) window.clearInterval(timer);
  }, 500);
  unpatchers.push(() => window.clearInterval(timer));
};

const isDeckyNativeNewsRouteState = (state: any) => {
  const eventToShow = state?.event_to_show;
  if (!eventToShow) return false;
  const eventId = eventToShow.eventid || eventToShow.gidPartnerEvent || eventToShow.gid || eventToShow.GID;
  return !!eventId && !!deckyNativePartnerEventForGid(eventId);
};

const deckyNativeNewsRouteAppId = (state: any, fallbackPath = "") => {
  const eventToShow = state?.event_to_show || {};
  const appId = Number(eventToShow.appid || gameDetailAppIdFromPath(fallbackPath));
  return Number.isFinite(appId) && appId > 0 ? appId : 0;
};

const shouldReplaceDeckyNativeNewsPush = (targetPath: string, state: any) => {
  if (!isDeckyNativeNewsRouteState(state)) return false;
  const targetAppId = deckyNativeNewsRouteAppId(state, targetPath);
  const currentAppId = gameDetailAppIdFromPath(currentRoutePath());
  // Steam's native Activity click normally pushes the same game-detail route with
  // only `event_to_show` added. Its close handler then replaces the current route
  // to remove `event_to_show`, leaving a duplicate game-detail entry behind. That
  // is why Andrea had to press B/Esc once for every news he had opened. For
  // Decky native news, make that event navigation replace the current game route
  // instead of pushing a new history entry. The modal still opens natively, but
  // closing it returns to the original route without polluting the back stack.
  return !!targetAppId && (!currentAppId || currentAppId === targetAppId);
};

const currentSteamHistoryState = (steamHistory?: any) => {
  const location = steamHistory?.location || (globalThis as any).Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location;
  return location?.state || null;
};

const shouldBackOutOfDeckyNativeNewsClose = (steamHistory: any, targetPath: string, nextState: any) => {
  const currentState = currentSteamHistoryState(steamHistory);
  if (!isDeckyNativeNewsRouteState(currentState)) return false;
  if (isDeckyNativeNewsRouteState(nextState)) return false;
  const currentAppId = deckyNativeNewsRouteAppId(currentState, currentRoutePath());
  const targetAppId = Number(gameDetailAppIdFromPath(targetPath) || currentAppId);
  return !!currentAppId && (!targetAppId || currentAppId === targetAppId);
};

const backSteamHistory = (steamHistory: any) => {
  if (typeof steamHistory?.goBack === "function") return steamHistory.goBack();
  if (typeof steamHistory?.back === "function") return steamHistory.back();
  if (typeof steamHistory?.go === "function") return steamHistory.go(-1);
  return undefined;
};

export const installNativeNewsHistoryRedirects = (unpatchers: Unpatch[]) => {
  try {
    const steamHistory = (globalThis as any).Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
    for (const methodName of ["push", "replace"]) {
      if (steamHistory?.[methodName]) {
        unpatchers.push(
          patchMethod(steamHistory, methodName, (_thisValue, original, args) => {
            const target = historyPathFromArgs(args);
            const state = historyStateFromArgs(args);
            if (methodName === "push" && shouldReplaceDeckyNativeNewsPush(target, state) && typeof steamHistory.replace === "function") {
              (globalThis as any).__deckyNativeNewsOpenedWithReplaceAt = Date.now();
              return steamHistory.replace(...args);
            }
            if (methodName === "replace" && shouldBackOutOfDeckyNativeNewsClose(steamHistory, target || currentRoutePath(), state)) {
              const replacedAt = Number((globalThis as any).__deckyNativeNewsOpenedWithReplaceAt || 0);
              // If our push->replace interception ran, closing the modal should keep using
              // Steam's replace. If Steam opened via a path we did not intercept, use Back
              // for the close action so the event entry is removed instead of replaced by a
              // duplicate app-detail entry.
              if (!replacedAt || Date.now() - replacedAt > 15000) {
                return backSteamHistory(steamHistory) ?? original(...args);
              }
            }
            try {
              const path = String(target || "").toLowerCase();
              if (path.includes("steamweb") && state && typeof state === "object" && typeof state.url === "string") {
                const rewritten = rewriteSteamLinkToMatchedApp(state.url);
                if (rewritten.rewrote) {
                  state.url = rewritten.url;
                  void frontendLog("nav", "steamweb router rewrite", {
                    from: rewritten.fromAppId,
                    to: rewritten.toAppId,
                  }).catch(() => undefined);
                }
              }
            } catch (_error) {
              // Steam navigation must continue even if the redirect probe fails.
            }
            return original(...args);
          })
        );
      }
    }
  } catch (error) {
    log.warn("patch", "history patch skipped", error);
  }

  try {
    for (const methodName of ["pushState", "replaceState"] as const) {
      const original = window.history?.[methodName];
      if (typeof original !== "function") continue;
      const patched = function (this: History, ...args: any[]) {
        const target = String(args[2] || "");
        const state = historyStateFromArgs(args);
        if (methodName === "pushState" && shouldReplaceDeckyNativeNewsPush(target, state)) {
          (globalThis as any).__deckyNativeNewsOpenedWithReplaceAt = Date.now();
          return window.history.replaceState(args[0], args[1], args[2]);
        }
        if (methodName === "replaceState") {
          const currentState = (window.history as any)?.state;
          if (isDeckyNativeNewsRouteState(currentState) && !isDeckyNativeNewsRouteState(state)) {
            const replacedAt = Number((globalThis as any).__deckyNativeNewsOpenedWithReplaceAt || 0);
            if (!replacedAt || Date.now() - replacedAt > 15000) {
              window.history.back();
              return undefined;
            }
          }
        }
        return original.apply(this, args as any);
      };
      (window.history as any)[methodName] = patched;
      unpatchers.push(() => {
        (window.history as any)[methodName] = original;
      });
    }
  } catch (error) {
    log.warn("patch", "window history redirect patch skipped", error);
  }
};

export const installActivityRefreshedListener = (unpatchers: Unpatch[]) => {
  const activityRefreshedListener = () => {
    deckyNativeActivityCache().clear();
    deckyNativePartnerEventCache().clear();
    const appId = currentGameDetailAppId();
    void ensureMetadataCacheFn().then(() => {
      if (appId) void refreshDeckyNativeActivityForApp(appId);
    });
  };
  window.addEventListener("decky-metadata:activity-refreshed", activityRefreshedListener);
  unpatchers.push(() => window.removeEventListener("decky-metadata:activity-refreshed", activityRefreshedListener));
};

export const installCommunityFeedPatch = (unpatchers: Unpatch[]) => {
  try {
    const httpClient = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      if (typeof module.g?.get === "function" && typeof module.g?.post === "function") {
        return module.g;
      }
      return undefined;
    });
    void frontendLog("community", "feed patch install", {
      httpClientFound: Boolean(httpClient),
      hasGet: typeof httpClient?.get === "function",
      hasPost: typeof httpClient?.post === "function",
    }).catch(() => undefined);
    const patchFeedMethod = (methodName: "get" | "post") => {
      if (!httpClient?.[methodName]) return;
      unpatchers.push(
        patchMethod(
          httpClient,
          methodName,
          (_thisValue, original, args) => {
            const url = String(args[0] || "");
            const activityAppId = activityAppIdFromUrl(url);
            if (activityAppId) {
              return steamActivityPayloadForApp(activityAppId).then((payload) => {
                if (payload) return payload;
                return original(...args);
              });
            }
            const match = url.match(/library\/appcommunityfeed\/(\d+)/);
            if (match) {
              const appId = Number(match[1]);
              const overview = getOverview(appId);
              // Only touch non-Steam shortcuts; real Steam games keep their native feed.
              if (isNonSteamApp(overview)) {
                return ensureMetadataCacheFn()
                  .then(() => {
                    const steamAppId = metadataCache[String(appId)]?.steam_appid;
                    if (!steamAppId) return original(...args);
                    // Rewrite the feed request to the matched Steam appid and pass it
                    // straight through to the native client: identical shape, real
                    // screenshots/guides/videos/artwork, and native pagination for free.
                    const steamUrl = rewriteCommunityFeedUrlForSteamApp(url, steamAppId);
                    if (!steamUrl) return original(...args);
                    const steamArgs = [steamUrl, ...args.slice(1)];
                    return Promise.resolve(original(...steamArgs)).then((native: any) => {
                      void frontendLog("community", "feed passthrough", {
                        appId,
                        steamAppId,
                        hubLen: Array.isArray(native?.hub) ? native.hub.length : null,
                      }).catch(() => undefined);
                      return native;
                    });
                  })
                  .catch((err) => {
                    void frontendLog("community", "feed passthrough error", {
                      appId,
                      err: String(err),
                    }).catch(() => undefined);
                    return original(...args);
                  });
              }
            }
            return original(...args);
          }
        )
      );
    };
    patchFeedMethod("get");
    patchFeedMethod("post");
  } catch (error) {
    log.warn("patch", "community feed patch skipped", error);
  }

  try {
    const communityVoteModule = findModuleChild((module: any) => {
      if (!module || typeof module !== "object") return undefined;
      if (module.bJ && typeof module.dK === "function") return module;
      return undefined;
    });
    if (communityVoteModule?.dK) {
      unpatchers.push(
        patchMethod(
          communityVoteModule,
          "dK",
          (_thisValue, original, args) => {
            const ids = Array.isArray(args[0]) ? args[0] : [];
            if (ids.length && ids.every(isDeckyCommunityId)) {
              const voteNone = communityVoteModule.bJ?.None ?? 0;
              return Promise.resolve(
                new Map(
                  ids.map((id: string) => [
                    id,
                    { vote: voteNone, bReported: false },
                  ])
                )
              );
            }
            return original(...args);
          }
        )
      );
    }
  } catch (error) {
    log.warn("patch", "community vote patch skipped", error);
  }
};
