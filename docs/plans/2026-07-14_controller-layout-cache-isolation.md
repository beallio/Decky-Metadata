# Plan: Controller Layout Cache Isolation and Search Performance (controller-layout-cache-isolation)

## Context

Matched listed and delisted non-Steam shortcuts now receive the matched Steam
game's Recommended/Official and Community controller layouts, but the first
implementation leaves every borrowed real-Steam source entry in SteamUI's
session-wide `controllerConfiguratorStore.m_mapAppConfigs`. SteamUI's Search tab
calls `GetAllConfigs()`, which aggregates every real-Steam cache entry, and its
empty search text matches every returned record. After visiting Wobbly Life,
Transformers: Fall of Cybertron, and Warhammer 40,000: Space Marine, Search can
therefore show Wobbly Life configurations while another shortcut is active.

Read-only live diagnosis on 2026-07-14 confirmed that this is cache provenance
leakage, not incorrect metadata matching or a circuit-breaker failure:

- shortcut `2405230651` resolves to Wobbly Life source `1211020`;
- shortcut `3276984150` resolves to Transformers source `213120`;
- shortcut `2155012430` resolves to Space Marine source `55150`;
- all six shortcut/source entries coexist in SteamUI's shared map; and
- the three real-Steam source caches contained 75, 91, and 93 records (259 total).

The same implementation also resets the source entry and issues a second native
controller-config query every time the displayed shortcut is queried. That
causes avoidable bridge traffic, per-record MobX updates, and repeat-navigation
latency. Search then filters and renders the accumulated source records.

Fix both symptoms without changing layout selection semantics:

| Displayed state | Required behavior |
| --- | --- |
| Matched shortcut | Run the shortcut's native query once; query its matched source only when the source cache is absent or the controller/filter query key changed; retain the active source's layouts; omit inactive source entries introduced by this plugin from Search. |
| Revisited matched shortcut with the same controller/filter | Run the shortcut's native query once and reuse the existing matched-source cache without another source query. |
| Native Steam app | Preserve native query count, cache ownership, Search results, and all getter results exactly. A native query for a previously borrowed source relinquishes plugin ownership of that source. |
| Never-on-Steam shortcut | Preserve standard non-Steam Controller Settings and Search behavior exactly. |
| Incompatible SteamUI or any plugin-side failure | Trip the existing session circuit breaker once, show its warning toast best-effort, and use Steam's standard UI until plugin reload. |

The Search fix must be provenance-aware. Track only source cache entries that
were absent immediately before this plugin issued their supplemental query.
While a matched shortcut is active, keep its current source records available
and filter only *inactive plugin-owned* source appids from the array returned by
Steam's native `GetAllConfigs()`. Do not hide a source cache that predated the
plugin query or was subsequently queried as a native app; such records belong to
Steam's native global Search behavior.

Do not delete source map entries or add another controller-config listener.
Steam's responses are asynchronous, and deleting an entry while the registered
listener is still ingesting records risks a SteamUI exception. Do not enumerate,
clone, serialize, or traverse the MobX store. The Search wrapper may inspect only
its adapter-local provenance state and the array already returned by the native
`GetAllConfigs()` call.

Extend the existing all-or-nothing controller-layout patch transaction from four
to five descriptors by including `GetAllConfigs`. Native originals must still run
first and exactly once. Every new invariant, filtering, and cache-reuse operation
is plugin-only work behind the existing shared breaker. Unexpected descriptors,
argument shapes, map operations, or native result shapes must produce standard
Steam UI plus the existing one-time toast, never a render error, retry loop,
partially installed adapter, or Deck crash.

This plan changes only the controller-layout policy/adapter and their tests, the
minimal Steam type boundary, existing read-only controller-layout verification
tooling, README behavior documentation, regenerated `dist/index.js`, and the
implementation session log. It does not change backend metadata, match
resolution, selected layouts, quick links, activity/community content, package
versions, releases, or other Steam patches.

The local orchestration override is authoritative: branch from and finalize back
to local `dev` with `ORCH_LOCAL_ONLY=1`. Do not fetch, pull, push, create a remote
branch, or promote `dev` to `main` as part of this plan. Preserve the unrelated
untracked `docs/review/2026-07-13_gpt-5_dev_thermo-nuclear-review.md` without
editing, staging, deleting, or treating it as implementation output.

