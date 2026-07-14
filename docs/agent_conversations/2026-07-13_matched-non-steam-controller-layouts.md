# Matched Non-Steam Controller Layouts

## Objective

Allow listed and delisted matched non-Steam shortcuts to discover the matched
Steam game's Recommended / Official and Community controller configurations
without changing how Steam previews, selects, saves, or edits a configuration
for the shortcut.

## Files changed

- Added pure policy and deterministic tests in
  `src/steam/controllerLayoutPolicy.ts` and its colocated test.
- Added the injected, transactional SteamUI adapter and defensive tests in
  `src/steam/controllerLayouts.ts` and its colocated test.
- Extended the minimal controller boundary in `src/types.ts` and added the
  guarded production installer in `src/steam/install.ts`.
- Added the read-only controller query probe and semantic fixture smoke in
  `scripts/deck/js/check_controller_layouts.js` and
  `scripts/deck/verify/smoke_controller_layouts.sh`.
- Integrated the smoke into `scripts/deck/verify/run_all.sh --no-launch` and
  extended `tests/test_deck_fixture_selection.py` with read-only safety checks.
- Updated `README.md` and regenerated the committed `dist/index.js`.

## Design and safety decisions

- Source resolution requires the unpatched shortcut predicate plus a finite,
  positive, different `steam_appid`. Store state does not gate listed,
  delisted, or unknown matches; native and never-on-Steam apps are pass-through.
- Pure merges preserve every native record and its ordering, seed native
  non-empty URLs as identities, and deduplicate only supplemental records before
  appending valid matched records. Recommended templates require
  `bRecommended === true`; generic and personal matched templates do not leak.
- Installation validates the Input bridge and all three getter prototype data
  descriptors before replacement. Four wrappers install as one transaction;
  any replacement failure restores prior descriptors in reverse order before
  the fallback warning is requested.
- Every wrapper invokes the native displayed-app method exactly once before
  plugin work. Native exceptions retain native behavior. Supplemental errors
  return the secured native result, disable all augmentation for the session,
  emit one bounded diagnostic, and request one best-effort warning toast.
- The shared breaker enters its disabled state before logging or notification.
  Throwing/missing notification behavior is swallowed, and later calls are
  native-only until plugin reload. Unload restores the exact original
  descriptors idempotently.
- The adapter never patches or invokes selection, preview, clearing, export,
  editing, save, shortcut, or metadata-write APIs and does not register another
  controller configuration listener.
- The device probe uses the existing connected-controller list, the native
  controller configurator query, bounded waiting, and the three read getters.
  Evidence contains counts and URL hashes only and remains under
  `/tmp/Decky-Metadata`.

## Deterministic and local verification

- Pure and adapter suites cover listed/delisted/unknown source policy; native
  and never-on-Steam pass-through; stable immutable merges; synthetic
  Recommended data; malformed supplemental values; all four runtime failure
  sections; native-throw call counts; shared breaker behavior; throwing
  notifier behavior; discovery exhaustion; malformed descriptors; failures on
  transactional install sections two through four; and repeated exact
  install/uninstall restoration.
- Device-tooling tests enforce semantic fixture reuse, `--no-launch`
  integration, hashed output, and the absence of mutating controller, metadata,
  navigation, reload, or launch calls in the committed JavaScript probe.
- `scripts/orchestration/run-quality-gates` passed: TypeScript type-check,
  Rollup build, 8 Vitest files / 85 tests, Python byte-compilation, the full
  pytest suite, and version-drift checks.
- Focused verification passed for the 32 pure/adapter controller tests, the 7
  device-fixture tests, JavaScript syntax, both shell syntax checks,
  review-note preservation, and `git diff --check`.
- `./run.sh npm run package` created the fixed-name local
  `Decky-Metadata.zip`; it was not copied, installed, deployed, or reloaded.

## Existing live fixture evidence

The read-only research that scoped this implementation found non-empty direct
Community results for the listed Assassin's Creed match (31), the delisted
Deadpool match (9), and the Wobbly Life match (5). The nine matched games then
available had no natural Recommended / Official record; the native Stardew
Valley query demonstrated that Steam can return a Recommended template. No
shortcut, metadata, selection, preview, or settings state was changed to create
a fixture.

## Live verification status

DEFERRED: awaiting user-installed bundle

Owner: user. After the locally built package is independently installed, the
read-only controller-layout smoke and `run_all.sh --no-launch --extended` may be
run. Live Recommended population remains deferred until a matching fixture
occurs naturally; deterministic pure and adapter tests cover that branch.

## Review round 01 resolution

- Corrected supplemental merging so duplicate native URL records remain
  byte-for-byte present in their original order; only matched supplemental
  collisions are omitted.
- Added a frozen-input regression covering two native records with the same URL,
  a colliding supplemental record, and a unique appended supplemental record.
- TDD evidence: the focused policy suite failed with the second native record
  missing before the fix, then passed after the native-base copy change.

## Unrelated observations

None. The implementation stayed within the plan's file boundary and preserved
the pre-existing untracked thermo-nuclear review.
