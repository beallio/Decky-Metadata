# Retry mounted compatibility badge discovery

## Date

2026-09-01

## Objective

Keep the Home compatibility badge visible when Steam mounts Home cards after a
SharedJSContext restart. The fix must not navigate, change focus, publish a
metadata revision, poll an AppOverview store, or run background work after its
bounded startup window ends.

## Implementation

- `installLibraryCompatibilityIndicators` now has separate target-resolution
  and mounted-Home discovery retry lifecycles. Mounted discovery runs every
  500 ms for at most 60 attempts after the normal patches, subscription,
  synchronous refresh, install diagnostic, and compatibility refresh paths.
- Each observation finds mounted Home cards through the existing Steam browser
  window bridge and bounded fiber walk. It leaves an intact wrapper alone, or
  wraps and recomputes the newest native renderer when Steam replaces it.
- The known Steam grid has a writable, configurable `props` field. The final
  fix owns that field with a teardown-safe accessor. A React replacement props
  object is wrapped immediately, keeps its newest native renderer as the
  cleanup target, and needs no timer after discovery exhaustion.
- Cleanup first makes both retry callbacks inert, cancels both timer IDs, then
  restores the newest native renderer and the original `grid.props` descriptor.
- The mounted-card type cache retains only callable component types. Object
  React markers are not callable and are not wrapped.
- The Unreleased changelog already contains the required Home restart recovery
  note. The generated `dist/index.js` and `dist/index.js.map` were rebuilt.

## Test-first evidence

- With mounted-discovery scheduling temporarily disabled, the focused test
  `retries mounted Home discovery when cards appear after startup patch
  installation` failed at the required native-renderer assertion:
  `expected [Function Mock] not to be [Function Mock]`. The failure is saved at
  `/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery/mutation-disabled-observation.log`.
- A later focused failure found the liveness boundary: `leaves an intact
  mounted Home wrapper alone during a later liveness observation` recomputed an
  intact renderer twice. The saved failure at
  `/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery/focused-pre-production-failure.log`
  records the required one-versus-two recompute assertion. The observation now
  recomputes only a new or replaced wrapper.
- The final focused suite passes 57 tests. It covers immediate discovery,
  late-mounted cards, continuous liveness, renderer replacement, grid props
  replacement after exhaustion, bounded exhaustion, and raced-callback cleanup.
- The final full quality gate passes: TypeScript, Rollup, 26 Vitest files / 389
  tests, Python byte-compilation, pytest, version checks, and the review-note
  deletion check. Its output is at
  `/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery/final-quality-gates.log`.

## Live Deck evidence

### Diagnostic trial and root cause

- The first controlled restart logged all 60 discovery observations. Each found
  34 Home cards and four grids, but the later probe found Steam's native bound
  `CellRenderer` again. The log is
  `/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery/20260901T1853-current-bundle-frontend-diagnostics.log`.
- The bounded card probe showed that `grid.props.cellRenderer` was writable and
  configurable, then that React replaced the whole writable/configurable
  `grid.props` object after the timer stopped. The fix therefore owns that exact
  property boundary rather than extending the retry window or changing renderer
  detection.

### Final no-navigation restart proof

- Decky Metadata was enabled only for each controlled trial and disabled again
  afterward. Library Home was mounted before `SteamClient.Browser.RestartJSContext()`.
- After the 30-second window,
  `20260901T185614-0700-retained-home-after-retry-window.json` records the
  wrapper source, an owned `cellRenderer` getter, an owned `grid.props` getter,
  and the yellow Playable SVG for Space Marine shortcut `2155012430`. Its paired
  screenshot is `20260901T185614-0700-retained-home-after-retry-window.png`.
- After more than two minutes without navigation, focus changes, or metadata
  publication,
  `20260901T185851-0700-retained-home-after-two-minutes.json` records the same
  wrapper and yellow Playable SVG. Its paired screenshot is
  `20260901T185851-0700-retained-home-after-two-minutes.png`.
- The exact Non-Steam18 tab was selected with the committed click tool. After
  three Down inputs, `20260901T190107-0700-non-steam-grid-space-marine.png`
  shows Space Marine with the yellow Playable badge while the adjacent
  unresolved-Automatic Transformers Fall of Cybertron card has no badge. The
  bounded fiber probe at
  `20260901T190241-0700-non-steam-grid-bounded-fiber-probe.json` records one
  grid compatibility slot for each card; the unresolved slot is inert.
- Official Home card `Teenage Mutant Ninja Turtles: Splintered Fate` (`2996040`)
  has no `decky-metadata-compatibility-*` fiber key. The bridge result is in
  `20260901T190335-0700-official-home-card-isolation-probe.json`.
- `./run.sh scripts/deck/verify/run_all.sh --no-launch` passed. It passed the
  quick-links, re-render, Community, and controller-layout smokes; the launch
  smoke was intentionally skipped. The output is
  `/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery/run-all-no-launch.log`.
- `./run.sh scripts/decky capture` completed and saved
  `/tmp/Decky-Metadata/diagnostics/20260902T020522Z`. The dedicated CDP tunnel
  was closed, `scripts/deck/tunnel.sh status` reported `tunnel: down`, and
  Loader again lists `Decky Metadata` in `disabled_plugins`.

## Files changed

- `src/steam/libraryCompatibilityIndicators.tsx`
- `src/steam/libraryCompatibilityIndicators.test.tsx`
- `dist/index.js`
- `dist/index.js.map`
- `CHANGELOG.md`
- `docs/agent_conversations/2026-09-01_retry-mounted-compatibility-badge-discovery.md`
