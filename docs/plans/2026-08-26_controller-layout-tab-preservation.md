# Plan: Preserve controller layout tab across filter queries (controller-layout-tab-preservation)

## Context

The controller layout data fix is working: when Steam's controller-type filter
is disabled, the Steam Deck and Legion Go S receive the same complete Community
layout set. The remaining discrepancy is a Steam UI tab-state reset on the
Legion Go S.

On 2026-08-26, both devices were tested against Warhammer 40,000: Space Marine
(matched Steam app `55150`; Steam Deck shortcut `2155012430`; Legion shortcut
`3213262460`). With `filterOtherControllerTypes=false`, each device returned the
same exact identities and controller metadata:

- 2 shortcut Workshop records;
- 50 matched-source Workshop records;
- 52 merged, unofficial, published Community records;
- 52 rendered Community DOM rows after **Community Layouts** was selected.

With the filter enabled, the expected compatible subsets differed (23 on Steam
Deck type `4`, 14 on Legion Go S type `102`). The bug appears only across the
Show All requery: Steam Deck remained on **Community Layouts**, while Legion Go
S reset to **Your Layouts** and displayed one row. Reselecting **Community
Layouts** immediately rendered all 52 records. No layout data was missing.

### Intended behavior

- Remember the user's active controller-layout chooser tab for the current
  displayed appid/controller index.
- For a matched non-Steam shortcut on verified affected controller type `102`,
  preserve that tab across the direct Steam Input query issued by the filter
  toggle.
- Never force **Community Layouts**. If the user selected Your Layouts,
  Templates, Official, Community, or Search, restore that exact still-available
  tab.
- A fresh store-driven chooser query must clear remembered state and retain
  Steam's native default selection.
- Steam Deck type `4`, native Steam apps, unmatched shortcuts, unknown
  controllers, unrelated Steam tab controls, and chooser tabs whose saved id no
  longer exists remain completely native.

### Verified Steam UI mechanics

The chooser component builds its tabs and calls Steam's shared tabs hook with:

```text
strDefaultTab ?? (Official available ? Official : User available ? User : Templates)
```

The filter callback updates
`controllerConfiguratorStore.m_bFilterOtherControllerTypes` and then invokes
`SteamClient.Input.QueryControllerConfigsForApp` directly. The query spinner
remounts the chooser, so the hook can initialize from the native default instead
of the tab the user selected.

The existing input wrapper can distinguish query origins before calling the
native function:

- `BConfigurationQueryInFlight === true`: store-driven fresh chooser query;
- `BConfigurationQueryInFlight !== true`: direct UI filter query.

The Steam tabs module is imported by the chooser at render time, so patching the
webpack module export after import is not sufficient. The structurally
discoverable memo component object has a writable/configurable `type`
descriptor; wrapping that render type changes the callable Steam actually
invokes while remaining exactly restorable.

### Architecture decisions

- Add a separate `controllerTabPersistence` module owned by
  `installControllerLayouts`; do not mix React/webpack discovery into the pure
  layout merge policy.
- Discover the shared tabs module with `findModuleChild`, following the defensive
  structural patterns in `src/steam/appLinks.ts` and `src/steam/activity.ts`.
  Identify the module by a sibling exported tab-header function whose source
  contains all three markers `activeTab`, `tabs`, and `onShowTab`; then validate
  the memo export's own `type` data descriptor.
- Install lazily and idempotently from controller input queries because the
  chooser webpack chunk may not be loaded at plugin startup.
- Scope the render wrapper by chooser tab ids (Community, Templates, Search),
  content appid/controller index, matched non-Steam context, and controller type
  `102`. A shape mismatch must return the native render unchanged.
- Remember selection through a wrapped `onShowTab`, keyed by displayed
  appid/controller index. Substitute a remembered `activeTab` only when that id
  still exists in the current tabs.
- Clear remembered state on a fresh store-driven query. Preserve it only for a
  direct filter-toggle query.
