# Plan: Retry mounted compatibility badge discovery after startup (retry-mounted-compatibility-badge-discovery)

## Context

Updater installation of `0.3.11-dev.ga229009` is healthy, but the Home
compatibility badge still has one startup race. Live review installed that
version through the development updater, then restarted Steam's JavaScript
context with `SteamClient.Browser.RestartJSContext()`. Decky returned ready in
five seconds and logged successful compatibility-indicator and Steam patch
installation with 93 teardown handlers. Without visiting a game detail route,
Space Marine shortcut `2155012430` still reported packed compatibility `10`,
derived category `2`, and native shortcut identity, but its mounted Home card
had no plugin compatibility fiber key, no compatibility SVG, and no yellow
badge.

The existing browser-window bridge was healthy after the restart: it exposed 34
`[data-id]` cards, the Space Marine card fiber, an `m_refGrid` ancestor at depth
11, and the exact `VBC_` plus `fnOnFocusedColumnChange` fingerprint at depth 13.
The grid's `cellRenderer` remained Steam's native bound renderer. Navigating to
the non-Steam grid and then returning Home made the badge appear, proving that
future renderer paths work.

The missed boundary is in
`src/steam/libraryCompatibilityIndicators.tsx`. After module targets resolve,
installation calls `refreshMountedHomeCarousels()` only once. During a full
JavaScript-context restart, that call can run before Steam mounts Home cards.
Later metadata bootstrap passes do not notify because the packed category is
already correct, so mounted-card discovery never runs again.

Add one bounded, teardown-safe mounted-Home discovery liveness window. After
successful renderer patch installation and the initial synchronous discovery,
observe mounted Home cards every 500 milliseconds for 60 attempts (30 seconds).
If the current grid renderer is native, wrap the newest renderer and recompute
the grid. Do not end the observation window after the first wrapper
installation: live validation proved that React can replace the grid's props
object and restore a native bound renderer after an earlier successful wrap.
Stop after the bounded window expires. Keep module-target resolution and
mounted-card discovery as separate retry lifecycles and timer IDs. Cleanup must
cancel both timers and make any raced callback inert. Exhaustion must stop all
background work while preserving any active wrapper and its normal cleanup.
Do not navigate, change focus or tabs, publish artificial metadata revisions,
poll AppOverview stores, or add a MutationObserver.

Use the existing browser bridge, bounded fiber walk, scheduler dependencies,
and renderer cleanup behavior. Relevant files are
`src/steam/libraryCompatibilityIndicators.tsx`,
`src/steam/libraryCompatibilityIndicators.test.tsx`, `dist/index.js`,
`dist/index.js.map`, `CHANGELOG.md`, and a dated session record. Do not change
`metadataPatch.ts`; live evidence shows compatibility data is already correct.

### Runtime safety update

Live validation of the first implementation exposed two additional current
Steam boundaries. Retaining object React element types made the wrapper call an
object and crashed SteamUI with `TypeError: carousel is not a function`.
Decky Metadata was disabled through Loader recovery and SteamUI returned to
Home. The corrected callable-only guard passed its focused regression and full
quality gate.

The exact corrected bundle was then enabled on an already-mounted Home screen.
It did not crash, but after the discovery window the Space Marine grid again
held Steam's native `bound CellRenderer`; its `cellRenderer` property was a
plain writable/configurable value, and the card had no plugin compatibility
component or badge. The live fiber still had `m_refGrid` at depth 11 with
`fnOnFocusedColumnChange`, and its depth-13 ancestor retained the `VBC_` plus
`fnOnFocusedColumnChange` fingerprint. This proves that a successful early
wrapper installation is not terminal: React can later replace the grid props
object. Keep Decky Metadata disabled until a new bundle covers this replacement
and passes the full no-navigation restart proof.

### Second live boundary

The full-window implementation still failed its runtime contract. Bundle
`4eef6ddac5993837d4231a067160e03940cfca47543fff66b44ea8ee126f0f47`
was byte-identical locally and on the Deck. After enabling it and performing one
successful `RestartJSContext`, Decky Metadata was active and SteamUI did not
crash, but the grid still exposed native `bound CellRenderer` with a plain
writable/configurable descriptor after the 30-second window. The card had no
compatibility component.

The discovery inputs were all present in the same SharedJSContext realm:

- the bridged Main and Gamepad documents were both `/library/home`, each with
  34 cards and shortcut `2155012430`;
