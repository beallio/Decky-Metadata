# Plan: Controller Layout Search Context Isolation (controller-layout-search-context-isolation)

## Context

The controller-layout cache-isolation implementation improved navigation and
matched-source query reuse, but Search context still leaks across games. After
Warhammer 40,000: Space Marine is the first matched shortcut inspected, its
controller configurations remain visible when Search is opened for Assassin's
Creed: Director's Cut and for X-Men Origins: Wolverine. The expected behavior is:

| Current displayed game | Expected empty-text Search behavior |
| --- | --- |
| Matched shortcut such as Assassin's Creed | Retain the current matched Steam source's configurations and omit inactive supplemental sources previously queried for other shortcuts. |
| Never-on-Steam shortcut such as X-Men Origins | Omit every supplemental source previously queried by this plugin while preserving unrelated native Steam Search records. |
| Native Steam app | Preserve Steam's standard Controller Settings behavior; a direct native query relinquishes this plugin's supplemental classification for that appid. |
| Incompatible or failing SteamUI contract | Trip the existing shared controller-layout circuit breaker once, request the existing warning toast best-effort, and return standard Steam UI until plugin reload. |

Read-only diagnosis on 2026-07-14 established the concrete sequence and source
resolution:

- shortcut `2155012430` (Warhammer 40,000: Space Marine) resolves to Steam app
  `55150`;
- shortcut `2312439508` (Assassin's Creed: Director's Cut) resolves to Steam app
  `15100`; and
- shortcut `3156562597` (X-Men Origins: Wolverine) has no matched Steam app.

The failure is inside the frontend adapter, not metadata matching and not a
circuit-breaker trip. The captured SteamUI implementation confirms that
`GetAllConfigs()` flattens every app entry in the session-wide
`controllerConfiguratorStore.m_mapAppConfigs`. It also confirms that the Choose
Configuration component can render its section getters and Search contents
before its React effect calls `QueryConfigsForApp` for the newly displayed app.
The current adapter updates `activeMatchedSourceAppid` only in the low-level
query wrapper. Its section getters resolve the current displayed app but do not
update Search context, so first render can reuse the prior game's active source.

Two existing policy choices then preserve the leak:

1. `filterControllerSearchConfigs` returns the complete native global Search
   array whenever the active matched source is `null`, which deterministically
   exposes prior supplemental results for never-on-Steam games.
2. A matched source is added to `pluginOwnedSourceAppids` only when its SteamUI
   map entry did not predate the supplemental query. Once the plugin successfully
   queries a source whose entry already exists, its inactive records are exempt
   from filtering even though the query was issued for supplemental shortcut
   behavior.

Correct the semantics without clearing, deleting, or enumerating Steam's cache.
Use adapter-local state to distinguish every source successfully activated for
supplemental shortcut layouts, regardless of whether its map key pre-existed.
Establish the current displayed context synchronously from each wrapped section
getter as well as from the existing query path. Search must remove inactive
supplemental sources even when the current displayed game has no match, retain
the active source for a matched shortcut, and preserve records from unrelated
native caches.

Keep the defensive contract from the original controller-layout plans:

- each native original runs first and exactly once;
- render-time Search never calls the resolver, touches or enumerates
  `m_mapAppConfigs`, writes MobX state, registers a listener, or walks SteamUI's
  component/store graph;
- adapter state is session-local and cleared on unload;
- unexpected descriptors, arguments, native results, resolver failures, or
  plugin-only exceptions fail open through the existing all-or-nothing breaker;
- the existing toast text and one-toast-per-plugin-session behavior remain
  unchanged; and
- no new dependency, backend call, persistent setting, or SteamUI cache mutation
  is introduced by Search filtering.

This corrective plan is limited to the controller-layout policy/adapter and
their tests, the existing controller-layout verification fixture only where
needed for static regression coverage, README wording, regenerated
`dist/index.js`, and the implementation session record. It does not change
metadata matching, Recommended/Official/Community merge rules, layout selection
or preview behavior, quick links, activity/community content, package versions,
release tags, or backend code.

The local orchestration override is authoritative: branch from and finalize back
to local `dev` with `ORCH_LOCAL_ONLY=1`. Do not fetch, pull, push, create a remote
branch, promote `dev` to `main`, or send a package to the Steam Deck. Preserve the
unrelated untracked
`docs/review/2026-07-13_gpt-5_dev_thermo-nuclear-review.md` without editing,
staging, deleting, or treating it as implementation output.

The user has prohibited modifying the Deck for testing. Do not deploy, reload,
navigate through CDP, issue synthetic controller-configuration queries, clear or
rewrite runtime caches, install a package, alter settings, select/preview a
layout, or launch a game. Local deterministic tests are release-blocking; live
verification remains explicitly deferred for the user to perform after they
independently install a later package.