- Discovery/incompatibility failures are fail-open and must not disable layout
  supplementation or show the existing “Controller layouts disabled” toast.
- Cleanup restores the exact original descriptor and clears every remembered
  tab. No timers, production DOM clicks, route forcing, hard-coded Community
  selection, or backend RPC are allowed.

### Files in scope

```text
src/steam/controllerTabPersistence.ts
src/steam/controllerTabPersistence.test.ts
src/steam/controllerLayouts.ts
src/steam/controllerLayouts.test.ts
scripts/deck/js/check_controller_tab_persistence.js
scripts/deck/verify/smoke_controller_tab_persistence.sh
tests/test_deck_fixture_selection.py
docs/runbooks/on-device-verification.md
README.md
CHANGELOG.md
dist/index.js
dist/index.js.map
docs/agent_conversations/2026-08-26_controller-layout-tab-preservation.md
```

Do not change backend metadata, controller-type source filtering, layout merge
or Search policy, layout preview/selection/application, updater behavior,
Versions diagnostics, or unrelated Steam/QAM patches.

**Slug used throughout this plan:** `controller-layout-tab-preservation`

---

## Orchestration Contract

**Slug:** `controller-layout-tab-preservation`

**Plan file:**

```text
docs/plans/2026-08-26_controller-layout-tab-preservation.md
```

**Implementation branch:**

```text
feat/controller-layout-tab-preservation
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/controller-layout-tab-preservation_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/controller-layout-tab-preservation_finalized
```

**Review notes:**

```text
docs/review/controller-layout-tab-preservation-review-*.md
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
git checkout -b feat/controller-layout-tab-preservation
```

Commit this plan first:

```bash
git add docs/plans/2026-08-26_controller-layout-tab-preservation.md
git commit -m "docs(plan): add controller-layout-tab-preservation implementation plan"
```

---

## Implementation Tasks

Work in this order. Tests and the Legion device baseline must prove the native
tab reset before production source changes.

### Task 1 — protocol checks and same-build device baseline

1. From the repository root run:

   ```bash
   scripts/decky doctor
   scripts/decky verify-change dev --explain
   ```

   Record the routed checks. Do not use `--allow-launch`; this plan never
   launches a game.
2. Create `/tmp/Decky-Metadata/controller-layout-tab-preservation/` and keep all
   payloads, screenshots, logs, caches, and temporary evidence there.
3. Before editing `src/`, deploy the current unmodified `dev` bundle to both
   devices through dedicated ports:

   ```bash
   DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/deploy.sh
   DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/deploy.sh
   ```

   This same-build baseline is required; do not compare the previously installed
   `0.3.6` Steam Deck bundle with the Legion dev prerelease.
4. Use the committed input tooling to open the Warhammer controller chooser on
   each current shortcut:
   - Steam Deck displayed appid `2155012430`, source `55150`, controller type `4`;
   - Legion displayed appid `3213262460`, source `55150`, controller type `102`.
5. Capture a bounded baseline sequence on each device:
   - select **Community Layouts** through the actual DOM tab control;
   - record the selected tab and Community DOM row count;
   - in SharedJSContext, set the visible filter to `false` and issue the exact
     direct `SteamClient.Input.QueryControllerConfigsForApp` call used by Show
     All;
   - wait for the bounded in-flight query to finish;
   - record the selected tab, rendered row count, getter count, controller type,
     visible filter, and hashed layout identities;
   - restore the original filter/tab and close the tunnel.
6. The expected pre-change discriminator is:
   - Legion: Community selected before the query, then native reset away from
     Community (observed Your Layouts / one row), while reselecting Community
     exposes the complete current unfiltered set;
   - Steam Deck: native behavior remains on Community with the complete
     unfiltered set.
   The previously observed count was 52 on both, but counts are not permanent;
   save current identities/counts and compare within this run. If Legion no
   longer resets on the same build, stop and update the plan instead of adding a
   workaround for obsolete behavior.

