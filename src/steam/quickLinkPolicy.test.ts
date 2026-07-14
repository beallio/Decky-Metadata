import { describe, expect, it } from "vitest";
import {
  QuickLinkDescriptor,
  QuickLinkResources,
  transformMatchedQuickLinks,
} from "./quickLinkPolicy";

const store = (appid = 10): QuickLinkDescriptor => ({
  label: "Store Page",
  url: `https://store.steampowered.com/app/${appid}/`,
});
const dlc = (appid = 10): QuickLinkDescriptor => ({
  label: "DLC",
  url: `https://store.steampowered.com/dlc/${appid}/`,
});
const community = (appid = 10): QuickLinkDescriptor => ({
  label: "Community Hub",
  link: "GameHub",
  appid,
});
const points = (appid = 10): QuickLinkDescriptor => ({
  label: "Points Shop",
  url: `https://store.steampowered.com/points/shop/app/${appid}`,
});
const support = (appid = 10): QuickLinkDescriptor => ({
  label: "Support",
  link: "HelpAppPage",
  appid,
});
const discussions: QuickLinkDescriptor = {
  label: "Discussions",
  link: "GameHubDiscussions",
  appid: 10,
};

const resources: QuickLinkResources = {
  buildDlcUrl: (appid) => `native://dlc/${appid}`,
  buildPointsShopUrl: (appid) => `native://points/${appid}`,
  localize: (token, fallback) =>
    token === "#AppDetails_Links_DLC" ? "Localized DLC" :
      token === "#AppDetails_Links_PointsShop" ? "Localized Points" : fallback,
};

const labels = (links: QuickLinkDescriptor[]) => links.map((link) => link.label);

const transform = (
  links: QuickLinkDescriptor[],
  options: Partial<Parameters<typeof transformMatchedQuickLinks>[1]> = {},
) => transformMatchedQuickLinks(
  links,
  {
    isNonSteamShortcut: true,
    steamAppid: 1211020,
    steamStoreState: "available",
    hasDlc: false,
    hasPointsShop: false,
    ...options,
  },
  resources,
);

describe("transformMatchedQuickLinks", () => {
  it("leaves native and unmatched applications unchanged", () => {
    const links = [store(), community(), support()];
    expect(transform(links, { isNonSteamShortcut: false })).toBe(links);
    expect(transform(links, { steamAppid: 0 })).toBe(links);
  });

  it.each(["available", "unknown"] as const)(
    "keeps Store and removes Support for %s matches",
    (steamStoreState) => {
      expect(labels(transform([store(), community(), support()], { steamStoreState })))
        .toEqual(["Store Page", "Community Hub"]);
    },
  );

  it("removes Store and Support for delisted matches", () => {
    expect(labels(transform([store(), community(), support()], { steamStoreState: "delisted" })))
      .toEqual(["Community Hub"]);
  });

  it("places DLC directly after Store for listed matches", () => {
    expect(labels(transform([store(), community(), discussions, support()], { hasDlc: true })))
      .toEqual(["Store Page", "Localized DLC", "Community Hub", "Discussions"]);
  });

  it("places DLC in the removed Store slot for delisted matches", () => {
    expect(labels(transform(
      [discussions, store(), community(), support()],
      { steamStoreState: "delisted", hasDlc: true },
    ))).toEqual(["Discussions", "Localized DLC", "Community Hub"]);
  });

  it("places DLC before Community or first when Store is absent", () => {
    expect(labels(transform([discussions, community()], { hasDlc: true })))
      .toEqual(["Discussions", "Localized DLC", "Community Hub"]);
    expect(labels(transform([discussions], { hasDlc: true })))
      .toEqual(["Localized DLC", "Discussions"]);
  });

  it("places Points Shop after Community or appends it when Community is absent", () => {
    expect(labels(transform([store(), community(), discussions], { hasPointsShop: true })))
      .toEqual(["Store Page", "Community Hub", "Localized Points", "Discussions"]);
    expect(labels(transform([store(), discussions], { hasPointsShop: true })))
      .toEqual(["Store Page", "Discussions", "Localized Points"]);
  });

  it("orders combined links Store, DLC, Community, Points", () => {
    expect(labels(transform(
      [store(), community(), discussions, support()],
      { hasDlc: true, hasPointsShop: true },
    ))).toEqual([
      "Store Page",
      "Localized DLC",
      "Community Hub",
      "Localized Points",
      "Discussions",
    ]);
  });

  it("removes native DLC and Points descriptors before insertion", () => {
    const output = transform(
      [store(), dlc(), dlc(20), community(), points(), points(20), support()],
      { hasDlc: true, hasPointsShop: true },
    );
    expect(labels(output)).toEqual([
      "Store Page",
      "Localized DLC",
      "Community Hub",
      "Localized Points",
    ]);
  });

  it("removes unexpected native optional descriptors when metadata says unavailable", () => {
    expect(labels(transform([store(), dlc(), community(), points(), support()])))
      .toEqual(["Store Page", "Community Hub"]);
  });

  it("preserves unrelated descriptors and builds URLs for the real appid", () => {
    const unrelated = { label: "Workshop", link: "SteamWorkshopPage", appid: 10 };
    const output = transform(
      [unrelated, store(), community(), discussions],
      { hasDlc: true, hasPointsShop: true },
    );

    expect(output[0]).toBe(unrelated);
    expect(output[5]).toBe(discussions);
    expect(output[2]).toMatchObject({
      label: "Localized DLC",
      url: "native://dlc/1211020",
    });
    expect(output[4]).toMatchObject({
      label: "Localized Points",
      url: "native://points/1211020",
    });
  });
});