**Slug used throughout this plan:** `controller-layout-search-context-isolation`

---

## Orchestration Contract

**Slug:** `controller-layout-search-context-isolation`

**Plan file:**

```text
docs/plans/2026-07-14_controller-layout-search-context-isolation.md
```

**Implementation branch:**

```text
feat/controller-layout-search-context-isolation
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/controller-layout-search-context-isolation_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/controller-layout-search-context-isolation_finalized
```

**Review notes:**

```text
docs/review/controller-layout-search-context-isolation-review-*.md
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
git checkout -b feat/controller-layout-search-context-isolation
```

Commit this plan first:

```bash
git add docs/plans/2026-07-14_controller-layout-search-context-isolation.md
git commit -m "docs(plan): add controller-layout-search-context-isolation implementation plan"
```

---

## Implementation Tasks

Work in order and use TDD. Preserve the existing native-first, transactional,
fail-open controller-layout adapter.

### 1. Correct the pure Search filtering policy

Modify `src/steam/controllerLayoutPolicy.ts` and
`src/steam/controllerLayoutPolicy.test.ts`.

1. Rename the Search filter's provenance concept from cache ownership to
   supplemental-source tracking wherever that improves accuracy. A source is
   supplemental after this plugin successfully requests it for a matched
   non-Steam shortcut; whether Steam's map key already existed is irrelevant to
   Search isolation.
2. Preserve the current input validation: a non-array native Search result is a
   typed policy failure, and individual opaque or malformed records remain
   untouched rather than throwing.
3. For a finite positive numeric record `appID`:
   - retain it when it is the active matched source;
   - remove it when it belongs to a tracked supplemental source other than the
     active source; and
   - retain it when it is not a tracked supplemental source.
4. When active matched source is `null`, remove every tracked supplemental
   source record instead of returning the global native contents unchanged.
   Preserve the exact native array identity as a fast path only when there are no
   tracked supplemental sources and no filtering is necessary.
5. Never mutate the native array, its records, the tracking set, or record order.
   Do not inspect titles, URLs, descriptions, controller/account identifiers, or
   any field other than the bounded numeric `appID` identity.
6. Add deterministic pure-policy tests for:
   - active Assassin's Creed source `15100` retaining its records while inactive
     Space Marine source `55150` is removed;
   - `null` active context removing both tracked sources for X-Men while
     unrelated native and opaque records remain ordered;
   - a source whose cache pre-existed but is tracked as supplemental being
     filtered while inactive;
   - an empty supplemental set preserving exact native identity;
   - malformed native collection returning the typed failure;
   - malformed/throwing record property access remaining fail-open; and
   - all inputs remaining unchanged.
7. Preserve the existing source resolver and Recommended/Official/Community
   merge policies exactly. Do not combine Search filtering with section merges.

### 2. Establish current Search context before the query effect

Modify `src/steam/controllerLayouts.ts` and the harness/tests in
`src/steam/controllerLayouts.test.ts`.

1. Keep the low-level `QueryControllerConfigsForApp` wrapper as an authoritative
   context signal and query-deduplication boundary. Do not add another Steam
   bridge or patch a React component.
2. Add a small adapter-local context helper used by every wrapped Official,
   Template, and Workshop getter after its captured native original returns:
   - accept only the getter's finite positive displayed appid;
   - clear the previous active matched source before resolving the current app;
   - resolve the source through the existing dependency;
   - leave the active source `null` for a native or never-on-Steam app;
   - validate a non-null source with the existing positive/different-appid
     invariants; and
   - set the active matched source before the getter performs its supplemental
     read/merge.
3. Reuse one bounded resolution path rather than allowing the query wrapper and
   getters to diverge on source validation or stale-state clearing. Preserve the
   native-first rule: a getter's native result or native throw must be secured
   before any resolver or plugin work, and the native original must never be
   retried.
4. Do not write observable Steam/MobX state from the getter context update. Only
   adapter-local primitive state may change. Do not resolve context from
   `GetAllConfigs`, because Search receives no displayed appid and runs during
   render.
5. Add adapter tests that simulate SteamUI's actual first-render ordering without
   first invoking the new game's query:
   - activate/query Space Marine;
   - invoke an Assassin's Creed section getter and immediately invoke Search;
   - prove Space Marine records are absent and Assassin records are the only
     retained tracked-source results;
   - invoke an X-Men section getter and immediately invoke Search;
   - prove every tracked supplemental record is absent while unrelated native
     records remain; and
   - verify all native getter/Search originals still run first and exactly once.
6. Test that a resolver failure during a getter cannot retain the prior game's
   Search context, returns the secured native getter result, trips the shared
   breaker once, requests the existing warning toast once, and makes every later
   wrapper native-only.