- the card exposed its React fiber;
- `m_refGrid` was at depth 11, its type contained
  `fnOnFocusedColumnChange`, and the depth-13 ancestor contained both `VBC_`
  and `fnOnFocusedColumnChange`;
- `recomputeGridSize` and `cellRenderer` were callable, the props object was
  extensible, and a reversible accessor definition on `cellRenderer`
  succeeded.

Therefore, do not make another speculative renderer-shape change. First add
temporary structured frontend diagnostics for each bounded observation:
attempt number, selected document URL/card count, discovered grid count, and
each wrapper-install outcome. Reproduce the no-navigation restart once and use
that evidence to fix the exact skipped or reverted branch. Remove the temporary
diagnostics before the final commit, retain a concise failure summary in the
session record, rerun the focused and full gates, and keep the plugin disabled
between controlled device trials.

**Slug used throughout this plan:** `retry-mounted-compatibility-badge-discovery`

---

## Orchestration Contract

**Slug:** `retry-mounted-compatibility-badge-discovery`

**Plan file:**

```text
docs/plans/2026-09-01_retry-mounted-compatibility-badge-discovery.md
```

**Implementation branch:**

```text
feat/retry-mounted-compatibility-badge-discovery
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery_finalized
```

**Review notes:**

```text
docs/review/retry-mounted-compatibility-badge-discovery-review-*.md
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
git checkout -b feat/retry-mounted-compatibility-badge-discovery
```

Commit this plan first:

```bash
git add docs/plans/2026-09-01_retry-mounted-compatibility-badge-discovery.md
git commit -m "docs(plan): add retry-mounted-compatibility-badge-discovery implementation plan"
```

---

## Implementation Tasks

1. Establish the failing startup contract before changing production code.
   - Extend `src/steam/libraryCompatibilityIndicators.test.tsx` with a case in
     which module targets resolve and patches install while every candidate
     browser document has no cards.
   - Assert that the current implementation performs its one synchronous
     discovery, leaves the native grid renderer untouched when cards mount
     later, and schedules no mounted-card recovery.
   - Make the passing form add cards and their bounded React fiber plus
     `m_refGrid` only after installation. Running the scheduled callback must
     wrap the exact current `cellRenderer`, recompute the grid, and render one
     Playable compatibility slot without route replacement or metadata
     mutation.
   - Record the exact failing test name and assertion before production edits.

2. Add a separate mounted-Home discovery retry lifecycle.
   - Add injectable `homeDiscoveryIntervalMs` and
     `maxHomeDiscoveryAttempts` dependencies. Production defaults are 500
     milliseconds and 60 attempts.
   - Keep the existing module-resolution `retryId` and attempt count unchanged.
     Use a distinct mounted-discovery timer ID and attempt count.
   - Let each mounted-discovery observation report whether the current
     `cellRenderer` is the recorded wrapper. Card presence, a fiber match, or a
     grid reference alone is not success. A successful wrap is also not a
     terminal lifecycle result because React can publish a replacement props
     object later in the bounded startup window.
   - After successful module patch installation, keep the current subscription,
     synchronous refresh, install diagnostic, and compatibility revision in
     their existing order. Schedule the first discovery observation after those
     paths complete and continue observations for the full configured attempt
     window. Each callback checks `active`, clears its timer ID, refreshes
     mounted Home carousels, and schedules the next observation only while below
     the configured limit.
   - On every observation, leave an intact recorded wrapper unchanged. If React
     replaced the grid props or `cellRenderer`, wrap the newest native renderer,
     update the cleanup target, and recompute that grid. Do not publish a
     compatibility revision from the observation.
   - Cleanup cancels both target-resolution and mounted-discovery timers before
     restoring grid renderers. A callback that races cleanup must not query the
     document, wrap a grid, recompute it, or schedule another callback.

3. Add permanent boundary and cleanup tests.
   - Prove immediate mounted-card discovery installs the wrapper and still
     schedules bounded liveness observations.
   - Prove cards that appear after installation are discovered on observation.
   - Prove a React replacement of `cellRenderer` during the observation window
     is wrapped from the newest native renderer and cleanup restores that
     renderer.
   - Prove a wrapper installed early in the window is not treated as terminal:
     replace the grid props object with a new native `cellRenderer`, run a later
     observation, and assert that the newest renderer is wrapped and restored
     by cleanup.
   - Prove cleanup cancels a pending mounted-discovery observation and a saved
     raced callback is inert.
   - Prove unresolved mounted discovery stops at the configured attempt limit
     with no pending callback and no renderer mutation.
   - Keep existing target-resolution retry, browser bridge fallback, App-ID
     isolation, negative category, duplicate indicator, and teardown tests
     passing. Do not weaken assertions that distinguish module retries from
     mounted-card retries.