### Task 2 — write discriminating failing tests

Before production changes, add the focused tests and run:

```bash
./run.sh npx vitest run \
  src/steam/controllerTabPersistence.test.ts \
  src/steam/controllerLayouts.test.ts
./run.sh uv run --with pytest -- pytest -q \
  tests/test_deck_fixture_selection.py
```

Required red contracts:

1. Pure chooser scoping/key behavior:
   - derive a stable appid/controller-index key only from a tab set containing
     Community, Templates, and Search plus valid chooser content props;
   - reject malformed tab arrays, missing ids/content, native/unmatched context,
     type `4`, unknown types, and non-`102` controllers;
   - isolate two appids and two controller indexes.
2. Selection memory:
   - wrapped `onShowTab` records whichever available tab the user selects and
     delegates with the original `this`, arguments, return value, and thrown
     errors;
   - a subsequent native reset is overridden by the remembered id;
   - no remembered tab is invented;
   - a remembered id missing from the new tab list is deleted and native state
     passes through;
   - a fresh query clears memory, while a direct filter query preserves it;
   - cleanup clears all keys.
3. Webpack/descriptor lifecycle:
   - structural discovery requires every source marker and finds the memo
     component, not the sibling header;
   - missing/lazy modules return unavailable without throwing and can install on
     a later query;
   - non-callable, accessor, non-writable, or non-configurable `type`
     descriptors fail open;
   - install is idempotent, transaction failure restores prior state, and cleanup
     restores the exact descriptor.
4. Controller wrapper integration:
   - sample `BConfigurationQueryInFlight` before the native input call;
   - store-driven query clears remembered state;
   - direct filter query preserves it and ensures lazy installation;
   - tab-persistence discovery/runtime failure never trips or disables existing
     controller layout supplementation;
   - unload cleans both patches.
5. Device probe safety/static contract:
   - the new probe may click only the chooser tab, toggle/query the in-memory
     controller cache, inspect bounded DOM/store scalars, and hash layout URLs;
   - it must contain no selection, preview, apply, route navigation, controller
     input dispatch, game launch, title, raw URL, or account-data output.

A missing module or syntax failure is not an acceptable red phase. Record named
failure output and tallies.

### Task 3 — implement isolated tab persistence

Create `src/steam/controllerTabPersistence.ts` with explicit test seams:

1. Define minimal local types for the shared Tabs memo object, its render props,
   chooser tabs/content, discovery target, selection key, dependencies, and
   control surface. Do not broaden `SteamInternals` or enumerate MobX objects.
2. Export a pure chooser-context resolver that:
   - validates tab ids and finds the Community/Templates/Search signature;
   - extracts one consistent numeric appid/controller index from chooser tab
     content;
   - calls injected matched-context/controller-type resolvers;
   - returns a key only for matched non-Steam type `102`.
3. Export structural target discovery using `findModuleChild`. Catch webpack
   access and function-source failures. Require the sibling header markers
   `activeTab`, `tabs`, and `onShowTab`; require exactly one compatible memo
   export with an own writable/configurable callable `type` data descriptor.
4. Implement a control with:
   - `ensureInstalled()` — lazy, retryable, idempotent descriptor replacement;
   - `beforeControllerQuery(displayedAppid, controllerIndex, storeDriven)` —
     ensure discovery and clear remembered state only for a store-driven fresh
     query;
   - `cleanup()` — exact descriptor restoration and memory clear;
   - test-only status/read seams as needed without exposing mutable production
     state.
5. The render wrapper must:
   - return native output/props untouched unless the strict chooser scope
     succeeds;
   - wrap `onShowTab` to remember the user's requested tab before delegating;
   - pass the remembered `activeTab` only when the current tabs still contain
     it;
   - preserve every unrelated prop and callback semantic.
6. Discovery and render-shape failures are independent fail-open behavior.
   Report at most once through an injected diagnostic callback; never throw into
   Steam render and never invoke the main controller-layout `trip`/toast.