7. Preserve exact descriptor restoration, idempotent cleanup, retry behavior,
   and the five-wrapper transaction. Do not expand the patched SteamUI surface
   unless current source/tests prove it is necessary; if a SteamUI contract
   mismatch is discovered, fail open rather than guessing.

### 3. Track every successfully supplemental source

Continue in `src/steam/controllerLayouts.ts` and
`src/steam/controllerLayouts.test.ts`.

1. Replace the cache-creation-only ownership rule with adapter-local tracking of
   every source for which the captured supplemental query returns synchronously
   without throwing. Add the source after that successful bridge call whether
   `m_mapAppConfigs.has(sourceAppid)` was true or false.
2. Keep exact-key cache reuse unchanged: `has(sourceAppid)` and the primitive
   source/controller/filter query key still decide whether a reset/query is
   necessary. Do not enumerate, clone, serialize, delete, or clear the map, and
   do not reintroduce repeat source queries.
3. A repeated matched query that reuses a known successful query key must retain
   the source's supplemental classification. A direct native query for that
   source appid must continue to relinquish only its adapter-local supplemental
   classification and query key without changing Steam's map entry.
4. Ensure context tracking and supplemental-source tracking remain distinct:
   the active source may change synchronously during first render, while the
   supplemental set records sources successfully requested during the plugin
   session.
5. Update adapter tests to prove:
   - an absent source entry is tracked after one successful supplemental query;
   - a pre-existing source entry is also tracked after one successful
     supplemental query;
   - both cases are filtered while inactive;
   - identical query keys retain tracking without another source reset/query;
   - direct native query relinquishment restores native Search preservation;
   - changed controller/filter keys still re-query exactly once; and
   - supplemental query failure trips once and cannot leave active augmentation
     enabled.
6. Clear active context, supplemental-source tracking, and query-key state during
   idempotent unload after restoring descriptors. Never persist this state.

### 4. Preserve Search and circuit-breaker safety boundaries

Continue in `src/steam/controllerLayouts.ts`,
`src/steam/controllerLayouts.test.ts`, and only if required by an actual type
error, the minimal `ControllerConfiguratorStoreBoundary` in `src/types.ts`.

1. The Search wrapper must call captured native `GetAllConfigs()` first and
   exactly once. A native throw escapes with native semantics and is not retried,
   reported as a plugin error, or converted to a toast.
2. When enabled, pass only the already-produced native array,
   `activeMatchedSourceAppid`, and the read-only supplemental-source set to the
   pure filter. Do not call the resolver or any map/store operation from Search.
3. If policy validation or plugin-only filtering fails, return the secured native
   result, trip the shared breaker with bounded `search` diagnostics, set disabled
   state before reporting/notifying, and restore standard UI for every later
   section.
4. Keep `CONTROLLER_LAYOUT_WARNING`, production `toastWarn` wiring, and
   one-notification-per-session behavior unchanged. Reporter or notifier throws
   must remain swallowed.
5. Extend the map-access test double so Search fails if it calls `has`, `set`,
   iteration, `forEach`, `entries`, `keys`, `values`, or any other store/cache
   API. Prove the corrected matched and no-match paths remain render-safe.
6. Retain transactional install-failure coverage for all five descriptors and
   exact reverse-order restoration. Do not accept a partially installed adapter
   after any incompatibility.
7. Do not add dependencies, backend changes, persistent settings, global debug
   state, a new listener, controller-record logging, or SteamUI tree/store
   discovery.

### 5. Align bounded verification and documentation

Inspect the existing controller-layout verifier before changing it:

- `scripts/deck/js/check_controller_layouts.js`;
- `scripts/deck/verify/smoke_controller_layouts.sh`;
- `tests/test_deck_fixture_selection.py`; and
- `docs/runbooks/on-device-verification.md`.

1. Prefer local Vitest coverage for the exact Space Marine to Assassin's Creed
   to X-Men transition. Do not create a new verification framework.
2. Update existing verifier source assertions or fixture-selection tests only if
   necessary to encode the new policy that pre-existing-but-successfully-queried
   sources are supplemental. Do not make the on-device script navigate, mutate
   cache state, clear provenance, monkey-patch SteamUI, or manufacture fixtures.
3. Do not run the on-device verifier during implementation. If the existing
   script's query behavior conflicts with the user's no-device-mutation boundary,
   leave runtime execution deferred and document why rather than weakening the
   boundary.
4. Update the Controller Settings bullet in `README.md` so it no longer promises
   isolation only for caches "introduced" by the plugin. State that inactive
   sources activated for supplemental matched-shortcut layouts are isolated from
   Search, including when the current shortcut has no Steam match. Preserve the
   standard-UI/circuit-breaker promise.
5. Regenerate and commit `dist/index.js` through the normal build. Do not commit
   `Decky-Metadata.zip`, device evidence, caches, or temporary files.
