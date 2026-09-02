# Plan: Fix persistent compatibility badge refresh (persistent-compatibility-badge-refresh)

## Context

The Steam Home compatibility badge for a saved non-Steam match disappears after
the plugin or SharedJSContext reloads and returns only after the user opens that
game and comes back. Live Deck evidence for shortcut `2155012430` established
two independent failure boundaries:

- saved metadata remained Playable (`deck_compat_category: 2`) while Steam's
  non-observable `steam_hw_compat_category_packed` field could be reset to `0`
  when Steam replaced an AppOverview object;
- after a settled reload, the packed value and derived category were already
  correct (`10` and `2`) but the focused Home card still had no badge. Opening
  the detail page and returning made the badge appear without changing either
  value.

The current fix in `src/steam/libraryCompatibilityIndicators.tsx` mounts a
revision-subscribed indicator only when its patched Home or grid item renderer
runs. `refreshCompatibilitySurfaces()` in `src/steam/metadataPatch.ts` uses a
same-route history replacement, but Steam's mounted `VirtualizedBoxCarousel`
retains its old item output, so no subscribed slot exists to receive later
revisions. Steam also treats the packed compatibility field as non-observable
and replaces AppOverview instances when non-observable native fields change, so
direct one-time writes are not durable.

Fix both lifecycle gaps. A positive effective compatibility category must
survive native AppOverview refresh/replacement, and already-mounted Home and
Library cards must acquire or update the badge without selecting a game,
navigating away, changing focus or tabs, or enumerating MobX/React render trees.
Keep official Steam games, explicit Unknown, unresolved Automatic, plugin
teardown, and compatibility-baseline restoration unchanged. Relevant runtime
files are `src/steam/metadataPatch.ts`, `src/steam/core.ts`,
`src/steam/libraryCompatibilityIndicators.tsx`, and `src/steam/install.ts`;
reuse existing files and helpers unless a small focused verification probe is
required.

**Slug used throughout this plan:** `persistent-compatibility-badge-refresh`

---

## Orchestration Contract

**Slug:** `persistent-compatibility-badge-refresh`

**Plan file:**

```text
docs/plans/2026-08-31_persistent-compatibility-badge-refresh.md
```

**Implementation branch:**

```text
feat/persistent-compatibility-badge-refresh
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/persistent-compatibility-badge-refresh_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/persistent-compatibility-badge-refresh_finalized
```

**Review notes:**

```text
docs/review/persistent-compatibility-badge-refresh-review-*.md
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
git checkout -b feat/persistent-compatibility-badge-refresh
```

Commit this plan first:

```bash
git add docs/plans/2026-08-31_persistent-compatibility-badge-refresh.md
git commit -m "docs(plan): add persistent-compatibility-badge-refresh implementation plan"
```

---

## Implementation Tasks

1. Establish the failing contract before changing production code.
   - Run `./run.sh scripts/decky doctor --deck` and
     `./run.sh scripts/decky verify-change dev --explain`.
   - Extend `src/steam/libraryCompatibilityIndicators.test.tsx` with a mounted
     Home-carousel harness that caches item output before the Library patch and
     proves the current same-route refresh does not mount the reactive badge
     slot. The passing implementation must invalidate or bypass that stale item
     output without simulated navigation.
   - Extend `src/steam/metadataPatch.test.ts` with a native AppOverview
     replacement case: metadata remains positive, Steam replaces or rehydrates
     the overview with packed category `0`, and the plugin must restore the
     effective category before the replacement is published to compatibility
     consumers.
   - Include negative cases for official games, missing metadata, unresolved
     Automatic, explicit Unknown, duplicate notifications, and teardown. Record
     the exact failing test names and assertions on the unmodified runtime.

2. Make compatibility application lifecycle-safe.
   - Use the narrowest verified Steam AppOverview initialization/update boundary
     so each new or rehydrated native non-Steam overview receives the effective
     category while metadata is available. Apply it before Steam publishes the
     replacement when the runtime permits this; do not poll AppOverview maps or
     enumerate store instances.
   - Preserve the original low-nibble baseline exactly once per shortcut, retain
     packed bits above the compatibility nibble, and keep clean restoration on
     metadata removal and plugin teardown.
   - When metadata arrives after an overview, apply it to the current exact
     native shortcut and publish one compatibility change after the complete
     batch. Never follow the matched official App ID alias for a write.
   - Resolve and patch all currently used AppOverview prototype variants
     fail-closed. Register teardown before asynchronous discovery. A missing or
     changed Steam target must leave native behavior intact and produce a
     bounded diagnostic instead of an endless retry.

3. Replace the ineffective mounted-card refresh.
   - In `src/steam/libraryCompatibilityIndicators.tsx` and
     `src/steam/metadataPatch.ts`, remove the assumption that
     `history.replace()` invalidates Steam's virtualized Home item cache.
   - Use the narrowest current Steam component or cache boundary that can be
     resolved with the existing exact source fingerprints and that demonstrably
     refreshes already-mounted Home and Library grid cards. If direct cache
     invalidation is not safe, mount the plugin-owned reactive indicator at a
     stable card boundary that already exists in cached output.
   - Do not navigate, replace the current route, change the selected game,
     disturb focus/tab state, toggle unrelated observable user fields, dispatch
     synthetic resize/input events, or walk render-phase React/MobX trees.
   - Drive Steam's native Deck indicator with the effective metadata category,
     not with an overview field that can be stale during replacement. Keep the
     exact shortcut App ID and native shortcut-identity guards. Category `0`
     remains Steam's normal no-badge state.
   - Keep one wrapper/subscription per rendered card, stable wrapper identities,
     bounded target resolution, and complete cleanup. Remove obsolete refresh
     code and tests rather than retaining compatibility aliases.

