# Plan: Fix controller layout type filtering and expose controller types (controller-type-filtering)

## Context

Controller Settings currently forwards Steam's `filterOtherControllerTypes`
value unchanged to both the displayed non-Steam shortcut and its matched native
Steam app. That is correct on a Steam Deck controller, but Steam's filtered
query returns no Workshop layouts for the Legion Go S integrated controller
(`eControllerType === 102`) even though an unfiltered source query contains
layouts that Steam's own `BControllerTypesEquivalent` logic considers
compatible.

This plan makes the supplemental source query controller-aware without changing
the primary shortcut query or Steam's visible filter:

- active Steam Deck controller type `4` keeps Steam's requested source filter;
- verified affected Legion Go S controller type `102` forces only the matched
  source query to `filterOtherControllerTypes=false`;
- unknown, missing, external, and future controller types preserve Steam's
  original value until verified and deliberately added to the affected allowlist;
- the existing getter wrappers continue to apply Steam's client-side controller
  equivalence filter, so Legion Go S sees compatible layouts while **Show All
  Configs** still controls whether every layout is visible.

The Quick Access Menu **Versions** section will also show every currently
connected controller type as a diagnostic value. Known verified types render as
`Steam Deck (4)` and `Legion Go S (102)`; unknown numeric types retain their raw
number, duplicate types are collapsed, and an unavailable controller store
renders `Unknown`.

### Verified device evidence behind the design

The following bounded, no-selection queries were run on 2026-08-26. They
temporarily populated Steam's in-memory controller configuration cache and then
restored the original filter; they did not apply a layout or launch a game.

- `steamdeck` exposed controller type `4`, style `100`, with Steam's filter set
  to `true`. The native filtered source query returned 31 Workshop records and
  the matched shortcut showed 31. Replacing the source cache with an unfiltered
  query while leaving the visible filter enabled changed the compatible visible
  set to 33. A universal forced-false policy would therefore change established
  Steam Deck behavior.
- `steamdeck-legos` exposed controller type `102` with Steam's filter set to
  `true`. The filtered source query returned zero Workshop records and the
  matched Deadpool shortcut (`3497159354 -> 224060`) showed zero. Fetching only
  the source unfiltered returned 21 Workshop records; restoring the visible
  filter let Steam select nine compatible layouts and the shortcut showed those
  nine.

These counts are evidence, not permanent fixtures: Workshop contents can change.
The durable contract is that type `4` preserves its before/after visible URL
identity set while type `102` changes from an empty filtered result to a
non-empty compatible subset.

### Architecture and scope

- Add one small frontend-only controller boundary/policy module shared by the
  query wrapper and the Versions panel. Do not add a backend RPC or Python
  dependency.
- Resolve the controller by the `controllerIndex` already present in
  `SteamClient.Input.QueryControllerConfigsForApp` arguments. Do not infer
  behavior from SteamOS, chassis model, hostname, or the first controller.
- Keep the affected-type allowlist explicit and initially limited to `102`.
- Preserve the primary native query, all getter merge semantics, Search
  isolation, layout preview/selection, and native Steam game behavior.
- Read controller information through `ControllerStore.GetControllers()` with
  the existing lowercase `controllerStore` fallback. Never enumerate MobX store
  instances or arbitrary Steam object trees during render.
- The Versions value is sampled when the Decky Metadata panel mounts. Live
  hot-plug updates while the panel remains mounted are out of scope.

### Files in scope

```text
src/types.ts
src/steam/controllerTypes.ts
src/steam/controllerTypes.test.ts
src/steam/controllerLayouts.ts
src/steam/controllerLayouts.test.ts
src/steam.ts
src/ContentPanel.tsx
src/ContentPanel.updateSettings.test.tsx
src/components/qam/VersionsSection.tsx
src/components/qam/VersionsSection.test.tsx
scripts/deck/js/check_controller_layouts.js
tests/test_deck_fixture_selection.py
README.md
CHANGELOG.md
dist/index.js
docs/agent_conversations/2026-08-26_controller-type-filtering.md
```

Do not modify `main.py`, `backend/`, updater behavior, layout selection/apply
methods, Search filtering policy, or unrelated QAM sections.

**Slug used throughout this plan:** `controller-type-filtering`

---

## Orchestration Contract

**Slug:** `controller-type-filtering`

**Plan file:**