### Task 4 — integrate with the existing controller input wrapper

In `src/steam/controllerLayouts.ts`:

1. Construct one tab-persistence control inside `installControllerLayouts`,
   injecting the existing displayed-context resolver and controller-index type
   resolver. Add dependency injection for unit tests.
2. In `queryWrapper`, read
   `targets.store.BConfigurationQueryInFlight === true` **before**
   `originalQuery.apply(this, args)`.
3. After validating displayed appid/controller index, notify the tab control of
   the query origin:
   - store-driven `true`: clear the saved key for this chooser;
   - direct `false`: preserve the key and lazily ensure the Tabs render patch.
4. Keep the existing primary/source query order, type-102 effective source
   filter, source cache-key invalidation, getter merges, Search isolation,
   descriptor transaction, retry, and failure semantics unchanged.
5. Call tab cleanup from the existing controller-layout cleanup before dropping
   references. A failure restoring the optional tab descriptor must not prevent
   restoration of the existing input/getter/Search descriptors.

### Task 5 — add bounded permanent device tooling

1. Add `scripts/deck/js/check_controller_tab_persistence.js` as a
   parameterized, output-safe probe. It must return only appids, controller
   index/type, filter booleans, selected tab ids/labels, DOM/getter counts,
   elapsed time, and hashed layout identities. It must restore the original
   visible filter and active tab in `finally`.
2. Add `scripts/deck/verify/smoke_controller_tab_persistence.sh` to coordinate
   the Big Picture and SharedJSContext phases using existing `cdp.py` tooling.
   Require an evidence path under `/tmp/Decky-Metadata/`, validate every required
   payload field, and fail loudly when the active tab changes unexpectedly,
   Community counts disagree, or identities disappear.
3. Keep this smoke standalone; do not add it to `run_all.sh`, whose semantic
   fixture selection does not establish the required live chooser route/tab.
4. Extend `tests/test_deck_fixture_selection.py` with discriminating source
   assertions for the probe/smoke safety contract. Assertions must fail if a
   forbidden mutator is reintroduced or if required selected-tab/hash evidence
   is removed.
5. Document the new smoke, cache/tab side effects, explicit current-device
   approval, target requirements, and restoration guarantees in
   `docs/runbooks/on-device-verification.md`.

### Task 6 — documentation, artifact, and session record

1. Update the controller-layout section of `README.md`: Show All preserves the
   user's current chooser tab on the verified Legion Go S type `102`; it does not
   force Community or alter Steam Deck/native behavior.
2. Add a concise `## [Unreleased]` Fixed entry to `CHANGELOG.md`.
3. Regenerate committed `dist/index.js` and `dist/index.js.map` through Rollup;
   never edit either manually.
4. Write
   `docs/agent_conversations/2026-08-26_controller-layout-tab-preservation.md`
   with the objective, files changed, discovery/descriptor decisions, red/green
   and mutation outputs, quality gate, both device baselines/results, evidence
   paths, and explicit unverified items.
5. Keep all temporary artifacts below
   `/tmp/Decky-Metadata/controller-layout-tab-preservation/`.

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

Apply `references/verification-standards.md`: every check must have an observable
failure state, failure evidence precedes the restored positive control, pipeline
producers use `pipefail` or standalone assignments, and the session log records
actual output/tallies.

### 1. Red phase

Run Task 2's focused commands before production changes. Required evidence is
named test failures for chooser scoping, active-tab restoration, fresh-query
clearing, lazy descriptor discovery/restoration, query-origin integration, and
probe safety. Exit `127`, missing files, syntax failures, or hard-coded
always-failing assertions do not count.

### 2. Focused green phase

After Tasks 3–5:

```bash
./run.sh npx vitest run \
  src/steam/controllerTabPersistence.test.ts \
  src/steam/controllerLayouts.test.ts
./run.sh uv run --with pytest -- pytest -q \
  tests/test_deck_fixture_selection.py
```

