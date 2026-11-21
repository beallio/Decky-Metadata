import { fetchNoCors } from "@decky/api";
import { getAppIconUrl } from "./steam/core";

const OWN_ICON_WAIT_MS = 1_000;
const OWN_ICON_POLL_MS = 100;
const STORE_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const COMMUNITY_ICON_HASH = /^[0-9a-f]{40}$/;

const steamIconRequests = new Map<number, Promise<string | null>>();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Steam loads a shortcut's icon data only after the first request, so a missing icon is not final at once.
// shortcut: fixed 1 s poll; switch to an overview-change subscription if icons arrive later than that.
const waitForOwnIcon = async (appId: number, isCurrent: () => boolean): Promise<string | null> => {
  for (let waited = 0; ; waited += OWN_ICON_POLL_MS) {
    const url = getAppIconUrl(appId);
    if (url || waited >= OWN_ICON_WAIT_MS || !isCurrent()) return url;
    await delay(OWN_ICON_POLL_MS);
  }
};

const fetchSteamIcon = async (steamAppId: number): Promise<string | null> => {
  const input = {
    ids: [{ appid: steamAppId }],
    context: { language: "english", country_code: "US" },
    data_request: { include_assets: true },
  };
  const response = await fetchNoCors(
    `${STORE_ITEMS_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`,
    { method: "GET" },
  );
  if (response.status !== 200) throw new Error(`Steam store items request failed with HTTP ${response.status}`);
  const payload: any = await response.json();
  const hash = payload?.response?.store_items?.[0]?.assets?.community_icon;
  // Delisted or hidden apps return no assets; then there is no Steam icon to show.
  return typeof hash === "string" && COMMUNITY_ICON_HASH.test(hash)
    ? `https://shared.steamstatic.com/community_assets/images/apps/${steamAppId}/${hash}.jpg`
    : null;
};

/** The matched Steam game's community icon, cached per app; failed requests retry on the next call. */
export const steamIconUrl = (steamAppId: number): Promise<string | null> => {
  let request = steamIconRequests.get(steamAppId);
  if (!request) {
    request = fetchSteamIcon(steamAppId).catch(() => {
      steamIconRequests.delete(steamAppId);
      return null;
    });
    steamIconRequests.set(steamAppId, request);
  }
  return request;
};

/** The game's own icon, else the matched Steam game's icon when `steamAppId` is given, else null. */
export const resolveEditorIcon = async (
  appId: number,
  steamAppId: number | null,
  isCurrent: () => boolean,
): Promise<string | null> => {
  const steamIcon = steamAppId ? steamIconUrl(steamAppId) : null;
  return (await waitForOwnIcon(appId, isCurrent)) ?? (steamIcon ? await steamIcon : null);
};

export const resetSteamIconCacheForTests = () => steamIconRequests.clear();
