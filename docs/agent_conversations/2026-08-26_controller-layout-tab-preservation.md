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
  preserves it and retries lazy tab installation. Tab discovery, rendering, and
  cleanup failures are optional/fail-open and cannot trip the existing
  controller-layout disable/toast path.
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
- After implementation, both `scripts/decky doctor --deck` calls reported the
  configured Deck optional target offline. Each required deployment was then
  attempted once and failed before copying at SSH `No route to host`:
  `steamdeck` at `10.168.168.20` and `steamdeck-legos` at `10.168.168.219`.
  No blind retry was made. The post-change smoke, screenshots, and no-launch
  suite are therefore blocked on current device reachability.

## Red, green, and mutation evidence

- The initial typed seam avoided a missing-module red result. The completed red
  Vitest run recorded six named behavior failures (chooser key, structural memo
  target, active-tab capture/restore, direct-query preservation, callback-throw
  memory, and lazy installation) in
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/red-vitest-full.log`.
  The probe contract red run failed on the required `DISPLAY_APPID` field, not
  syntax or a missing file, in
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/red-probe-safety.log`.
- Focused green passed 2 Vitest files / 83 tests and the fixture safety file's
  8 tests; outputs are `focused-green.log` and `focused-probe-green.log` below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`.
- Mutation controls were restored without committing them:
  - forcing direct filter queries to clear memory produced the named direct
    preservation failure in `mutation-direct-clears.log`;
  - suppressing remembered `activeTab` substitution produced the named remount
    restoration failure in `mutation-active-tab-substitution.log`;
  - changing the type scope from `102` to `4` produced six failures, including
    the Steam Deck native-pass-through contract, in `mutation-type-four-scope.log`.
- The restored focused positive control passed 83 Vitest tests and 8 fixture
  tests (`focused-post-mutation-green.log` and
  `focused-probe-post-mutation-green.log`). Full quality gates passed with
  TypeScript, Rollup, 20 Vitest files / 248 tests, Python byte-compilation, and
  pytest in `quality-gates-pre-session.log`.

## Explicitly unverified

- Post-change Legion type-102 and Steam Deck type-4 smoke results, screenshots,
  and `verify/run_all.sh --no-launch` remain blocked until both configured
  devices are reachable.
- Layout preview, selection, application, and game launch remain untested by
  design. Types other than `4` and `102`, physical multiple-controller switching,
  hot-plug behavior, and webpack shapes outside the structurally tested current
  build remain unit-only/fail-open.
