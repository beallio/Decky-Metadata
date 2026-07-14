# Controller Layout Cache Isolation Implementation

Date: 2026-07-14

## Objective

Prevent controller-layout caches borrowed for matched non-Steam shortcuts from
leaking inactive games into SteamUI's global Controller Settings Search, while
avoiding redundant matched-source bridge queries on repeated navigation.

## Defect and design

The prior adapter reset and queried every matched real-Steam source on every
shortcut query. Those supplemental responses remained in SteamUI's session-wide
controller configuration map, and native `GetAllConfigs()` exposed all of them
to Search regardless of the currently displayed shortcut.

The implementation keeps three adapter-local, session-only values: the active
matched source appid, the source appids whose cache entries were absent before a
successful plugin supplemental query, and the last successful primitive query
key per source (source appid, controller index, and filter boolean). Exact-key
`has` and `set` operations are the only cache-map operations. Identical queries
reuse an existing source entry; changed keys or missing entries trigger one
reset and supplemental query. A direct native query relinquishes plugin
ownership without deleting or rewriting Steam's cache.

`GetAllConfigs` is installed with the query and three section getters as one
five-descriptor transaction. Its wrapper calls native Search first and once,
then filters only inactive plugin-owned source appids from the returned array.
Active, pre-existing/native, malformed, and opaque records remain ordered and
unchanged. Adapter-local provenance is cleared during idempotent unload.

## Defensive behavior

Unexpected descriptors, query arguments, map operations, supplemental calls,
or Search results trip the existing shared session breaker. The secured native
result is returned, all five wrappers become native-only, diagnostics remain
bounded to invariant/appid data, and the existing warning toast is requested at
most once. Native throws retain their original semantics and are not retried.

The read-only Deck probe now performs a bounded two-shortcut sequence, samples
only exact supplied cache keys with `has`, and reports only appids, booleans,
counts, and URL hashes. It defers the isolation assertion when either source
cache pre-existed instead of mutating Steam state.

## Files changed

- `src/steam/controllerLayoutPolicy.ts` and tests
- `src/steam/controllerLayouts.ts` and tests
- `src/types.ts`
- `scripts/deck/js/check_controller_layouts.js`
- `scripts/deck/verify/smoke_controller_layouts.sh`
- `tests/test_deck_fixture_selection.py`
- `README.md`
- regenerated `dist/index.js`

No backend, package version, release, metadata matching, quick-link, or other
Steam patch behavior changed.

## Validation

- Baseline `scripts/decky verify-change dev --explain`: PASS (85 Vitest tests;
  full Python gate passed)
- Controller policy and adapter focused suite: PASS (51 tests)
- Deck fixture-selection/tooling suite: PASS (7 tests)
- `node --check scripts/deck/js/check_controller_layouts.js`: PASS
- `bash -n scripts/deck/verify/smoke_controller_layouts.sh`: PASS
- `bash -n scripts/deck/verify/run_all.sh`: PASS
- TypeScript `tsc --noEmit`: PASS
- Final repository quality gates: PASS (8 Vitest files / 104 tests; full
  TypeScript build/typecheck, Python compile/pytest, version-drift, and
  review-note-preservation checks passed)

## Live verification

DEFERRED: awaiting user-installed bundle