The user has prohibited modifying the Deck for testing. Local gates are the
implementation-round requirement. Do not deploy, reload Steam/Decky, clear
SteamUI caches, edit settings, select/preview layouts, or otherwise change Deck
state. After the user independently installs a resulting bundle, only the
bounded read/query verification described below is permitted; until then record
live verification exactly as `DEFERRED: awaiting user-installed bundle`.

**Slug used throughout this plan:** `controller-layout-cache-isolation`

---

## Orchestration Contract

**Slug:** `controller-layout-cache-isolation`

**Plan file:**

```text
docs/plans/2026-07-14_controller-layout-cache-isolation.md
```

**Implementation branch:**

```text
feat/controller-layout-cache-isolation
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/controller-layout-cache-isolation_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/controller-layout-cache-isolation_finalized
```

**Review notes:**

```text
docs/review/controller-layout-cache-isolation-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/controller-layout-cache-isolation
```

Commit this plan first:

```bash
git add docs/plans/2026-07-14_controller-layout-cache-isolation.md
git commit -m "docs(plan): add controller-layout-cache-isolation implementation plan"
```

---

## Implementation Tasks

Work in order and use TDD. Keep every production change fail-open and narrowly
scoped to the confirmed cache/query behavior.

### 1. Add pure Search-cache isolation policy

Modify `src/steam/controllerLayoutPolicy.ts` and
`src/steam/controllerLayoutPolicy.test.ts`.

1. Add a pure operation for filtering the array returned by Steam's native
   `GetAllConfigs()` method. Its inputs must include the native result, the
   currently active matched source appid, and a read-only collection of source
   appids whose cache entries were introduced by this plugin.
2. Treat a finite positive numeric `appID` field as the only source identity used
   by the filter. Preserve opaque records, records without a usable `appID`, and
   records belonging to Steam/native caches. Do not inspect titles,
   descriptions, URLs, account identifiers, or localized text.
3. Preserve the active matched source's records. Remove only records whose
   `appID` belongs to a different plugin-owned source. Return a new array when
   filtering is active; never mutate the native array, its records, or the
   ownership collection.
4. Return a discriminated failure when the native `GetAllConfigs()` result is not
   an array. Do not throw from the pure policy and do not reject individual
   opaque native records.
5. Add deterministic tests covering:
   - Wobbly Life as an inactive plugin-owned source while Transformers is active;
   - Transformers retained as the active source;
   - multiple stale plugin-owned source appids removed in stable order;
   - pre-existing/unowned real-Steam sources preserved;
   - native opaque/missing/malformed `appID` records preserved;
   - no active matched context returns the native contents unchanged;
   - malformed native collection returns the typed failure; and
   - input arrays, records, and ownership state remain unchanged.
6. Preserve all existing Recommended/Official/Community merge and source
   resolution behavior. Do not combine Search records with those section merge
   helpers.

### 2. Track query provenance and reuse matched-source caches

Modify `src/steam/controllerLayouts.ts` and its adapter test harness in
`src/steam/controllerLayouts.test.ts`.

1. Extend the validated store boundary to require callable `has` and `set`
   operations on `m_mapAppConfigs`. Do not require or call `forEach`, `entries`,
   `values`, `keys`, `get`, `delete`, or any other enumeration/mutation API.
2. Maintain only adapter-local session state:
   - the current matched source appid, or `null` outside a matched query context;
   - a set of source appids introduced by this plugin; and
   - the most recent successfully issued supplemental query key per source.
3. Define the supplemental query key from the current known bridge contract:
   source appid, finite non-negative integer controller index, and boolean
   `filterOtherControllerTypes`. Compare these primitive fields directly; do not
   stringify or retain arbitrary SteamUI objects. If the matched path receives an
   incompatible argument shape, keep the already-completed native shortcut
   query/result and trip the breaker.
4. Preserve the wrapper's native-first rule. Call the displayed app's captured
   native query exactly once before all plugin work and preserve its return or
   throw semantics. Before resolving plugin context, clear the prior active
   source so a resolver or invariant failure cannot leave stale Search state.