```text
docs/plans/2026-08-26_controller-type-filtering.md
```

**Implementation branch:**

```text
feat/controller-type-filtering
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/controller-type-filtering_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/controller-type-filtering_finalized
```

**Review notes:**

```text
docs/review/controller-type-filtering-review-*.md
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
git checkout -b feat/controller-type-filtering
```

Commit this plan first:

```bash
git add docs/plans/2026-08-26_controller-type-filtering.md
git commit -m "docs(plan): add controller-type-filtering implementation plan"
```

---

## Implementation Tasks

Work in this order. The tests and device baselines must demonstrate the existing
failure/behavior before the production source changes.

### Task 1 — protocol checks and reproducible baselines

1. Run the required project routing checks from the repository root:

   ```bash
   scripts/decky doctor
   scripts/decky verify-change dev --explain
   ```

   Record the selected checks in the session log. Do not use `--allow-launch`;
   this plan never launches a game.
2. Create `/tmp/Decky-Metadata/controller-type-filtering/` for evidence. Keep all
   captures, payloads, screenshots, caches, and temporary fixtures there.
3. Before editing `src/`, open dedicated debugger tunnels so one host can never
   be mistaken for the other:

   ```bash
   DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/tunnel.sh up
   DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/tunnel.sh up
   ```

4. Use `scripts/deck/cdp.py eval SharedJSContext
   @scripts/deck/js/check_controller_layouts.js` to capture a baseline layout
   JSON from each device. Use current live shortcuts, not settings-only fixtures:
   - Steam Deck: displayed `2312439508`, source `15100`; second displayed
     `3497159354`, second source `224060`; third displayed `3826383093`.
   - Legion Go S: displayed `3497159354`, source `224060`; second displayed
     `3164917450`, second source `1030830`; third displayed `2661415270`.
   Save standalone command output to
   `/tmp/Decky-Metadata/controller-type-filtering/{steamdeck,legos}-before.json`.
5. The pre-change probe does not yet return controller diagnostics. For each
   device, run a separate bounded `cdp.py eval SharedJSContext` expression that:
   - selects the same controller by the exact index returned in the layout
     payload;
   - reads only its numeric `eControllerType` and
     `controllerConfiguratorStore.m_bFilterOtherControllerTypes`;
   - writes those scalars to
     `/tmp/Decky-Metadata/controller-type-filtering/{steamdeck,legos}-controller-before.json`.
   Do not enumerate controller/store objects into the evidence.
6. A missing CDP target, missing connected controller, missing live shortcut,
   invalid JSON, or a controller index with no matching record is a hard failure;
   do not silently choose a settings entry that is absent from `appStore`.
7. Record the baseline controller type, store filter, displayed/source Community
   counts, and URL hashes. The expected pre-change discriminator is:
   - Steam Deck type `4`: matched displayed Community results are non-empty.
   - Legion Go S type `102`: Deadpool's displayed and source Community results
     are empty under the native filtered request, while the already documented
     direct unfiltered source query is non-empty.
   If the live behavior no longer has this shape, stop and update the plan from
   new evidence rather than implementing a stale workaround.
8. Close both tunnels after the captures. Never leave port `18081`, `18082`, or
   `18083` as an ambiguous tunnel to another host.

### Task 2 — write focused failing tests first

Add tests before production changes and run:

```bash
./run.sh npx vitest run \
  src/steam/controllerTypes.test.ts \
  src/steam/controllerLayouts.test.ts \
  src/components/qam/VersionsSection.test.tsx \
  src/ContentPanel.updateSettings.test.tsx
```

The new tests must fail for the missing contracts, with named failures that
identify the controller policy or Versions output:

1. `src/steam/controllerTypes.test.ts`:
   - resolve controller type `4` and `102` by the exact queried controller index;
   - prefer callable `ControllerStore.GetControllers`, fall back to callable
     `controllerStore.GetControllers`, and return no types when neither boundary
     is usable;
   - reject malformed controller indexes/types without throwing;
   - deduplicate and numerically sort connected controller types;
   - preserve the requested filter for type `4`, unknown types, missing types,
     and any request already set to `false`;
   - force `false` only for affected type `102`;
   - format known, unknown, multiple, and unavailable controller types with the
     exact Versions-panel text contract.
