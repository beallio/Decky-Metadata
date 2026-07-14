export type QuickLinkDescriptor = {
  label?: unknown;
  url?: string;
  link?: string;
  appid?: number;
  [key: string]: unknown;
};

export type MatchedQuickLinkState = {
  isNonSteamShortcut: boolean;
  steamAppid: number;
  steamStoreState: "available" | "delisted" | "unknown";
  hasDlc: boolean;
  hasPointsShop: boolean;
};

export type QuickLinkResources = {
  buildDlcUrl: (steamAppid: number) => string;
  buildPointsShopUrl: (steamAppid: number) => string;
  localize: (token: string, fallback: string) => string;
};

const descriptorPath = (descriptor: QuickLinkDescriptor): string => {
  if (typeof descriptor?.url !== "string" || !descriptor.url) return "";
  try {
    return new URL(descriptor.url, "https://store.steampowered.com").pathname.toLowerCase();
  } catch (_error) {
    return "";
  }
};

export const isSupportQuickLink = (descriptor: QuickLinkDescriptor): boolean =>
  descriptor?.link === "HelpAppPage";

export const isCommunityQuickLink = (descriptor: QuickLinkDescriptor): boolean =>
  descriptor?.link === "GameHub";

export const isStoreQuickLink = (descriptor: QuickLinkDescriptor): boolean =>
  /^\/app\/\d+(?:\/|$)/.test(descriptorPath(descriptor));

export const isDlcQuickLink = (descriptor: QuickLinkDescriptor): boolean =>
  /^\/dlc\/\d+(?:\/|$)/.test(descriptorPath(descriptor));

export const isPointsShopQuickLink = (descriptor: QuickLinkDescriptor): boolean =>
  /^\/points\/shop\/app\/\d+(?:\/|$)/.test(descriptorPath(descriptor));

export const transformMatchedQuickLinks = (
  links: QuickLinkDescriptor[],
  state: MatchedQuickLinkState,
  resources: QuickLinkResources,
): QuickLinkDescriptor[] => {
  if (!state.isNonSteamShortcut || !(state.steamAppid > 0)) return links;

  const transformed: QuickLinkDescriptor[] = [];
  let originalStoreSlot: number | undefined;

  for (const descriptor of links) {
    if (
      isSupportQuickLink(descriptor) ||
      isDlcQuickLink(descriptor) ||
      isPointsShopQuickLink(descriptor)
    ) {
      continue;
    }
    if (isStoreQuickLink(descriptor)) {
      if (originalStoreSlot === undefined) originalStoreSlot = transformed.length;
      if (state.steamStoreState !== "delisted") transformed.push(descriptor);
      continue;
    }
    transformed.push(descriptor);
  }

  if (state.hasDlc) {
    const communityIndex = transformed.findIndex(isCommunityQuickLink);
    const insertAt = originalStoreSlot !== undefined
      ? originalStoreSlot + (state.steamStoreState === "delisted" ? 0 : 1)
      : communityIndex >= 0 ? communityIndex : 0;
    transformed.splice(insertAt, 0, {
      label: resources.localize("#AppDetails_Links_DLC", "DLC"),
      url: resources.buildDlcUrl(state.steamAppid),
    });
  }

  if (state.hasPointsShop) {
    const communityIndex = transformed.findIndex(isCommunityQuickLink);
    const insertAt = communityIndex >= 0 ? communityIndex + 1 : transformed.length;
    transformed.splice(insertAt, 0, {
      label: resources.localize("#AppDetails_Links_PointsShop", "Points Shop"),
      url: resources.buildPointsShopUrl(state.steamAppid),
    });
  }

  return transformed;
};
