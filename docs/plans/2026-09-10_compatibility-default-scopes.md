# Plan: Add four compatibility default scopes (compatibility-default-scopes)

## Context

Replace the current matched-games-only toggle with a four-option native
dropdown, **Apply default to**, below **Default compatibility status**.
This plan adopts the maintainer-approved recommendation: a saved manual record
without a Steam ID belongs in the no-Steam-ID scope, just like an IGN record.
The selector restricts the numeric global default; it is not a second category
setting and does not change per-game override precedence.

### User-visible contract

| Display label, in this order | Persisted value | Eligible native non-Steam shortcuts |
| --- | --- | --- |
| Steam-matched games | `steam` | Saved record with a valid positive Steam App ID. |
| Saved games without a Steam ID | `no-steam` | Saved record without a valid positive Steam App ID, including manual records. |
| All games with saved metadata | `metadata` | Any saved record, whether or not it has a Steam App ID. |
| All non-Steam games | `all` | Every native non-Steam shortcut, including entries without a record. |

Classify by record presence and Steam ID, never by provider name or live store
availability. Delisted games with valid IDs are Steam-matched. A source of IGN
does not imply no Steam match. A missing record is not a manual record.

Precedence stays: fixed per-game category (including numeric Unknown `0`);
then Follow Valve when selected; then the numeric global default only inside
the selected scope; then the existing Valve-category/native-baseline fallback.
For example, global Verified with scope `no-steam` leaves an inheriting
Steam-matched Playable game at Valve Playable, not native Unknown.

Automatic disables the scope control without discarding its saved selection.
Existing Game Info deferral, editor-exit precedence, native filter publication,
reload handling, and native launch identity remain in force. No Steam game or
official-ID alias becomes writable because it happens to have metadata.

### Research and current implementation

Read-only Deck research on 2026-09-10 found 18 native shortcuts: 9 records with
Steam IDs, 5 records without Steam IDs, and 4 without records. Of the 14 records,
7 were Steam-sourced and 7 IGN-sourced; two IGN records also had Steam IDs.
Four records had per-game overrides. These counts are evidence, not fixture
constants or implementation assumptions.

The native five-option category popup supported controller navigation and
cancel-to-origin focus. Its closed control was 134 CSS pixels wide, while the
proposed long labels measured 160-233 pixels. A second inline narrow dropdown
would truncate the selected scope. Native `DropdownItem` supports `layout`,
`childrenContainerWidth`, and `renderButtonValue`; use those existing controls,
not a custom multi-position switch.

Research artifacts remain under
`/tmp/Decky-Metadata/scope-selector-research-uhz4569j/`. The proposal simulation
covered 28 explicit precedence cases and 180 old-boolean migration comparisons;
it was not a live implementation of the new scopes. The historical log-copy
audit hit the local quota. Before drafting, 424 MiB was reclaimed from older
project log copies and regenerable caches; research, diagnostic captures,
recovery data, and other plugin folders were retained. Do not depend on deleted
historical log copies or treat temporary artifact availability as an acceptance
criterion.

### Scope and existing paths

- Persistence/RPC: `backend/storage.py`, `main.py`, `src/backend.ts`.
- Shared types/state/policy: `src/types.ts`, `src/steam/core.ts`,
  `src/steam/metadataPatch.ts`, `src/steam.ts`.
- Match predicate: `src/steam/detailsReassert.ts` and its existing consumers.
- UI: `src/components/qam/MetadataSection.tsx`, `src/ContentPanel.tsx`,
  `src/qamCompatibilityFocus.ts`, `src/MetadataPage.tsx`.
- Home/grid contract: `src/steam/libraryCompatibilityIndicators.tsx`; its
  `CompatibilityMetadata` pick currently omits `steam_appid` and must include
  it when the resolver becomes scope-aware.
- Existing tests: `tests/test_deck_compat.py`,
  `src/steam/{metadataPatch,detailsReassert,routerPatches}.test.ts`,
  `src/steam/libraryCompatibilityIndicators.test.tsx`,
  `src/ContentPanel.updateSettings.test.tsx`,
  `src/components/qam/MetadataSection.test.tsx`, `src/MetadataPage.test.tsx`.
- Current docs: `README.md`, `CHANGELOG.md`,
  `docs/specs/compatibility-status.md`,
  `docs/runbooks/on-device-verification.md`.

Non-goals: provider lookup changes, fresh store/network validation of matches,
new category sources, custom controller navigation, render/launch spoofing
redesign, telemetry, release/version bumps, dependency additions, remote Git
pushes, or `dev` to `main` promotion. This is a new plan, not a continuation of
the abandoned external `compat-default-matched-only` run. Authoring this plan
does not authorize launching its implementer or changing the device.