4. Complete artifacts and records.
   - Regenerate `dist/index.js` and `dist/index.js.map`.
   - Add an `Unreleased` changelog entry that says the Home compatibility badge
     is recovered when cards mount after a Steam JavaScript-context restart.
   - Record the updater-installed failure, root cause, implementation, failed
     alternatives, focused test evidence, quality-gate results, and live Deck
     evidence in
     `docs/agent_conversations/2026-09-01_retry-mounted-compatibility-badge-discovery.md`.

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
Follow
`skill://orchestration-plan-author/references/verification-standards.md`.


1. Prove the focused regression.
   - Before production edits, run:
     `./run.sh npx vitest run src/steam/libraryCompatibilityIndicators.test.tsx`.
     The new late-card startup test must fail because no mounted-discovery retry
     exists, not because its bridge, fiber, or grid fixture is absent.
   - After implementation, rerun the same suite. Record its test count.
   - Temporarily disable the mounted-discovery scheduling branch and rerun the
     named test. It must fail at the missing wrapper or badge assertion. Restore
     the code and rerun green; do not commit the mutation.

2. Run automated gates.
   - `./run.sh npx tsc --noEmit`
   - `./run.sh npx vitest run src/steam/libraryCompatibilityIndicators.test.tsx src/steam/metadataPatch.test.ts src/steam/install.test.ts`
   - `./run.sh npm run build`
   - `./scripts/orchestration-hooks/quality-gates`
   - `./run.sh scripts/decky verify-change dev --explain`
   - `scripts/orchestration/check-review-notes-not-deleted`
   - Record exact file/test counts and command results. Every command must exit
     successfully, generated bundle changes must be committed, and the tree
     must be clean.

3. Validate the real startup race on the available Steam Deck.
   - Run `./run.sh scripts/decky doctor --deck` and
     `./run.sh scripts/decky verify-change dev --device --explain`. Do not use
     `--allow-launch`.
   - Use the committed tunnel and CDP tools. Put the Big Picture surface on
     `/library/home` with Space Marine shortcut `2155012430` present, then call
     `SteamClient.Browser.RestartJSContext()` from SharedJSContext. This is the
     validated full JavaScript-context restart. Do not use CDP `Page.reload` as
     the behavior oracle because a direct page reload does not re-inject Decky
     Loader on this installed runtime.
   - Wait for `cdp.py wait-ready`, then do not navigate, change focus, open game
     details, switch tabs, or publish a manual compatibility revision. Within
     the 30-second retry window, prove the mounted Home grid's current
     `cellRenderer` is the plugin wrapper and Space Marine's existing card gains
     one plugin compatibility fiber key and one yellow Playable badge while its
     overview remains packed `10`, category `2`, and a native shortcut.
   - Capture a timestamped PNG and machine-readable probe below
     `/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery/`.
     Recheck after at least two minutes without navigation and prove the same
     wrapper and badge remain.
   - Then open the non-Steam grid and prove Space Marine still has one badge,
     unresolved Automatic shortcut `3276984150` has none, and official Steam
     cards retain native output without plugin compatibility keys.
   - Run `./run.sh scripts/deck/verify/run_all.sh --no-launch` and
     `./run.sh scripts/decky capture`. Close the dedicated tunnel and confirm
     `scripts/deck/tunnel.sh status` reports `tunnel: down`.

No verification is deferred. A passing unit harness without the post-restart
Home screenshot and machine-readable card evidence is not sufficient.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished retry-mounted-compatibility-badge-discovery
```

This writes:

```text
/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer retry-mounted-compatibility-badge-discovery`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/retry-mounted-compatibility-badge-discovery-review-*.md
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
   scripts/orchestration/clear-finished retry-mounted-compatibility-badge-discovery
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
   git add docs/review/retry-mounted-compatibility-badge-discovery-review-*.md
   git commit -m "docs(review): record retry-mounted-compatibility-badge-discovery review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished retry-mounted-compatibility-badge-discovery
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer retry-mounted-compatibility-badge-discovery` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed retry-mounted-compatibility-badge-discovery
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize retry-mounted-compatibility-badge-discovery
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery_finalized
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
scripts/orchestration/finalize retry-mounted-compatibility-badge-discovery
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery_finished
/tmp/Decky-Metadata/retry-mounted-compatibility-badge-discovery_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