2. `src/steam/controllerLayouts.test.ts`:
   - primary type-`102` query remains `query:<displayed>:<index>:true`, while the
     matched source query becomes `query:<source>:<index>:false`;
   - type `4` and unknown types preserve `true` for the source;
   - an original `false` stays `false`;
   - controller resolution uses `args[1]`, not whichever controller appears
     first;
   - source-query deduplication keys on the effective source filter. Repeating a
     type-`102` primary request with `true` and then `false` must not refetch an
     unchanged source cache solely because both effective source filters are
     `false`; changing controller index or effective source filter must refetch;
   - native Steam apps, unmatched shortcuts, getter merges, Search isolation,
     fail-open behavior, and descriptor cleanup retain their current assertions.
3. `src/components/qam/VersionsSection.test.tsx`:
   - render `Controller Types: Steam Deck (4)`;
   - render `Controller Types: Legion Go S (102)`;
   - render a deterministic comma-separated list for multiple unique types;
   - preserve an unknown raw numeric type;
   - render `Controller Types: Unknown` for no usable controller data.
4. `src/ContentPanel.updateSettings.test.tsx`:
   - mock the controller reader;
   - run mount effects;
   - assert that the sampled controller types are passed to `VersionsSection`.

Record the failing test names and pass/fail tallies in the session log. A module
resolution error, missing command, or syntax error does not count as the
expected red phase.

### Task 3 — implement the shared controller boundary and policy

1. Extend `src/types.ts` with the minimal observed boundary only:
   - a controller record containing unknown-valued `nControllerIndex`,
     `eControllerType`, and optional `eControllerStyle`;
   - a controller store exposing optional `GetControllers`;
   - optional uppercase `ControllerStore` and lowercase `controllerStore` fields
     on `SteamInternals`.
   Do not type unrelated Steam internals.
2. Create `src/steam/controllerTypes.ts` containing boring, pure/testable helpers:
   - constants for verified Steam Deck type `4` and Legion Go S type `102`;
   - one explicit affected-type set initially containing only `102`;
   - safe discovery of the uppercase/lowercase controller store;
   - `controllerTypeForIndex(controllerIndex, store?)`, returning a validated
     integer type or `null`;
   - `getConnectedControllerTypes(store?)`, returning unique sorted integers;
   - `sourceFilterForControllerType(controllerType, requestedFilter)`, returning
     `false` only for affected types and otherwise preserving the request;
   - deterministic formatting for the Versions panel.
3. Boundary helpers must catch Steam-internal access/call failures and return
   conservative values. Failure to identify a controller preserves Steam's
   original query filter; it must not disable controller-layout supplementation.
4. Export only the QAM-facing reader/formatter through `src/steam.ts`. Patch-only
   policy helpers may be imported directly from the module.

### Task 4 — apply the type-specific supplemental query filter

In `src/steam/controllerLayouts.ts`:

1. Add a test-injectable `resolveControllerType(controllerIndex)` dependency
   whose default calls `controllerTypeForIndex`.
2. Parse and validate the existing query arguments exactly as today. Leave the
   primary `originalQuery.apply(this, args)` call untouched.
3. After resolving the matched source and controller index, derive an
   `effectiveSourceFilter` through `sourceFilterForControllerType`.
4. Build the supplemental source arguments as:

   ```text
   [matchedSourceAppid, controllerIndex, effectiveSourceFilter, ...remainingArgs]
   ```

   Preserve any arguments after index `2`; do not mutate the original `args`
   array.
5. Store `effectiveSourceFilter`, not the primary request value, in
   `SupplementalQueryKey`. Keep source appid and controller index in the key.
6. Do not change getter wrappers. Their calls into Steam's
   `GetWorkshopConfigsForApp` must continue to enforce the currently visible
   `m_bFilterOtherControllerTypes` setting through Steam's own equivalence
   policy.
7. Do not add a Legion-specific appid, hostname, SteamOS check, backend setting,
   retry, or fallback layout. Type `102` is the only new policy input.

### Task 5 — expose connected controller types in Versions

1. In `src/ContentPanel.tsx`, add controller-type state initialized to an empty
   array. In a mount effect, call `getConnectedControllerTypes()` once and store
   the result. Do not poll and do not walk Steam/MobX object trees.
2. Pass the sampled types to `VersionsSection`.
3. In `src/components/qam/VersionsSection.tsx`, add the new prop and append one
   compact line inside the existing `Field`:

   ```text
   Controller Types: <formatted value>
   ```

   Keep the existing Decky Metadata, Decky, and SteamOS rows unchanged. Use
   `Unknown` when no valid type is available.
