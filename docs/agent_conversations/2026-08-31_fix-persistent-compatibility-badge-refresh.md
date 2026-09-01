# Fix persistent compatibility badge refresh

## Date

2026-08-31

## Objective

Keep a positive saved non-Steam compatibility category visible on Library Home
and grid cards after Decky Metadata or SharedJSContext reloads, without opening
the game details page, changing focus or tabs, or replacing the current route.

## Implementation

- Removed the same-route `history.replace()` workaround. Compatibility refresh
  now publishes only the plugin revision signal.
- Patched `appInfoStore.OnAppOverviewChange`, the Steam input that runs before
  `UpdateAppOverview` creates and publishes native replacement objects. It
  writes the effective category to the incoming exact native-shortcut protobuf,
  keeps packed bits above the compatibility nibble, and records the baseline
  once. `UpdateAppOverview` publishes one revision only after the complete
  native update returns.
- When saved metadata changes an existing native shortcut, the code replaces
  only that exact `m_mapApps` entry after all writes. The replacement runs the
  native AppOverview constructor, retains its own `LOG_CHANGE` callback and
  non-enumerable initialization, and restores preserved state before map
  publication. This supports both live observable and non-observable classes
  without scanning the map or following an official matched-AppID alias.
- Steam now exposes `UpdateAppOverview` as a read-only native method. The
  writable `OnAppOverviewChange` input patch remains the lifecycle boundary;
  when the optional update hook cannot be installed, it emits one deferred
  revision after the native input batch instead of aborting all Steam patches.
- The mounted-card cache bypass uses the established SteamUI browser-window
  bridge: `SteamUIStore.m_WindowStore.MainWindowInstance.m_BrowserWindow.document`,
  with `GamepadUIMainWindowInstance.m_BrowserWindow.document` as the compatible
  fallback. It finds only rendered `[data-id]` cards, walks each card's React
  ancestors to the existing `m_refGrid` with the exact VBC fingerprint, wraps
  its current native renderer, and recomputes the grid. It does not navigate,
  change focus, enumerate a MobX store, or use a route replacement.

## Failed alternatives

- The previous same-route history replacement did not invalidate the mounted
  VirtualizedBoxCarousel item cache.
- Adding only a ref to future Home output did not help an already-mounted
  carousel because the ref was never adopted.
- Cross-context component object identity does not match the Big Picture card
  fiber. The production boundary uses the established browser-document bridge
  plus the existing strict VBC source fingerprint instead.

## Test-first evidence

- On the unmodified runtime,
  `refreshes a Home card cached before patch installation without replacing the
  current route` failed because the native compatibility slot remained `false`.
- On the unmodified runtime,
  `reapplies a positive category to a native AppOverview replacement before
  callers receive it` failed because the replacement packed value remained `0`
  instead of `10`.
- Mutation evidence is at
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh-mutation-tests.log`:
  disabling the lifecycle reapply branch made the named replacement assertion
  fail at `0` instead of `10`.
- Review-round test-first failures are recorded in
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh-tdd-failure.log`:
  the replacement renderer was not rewrapped, a prototype clone did not run
  the AppOverview constructor, and a read-only `UpdateAppOverview` aborted
  patch installation. The corrected Home/metadata suites pass 66 tests.
- The round-02 bridge regression puts cards only in
  `MainWindowInstance.m_BrowserWindow.document`; the SharedJSContext global,
  parent, top, and Gamepad fallback documents have no cards. A compatibility
  revision then wraps the stale renderer, recomputes the grid, renders the
  native Playable indicator, and restores the native renderer on teardown. A
  second focused test proves the Gamepad browser-document fallback. The focused
  suite passes 39 tests.
- The final local quality gate passes: TypeScript, Rollup, all 26 Vitest files
  (371 tests), Python byte-compilation, pytest, version guard, and the
  review-note deletion guard. The shared `/tmp` quota was full during earlier
  attempts; only generated npm, Node compile, pytest-temp, and Python bytecode
  caches below `/tmp/Decky-Metadata` were cleared before the successful rerun.

## Live Deck evidence

- On 2026-09-01, `scripts/decky doctor --deck` confirmed Deck reachability and
  `scripts/decky verify-change dev --device --explain` rebuilt, deployed, and
  hard-reloaded the frontend. The corrected bridge was therefore running before
  the visual check; no persistent metadata was changed.
- Space Marine is shortcut `2155012430`. The visible Library Home card showed
  Steam's Deck icon and yellow Playable indicator after the hard reload and
  again more than two minutes later. The retained screenshot is
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/home-after-hard-reload.png`.
  Its same-time machine-readable probe is
  `home-after-hard-reload-state.json`: packed `10`, derived category `2`, and
  native shortcut identity `true`.
- Steam's browser history object remained stale at
  `/routes/library/app/2312439508` while the Big Picture surface visibly showed
  Library Home. The browser bridge still exposed its document, but the stale
  route object could not be used as the visual-card identity oracle. The
  screenshot is the user-visible evidence for the selected Space Marine card.
- The direct `/library/collection/nonsteam` navigation reached Steam's Library
  tab strip, but its grid stayed blank in this session, so the Space Marine grid
  badge could not be visually verified. No fixture detail route was opened for
  this attempt. A native AppOverview replacement, negative controls, and a
  retained grid PNG consequently remain unverified; this record does not claim
  them as passing.
- `scripts/deck/verify/run_all.sh --no-launch` passed quick-links, rerender,
  community, and all controller-layout behavior checks. Its final controller
  JSON write failed with `OSError: [Errno 122] Disk quota exceeded`, so the
  aggregate smoke command returned failure despite the completed behavior
  checks. `scripts/decky capture` hit the same `/tmp` quota while copying its
  diagnostic inputs. Exact output is retained in
  `persistent-compatibility-badge-refresh/no-launch-smoke.log` and
  `capture-error.log`; no source logs or persistent metadata were changed.
