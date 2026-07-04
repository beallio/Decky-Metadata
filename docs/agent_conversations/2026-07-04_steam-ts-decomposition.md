# 2026-07-04 - steam-ts-decomposition

## Objective

Implement `docs/plans/2026-07-03_steam-ts-decomposition.md` by decomposing
`src/steam.ts` into focused modules under `src/steam/` while preserving the
public `./steam` import surface and runtime behavior.

## Task 0 Invariants

Pre-split `installSteamPatches` order captured from `src/steam.ts:2678-3172`:

1. Create one shared `unpatchers` array.
2. Define `patchesCancelled` and `safeInstallStep`.
3. `safeInstallStep("unmatchedAppLinksHider", ...)`.
4. `safeInstallStep("nativeActivityStorePatch", ...)`.
5. `safeInstallStep("nativePartnerEventStorePatch", ...)`.
6. Install `decky-metadata:activity-refreshed` listener and push its teardown into the same `unpatchers` array.
7. Read `overviewProto` and `detailsProto`.
8. If Steam internals/prototypes are missing, install the retry branch and return its teardown.
9. `safeInstallStep("steamNavigationRedirect", ...)`.
10. `safeInstallStep("mainWindowHistoryRedirect", ...)`.
11. Load `getDebugLogging()` asynchronously; only inside the enabled callback install `navigationTrace`, `historyInstanceTrace`, and `clickTrace`, and only if `patchesCancelled` is still false.
12. Install native-news Steam history `push`/`replace` patch.
13. Install native-news `window.history.pushState`/`replaceState` patch.
14. Install `appStore.GetAppOverviewByAppID` fallback patch.
15. Install details/overview metadata patches.
16. Install AppDetails section patch.
17. Install community feed passthrough patch.
18. Install community vote patch.
19. Install game-detail router render patch.
20. Install game-activity router render patch.
21. Return teardown that sets `patchesCancelled = true` and reverses the same shared `unpatchers` array.

Teardown invariant: every installer appends into the same `unpatchers` array in
the order above. Dismount still uses `unpatchers.splice(0).reverse()` from the
top-level installer, so modules do not own independent teardown arrays.

## Module Map

- `src/steam.ts`: stable public barrel for all 19 existing `./steam` exports.
- `src/steam/core.ts`: shared state, public primitive helpers, patch helpers,
  route/app-id detection, native cache accessors, history-arg helpers, and
  Steam-link rewrite helpers.
- `src/steam/metadataPatch.ts`: metadata cache/bootstrap/apply/fetch/enrich,
  metadata details/overview prototype patches, and non-Steam game discovery.
- `src/steam/activity.ts`: native Activity model, PartnerEvent model/store
  patching, activity-refresh listener, native-news history redirect patches,
  and community-feed/vote patches. This module is larger than the 800-line
  target because those concerns share the native event model and keeping them
  together avoids feature-module import cycles.
- `src/steam/appLinks.ts`: unmatched app-links hider.
- `src/steam/navigationRedirect.ts`: Steam link opener redirects and main-window
  history SteamWeb redirects.
- `src/steam/diagnostics.ts`: debug-gated click/navigation/history tracing.
- `src/steam/routerPatches.ts`: game detail/activity render patches, wired by
  injected metadata/activity callbacks from the top-level installer.
- `src/steam/install.ts`: thin installer preserving the original patch order and
  the shared teardown array.

## Public Surface

The `src/steam.ts` barrel re-exports the original 19 public symbols:

`allNonSteamGames`, `applyMetadata`, `appName`, `cleanTitle`,
`ensureMetadataCache`, `getOverview`, `hasActivityStore`, `hasAppDetailsStore`,
`hasSteamInternals`, `installSteamPatches`, `isNonSteamApp`, `metadataCache`,
`patchInstallStatus`, `refreshMetadataCache`, `rewriteSteamLinkToMatchedApp`,
`startMetadataBootstrap`, `steamAppIdForApp`, `tryEnrichScreenshotsForApp`,
`tryFetchMetadataForApp`.

Consumer import blocks in `src/index.tsx`, `src/contextMenuPatch.tsx`, and
`src/components.tsx` were not changed.

## Validation

- Baseline before implementation: `./run.sh scripts/orchestration/run-quality-gates` passed.
- During implementation: `./run.sh npx tsc --noEmit` passed.
- During implementation: `./run.sh npm run build` passed and rebuilt `dist/index.js`.

Full orchestration quality gates will be run before marking the round complete.