4. Known labels are diagnostics, not policy keys: display `Steam Deck (4)` and
   `Legion Go S (102)`, while any unrecognized integer renders as `Type <N>`.
   Multiple values are numerically sorted and comma-separated.
5. Update the existing ContentPanel mock seam and add the focused component test;
   do not make VersionsSection reach into Steam globals itself.

### Task 6 — extend bounded device evidence

Add `controllerType` and `filterOtherControllerTypes` to the JSON returned by
`scripts/deck/js/check_controller_layouts.js`. Both are non-sensitive scalar
diagnostics already read by the probe. Keep its existing URL hashing,
no-selection behavior, context restoration, timeout, native phase, and Search
isolation evidence unchanged. Do not add layout URLs, titles, account IDs,
selection calls, preview calls, input dispatch, or game launch.

Update `tests/test_deck_fixture_selection.py` and any focused probe assertion
whose observable contract changes. Keep the static guarantee that the probe
does not select, preview, apply, or launch. Do not weaken any existing smoke
assertion to accommodate a stale fixture.

### Task 7 — documentation, artifact, and session record

1. Update `README.md`:
   - include connected controller types among the diagnostics shown in the
     Versions panel;
   - state that compatible matched-game layouts remain available on the Legion
     Go S while Steam's normal visible controller-type filter remains in effect.
2. Add concise `## [Unreleased]` entries to `CHANGELOG.md`:
   - **Fixed:** matched community layouts on Legion Go S controller type `102`;
   - **Added:** connected controller types in the Versions panel.
3. Regenerate the committed `dist/index.js` through the project build; never edit
   it manually.
4. Write
   `docs/agent_conversations/2026-08-26_controller-type-filtering.md` with the
   objective, files changed, controller-policy decision, red/green and mutation
   evidence, quality-gate output, both device results, screenshots/evidence
   paths, and explicit unverified items.
5. Keep all temporary evidence and screenshots below
   `/tmp/Decky-Metadata/controller-type-filtering/`. Do not commit them.

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

Apply `references/verification-standards.md`: every check below must have a
specific failure mode, baseline/failure cases run before positive controls, and
the session record must contain actual output/tallies rather than conclusions.

### 1. Red tests prove the new contracts are absent

Before production changes, run the focused command from Task 2. Required
evidence is failing named assertions for:

- type `102` supplemental source filter `false`;
- type `4` source filter preserved;
- controller-index lookup;
- effective-key deduplication;
- Versions controller text;
- ContentPanel-to-Versions wiring.

If the command exits `127`, fails to import a file that should exist, or has no
named contract failure, fix the test harness and repeat; do not count that as a
red result.

### 2. Focused green tests

After Tasks 3–6:

```bash
./run.sh npx vitest run \
  src/steam/controllerTypes.test.ts \
  src/steam/controllerLayouts.test.ts \
  src/components/qam/VersionsSection.test.tsx \
  src/ContentPanel.updateSettings.test.tsx
```

Record test-file and test-case pass/fail totals. Any failed existing
controller-layout/Search assertion is a regression.

### 3. Mutation checks, then restored positive control

With the focused tests green:

1. Temporarily remove type `102` from the affected set. Re-run
   `controllerTypes.test.ts` and `controllerLayouts.test.ts`; the named Legion
   source-filter tests must fail because the source call used `true`.
2. Restore the affected set.
3. Temporarily omit the Controller Types line from `VersionsSection`. Re-run
   `VersionsSection.test.tsx`; its exact rendered-text assertions must fail.
4. Restore the line.
5. Re-run the complete focused command from section 2. It must return exit `0`
   with all four files green. This final post-mutation run is the negative
   control proving the restored implementation, rather than the temporary
   mutation, is under test.

Do not commit either mutation. Record the failing test names and the final green
totals.

### 4. Project quality gate

Run the generated Quality Gates section exactly. The implementation is not ready
for device deployment unless `scripts/orchestration/run-quality-gates` exits `0`,
the committed `dist/index.js` is regenerated, review notes are intact, and the
tree contains only the intended committed changes.

### 5. Steam Deck device regression check

The user has made both `steamdeck` and `steamdeck-legos` available for this
feature's bounded controller-cache queries and on-device verification. Use the
committed tooling only. Deployment remains explicit and must not launch a game.

