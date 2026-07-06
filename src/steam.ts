export {
  allNonSteamGames,
  applyMetadata,
  ensureMetadataCache,
  refreshMetadataCache,
  startMetadataBootstrap,
  tryEnrichScreenshotsForApp,
  tryFetchMetadataForApp,
} from "./steam/metadataPatch";
export {
  appName,
  cleanTitle,
  getOverview,
  hasActivityStore,
  hasSteamInternals,
  isNonSteamApp,
  metadataCache,
  patchInstallStatus,
  rewriteSteamLinkToMatchedApp,
  steamAppIdForApp,
} from "./steam/core";
export { installSteamPatches } from "./steam/install";
