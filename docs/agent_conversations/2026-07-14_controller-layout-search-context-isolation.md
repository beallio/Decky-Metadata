# Controller Layout Search Context Isolation

**Date:** 2026-07-14
**Objective:** Implement the existing controller-layout Search context-isolation
plan without accessing or modifying the Steam Deck.

## Defect

Controller Settings Search could reuse the previous matched shortcut's source
because the adapter updated its active source only from the later query effect.
The global Search policy also returned all native records for a no-match context,
and sources whose cache entries predated a supplemental query were not classified
as plugin-activated supplemental sources.

## Design

- Added one adapter-local context helper shared by the query wrapper and all
  Official, Template, and Workshop getters. Each native getter returns first;
  only then does the helper clear stale context, resolve the displayed app, and
  establish the current matched source.
- Replaced cache-creation ownership with session-local supplemental-source
  tracking. Every source is tracked after a successful supplemental bridge call,
  including sources with pre-existing cache entries. Exact query-key reuse and
  direct-native-query relinquishment remain unchanged.
- Updated the pure Search filter so inactive tracked sources are removed for
  both matched and no-match contexts. Unrelated native and opaque records retain
  their original order, and an empty tracking set preserves native array identity.
- Search still calls its captured native original first and exactly once, and it
  receives only the secured native array plus adapter-local primitive/set state.
  It never resolves metadata or accesses/enumerates Steam's configuration map.
- Preserved the shared all-or-nothing circuit breaker, existing warning text,
  best-effort reporting/toast behavior, five-descriptor transaction, exact
  restoration, and idempotent cleanup.
- Tightened the existing static verifier so cache preexistence no longer defers
  Search-isolation enforcement. No new verification framework was introduced.

## Files Changed

- `src/steam/controllerLayoutPolicy.ts`
- `src/steam/controllerLayoutPolicy.test.ts`
- `src/steam/controllerLayouts.ts`
- `src/steam/controllerLayouts.test.ts`
- `scripts/deck/js/check_controller_layouts.js`
- `scripts/deck/verify/smoke_controller_layouts.sh`
- `tests/test_deck_fixture_selection.py`
- `README.md`
- `dist/index.js`
- `dist/index.js.map`
- `docs/plans/2026-07-14_controller-layout-search-context-isolation.md`
- `docs/agent_conversations/2026-07-14_controller-layout-search-context-isolation.md`

## Validation

- `scripts/decky doctor` — completed with only the expected working-tree and
  repository-local `node_modules` warnings.
- `scripts/decky verify-change dev --explain` — passed the pre-change baseline
  gate (105 Vitest tests plus the full Python suite).
- `./run.sh npm test -- src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts`
  — 56 tests passed.
- `./run.sh npx tsc --noEmit` — passed.
- `./run.sh node --check scripts/deck/js/check_controller_layouts.js` — passed.
- `bash -n scripts/deck/verify/smoke_controller_layouts.sh` through `./run.sh` — passed.
- `./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py`
  — 7 tests passed.
- `scripts/orchestration/run-quality-gates` — passed after implementation (109
  Vitest tests, frontend build/typecheck, backend compile, full Python suite,
  version drift, and review-note preservation).
- `git diff --check` — passed.

## Device Verification

The controller-layout verifier issues configuration queries, so it was not run
against the Deck under the user's no-device-mutation boundary.

DEFERRED: user prohibited Deck mutation for testing; awaiting a user-installed package and manual navigation.

## Follow-up Scope

No unrelated improvements were included. Manual acceptance remains the user's
post-install responsibility exactly as described in the implementation plan.