**Slug used throughout this plan:** `compatibility-default-scopes`

---

## Orchestration Contract

**Slug:** `compatibility-default-scopes`

**Plan file:**

```text
docs/plans/2026-09-10_compatibility-default-scopes.md
```

**Implementation branch:**

```text
feat/compatibility-default-scopes
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/compatibility-default-scopes_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/compatibility-default-scopes_finalized
```

**Review notes:**

```text
docs/review/compatibility-default-scopes-review-*.md
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
git checkout -b feat/compatibility-default-scopes
```

Commit this plan first:

```bash
git add docs/plans/2026-09-10_compatibility-default-scopes.md
git commit -m "docs(plan): add compatibility-default-scopes implementation plan"
```

---

## Implementation Tasks

### 1. Replace boolean persistence with one canonical scope

Add the shared TypeScript union
`CompatibilityDefaultScope = "steam" | "no-steam" | "metadata" | "all"` in
`src/types.ts`. Store it as `settings.deck_compat_default_scope`. Keep the
existing numeric `deck_compat_default` key and RPC contract unchanged.

In `backend/storage.py`, normalize the canonical scope and migrate the old
boolean at the existing settings-load boundary:

- A valid canonical scope wins if both keys are present.
- If the canonical value is absent or invalid, legacy boolean `True` maps to
  `metadata`; `False`, absence, and invalid legacy values map to `all`.
- An invalid present canonical value is normalized to that fallback.
- If both keys are absent, keep the loaded key absent and let the getter
  return `all`, preserving the existing no-rewrite behavior for legacy files.
- If the legacy key is present, expose the resolved canonical scope in memory
  and remove the legacy key there. A later successful normal save persists
  the canonical representation. A read must not rewrite the file.
- Preserve unrelated settings and metadata. Remove the old boolean default
  and sanitizer after migration is implemented; legacy spelling remains only
  in the migration boundary, its tests, and upgrade documentation.

Replace the old boolean getter/setter in `main.py` and their `src/backend.ts`
callables with:

- `get_compatibility_default_scope() -> str`
- `set_compatibility_default_scope(scope) -> str`
- Frontend `getCompatibilityDefaultScope` and `setCompatibilityDefaultScope`.

The setter accepts only the four exact strings. Reject unknown strings,
booleans, numbers, and null with `ValueError("invalid compatibility default scope")`.
Use the existing guarded load/save/rollback pattern, preserving prior value or
key absence on a failed write. Do not provide old RPC aliases or dual writes.
Require a full ZIP install so backend and frontend cut over together.

### 2. Migrate the shared resolver and every consumer

Replace the boolean state, snapshot, and confirmed setter with
`compatibilityDefaultScope`, `compatibilityDefaultScopeSnapshot`, and
`setConfirmedCompatibilityDefaultScope`. Use `all` as the initial state.
Migrate bridge imports, exports, tests, and callers cleanly. Before changing
exported symbols, use language-server references when configured; otherwise
inventory references with the repository search tool.

Keep category and scope loading together in the existing shared load promise.
Do not set `compatibilityDefaultLoaded` until both succeed, and reject an
invalid RPC scope response without publishing a half-loaded policy. Retain
generation/lifecycle checks so late loads and saves cannot overwrite a newer
confirmed selection or act after plugin unload.

Extend the one existing effective-category resolver with the enum scope.
Reuse `hasMatchedSteamAppId` rather than provider-specific classification.
Make its validity contract explicit: a positive safe integer after supported
numeric-string normalization; booleans, fractional/non-finite values, zero,
negative values, and malformed strings are not IDs. Update its existing
reference sites/tests for this contract without adding a network check.

Every native write path, incoming overview, metadata refresh/removal, editor
preview, and Home/grid indicator must use the same eligibility and precedence.
Include `steam_appid` in the card metadata shape; do not hide a missing input
with an unchecked cast. The per-game editor's `compatibilityStatusDisplay`
currently assumes any numeric default applies: replace that assumption with
the shared scoped result. Subscribe the editor to scope-only revisions too.
For a new manual editor record, its preview may describe the post-Save result,
but opening the editor must not itself create a saved record.

Scope changes reuse the current single linear pass and observable native map
publication. A metadata refresh that adds, removes, or changes a Steam ID must
recompute eligibility even if provider name and global setting are unchanged.
Do not cache eligibility across metadata revisions or copy a desired category
into pending Game Info work: exit must resolve the latest scope and record.

