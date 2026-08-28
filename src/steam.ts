export {
  allNonSteamGames,
  applyMetadata,
  effectiveCompatibilityCategory,
  ensureMetadataCache,
  refreshMetadataCache,
  restoreAllCompatibilityBaselines,
  startMetadataBootstrap,
  tryEnrichScreenshotsForApp,
  tryFetchMetadataForApp,
} from "./steam/metadataPatch";
export {
  formatConnectedControllerTypes,
  getConnectedControllerTypes,
} from "./steam/controllerTypes";
export {
  appName,
  cleanTitle,
  getOverview,
  hasActivityStore,
  hasSteamInternals,
  isNonSteamApp,
  isNativeNonSteamShortcut,
  metadataCache,
  patchInstallStatus,
  rewriteSteamLinkToMatchedApp,
  steamAppIdForApp,
} from "./steam/core";
export { installSteamPatches } from "./steam/install";
