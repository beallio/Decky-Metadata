# Controller layout tab preservation

## Date

2026-08-26 to 2026-08-27

## Objective

Implement `controller-layout-tab-preservation`: retain the currently selected
controller-layout chooser tab when the verified Legion Go S type `102` toggles
Show All for a matched non-Steam shortcut. Steam's native default remains in
control for fresh chooser queries and for every other device/context.

## Files changed

- `src/steam/controllerTabPersistence.ts`
- `src/steam/controllerTabPersistence.test.ts`
- `src/steam/controllerLayouts.ts`
- `src/steam/controllerLayouts.test.ts`
- `scripts/deck/js/check_controller_tab_persistence.js`
- `scripts/deck/verify/smoke_controller_tab_persistence.sh`
- `tests/test_deck_fixture_selection.py`
- `docs/runbooks/on-device-verification.md`
- `README.md`
- `CHANGELOG.md`
- generated `dist/index.js` and `dist/index.js.map`

## Design decisions

- The new controller-tab module is independent of the layout merge/search
  policy. It discovers a webpack module only when a sibling header function
  contains `activeTab`, `tabs`, and `onShowTab`, and then swaps the exact own,
  writable/configurable memo `type` descriptor. Discovery remains lazy so a
  chooser chunk loaded after plugin startup can be patched by a later direct
  input query.
- The render wrapper scopes itself to a consistent chooser tab-content app ID
  and controller index, a matched non-Steam context, and controller type `102`.
  It wraps `onShowTab` with the original receiver, arguments, return value, and
  error behavior, recording only an available tab ID. A missing remembered tab
  is deleted rather than invented.
- The input wrapper samples `BConfigurationQueryInFlight` before Steam's native
  call. A store-driven query clears the matching memory; a direct filter query
  preserves it. Both query origins attempt lazy tab installation before the
  store-driven path clears its exact key, so the first chooser render can capture
  the user's initial selection. Tab discovery, rendering, and cleanup failures
  are optional/fail-open and cannot trip the existing controller-layout
  disable/toast path.
- The permanent smoke is intentionally separate from `run_all.sh`. It uses the
  real chooser tab DOM plus the SharedJSContext input/cache boundary, emits only
  scalar state and hashed identities, restores the visible filter and original
  tab, and contains no preview, selection, apply, launch, route, controller
  input, raw URL, or account-data operation.

## Baseline and device evidence

- `scripts/decky doctor` passed required local checks with its expected cache
  and local-package warnings. `scripts/decky verify-change dev --explain`
  routed the initial plan commit to the quality gate and passed it: 19 Vitest
  files / 225 tests and the Python suite.
- The same current `dev` bundle was deployed successfully to both dedicated
  ports before source edits. On the Steam Deck shortcut `2155012430`, controller
  index `15`, type `4`, selected Community Layouts stayed selected across the
  direct unfiltered query. On Legion shortcut `3213262460`, index `0`, type
  `102`, the same direct query set the visible filter to `false` and reset the
  chooser from Community Layouts to Your Layouts. Reselecting Community rendered
  52 DOM layout cards on both hosts. The Legion SharedJSContext getter returned
  50 current source identities, while its rendered view contained the two
  shortcut records plus that source set. Both filters and their original tabs
  (Steam Deck Your Layouts; Legion Templates) were restored; both baseline
  tunnels were closed.
- After the review-01 correction, `DECKY_DECK_HOST=steamdeck-legos ./run.sh
  scripts/decky doctor --deck` and `DECKY_DECK_HOST=steamdeck ./run.sh
  scripts/decky doctor --deck` both returned `WARN deck-reachability: Optional
  Deck is offline`. No deployment was attempted after those reachability checks,
  and no blind retry was made. The required post-change typed smokes,
  screenshots, and no-launch suites remain blocked on current device
  reachability; they must be rerun against this corrected commit when both hosts
  return online.

## Red, green, and mutation evidence

- The initial typed seam avoided a missing-module red result. The completed red
  Vitest run recorded six named behavior failures (chooser key, structural memo
  target, active-tab capture/restore, direct-query preservation, callback-throw
  memory, and lazy installation) in
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/red-vitest-full.log`.
  The probe contract red run failed on the required `DISPLAY_APPID` field, not
  syntax or a missing file, in
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/red-probe-safety.log`.
- Review-01 red tests failed as intended: a fresh store query did not install
  the tab wrapper (2 named Vitest failures) and the old probe/smoke contract
  lacked the required serialized payload/completion contract. Outputs are
  `review-01-red-vitest.log` and `review-01-red-probe.log` below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`.
- The corrected focused positive control passed 2 Vitest files / 85 tests and
  the fixture safety file's 11 tests; outputs are
  `review-01-focused-green-vitest.log` and
  `review-01-focused-green-pytest.log` below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`. The probe test
  runs the emitted query phase with a delayed displayed-cache replacement and
  proves the bounded missing-completion timeout.
- Mutation controls were restored without committing them:
  - removing store-driven installation produced 2 named first-render failures
    in `review-01-mutation-store-install.log`;
  - forcing direct filter queries to clear memory produced 3 named preservation
    failures in `review-01-mutation-direct-clears.log`;
  - suppressing remembered `activeTab` substitution produced 3 named remount
    restoration failures in `review-01-mutation-active-tab-substitution.log`;
  - changing the type scope from `102` to `4` produced 7 failures, including
    the Steam Deck native-pass-through contract, in
    `review-01-mutation-type-four-scope.log`.
- `./run.sh bash -n scripts/deck/verify/smoke_controller_tab_persistence.sh`,
  `./run.sh node --check scripts/deck/js/check_controller_tab_persistence.js`,
  and `./run.sh scripts/orchestration/run-quality-gates` passed after the
  restored controls. The full gate regenerated both committed bundle artifacts
  and passed TypeScript, Rollup, 20 Vitest files / 250 tests, Python
  byte-compilation, the full pytest suite, and the review-note deletion check.

## Explicitly unverified

- Post-change Legion type-102 and Steam Deck type-4 smoke results, screenshots,
  and `verify/run_all.sh --no-launch` remain blocked until both configured
  devices are reachable.
- Layout preview, selection, application, and game launch remain untested by
  design. Types other than `4` and `102`, physical multiple-controller switching,
  hot-plug behavior, and webpack shapes outside the structurally tested current
  build remain unit-only/fail-open.