Preserve the held active Game Info value, native filter updates for other
games, editor Save priority, current-object lookup on exit, reload retention,
and teardown cancellation. Do not resurrect a deleted shortcut. No MobX store
enumeration in a render-phase tree walk and no new force-refresh machinery.

### 3. Replace the toggle with a readable native dropdown

Use the four labels and order from the contract. Remove the old `ToggleField`
and boolean props. Put **Apply default to** below the category control, using
`DropdownItem` with `layout="below"` and maximum available child width. Ensure
the complete selected scope is readable; if native text still truncates, use
its supported `renderButtonValue` for wrapping rather than shrinking text or
adding a fixed-height layout. Verify narrow-QAM and popup fit on the Deck.
Describe that saved records without Steam IDs include manual and provider
records, whereas no-record shortcuts belong only to `all`.

Preserve the synchronous shared in-flight guard between category and scope
saves. Disable both controls while either save is pending. Scope is also
disabled until loading completes and while category is Automatic. Preserve
the selected enum under Automatic, including across reload. A failed save
keeps the last confirmed policy, restores the displayed selection, and shows
the existing inline/toast error. Increment the same stale-load version guard.

Extend `src/qamCompatibilityFocus.ts`'s existing return request to identify
the originating control (`category` or `scope`). Track the two control refs
through the existing bounded native focus handoff in `ContentPanel`. Selection,
cancellation, failure, and QAM remount must return focus to the dropdown that
opened the popup, not always to the category control. Reuse the existing
navigation machinery; do not duplicate it or hand-dispatch controller events.

### 4. Defend the new boundaries with focused regressions

Use existing test files and typed fixtures. Add tests only for plausible
behavioral failures; do not pin prose, copied props, imports, or internal enum
ordinals. Cover:

- Legacy migration parity for both booleans, canonical-over-legacy precedence,
  invalid persisted fallback, no-write getters, unrelated-field preservation,
  invalid setter rejection, and rollback including canonical-key absence.
- All four scopes across Steam-ID records (including IGN-sourced ones),
  provider-only records, manual records, and absent records. The first two
  groups must be disjoint and their union must equal `metadata`.
- Fixed overrides including Unknown and Follow Valve in and out of scope;
  excluded Steam records retain Valve fallback, including category `0`.
  Automatic yields the same result for every scope.
- Record/Steam-ID additions, removals, and reassignment; invalid-ID handling;
  an incoming native overview and an official-ID alias.
- A scope-only change moves observable map membership in both directions.
  Compare actual entry references and categories, not copied tag properties.
- A no-record or newly excluded active Game Info game holds its previous
  value until exit, then resolves the latest scope; repeated choices,
  metadata deletion, reload, and editor Save do not replay obsolete intent.
- A delayed scope load cannot expose an unscoped numeric default; stale
  responses cannot overwrite a later confirmed save or a new plugin lifetime.
- Both dropdowns reject overlapping saves; focus returns to the originating
  control after select/cancel/failure/remount. Per-game preview and Home/grid
  consumers reflect scope-only changes with Steam ID present in their inputs.

Keep old regressions that defend these contracts. Replace obsolete boolean
tests with equivalent enum behavior rather than retaining compatibility APIs.

### 5. Update current documentation and package

Update README, the Unreleased changelog, the compatibility spec, and the device
runbook. Explain all four options, inclusion of manual records, migration,
precedence/fallback, disabled Automatic, and unchanged Game Info timing.
Update current S41-S47 wording from the boolean to its corresponding scopes,
then add scenarios for the two new ID-based scopes, provider/ID disagreement,
manual records, ID transitions, and excluded Steam fallback. Preserve the
historical review notes and session records as audit history.

Record implementation decisions, exact verification results, package version,
and any deferred checks in
`docs/agent_conversations/2026-09-10_compatibility-default-scopes.md`.
Regenerate the tracked frontend artifacts through the standard build/package
commands. Do not add dependencies or change package/plugin base versions.

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

Use the orchestration-plan-author skill's
`references/verification-standards.md`. Record command exit status and actual
output; do not conceal a producer's failure behind `tail`, `tee`, or another
pipeline consumer. Generated evidence stays under `/tmp/Decky-Metadata`.

### Local verification

1. Run the required change routing at implementation start:
   `./run.sh scripts/decky doctor` and
   `./run.sh scripts/decky verify-change dev --explain`.
   Record any required device checks rather than treating DEFERRED as PASS.
