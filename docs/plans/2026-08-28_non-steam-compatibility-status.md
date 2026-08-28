# Plan: Add Non-Steam Compatibility Status Overrides (non-steam-compatibility-status)

## Context

Issue #4 asks for a per-game control that changes the Steam Deck compatibility
status shown for non-Steam shortcuts. Users access the control through the
existing `Decky metadata...` context-menu entry; the metadata editor presents
it as a dropdown with Automatic, Verified, Playable, Unsupported, and Unknown.
Automatic uses the Valve-resolved category already fetched for a matched Steam
app; ProtonDB is explicitly
deferred. This feature is for non-Steam shortcuts only. Do not expose it for or
mutate official Steam games.

The frontend already persists fetched `deck_compat_category` metadata and
`applyMetadata()` writes `steam_hw_compat_category_packed`. The new user choice
must remain separate from that provider-derived value so refreshes cannot
overwrite it. Live Deck probing also established two constraints: an in-place
packed-field write does not rerender an already-mounted compatibility surface,
and replacing a shortcut in `appStore.m_mapApps` removes its enriched Game Info
until a route remount. Do not use app-store object replacement as a refresh
mechanism.

**Slug used throughout this plan:** `non-steam-compatibility-status`

---

## Orchestration Contract

**Slug:** `non-steam-compatibility-status`

**Plan file:**

```text
docs/plans/2026-08-28_non-steam-compatibility-status.md
```

**Implementation branch:**

```text
feat/non-steam-compatibility-status
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/non-steam-compatibility-status_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/non-steam-compatibility-status_finalized
```

**Review notes:**

```text
docs/review/non-steam-compatibility-status-review-*.md
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
git checkout -b feat/non-steam-compatibility-status
```

Commit this plan first:

```bash
git add docs/plans/2026-08-28_non-steam-compatibility-status.md
git commit -m "docs(plan): add non-steam-compatibility-status implementation plan"
```

---

## Implementation Tasks

### 1. Add an explicit persisted override

- Add a shared category type for the Steam values `0 | 1 | 2 | 3`, representing
  Unknown, Unsupported, Playable, and Verified.
- Extend `MetadataData` and the Python `MetadataRecord` with a nullable
  `deck_compat_override`. `null` or an absent key means Automatic; numeric `0`
  is a deliberate Unknown override and must not be treated as false.
- Sanitize the override to `0..3` or `None`.
- Preserve an existing override through every fetched-metadata merge,
  enrichment, scan, Steam App ID change, and manual metadata save regardless of
  whether a positive Steam App ID is pinned. Metadata providers must never
  populate the override.
- Ensure a shortcut without an existing metadata record can save an override by
  creating the normal sanitized metadata shell for that App ID. Reuse the
  existing metadata RPC and cache instead of adding a parallel settings store.

### 2. Apply effective compatibility state correctly

- Define effective compatibility as:
  `deck_compat_override` when it is numeric, otherwise fetched
  `deck_compat_category`, otherwise the shortcut's original packed category.
- Continue to guard all mutation with `isNonSteamApp`. Do not broaden the
  context-menu or Steam-patch eligibility to official games.
- Update `applyMetadata()` to apply all categories `0..3`. Preserve packed bits
  outside the compatibility low nibble. Keep Steam's existing low-nibble mirror
  behavior for categories written by the plugin because the user accepted the
  corresponding collection/filter effects.
- Before the first plugin compatibility mutation for an App ID, capture its
  original low nibble. Restore that nibble, while preserving unrelated higher
  bits, when no fetched or manual category remains, when metadata is removed or
  cleared, and when the plugin dismounts.
- Make cache refresh handle records whose override/category was removed; stale
  compatibility bits must not survive a backend refresh.
- Keep baseline capture and restoration bounded to App IDs the plugin actually
  mutates. Remove restored entries from the baseline map.

### 3. Integrate the selector into the metadata editor

- Keep one existing `Decky metadata...` entry in the per-game context menu.
  Remove the separate `Compatibility status...` entry and its modal.
- Add a `Compatibility status` section to the metadata editor page opened by
  `Decky metadata...`. Use Decky's native `DropdownItem` control.
- The dropdown must show five choices in this order: Automatic, Verified,
  Playable, Unsupported, Unknown.
- Show the saved manual choice as selected. For Automatic, include the currently
  resolved Valve status when one exists so the result is not ambiguous.
- Treat the dropdown as part of the editor form. Changing it updates
  `deck_compat_override` in form state; the editor's existing Save action
  persists the complete record, updates `metadataCache`, applies compatibility,
  requests the safe SteamUI refresh, and uses the existing save toast/error
  behavior.