1. Run:

   ```bash
   DECKY_DECK_HOST=steamdeck scripts/decky doctor --deck
   DECKY_DECK_HOST=steamdeck CDP_PORT=18083 scripts/deck/deploy.sh
   ```

2. Re-run the exact Steam Deck probe from Task 1 and save
   `/tmp/Decky-Metadata/controller-type-filtering/steamdeck-after.json`.
3. Fail unless:
   - `controllerType === 4`;
   - `filterOtherControllerTypes === true`;
   - source comparison completed;
   - displayed Community identities contain every source Community identity;
   - the displayed Community URL-hash set exactly matches the same-day
     pre-deploy baseline. Use a standalone extraction command followed by
     `cmp`; do not hide the producer in a successful `printf` or infer status
     from an unchecked pipeline.
4. Run the existing bounded suite without launching:

   ```bash
   DECKY_DECK_HOST=steamdeck CDP_PORT=18083 \
     scripts/deck/verify/run_all.sh --no-launch
   ```

   Record each PASS/FAIL line. Any failure is blocking; do not dismiss a changed
   layout identity as network noise without recapturing and explaining it.

### 6. Legion Go S behavior check

1. Run:

   ```bash
   DECKY_DECK_HOST=steamdeck-legos scripts/decky doctor --deck
   DECKY_DECK_HOST=steamdeck-legos CDP_PORT=18082 scripts/deck/deploy.sh
   ```

2. Re-run the exact Legion probe from Task 1 and save
   `/tmp/Decky-Metadata/controller-type-filtering/legos-after.json`.
3. Parse the payload with a standalone `jq -e` command under `set -o pipefail`.
   Fail unless:
   - `controllerType === 102`;
   - the visible Steam filter remains `true`;
   - the Deadpool source comparison completed;
   - source Community count is greater than zero;
   - displayed Community count is greater than zero;
   - every compatible source URL hash is present in the displayed shortcut
     hashes;
   - native and Search-isolation phases still satisfy the existing probe
     contract.
4. The settings-only Assassin's Creed fixture is stale on this host and absent
   from live `appStore`; do not use its expected failure as evidence for or
   against this fix. Use the explicit current shortcuts from Task 1.

### 7. Actual Versions-panel surface on both devices

After each deployment, open Decky Metadata's Quick Access Menu panel fresh using
a physical controller or the committed CDP input tooling. Do not hand-roll key
dispatch.

1. On `steamdeck`, fail unless the rendered Versions field contains:

   ```text
   Controller Types: Steam Deck (4)
   ```

2. On `steamdeck-legos`, fail unless it contains:

   ```text
   Controller Types: Legion Go S (102)
   ```

3. Use `scripts/deck/cdp.py eval QuickAccess` to capture the rendered text and
   `scripts/deck/cdp.py screenshot` to save one screenshot per host under
   `/tmp/Decky-Metadata/controller-type-filtering/`. The DOM assertion and
   screenshot are both required; a component test alone is not visual proof.
4. Verify initial focus and one D-pad move with
   `scripts/deck/js/gpfocus_dump.js` as required by the QAM runbook. The added
   non-interactive text must not change the existing preferred focus target or
   navigation order.

Close both dedicated tunnels at the end.

### Not verified by this plan — record explicitly

- Layout preview, selection, application, and game launch are not exercised.
- Controller types other than verified `4` and `102` retain native behavior but
  are not tested on hardware.
- Multiple simultaneously connected controllers are unit-tested for formatting;
  the physical multi-controller surface is not exercised.
- Hot-plug changes while the Versions panel remains mounted are intentionally
  not live-updated or tested.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished controller-type-filtering
```

This writes:

```text
/tmp/Decky-Metadata/controller-type-filtering_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer controller-type-filtering`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/controller-type-filtering-review-*.md
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
   scripts/orchestration/clear-finished controller-type-filtering
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
   git add docs/review/controller-type-filtering-review-*.md
   git commit -m "docs(review): record controller-type-filtering review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished controller-type-filtering
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer controller-type-filtering` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed controller-type-filtering
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize controller-type-filtering
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/controller-type-filtering_finalized
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
scripts/orchestration/finalize controller-type-filtering
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/controller-type-filtering_finished
/tmp/Decky-Metadata/controller-type-filtering_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
