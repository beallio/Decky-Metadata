export {
  allNonSteamGames,
  applyMetadata,
  effectiveCompatibilityCategory,
  ensureMetadataCache,
  refreshMetadataCache,
  refreshCompatibilitySurfaces,
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
  getNativeOverview,
  hasActivityStore,
  hasSteamInternals,
  isNonSteamApp,
  isNativeNonSteamShortcut,
  metadataCache,
  patchInstallStatus,
  rewriteSteamLinkToMatchedApp,
  steamAppIdForApp,
} from "./steam/core";
export {
  classifyShortcutNameState,
  hasShortcutNameApi,
  nativeShortcutName,
  setShortcutNameAndWait,
} from "./steam/shortcutNames";
export { installSteamPatches } from "./steam/install";