- Preserve numeric `0` as explicit Unknown. Automatic writes `null`.
- Preserve the current menu's stale-App-ID protections. Reused menu bodies must
  still open the metadata editor for the game whose menu is currently open.
- Use native Decky dropdown/focus behavior. Do not add a modal, raw DOM focus,
  timers, or a second context-menu entry.

### 4. Refresh affected SteamUI surfaces safely

- Make a saved choice visible on the library poster and Game Info surface
  without restarting Steam.
- Do not replace or delete entries in `appStore.m_mapApps`; live validation
  proved that replacement drops matched-shortcut enriched details.
- Prefer an existing route/render boundary or a narrow plugin-owned revision
  signal. Avoid separate broad SteamUI render patches when one shared refresh
  mechanism can update both surfaces.
- Prove both return paths: save from a Library context-menu editor and return to
  the updated poster; then open the editor from Game Info, save, and return to
  an updated Game Info surface without replacing the shortcut overview or
  losing enriched details.
- Automatic, explicit Unknown, metadata removal, and plugin dismount must use
  the same refresh path as the positive categories.

### 5. Tests and project artifacts

- Add backend tests for override sanitization, `0` handling, persistence, and
  preservation through pinned and unpinned metadata merges/enrichment.
- Add frontend tests for effective-category precedence, all values `0..3`,
  higher-bit preservation, original-nibble restoration, metadata removal/cache
  refresh, and dismount cleanup.
- Keep context-menu tests focused on one deduplicated `Decky metadata...` entry,
  non-Steam eligibility, official-game exclusion, and current App ID selection.
- Add focused editor/dropdown tests for option order, Automatic, explicit
  Unknown, saved selection, failed-save rollback, and refresh after save.
- Test observable behavior and user-visible outcomes. Do not test source text or
  incidental component internals.
- Regenerate and commit `dist/index.js`.
- Add an `Unreleased` changelog entry and update README usage for the new
  context-menu selector. State that Automatic uses Valve's matched status and
  that ProtonDB is not a source.
- Record the required implementation summary under
  `docs/agent_conversations/`.

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

Run the project quality gates, then use the committed Deck tooling for the live
check because this changes `src/steam/` and a controller-driven context menu:

```bash
scripts/decky doctor --deck
scripts/decky verify-change dev --device --explain
```

Do not add `--allow-launch`; this feature does not require launching a game.
Use the actual context menu on the verified matched non-Steam shortcut fixture
and the committed CDP input/focus probes. Verify all of the following:

1. Official Steam games do not receive a Decky Metadata editor entry or any
   compatibility mutation from this feature.
2. The non-Steam shortcut context menu contains exactly one
   `Decky metadata...` entry after repeated opens and alternating between games;
   there is no separate compatibility entry.
3. The metadata editor contains one native Compatibility status dropdown with
   correct initial focus, D-pad option order, selected-state feedback, and no
   clipped controls.
4. Automatic shows and applies the fetched Valve category after Save.
5. Verified, Playable, Unsupported, and Unknown each save and change the poster
   and Game Info status for the same shortcut.
6. Saving from the editor and returning to Game Info updates the status without
   restarting Steam or losing the enriched matched-game details.
7. Returning to Automatic restores the fetched category; removing metadata and
   reloading/dismounting the plugin do not leave stale packed bits.
8. The shortcut remains launchable and the rich details/quick-links page remains
   present. Run the no-launch applicable smoke checks and record any check that
   the dispatcher explicitly defers because launch authorization was not given.

Capture screenshots and focused JSON evidence only below
`/tmp/Decky-Metadata/`. Record exact commands, results, and evidence paths in the
session log. On-device verification is required for round completion; it is not
deferred.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished non-steam-compatibility-status
```

This writes:

```text
/tmp/Decky-Metadata/non-steam-compatibility-status_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer non-steam-compatibility-status`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/non-steam-compatibility-status-review-*.md
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
   scripts/orchestration/clear-finished non-steam-compatibility-status
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
   git add docs/review/non-steam-compatibility-status-review-*.md
   git commit -m "docs(review): record non-steam-compatibility-status review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished non-steam-compatibility-status
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer non-steam-compatibility-status` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed non-steam-compatibility-status
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize non-steam-compatibility-status
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/non-steam-compatibility-status_finalized
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
scripts/orchestration/finalize non-steam-compatibility-status
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/non-steam-compatibility-status_finished
/tmp/Decky-Metadata/non-steam-compatibility-status_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