4. Add permanent behavioral verification.
   - Extend the existing focused Vitest suites so they model a card cached
     before patch installation, cache completion after first render, AppOverview
     replacement after a successful write, repeated refreshes, and dismount.
     Assertions must prove both icon presence and absence, exact App ID
     isolation, notification counts, and no retained listener or wrapper.
   - Add or extend a focused probe under `scripts/deck/verify/` only if needed to
     make the live stale-card sequence repeatable. It must use the committed CDP
     client and bounded DOM/component evidence, never enumerate MobX stores
     inside a render-tree walk, and fail with an explicit reason when the fixture
     or expected badge target is absent.
   - Regenerate `dist/index.js` and `dist/index.js.map`.
   - Add an `Unreleased` changelog entry that states compatibility badges remain
     visible after plugin/SteamUI reload without selecting each game.
   - Record the implementation, design choice, failed alternatives, focused
     test tallies, quality-gate result, and live Deck evidence in
     `docs/agent_conversations/2026-08-31_fix-persistent-compatibility-badge-refresh.md`.

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

Follow `skill://orchestration-plan-author/references/verification-standards.md`.
Every command below must report its real exit status and output.

1. Prove the regression before trusting the fix.
   - On the unmodified implementation, run the new focused tests with
     `./run.sh npx vitest run src/steam/libraryCompatibilityIndicators.test.tsx src/steam/metadataPatch.test.ts`.
     The stale mounted-card and AppOverview replacement cases must fail at their
     named badge/category assertions, not because setup or a command is absent.
   - After implementation, temporarily disable the new mounted-card
     invalidation or lifecycle-reapply branch. Run the same focused command and
     record the expected named failure. Restore the implementation and rerun;
     all focused tests must pass. Do not leave the mutation in the branch.

2. Run automated gates.
   - `./run.sh npx tsc --noEmit`
   - `./run.sh npx vitest run src/steam/libraryCompatibilityIndicators.test.tsx src/steam/metadataPatch.test.ts src/steam/routerPatches.test.ts src/steam/activity.test.ts`
   - `./run.sh npm run build`
   - `./scripts/orchestration-hooks/quality-gates`
   - Record test-file and test-case tallies. Any non-zero command, deleted review
     note, changed generated bundle not committed, or dirty tree is a failure.

3. Validate the actual SteamUI surface on the available Steam Deck.
   - Run `./run.sh scripts/decky doctor --deck`.
   - Run `./run.sh scripts/decky verify-change dev --device --explain`. Do not
     add `--allow-launch`; this change does not require launching a game.
   - Use `scripts/deck/deploy.sh` if the dispatcher does not already deploy the
     final bundle, then use the committed CDP/tunnel tools.
   - With Space Marine shortcut `2155012430` selected on Steam Home and saved
     Playable metadata present, hard-reload `SharedJSContext`, wait for Decky and
     the plugin patch to be ready, and do not visit a game-detail route.
   - Prove the focused Home card shows the yellow Playable badge while its live
     overview reports packed `10` and derived category `2`. Capture both a PNG
     and machine-readable probe output below
     `/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/`.
   - Open the non-Steam Library grid without first opening the fixture details
     and prove its card shows the same badge. Re-check after at least two minutes
     so a later AppOverview replacement cannot silently remove the category or
     indicator.
   - Negative controls run last: an explicit Unknown or unresolved Automatic
     shortcut has no badge, and an official Steam game retains its native
     category and card output. Do not change persistent metadata solely to
     manufacture these controls; use existing eligible fixtures or a
     read-only/runtime-isolated probe.
   - Run `scripts/deck/verify/run_all.sh --no-launch`. Any new compatibility,
     re-render, quick-link, controller-layout, or community regression is a
     failure; distinguish and document only pre-existing fixture failures with
     exact output.
   - Capture `./run.sh scripts/decky capture`, close the dedicated tunnel, and
     verify `scripts/deck/tunnel.sh status` reports `tunnel: down`.

No backend behavior or game-launch path is expected to change. A full Steam
process restart is deferred only if the Deck cannot safely perform it during
this run; if deferred, state that gap explicitly. SharedJSContext hard reload,
pre-navigation Home and grid checks, the two-minute replacement window,
negative controls, and the full quality gate are required and may not be
deferred.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished persistent-compatibility-badge-refresh
```

This writes:

```text
/tmp/Decky-Metadata/persistent-compatibility-badge-refresh_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer persistent-compatibility-badge-refresh`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/persistent-compatibility-badge-refresh-review-*.md
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
   scripts/orchestration/clear-finished persistent-compatibility-badge-refresh
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
   git add docs/review/persistent-compatibility-badge-refresh-review-*.md
   git commit -m "docs(review): record persistent-compatibility-badge-refresh review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished persistent-compatibility-badge-refresh
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer persistent-compatibility-badge-refresh` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed persistent-compatibility-badge-refresh
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize persistent-compatibility-badge-refresh
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/persistent-compatibility-badge-refresh_finalized
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
scripts/orchestration/finalize persistent-compatibility-badge-refresh
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/persistent-compatibility-badge-refresh_finished
/tmp/Decky-Metadata/persistent-compatibility-badge-refresh_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