6. Create
   `docs/agent_conversations/2026-07-14_controller-layout-search-context-isolation.md`
   recording the defect, context/provenance design, files changed, fail-open
   behavior, validation results, and explicit device-verification deferral.
7. Do not change `package.json`, `plugin.json`, versions/tags, backend files,
   quick-link policy, metadata resolution, or unrelated docs/tests.

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

### Required pre-change routing

Before implementation, run and record:

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

Do not add `--device` or `--allow-launch`; the user explicitly prohibited Deck
mutation for testing.

### Focused TDD and static checks

Run focused frontend tests through the cache-isolating wrapper:

```bash
./run.sh npm test -- src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts
./run.sh npx tsc --noEmit
./run.sh node --check scripts/deck/js/check_controller_layouts.js
bash -n scripts/deck/verify/smoke_controller_layouts.sh
```

If `tests/test_deck_fixture_selection.py` or another existing verifier test is
changed, also run:

```bash
./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py
```

Then run the generated Quality Gates section exactly, followed by:

```bash
git diff --check
git status --short
```

Expected automated results:

1. Space Marine source `55150` is removed immediately after an Assassin's Creed
   getter establishes active source `15100`, even before Assassin's query effect
   runs.
2. After the Assassin query completes, Assassin configurations populate and
   remain the only tracked supplemental-source results exposed by Search.
3. An X-Men getter establishes `null` active source and Search removes every
   tracked supplemental-source record while preserving unrelated native/opaque
   records and stable order.
4. Sources successfully queried for supplemental layouts are tracked whether
   their SteamUI map key was absent or pre-existing; identical query keys remain
   deduplicated.
5. A direct native query relinquishes supplemental classification without
   deleting or rewriting the native cache.
6. Search performs no resolver call, map access, MobX write, enumeration, tree
   walk, listener registration, or native retry.
7. Every native original runs first and exactly once; malformed descriptors,
   resolver failures, query failures, map failures, and malformed Search results
   return standard Steam behavior and request one existing warning toast.
8. All five descriptors install transactionally and restore exactly during
   rollback/unload; cleanup clears only adapter-local state.
9. the TypeScript/Vitest/build, Python compile/pytest, version-drift, and
   review-note-preservation gates pass; `dist/index.js` is regenerated; and all
   implementation output is committed.
10. The unrelated untracked thermo-nuclear review remains untouched, and no ZIP,
    cache, device evidence, version change, or out-of-scope artifact is added.

### On-device verification is explicitly deferred

Do not deploy, package-push, copy, install, reload Steam/Decky, navigate through
CDP, invoke `QueryConfigsForApp`, run the controller-layout smoke against the
Deck, clear caches, modify settings, select/preview/edit/export a layout, or
launch a game during this implementation. Record exactly:

```text
DEFERRED: user prohibited Deck mutation for testing; awaiting a user-installed package and manual navigation.
```

After the user independently installs a later package, the user-facing manual
acceptance sequence is:

1. Open Controller Settings for Warhammer 40,000: Space Marine, enter Search,
   and allow its matched configurations to load.
2. Open Controller Settings for Assassin's Creed: Director's Cut and enter
   Search. Assassin's Creed configurations should populate; Space Marine
   configurations should not appear as stale defaults.
3. Open Controller Settings for X-Men Origins: Wolverine and enter Search. No
   previously supplemental Space Marine or Assassin's Creed configurations
   should appear.
4. Confirm navigation remains responsive, Recommended/Official/Community
   sections still work, no repeated-query loop or renderer error occurs, and no
   circuit-breaker toast appears during compatible operation.

The implementer must not perform this sequence on the user's behalf. If the user
later reports a naturally occurring SteamUI incompatibility, collect only
read-only diagnostics and confirm that one warning toast appeared and standard
Controller Settings remained usable; never intentionally corrupt or monkey-patch
SteamUI to exercise the breaker.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished controller-layout-search-context-isolation
```

This writes:

```text
/tmp/Decky-Metadata/controller-layout-search-context-isolation_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer controller-layout-search-context-isolation`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/controller-layout-search-context-isolation-review-*.md
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
   scripts/orchestration/clear-finished controller-layout-search-context-isolation
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
   git add docs/review/controller-layout-search-context-isolation-review-*.md
   git commit -m "docs(review): record controller-layout-search-context-isolation review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished controller-layout-search-context-isolation
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer controller-layout-search-context-isolation` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed controller-layout-search-context-isolation
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize controller-layout-search-context-isolation
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/controller-layout-search-context-isolation_finalized
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
scripts/orchestration/finalize controller-layout-search-context-isolation
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/controller-layout-search-context-isolation_finished
/tmp/Decky-Metadata/controller-layout-search-context-isolation_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
