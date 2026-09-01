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
  only that exact `m_mapApps` entry with a same-prototype copy after all writes.
  This publishes the completed native category without scanning the map or
  following an official matched-AppID alias.
- Added a bounded Home cache bypass. It starts from rendered `[data-id]` cards,
  follows at most 24 React ancestors, and accepts only the confirmed `VBC_` /
  `fnOnFocusedColumnChange` VirtualizedBoxCarousel fingerprint. It reads no
  MobX store and changes no route, input, focus, tab, or user field. The owned
  `cellRenderer` wrapper is stable per grid, recomputes the exact grid cache,
  and restores the original renderer during teardown.

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
- Focused Home/metadata tests pass: 63 tests. The four required focused Steam
  suites and final project quality gate are recorded after the live check.

## Live Deck evidence

- The Space Marine fixture is shortcut `2155012430`. Before the final live
  retry, its exact native overview reported packed `10`, derived category `2`,
  and native shortcut identity `true` while its selected Home card still lacked
  the yellow badge. This confirms the planned stale-card regression.
- The final Deck capture, grid check, two-minute replacement check, negative
  controls, and full no-launch smoke are pending while the configured Deck SSH
  address is temporarily unreachable. No persistent metadata was changed to
  create controls.