Record file/test totals. Every pre-existing controller filter, cache, Search,
failure, and cleanup assertion must remain green.

### 3. Mutation checks and restored control

With focused tests green:

1. Temporarily make direct filter queries clear remembered tab state. The
   direct-query integration and Community-restoration tests must fail by name.
2. Restore the query-origin branch.
3. Temporarily remove the remembered `activeTab` substitution from the memo
   render wrapper while leaving callback capture intact. The remount/reset test
   must fail.
4. Restore the wrapper.
5. Temporarily broaden the controller scope from type `102` to type `4`. The
   Steam Deck native-pass-through test must fail.
6. Restore the scope and rerun the complete focused commands. They must exit `0`;
   record the final post-mutation totals. Commit none of the mutations.

### 4. Full project gates

Run the generated Quality Gates section. Deployment is blocked unless
`scripts/orchestration/run-quality-gates` exits `0`, both generated bundle files
match the build, review notes are intact, all changes are committed, and the
worktree is clean.

### 5. Legion Go S type-102 behavior

With explicit current-device approval:

```bash
DECKY_DECK_HOST=steamdeck-legos scripts/decky doctor --deck
DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/deploy.sh
```

Open the current Warhammer shortcut `3213262460`, select Community, and run the
new standalone smoke against source `55150`. Fail unless:

- controller type is `102`;
- the direct query changes the visible filter to `false`;
- selected tab is Community before and after the query;
- getter and rendered Community counts agree and remain positive;
- no before-query Community hash disappears;
- current tabs still include Templates, Community, and Search;
- the probe restores the original filter/tab;
- no layout selection, preview, application, or game launch occurs.

Capture JSON plus before/after screenshots. The historical observed count was
52; use the same-run getter/hash set as the durable oracle rather than a fixed
network count.

### 6. Steam Deck type-4 regression

```bash
DECKY_DECK_HOST=steamdeck scripts/decky doctor --deck
DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/deploy.sh
```

Open shortcut `2155012430` and run the same smoke against source `55150`. Fail
unless type `4` remains on the native path, Community remains selected under
the observed native behavior, rendered/getter counts and hashes agree, and the
filter/tab are restored. Compare the post-change payload to the same-build
pre-change Steam Deck baseline; the tab wrapper must not alter any native prop
or callback behavior.

### 7. Existing no-launch regression suite

Run on both hosts:

```bash
DECKY_DECK_HOST=<host> CDP_PORT=<dedicated-port> \
  scripts/deck/verify/run_all.sh --no-launch
```

Every executed current-fixture check must pass. If a settings-only fixture is
stale, use the explicit current fixture/probe required above and record the
stale gate separately; never reinterpret it as a passing result.

### 8. Cleanup and explicitly unverified behavior

Close both dedicated tunnels and record their final status. State explicitly:

- layout preview, selection, application, and game launch remain untested;
- controller types other than verified `4` and `102` are unit-pass-through only;
- physical multiple-controller switching and hot-plug behavior are untested;
- webpack changes outside the structurally verified current Steam build are
  fail-open, not claimed compatible.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished controller-layout-tab-preservation
```

This writes:

```text
/tmp/Decky-Metadata/controller-layout-tab-preservation_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer controller-layout-tab-preservation`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/controller-layout-tab-preservation-review-*.md
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
   scripts/orchestration/clear-finished controller-layout-tab-preservation
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
   git add docs/review/controller-layout-tab-preservation-review-*.md
   git commit -m "docs(review): record controller-layout-tab-preservation review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished controller-layout-tab-preservation
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer controller-layout-tab-preservation` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed controller-layout-tab-preservation
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize controller-layout-tab-preservation
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/controller-layout-tab-preservation_finalized
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
scripts/orchestration/finalize controller-layout-tab-preservation
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/controller-layout-tab-preservation_finished
/tmp/Decky-Metadata/controller-layout-tab-preservation_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
