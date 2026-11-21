import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ fetchNoCors: vi.fn() }));
vi.mock("./steam/core", () => ({ getAppIconUrl: vi.fn() }));

import { fetchNoCors } from "@decky/api";
import { resetSteamIconCacheForTests, resolveEditorIcon } from "./editorHeaderIcon";
import { getAppIconUrl } from "./steam/core";

const fetchMock = vi.mocked(fetchNoCors);
const ownIcon = vi.mocked(getAppIconUrl);
const HASH = "bb731d6554f7614b5c2ad1acb511286de1cc7ba4";

const storeItems = (assets: unknown) =>
  ({ status: 200, json: async () => ({ response: { store_items: [{ appid: 1211020, success: 1, assets }] } }) }) as Response;

const resolveAfterOwnIconWait = async (steamAppId: number | null) => {
  const result = resolveEditorIcon(42, steamAppId, () => true);
  await vi.advanceTimersByTimeAsync(1_100);
  return result;
};

describe("resolveEditorIcon", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSteamIconCacheForTests();
    fetchMock.mockReset();
    ownIcon.mockReset().mockReturnValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it("prefers the game's own icon, including one that loads after the first check", async () => {
    fetchMock.mockResolvedValue(storeItems({ community_icon: HASH }));
    ownIcon.mockReturnValueOnce(null).mockReturnValue("data:image/x-icon;base64,AAAB");

    await expect(resolveAfterOwnIconWait(1211020)).resolves.toBe("data:image/x-icon;base64,AAAB");
  });

  it("uses the matched Steam icon only when the game has none", async () => {
    fetchMock.mockResolvedValue(storeItems({ community_icon: HASH }));

    await expect(resolveAfterOwnIconWait(1211020)).resolves.toBe(
      `https://shared.steamstatic.com/community_assets/images/apps/1211020/${HASH}.jpg`,
    );
    await expect(resolveAfterOwnIconWait(null)).resolves.toBeNull();
  });

  it("shows no icon for delisted apps or malformed hashes", async () => {
    fetchMock.mockResolvedValueOnce(storeItems(undefined));
    await expect(resolveAfterOwnIconWait(224060)).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(storeItems({ community_icon: "../evil" }));
    await expect(resolveAfterOwnIconWait(570)).resolves.toBeNull();
  });

  it("retries the Steam request after a failure but caches a success", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(resolveAfterOwnIconWait(1211020)).resolves.toBeNull();

    fetchMock.mockResolvedValue(storeItems({ community_icon: HASH }));
    await resolveAfterOwnIconWait(1211020);
    await resolveAfterOwnIconWait(1211020);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
