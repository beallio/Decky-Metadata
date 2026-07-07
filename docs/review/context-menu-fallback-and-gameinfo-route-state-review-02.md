# Review — context-menu-fallback-and-gameinfo-route-state (round 02)

Branch: `feat/context-menu-fallback-and-gameinfo-route-state`
Reviewed against: `docs/plans/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md`

## Verdict

Changes requested. The whitespace finding from round 01 is fixed, but the
targeted Game Info shield can still apply to unmatched non-Steam shortcuts from
the router-render path.

## Gate status

Reviewer checked:

```bash
git diff --check dev...HEAD
```

The whitespace gate is now clean. Full quality gates still need to be rerun
after the semantic fix below.

## Required changes

1. Prevent route-render shielding from spoofing Game Info for shortcuts that do
   not have matched metadata.

   In `src/steam/routerPatches.ts`, the router-render path currently arms the
   targeted shield for any non-Steam overview:

   ```text
   src/steam/routerPatches.ts:47-49
   if (appId && isNonSteamApp(appOverview)) {
     metadataState.lastObservedGameDetailAppId = appId;
     armRouteShield(appId, route, "route-render");
   ```

   That path does not check `metadataCache[String(appId)]`, unlike the
   main-window reentry shield path. Because `src/steam/metadataPatch.ts:458-460`
   returns `false` for any shield hit, an unmatched shortcut can receive Game
   Info spoofing if route-render arms the shield.

   The plan requires the shield to be armed for the matched shortcut's route
   (`docs/plans/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md:233-236`)
   and includes a deferred regression check that unmatched/non-Steam shortcuts
   must not get Game Info spoofing where no matched metadata exists
   (`docs/plans/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md:331-332`).

   Fix this by making shield arming and/or shield consumption require matched
   metadata. Acceptable approaches include:

   - do not call `armRouteShield` from router-render unless
     `metadataCache[String(appId)]` exists; or
   - carry a matched-metadata flag in the shield and make
     `BIsModOrShortcut` treat a no-metadata shield as a miss without spoofing.

   Preserve the intended `Transformers Devastation` path: matched shortcut app
   id `3015223078` must still get a targeted shield hit even when
   `currentRoutePath()` is empty in `BIsModOrShortcut`.

2. Add or preserve diagnostics for the no-metadata case so on-device logs can
   distinguish "shield skipped because no matched metadata" from a normal miss.

3. Rerun the required gates from the plan:

   ```bash
   ./run.sh npm run build
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git diff --check dev...HEAD
   git status --short
   ```

4. Commit the code fix and this review note as durable audit evidence, then
   recreate the round-complete marker.

STATUS: CHANGES_REQUESTED
