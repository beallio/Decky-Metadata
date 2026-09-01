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
- The attempted Home cache bypass remains a same-context-only fallback. It
  starts from rendered `[data-id]` cards, but SharedJSContext has no access to
  the Big Picture document or its mounted `m_refGrid` instance. It therefore
  cannot fulfill the persistent already-mounted-card requirement on this Deck.

## Failed alternatives

- The previous same-route history replacement did not invalidate the mounted
  VirtualizedBoxCarousel item cache.
- Adding only a ref to future Home output did not help an already-mounted
  carousel because the ref was never adopted.
- Cross-context component object identity did not match the Big Picture card
  fiber. The production boundary therefore uses the existing strict source
  fingerprint instead.

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
- The final local quality gate passes: TypeScript, bundle, all 26 Vitest files
  (370 tests), Python compilation, pytest, and the review-note deletion guard.

## Live Deck evidence

- The Space Marine fixture is shortcut `2155012430`. Before the final live
  retry, its exact native overview reported packed `10`, derived category `2`,
  and native shortcut identity `true` while its selected Home card still lacked
  the yellow badge. This confirms the planned stale-card regression.
- On 2026-09-01, the Deck was reachable and the feature bundle was deployed.
  Before the runtime-hook repair, `installSteamPatches` aborted on the read-only
  `UpdateAppOverview` method, leaving the Home card unpatched. After the repair,
  Deck logs confirmed `library compatibility indicators installed` and `steam
  patches installed` with 93 teardown handlers.
- The unresolved runtime boundary is now explicit: SharedJSContext reports
  zero `[data-id]` cards for its global, parent, and top documents, while the
  Big Picture target owns the selected fixture card. A runtime-only,
  constructor-safe replacement of exact `m_mapApps[2155012430]` kept packed
  `10`, category `2`, and native shortcut identity, but did not rerender the
  cached Home card or show the badge. No persistent metadata was changed.
- The no-launch smoke ran. Re-render churn and community fallback passed;
  quick-links and controller-layout Community checks failed on existing
  delisted-fixture drift (no rich rendered metadata and zero source Community
  layouts), not on this change. The full `scripts/decky capture` copy failed
  because `/tmp` reached its per-user quota while copying historic logs. The
  session-created partial diagnostics were moved to the local Trash; source
  logs on the Deck were not changed.
- Home/grid PNGs, the two-minute replacement check, negative controls, and a
  passing no-launch smoke cannot be claimed. A sanctioned Steam cache
  invalidation API reachable from SharedJSContext, or explicit approval to use
  the current bounded Big Picture DOM/fiber instance path, is required before
  this plan can complete.
