export const rewriteCommunityFeedUrlForSteamApp = (
  url: string,
  steamAppId: number | null | undefined
): string | null => {
  const cleanSteamAppId = Number(steamAppId || 0);
  if (!cleanSteamAppId) return null;
  if (!/library\/appcommunityfeed\/\d+/.test(String(url || ""))) return null;
  return String(url || "").replace(/appcommunityfeed\/\d+/, `appcommunityfeed/${cleanSteamAppId}`);
};
