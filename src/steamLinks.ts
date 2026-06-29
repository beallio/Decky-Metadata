export type SteamAppLinks = {
  store: string;
  community: string;
  discussions: string;
  guides: string;
};

export const steamAppLinks = (steamAppId: number): SteamAppLinks | null => {
  if (!Number.isFinite(steamAppId) || !Number.isInteger(steamAppId) || steamAppId <= 0) {
    return null;
  }

  const storeBase = `https://store.steampowered.com/app/${steamAppId}`;
  const communityBase = `https://steamcommunity.com/app/${steamAppId}`;

  return {
    store: storeBase,
    community: communityBase,
    discussions: `${communityBase}/discussions/`,
    guides: `${communityBase}/guides/`,
  };
};