2. Reproduce the new boundary failures with focused behavioral tests before
   their fixes. Record the actual failing assertions; missing binaries/imports
   or invalid test fixtures are not proof of a policy failure.
3. Run the touched existing suites, including:
   `./run.sh uv run --with pytest -- pytest -q tests/test_deck_compat.py`
   and focused `./run.sh npm test -- <touched test files>`.
   Record counts and failures. Exercise real backend RPC/storage logic with
   an isolated temporary settings directory; no device settings are needed.
4. Mutation controls after the implementation is green: temporarily force the
   eligibility branch to apply the numeric default to every recorded game;
   the Steam/no-Steam partition and excluded-Valve-fallback regressions must
   fail. Separately change the legacy-true mapping to `all`; the preservation
   regression must fail. Restore each mutation immediately, then rerun the
   same checks to green. Never commit the mutations.
5. Run `./run.sh scripts/orchestration/run-quality-gates` and the generated
   review-retention gate. Record type check, build, frontend and backend
   results. Run once for the completed change, not between concurrent edits.
6. Run `./run.sh npm run package`, confirm the ZIP version and root structure,
   and record `sha256sum Decky-Metadata.zip`. This proves packaging only.

### Live verification gate — after explicit current-device authorization

The plan author has not installed this feature or authorized a launch.
Until authorization is supplied for execution, device work is deferred.
Capture baseline policy, exact fixture records, native packed categories, and
the currently selected Library filter before any device mutation. Prefer
existing fixtures; create/remove only explicitly authorized disposable records.
Do not assume research counts or fixture IDs remain current.

Use the committed doctor, capture, and log tooling; install a full ZIP via
Decky Loader's file picker after explicit `package-push --build --push`.
Avoid copying historical log snapshots repeatedly when only one current
capture is needed. Retain restricted baselines separately from public reports.

Required observations:

1. Show all four choices and the complete selected label in the actual QAM.
   Exercise both dropdowns with `scripts/deck/cdp.py input` and the committed
   `gpfocus_dump.js`/`focus_order.js` probes: Down order, popup navigation,
   cancellation, selection, and focus return to the correct originating
   control. Confirm Automatic disables scope without clearing it.
2. With a numeric global default, exercise every scope against a Steam-ID
   record, a no-ID provider/manual record, and a no-record shortcut. Include an
   IGN-sourced record with a Steam ID where available. Check ordinary Steam
   games remain unchanged. Record scoped membership separately from games
   whose per-game override means they do not inherit the default.
3. Check the actual mounted Home/grid indicators and native compatibility
   collection/filter in both directions. Assert against captured eligible
   fixture sets, not hardcoded research totals or only packed fields. Ensure
   excluded Steam-matched games retain Valve status and explicit Unknown or
   Follow Valve still wins.
4. Under authorization for disposable data, add/remove a record and add/remove
   its Steam ID; verify automatic movement between scopes and the editor's
   post-Save explanation. Restore those fields before continuing.
5. Change scope with Game Info active: hold its visible status/content while
   other games update; QAM/context-menu cancel is not an exit. A real tab/page
   exit applies the latest result, and editor Save wins over pending intent.
   Repeat an in-place plugin reload while pending, then exit and verify the
   correct result. Do not substitute a full SteamUI restart that leaves to Home.
6. Run `scripts/deck/verify/run_all.sh --no-launch`; record deliberate skips.
   Run the classifier-required launch smoke only with separate authorization
   for its exact fixture, and verify the actual 64-bit game ID.
7. Restore baseline policy, records, filter, and fixture state; close the
   browser handle and tunnel. Re-read the policy and native categories to prove
   restoration. A failed/offline/unrun required check blocks acceptance and
   integration; report the missing prerequisite, do not mark it complete.

Only the plan itself is being validated during authoring. Full behavior is
accepted only after implementation, local gates, and the required live checks.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished compatibility-default-scopes
```

This writes:

```text
/tmp/Decky-Metadata/compatibility-default-scopes_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer compatibility-default-scopes`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/compatibility-default-scopes-review-*.md
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
   scripts/orchestration/clear-finished compatibility-default-scopes
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
   git add docs/review/compatibility-default-scopes-review-*.md
   git commit -m "docs(review): record compatibility-default-scopes review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished compatibility-default-scopes
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer compatibility-default-scopes` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed compatibility-default-scopes
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize compatibility-default-scopes
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/compatibility-default-scopes_finalized
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
scripts/orchestration/finalize compatibility-default-scopes
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/compatibility-default-scopes_finished
/tmp/Decky-Metadata/compatibility-default-scopes_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
