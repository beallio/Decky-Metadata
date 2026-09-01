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

### Review-round 03 correction and adopted evidence

- The earlier description of
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/home-after-hard-reload.png`
  was incorrect. The PNG is a blank Library Collections view and contains no
  game card; it is retained only as a failed-attempt artifact and is not visual
  badge evidence.
- The independent reviewer opened `/library/home` without first opening a game
  details route. The valid retained Home evidence is
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/reviewer-home.png`.
  It shows Space Marine, shortcut `2155012430`, with its yellow native Playable
  indicator more than ten minutes after the feature deploy.
- The reviewer then selected the exact `Non-Steam18` Library tab with the
  committed click/input tooling and sent three Down inputs. The valid retained
  grid evidence is
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/reviewer-nonsteam-grid-space-marine.png`.
  It shows the same yellow indicator for Space Marine. The adjacent Transformers
  Fall of Cybertron card is unresolved Automatic and has no indicator.
- The bounded rendered-card fiber check also found that official Brotato and
  Teenage Mutant Ninja Turtles cards retained their native indicators and had no
  `decky-metadata-compatibility-*` React key. The check did not enumerate any
  Steam or MobX store from a React walk.

The review results, in a machine-readable form, are:

```json
{
  "home": {
    "appId": 2155012430,
    "nativeShortcut": true,
    "packedCompatibility": 10,
    "effectiveCategory": 2,
    "indicator": "yellow Playable",
    "png": "reviewer-home.png"
  },
  "nonSteamGrid": {
    "appId": 2155012430,
    "nativeShortcut": true,
    "packedCompatibility": 10,
    "effectiveCategory": 2,
    "indicator": "yellow Playable",
    "png": "reviewer-nonsteam-grid-space-marine.png"
  },
  "unresolvedAutomatic": {
    "title": "Transformers Fall of Cybertron",
    "indicator": false
  },
  "officialGames": {
    "titles": ["Brotato", "Teenage Mutant Ninja Turtles"],
    "nativeIndicatorPreserved": true,
    "deckyMetadataCompatibilityReactKey": false
  }
}
```

The committed command forms for a repeat of that bounded check are:

```bash
T="Steam Big Picture Mode"
scripts/deck/cdp.py eval SharedJSContext @scripts/deck/js/nav.js --var ROUTE=/library/home
scripts/deck/cdp.py eval "$T" @scripts/deck/js/fiber_walk.js --var TEXT="Space Marine"
scripts/deck/cdp.py screenshot /tmp/Decky-Metadata/persistent-compatibility-badge-refresh/reviewer-home.png "$T"
scripts/deck/cdp.py eval SharedJSContext @scripts/deck/js/nav.js --var ROUTE=/library/collection/nonsteam
scripts/deck/cdp.py eval "$T" @scripts/deck/js/click_by_label.js --var LABEL=Non-Steam18
scripts/deck/cdp.py input "$T" down down down
scripts/deck/cdp.py eval "$T" @scripts/deck/js/fiber_walk.js --var TEXT="Space Marine"
scripts/deck/cdp.py screenshot /tmp/Decky-Metadata/persistent-compatibility-badge-refresh/reviewer-nonsteam-grid-space-marine.png "$T"
```

The exact native-shortcut category values are also recorded in the contemporary
`home-after-hard-reload-state.json` probe. Its image pairing is invalid, so the
values above are adopted together with the valid reviewer screenshots rather
than using that blank PNG as a visual oracle.

### Round-03 recovery attempt

- The full local quality gate recorded at
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/quality-gates-final.log`
  passed TypeScript, Rollup, 26 Vitest files / 371 tests, Python
  byte-compilation, pytest, the version guard, and the review-note deletion
  guard. The documentation correction was then rerun through the same gate;
  `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/quality-gates-round03.log`
  ends with `quality-gates: OK`, `no deleted review notes`, and `quality gates
  passed`.
- The first `scripts/deck/verify/run_all.sh --no-launch` and
  `./run.sh scripts/decky capture` attempts failed because the user `/tmp`
  quota was exhausted. To recover space, only regenerable paths below
  `/tmp/Decky-Metadata` were removed: Python/Node/pytest caches,
  `diagnostics/` capture copies, and `steamui/unknown` snapshots. Deck source
  logs, persistent metadata, screenshots, and reviewer evidence were retained.
- After recovery, `df -h /tmp` reported 675M filesystem free and the user quota
  reported 2308M used of 2387M. The exact retry command,
  `./run.sh scripts/deck/verify/run_all.sh --no-launch`, no longer hit quota but
  stopped immediately with `ssh: connect to host 10.168.168.20 port 22: No route
  to host`. `./run.sh scripts/decky doctor --deck` likewise reports optional
  Deck reachability as offline.
- `./run.sh scripts/decky capture` then passed the quota boundary but failed to
  parse an empty metadata response with `json.decoder.JSONDecodeError`.
  Its diagnostic directory is
  `/tmp/Decky-Metadata/diagnostics/20260901T155955Z`. The current dedicated
  tunnel was explicitly closed with `scripts/deck/tunnel.sh down`; the follow-up
  `scripts/deck/tunnel.sh status` reports `tunnel: down`.

The aggregate smoke command and final capture must be rerun successfully after
the Deck is reachable again. The current live-device outage prevents completion
of those two required gates; no round-complete marker is claimed for this
attempt.
