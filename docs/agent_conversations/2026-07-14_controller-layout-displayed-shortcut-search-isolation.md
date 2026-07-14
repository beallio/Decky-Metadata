# Controller Layout Displayed Shortcut Search Isolation

**Date:** 2026-07-14
**Objective:** Implement the existing displayed-shortcut Search-isolation plan
on `feat/controller-layout-displayed-shortcut-search-isolation`.

## Defect and Root Cause

Live evidence captured before this implementation showed that the installed
`0.1.1+9667394` wrapper correctly removed inactive matched-source records but
left configuration records owned by previously displayed non-Steam shortcuts.
After moving from shortcut `2155012430` (source `55150`) to shortcut
`2312439508` (source `15100`), Search still exposed the first shortcut's
records. After moving to unmatched shortcut `3156562597`, Search still exposed
both prior shortcut caches.

The adapter tracked only the active matched source. Its source-only resolver
could not distinguish a native Steam app, an unmatched non-Steam shortcut, and
a matched non-Steam shortcut, so the pure Search policy had no primitive state
identifying the displayed shortcut.

## Design

- Replaced the ambiguous source resolver with a synchronous immutable
  `ControllerLayoutContext` containing `isNonSteamShortcut` and
  `matchedSourceAppid`.
- The production resolver performs one guarded `getOverview(displayedAppid)`
  lookup, uses the existing unpatched non-Steam predicate, and reads only the
  matching `metadataCache` entry.
- Added adapter-local `activeDisplayedShortcutAppid` state beside the active
  matched source. Query and section wrappers clear both values, resolve and
  validate context once after their native original returns, and establish only
  validated primitive state.
- Malformed, thrown, or contradictory context trips the existing shared breaker
  after securing the native result. Breaker trip and cleanup clear both active
  appids, supplemental-source tracking, and exact query-key state.
- Added `isSteamShortcutAppid`, using the unsigned 32-bit namespace
  `0x80000000..0xffffffff` defined by `backend/shortcuts_vdf.py`. Search can
  therefore isolate shortcut caches that predate plugin startup without
  enumerating Steam, MobX, metadata, or adapter-visited shortcuts.
- The pure Search filter preserves the current shortcut and matched source,
  removes inactive supplemental sources and inactive shortcut-owned records,
  preserves native/opaque records and order, and returns the original native
  array identity when no removal occurs.
- Search remains one native call plus one linear, side-effect-free pass. Hostile
  test doubles forbid resolver and configuration-map access during Search.
  Exact supplemental query-key reuse, native-first throws/results, direct-source
  relinquishment, five-descriptor rollback, and reverse-order cleanup remain
  covered.
- Extended the existing bounded semantic Deck probe to observe Search after the
  delisted match and unmatched shortcut in one listed -> delisted -> unmatched
  sequence. Evidence is limited to appids, booleans, counts, elapsed durations,
  and URL hashes.

## Files Changed

- `src/steam/controllerLayoutPolicy.ts`
- `src/steam/controllerLayoutPolicy.test.ts`
- `src/steam/controllerLayouts.ts`
- `src/steam/controllerLayouts.test.ts`
- `src/steam/install.ts`
- `scripts/deck/js/check_controller_layouts.js`
- `scripts/deck/verify/smoke_controller_layouts.sh`
- `tests/test_deck_fixture_selection.py`
- `docs/runbooks/on-device-verification.md`
- `README.md`
- `dist/index.js`
- `dist/index.js.map`
- `docs/plans/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`
- `docs/agent_conversations/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`

`main.py`, `backend/`, package versions, metadata persistence/matching, quick
links, layout selection/preview/export behavior, and the unrelated untracked
thermo-nuclear review were not changed.

## Red and Green Tests

- Pre-change focused run: 2 failures and 56 passes. The pure policy retained
  shortcut appids `2155012430` and `3156562597`, and the adapter reproduction
  retained stale shortcut-owned records. Output is stored at
  `/tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation-red.log`.
- Post-change focused run: 88 tests passed across
  `controllerLayoutPolicy.test.ts` and `controllerLayouts.test.ts`.
- Unsigned shortcut boundary coverage accepts `0x80000000` and `0xffffffff`
  and rejects `0x7fffffff`, zero, negatives, fractions, infinities, `NaN`,
  numeric strings, and values above `0xffffffff`.
- Context coverage distinguishes native, unmatched, matched, invalid displayed
  ids, invalid matched ids, equal displayed/source ids, thrown resolvers, and
  malformed/contradictory returned contexts.

## Validation

- `scripts/decky doctor` — completed with only the expected dirty-tree,
  cache-policy, and repository-local `node_modules` warnings.
- `scripts/decky verify-change dev --explain` — passed the pre-change baseline
  gate with 109 Vitest tests and the full Python suite.
- `./run.sh npm test -- src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts`
  — 88 tests passed.
- `./run.sh npx tsc --noEmit` — passed.
- `./run.sh node --check scripts/deck/js/check_controller_layouts.js` — passed.
- `./run.sh bash -n scripts/deck/verify/smoke_controller_layouts.sh` — passed.
- `./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py`
  — 7 tests passed.
- `scripts/orchestration/run-quality-gates` — passed after implementation with
  141 Vitest tests, Rollup build, TypeScript, backend compile, full Python suite,
  version drift, and review-note preservation.
- `scripts/orchestration/check-review-notes-not-deleted` — passed.
- `git diff --check dev...HEAD` and `git diff --check` — passed.

## Review Round 01 Corrections

The first committed review requested two safety/audit corrections before live
verification:

- Matched sources now use one shared native-Steam appid predicate: an integer
  greater than zero and below the reserved shortcut boundary `0x80000000`.
  The pure resolver treats shortcut-domain and overflowing metadata as an
  unmatched non-Steam context. The adapter independently rejects an injected
  malformed context carrying those values, trips the existing breaker after
  securing the native result, and leaves later wrappers native-only.
- The controller probe and `--no-launch` suite labels now describe the operation
  as bounded, no-selection, and cache-populating. They no longer call the probe
  read-only; the existing forbidden-operation assertions remain unchanged.

TDD red evidence is stored below `/tmp/Decky-Metadata` in
`controller-layout-displayed-shortcut-search-isolation-review01-red-vitest.log`
and `controller-layout-displayed-shortcut-search-isolation-review01-red-pytest.log`.
The first run produced eight expected TypeScript failures across pure and
adapter coverage for `0x80000000`, `3156562597`, `0xffffffff`, and
`0x100000000`; the fixture-selection contract also failed on the old read-only
label. After the correction, the focused Vitest run passed 96 tests and the
fixture-selection pytest run passed 7 tests. The complete local quality gate
passed with 149 Vitest tests and the full build/Python/version/review-note gate.
No Steam Deck command was run during this correction round.

## Device Verification

Read-only `scripts/decky status --deck` and `scripts/decky doctor --deck`
reported the Deck offline. `scripts/deck/logs.sh audit --json` could not find a
reachable log directory on either configured host. No deployment, reload,
navigation, controller query, layout operation, or launch was attempted.

DEFERRED: on-device deployment and controller-cache query require explicit current approval; the separate launch gate also requires an explicitly approved safe shortcut.

## Follow-up Scope

The approval-gated no-launch controller smoke remains required before this
`src/steam/` change is finalized or integrated unless the user explicitly
accepts the named deferral. The separate launch gate remains independently
approval-gated and must use an explicitly approved safe shortcut id.
