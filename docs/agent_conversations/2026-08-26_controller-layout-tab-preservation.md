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
- `docs/agent_conversations/2026-08-26_controller-layout-tab-preservation.md`
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
- The render wrapper scopes itself to the chooser's `Community` and `Search`
  tab-content app ID/controller index, a matched non-Steam context, and
  controller type `102`. It recognizes Steam's generated tab-ID prefixes while
  preserving exact IDs. The static `Templates` tab is deliberately allowed to
  have no app context, matching the live chooser shape. It wraps `onShowTab`
  with the original receiver, arguments, return value, and error behavior,
  recording only an available tab ID. A missing remembered tab is deleted rather
  than invented.
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
- For review-02 both hosts returned to service and the rebuilt bundle was
  deployed before final capture. An early navigation attempt selected the first
  duplicate Space Marine shortcut returned by Steam search, which belonged to
  the other host; the strengthened probe now checks the active store app ID, and
  that discarded attempt was not used as evidence. The final captures used
  Legion shortcut `3213262460` / controller index `0` / type `102` and Steam
  Deck shortcut `2155012430` / controller index `15` / type `4`.
- Both final typed smokes passed with Community selected before and after the
  direct filter query. Legion rendered `14` then `52` cards, and Steam Deck
  rendered `23` then `52`; both getters reported `52` after the query. Both
  restored the filter to `true` and restored Community. Steam mutated its
  displayed cache entry in place rather than replacing its identity on both
  hosts (`cacheMutated: true`, `cacheReplaced: false`), so the probe accepts
  either observable completion form. Legion's pre-query hashes remained in its
  expanded result; Steam Deck's native type-4 filter returned a non-monotonic
  hash set, which is recorded but not treated as a preservation failure.
- Safe final evidence and before/after screenshots live below
  `/tmp/Decky-Metadata/controller-layout-tab-preservation/`: `legos.json`
  (`12fd9a6026bdb37baf35f3f4ca65406219c407d2546132b31771d54138fb9625`),
  `steamdeck.json`
  (`e93042cfe5cc034bcc72cb6353995b82198390a685e1272d09a89fe7b92d9fcd`),
  `legos-final-proof-community-{before,after}.png`,
  `steamdeck-final-proof-community-{before,after}.png`, and the matching
  `*-final-proof-smoke.log` files. No account data, raw URLs, selection,
  preview, apply, export, save, route, or launch action was included.
- `scripts/deck/verify/run_all.sh --no-launch` was also rerun using unique
  `DECKY_VERIFY_RUN_ID` values to prevent its shared default staging path from
  colliding across the two simultaneous hosts. Legion passed rerender, Community,
  and controller-layout checks but retained the unrelated quick-links fixture
  failure `developer metadata missing from a Game Info page`. Steam Deck passed
  rerender and Community but retained unrelated quick-links `delisted game lost
  rich metadata` and controller-layout `delisted matched source Community
  results are empty` fixture failures. These pre-existing fixture outcomes are
  isolated in `legos-run-all-no-launch-final.log` and
  `steamdeck-run-all-no-launch-final.log`; they do not alter the dedicated typed
  smoke result.

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
- Review-02 mutation controls were also restored without committing them:
  - making every query clear memory produced 3 named direct-query preservation
    failures in `review-02-mutation-direct-clears.log`;
  - suppressing remembered `activeTab` substitution produced 4 named remount
    restoration failures in `review-02-mutation-active-tab-substitution.log`;
  - changing the type scope from `102` to `4` produced 11 failures, including
    Steam Deck native pass-through, in
    `review-02-mutation-type-four-scope.log`.
- The review-02 focused green control passed 2 Vitest files / 88 tests and the
  fixture safety file's 13 tests in `review-02-focused-green.log` and
  `review-02-fixture-green.log`. The permanent full quality gate was rerun
  after the restored controls and documentation changes.
- `./run.sh bash -n scripts/deck/verify/smoke_controller_tab_persistence.sh`,
  `./run.sh node --check scripts/deck/js/check_controller_tab_persistence.js`,
  and `./run.sh scripts/orchestration/run-quality-gates` passed after the
  restored controls. The full gate regenerated both committed bundle artifacts
  and passed TypeScript, Rollup, 20 Vitest files / 250 tests, Python
  byte-compilation, the full pytest suite, and the review-note deletion check.

## Explicitly unverified

- Layout preview, selection, application, and game launch remain untested by
  design. Types other than `4` and `102`, physical multiple-controller switching,
  hot-plug behavior, and webpack shapes outside the structurally tested current
  build remain unit-only/fail-open.
