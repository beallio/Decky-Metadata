# Fix compatibility badge cache refresh

## Date

2026-08-30

## Objective

Make non-Steam compatibility badges appear on Library Home and grid cards after saved metadata loads, without requiring the user to select each game first.

## Root Cause

The Library card render patches read the metadata cache synchronously. On plugin startup, cards could render before the asynchronous cache load completed. The patch then inserted no badge, and the cache load did not give the existing card tree a subscribed element that could render when compatibility metadata became available.

## Changes

- Added a compatibility revision publisher and per-slot subscriptions in `src/steam/core.ts` and `src/steam/libraryCompatibilityIndicators.tsx`.
- Made eligible native non-Steam cards own a reactive compatibility slot before metadata is available.
- Published compatibility revisions after cache refresh, successful delayed bootstrap writes, editor mutations, route-entry writes, and activity refresh changes.
- Applied refreshed activity compatibility metadata to Steam's packed overview field before publication.
- Forced one Library render after indicator patch installation so already-mounted cards acquire the subscribed slot.
- Kept metadata save routes free of unrelated history replacement.
- Added Home, grid, bootstrap, activity, router, editor, notification-order, and cleanup regression coverage.
- Regenerated `dist/index.js` and `dist/index.js.map`.
- Added the fix to `CHANGELOG.md`.

## Design Decisions

- Used React `useState` and `useEffect`, not `useSyncExternalStore`, because Steam's runtime must remain compatible with React 16.8.
- Kept compatibility rendering fail-closed for official games, App ID mismatches, explicit Unknown, and unresolved Automatic metadata.
- Used one revision notification after each complete mutation batch. Delayed bootstrap publishes only when it writes a new packed compatibility value.
- Restricted the install-time history replacement to Library routes. Editor saves publish a revision but do not replace `/decky-metadata/:appid`.
- Used each React effect's unsubscribe cleanup instead of a global listener purge.

## Validation

- `./scripts/orchestration-hooks/quality-gates`: passed; 26 Vitest files and 361 tests passed, Rollup rebuilt the bundle, TypeScript passed, Python byte-compilation passed, and pytest passed.
- Focused regression run: 4 files and 61 tests passed.
- `scripts/deck/deploy.sh`: deployed the final bundle and hard-reloaded SteamUI successfully.
- Fresh Library grid probe, before selecting any game:
  - Assassin's Creed: Director's Cut (`2312439508`): packed value `10`, reactive slot rendered Steam target `G`.
  - Deadpool (`3497159354`): packed value `15`, reactive slot rendered Steam target `G`.
  - Heroic Games Launcher, Ludusavi, and Lutris: packed value `0`, owned slot remained correctly empty.
- Saved the unchanged Assassin's Creed compatibility selection, back-navigated, and reopened the editor. The row remained `Automatic (Valve: Playable)`.
- `scripts/deck/verify/run_all.sh`: passed quick-links, re-render churn, and community checks. Controller-layout and launch checks were intentionally skipped by the script because this change does not affect those paths.
- Final grid screenshot: `/tmp/Decky-Metadata/compatibility-badge-cache-refresh/non-steam-grid-final.png`.
- Final diagnostics: `/tmp/Decky-Metadata/diagnostics/20260831T031839Z`.

## Review

Claude Opus 5 (`claude-opus-5`) reviewed the working tree in multiple read-only passes. Its functional findings covered React runtime compatibility, missing publication paths, delayed packed writes, install-time rerender behavior, activity refresh ordering, route publication suppression, production-helper coverage, and hook dependency stability. All were fixed and covered by tests. Its last substantive re-review verified those fixes and reported only one remaining blank line in a test file; that line was removed.