5. When source resolution returns no match, leave native behavior untouched. If
   the displayed positive appid was previously plugin-owned, remove only that
   appid from adapter-local ownership/query-key bookkeeping because a direct
   native query has now claimed it. Do not change its SteamUI map entry.
6. For a valid matched source:
   - set it as the active source;
   - call `m_mapAppConfigs.has(sourceAppid)` for that exact key only;
   - if the entry exists and its last successful supplemental query key exactly
     matches, reuse it and issue no source reset/query;
   - otherwise remember whether the entry existed, reset only that exact source
     entry to `[]`, call the captured native bridge method once for the source,
     and record the new query key only after the synchronous call returns;
   - add the source to plugin ownership only when it was absent before this
     plugin's successful supplemental query; and
   - never recurse through the installed query wrapper.
7. If `has`, `set`, source resolution, key validation, or the supplemental query
   fails, return the secured native result and trip the existing breaker with a
   bounded `query` failure. Do not retry, delete an entry, or leave active plugin
   augmentation enabled after the trip.
8. Clear adapter-local provenance/query bookkeeping during idempotent unload
   after restoring descriptors. No provenance is persisted to settings or disk.
9. Add adapter tests proving:
   - the first matched query remains native-first and issues one source query;
   - an identical repeat still issues one displayed native query but no second
     source query or source reset;
   - changing controller index or filter value issues exactly one new source
     reset/query, and repeating that new key reuses it;
   - a missing source entry forces a new query even when a prior key was known;
   - pre-existing source entries are never marked plugin-owned;
   - a direct native query for an owned source relinquishes only local ownership;
   - listed, delisted, never-on-Steam, and native behavior from the existing suite
     remains intact; and
   - invalid arguments and throwing map operations fail open, trip once, and do
     not repeat any native original.

### 3. Add a transactional, fail-open Search wrapper

Continue in `src/steam/controllerLayouts.ts` and
`src/steam/controllerLayouts.test.ts`.

1. Add `GetAllConfigs` to exact target discovery and descriptor validation.
   Require the same callable, writable, configurable data descriptor contract as
   the existing three getter methods.
2. Install the query, Official, Template, Workshop, and Search wrappers as one
   five-descriptor transaction. If any replacement fails, restore every earlier
   exact descriptor in reverse order before tripping/notifying. Extend install
   failure injection to every position in the five-section transaction.
3. The Search wrapper must call the captured native `GetAllConfigs()` exactly
   once before plugin logic. Preserve native return identity when disabled or
   when no matched source is active. Preserve a native throw without catching,
   retrying, logging it as a plugin failure, or notifying.
4. When a matched source is active, pass the native result and adapter-local
   provenance state to the pure Search filter. Return the filtered copy. Do not
   call the resolver or access `m_mapAppConfigs` from this render-time wrapper.
5. If the policy rejects the native result or plugin-only filtering throws,
   return the already-produced native result, trip the shared breaker with
   section `search`, emit the existing bounded diagnostic and one best-effort
   toast, and make every later controller-layout wrapper native-only.
6. Keep the current circuit-breaker wording and production `toastWarn` wiring.
   Disabled state must be set before reporting/notifying; logging/toaster failures
   remain swallowed; no new toast or notification abstraction is allowed.
7. Extend adapter tests to prove:
   - Wobbly-owned records do not appear after switching the active context to
     Transformers, while Transformers and unowned native records remain;
   - switching again to Space Marine removes both inactive plugin-owned sources;
   - returning to Wobbly reuses its cache and makes Wobbly the retained source;
   - native and never-on-Steam Search calls preserve exact native identity;
   - malformed Search results return the native value and disable all five
     sections exactly once;
   - native Search throws retain native semantics and are never retried;
   - Search filtering never accesses or enumerates the store map; and
   - repeated install/unload restores all five exact descriptors and clears local
     provenance without touching Steam's cache.
8. Do not patch Search UI components, `SearchText`, route/render trees, MobX
   collections, or Steam's `onControllerConfigInfo` listener. Do not hide the
   active game's source records merely to make an empty Search tab blank.

### 4. Keep typed and production boundaries minimal

