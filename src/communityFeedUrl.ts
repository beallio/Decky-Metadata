// Dependency-free so tests/test_community_feed_passthrough.py can import it with plain node.
export const rewriteCommunityFeedUrlForSteamApp = (
  url: string,
  steamAppId: number | null | undefined
): string | null => {
  const cleanSteamAppId = Number(steamAppId || 0);
  if (cleanSteamAppId <= 0) return null;
  if (!/library\/appcommunityfeed\/\d+/.test(String(url || ""))) return null;
  return String(url || "").replace(/appcommunityfeed\/\d+/, `appcommunityfeed/${cleanSteamAppId}`);
};