1. Update only `ControllerConfiguratorStoreBoundary` in `src/types.ts` with the
   minimal `GetAllConfigs` callable and `m_mapAppConfigs.has` shape required by
   the adapter. Keep all other Steam internals opaque.
2. `src/steam/install.ts` should require no behavioral change: continue using the
   existing source resolver, bounded failure reporting, and `toastWarn` notifier.
   Modify it only if a type-only adjustment is required. Do not change installer
   order or let this section abort unrelated Steam patches.
3. Extend `ControllerLayoutFailure.section` with `search` and keep diagnostics
   bounded to section, invariant code, and appids. Never log controller-config
   records, titles, descriptions, URLs, account IDs, or the cache contents.
4. Do not add dependencies, backend calls, persistent settings, global debug
   state, or a second controller-config message registration.

### 5. Extend non-mutating verification coverage

Modify the existing controller-layout verification tooling rather than creating
a parallel framework:

- `scripts/deck/js/check_controller_layouts.js`;
- `scripts/deck/verify/smoke_controller_layouts.sh`;
- `scripts/deck/verify/run_all.sh` only if argument/routing compatibility needs an
  adjustment; and
- `tests/test_deck_fixture_selection.py`.

1. Preserve the existing listed/delisted/never-on-Steam Community identity
   checks and hashed evidence. Add a bounded sequence that queries two known
   matched shortcut appids through `controllerConfiguratorStore.QueryConfigsForApp`,
   waits for completion, then reads `GetAllConfigs()` and reports counts for only
   the two explicitly supplied source appids.
2. The probe may call `m_mapAppConfigs.has(knownSourceAppid)` for those exact
   supplied keys to establish whether the test itself can prove plugin ownership.
   It must not enumerate, serialize, clone, clear, set, or delete the map.
3. When the first source did not pre-exist, assert that after switching to the
   second matched shortcut Search contains no first-source records and retains
   the second source when it has results. If either source pre-existed, report the
   isolation observation as deferred instead of clearing caches or producing a
   false failure; native/pre-existing cache provenance must remain untouched.
4. Keep query-deduplication counts deterministic in the Vitest adapter suite.
   Do not monkey-patch SteamClient or SteamUI methods on the Deck merely to count
   calls, and do not use wall-clock performance thresholds as release gates.
5. Emit only appids, booleans, counts, and URL hashes. Never emit configuration
   titles/descriptions, account IDs, full records, or map contents. Keep generated
   evidence below `/tmp/Decky-Metadata`.
6. Preserve the probe's forbidden-mutator assertions and add explicit assertions
   against map enumeration/mutation and Steam/Deck reload, navigation, layout
   selection/preview/edit/save, metadata writes, or game launch.
7. Keep the smoke compatible with semantic `listed_match`, `delisted_match`, and
   `never_on_steam` fixtures. Do not manufacture shortcuts, remap metadata, or
   require a naturally absent Recommended fixture.

### 6. Documentation, build artifact, and audit record

1. Update the Controller Settings bullet in `README.md` to state that inactive
   borrowed game caches are isolated from Search and identical matched-source
   queries are reused. Preserve the existing standard-UI/circuit-breaker promise.
2. Regenerate and commit `dist/index.js` through the normal build. Do not commit
   `Decky-Metadata.zip`, caches, device evidence, or temporary files.
3. Create
   `docs/agent_conversations/2026-07-14_controller-layout-cache-isolation.md`
   recording the defect, provenance and query-key design, files changed,
   defensive/fallback behavior, test results, and live-verification deferral or
   user-installed-bundle results.
4. Do not change `package.json`, `plugin.json`, release tags, quick-link behavior,
   backend files, metadata matching, or unrelated documentation/tests.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

### Static and automated verification

Before implementation, run the required change route and record its output:

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

Run focused tests through the cache-isolating wrapper during TDD:

```bash
./run.sh npm test -- src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts
./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py
./run.sh npx tsc --noEmit
./run.sh node --check scripts/deck/js/check_controller_layouts.js
bash -n scripts/deck/verify/smoke_controller_layouts.sh
bash -n scripts/deck/verify/run_all.sh
```

Then run the generated Quality Gates section exactly, followed by:

```bash
git diff --check
git status --short
```

Expected automated results:

1. every native original, including `GetAllConfigs`, runs first and at most once;
2. identical matched source/controller/filter queries are reused while changed
   keys re-query exactly once;
3. only inactive plugin-owned source records are removed from matched Search;
4. active-source, native/pre-existing, opaque, native-app, and never-on-Steam
   records remain unchanged and ordered;
5. failures at all five install/runtime sections restore or return native
   behavior, trip one shared breaker, and request one best-effort warning toast;
6. no production code enumerates the controller store or registers another
   message listener;
7. the full TypeScript/Vitest/build, Python compile/pytest, version-drift, and
   review-note-preservation gates pass;
8. `dist/index.js` is regenerated and all implementation output is committed;
   and
9. the pre-existing untracked thermo-nuclear review remains untouched and no new
   cache, ZIP, or device-evidence artifact appears in the repository.

### Defensive failure verification

The focused adapter suite is release-blocking. Inject incompatible descriptors,
failures at each of the five transaction positions, invalid query keys, throwing
`has`/`set` operations, supplemental query/getter failures, malformed Search
results, logging failures, and notifier failures. Prove that:

- the native method is never retried;
- a secured native result is returned on plugin-only failure;
- exact descriptors are restored before the user is notified;
- all controller-layout augmentation becomes pass-through after the first trip;
- the warning is requested once with the existing standard-UI fallback copy;
- a throwing reporter/notifier cannot escape or cause another native call; and
- unload remains idempotent after successful install, partial install, or trip.

Do not weaken fallback tests to accept partially active controller-layout
wrappers. Standard Steam UI is the only acceptable uncertain-state behavior.

### On-device verification: explicitly deferred unless the user installs

Do not deploy, copy, install, reload, restart, clear caches, edit metadata or
settings, select/preview/export/delete a layout, navigate automatically, or
launch a game as part of this implementation.

Build a local package only when needed for user handoff:

```bash
./run.sh npm run package
```

Leave `Decky-Metadata.zip` local and uncommitted. Until the user confirms the new
bundle is installed, record:

```text
DEFERRED: awaiting user-installed bundle
```

After that confirmation, the permitted live checks are read/query-only:

```bash
scripts/decky doctor --deck
scripts/deck/logs.sh audit --json
scripts/deck/verify/smoke_controller_layouts.sh \
  /tmp/Decky-Metadata/verification/controller-layout-cache-isolation/fixtures.json \
  /tmp/Decky-Metadata/verification/controller-layout-cache-isolation/evidence.json
scripts/deck/verify/run_all.sh --no-launch
```

Confirm the following without mutating Deck state:

1. switching between two matched shortcut fixtures does not expose the inactive
   plugin-owned source in `GetAllConfigs()` when ownership can be established;
2. active Recommended/Official/Community augmentation still matches source URL
   identities without duplicates;
3. repeated manual navigation is visibly responsive and does not produce a
   repeated-query loop, renderer error, circuit trip, or warning toast;
4. native and never-on-Steam controls retain their standard behavior; and
5. if the source cache pre-existed and provenance cannot be established without
   clearing it, record that one isolation assertion as deferred—never clear or
   rewrite the Deck cache to force the check.

Do not intentionally corrupt or monkey-patch SteamUI to exercise the breaker.
The injected local suite is authoritative for failure/toast behavior. If a real
SteamUI incompatibility naturally trips the breaker, verify only that one toast
appears and standard Controller Settings remains usable.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished controller-layout-cache-isolation
```

This writes:

```text
/tmp/Decky-Metadata/controller-layout-cache-isolation_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer controller-layout-cache-isolation`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/controller-layout-cache-isolation-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished controller-layout-cache-isolation
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/controller-layout-cache-isolation-review-*.md
   git commit -m "docs(review): record controller-layout-cache-isolation review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished controller-layout-cache-isolation
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer controller-layout-cache-isolation` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed controller-layout-cache-isolation
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize controller-layout-cache-isolation
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/controller-layout-cache-isolation_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize controller-layout-cache-isolation
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/controller-layout-cache-isolation_finished
/tmp/Decky-Metadata/controller-layout-cache-isolation_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
