# Plan: Polish Editor Toggle Alignment, Toast Icon, and Search Spacing (editor-polish-toggle-toast-search)

## Context

Follow-up polish on the merged `refine-metadata-editor-layout` work (dev commit
`5eaadab`). Three user-reported visual defects remain:

1. **Category toggles are not vertically centered in their row box.** The scoped
   category-row rule in `src/metadataEditorStyles.ts` forces every native
   `ToggleField` root to `min-height: 36px` with `padding: 4px 12px`, but does not
   re-center the row's flex contents. The label and switch sit toward the top of the
   36 px box instead of centered, and the switch is not vertically aligned with its
   label. The fix is presentational only: center the row's contents vertically.

2. **Toast notification icon is too small and not vertically centered.** In
   `src/toast.tsx`, the `logo` passed to `toaster.toast(...)` is a bare
   `<FaCheckCircle>` / `<FaExclamationTriangle>` with only a `color` — no size and no
   vertical centering, so Decky renders a small icon aligned to the top of the toast
   logo area. The icon should be visibly larger and vertically centered in the toast.
   `notify()` is the shared toast helper used across the plugin (ContentPanel,
   `src/steam/install.ts`, MetadataPage), so this change is intentionally global to
   every plugin toast, not editor-only. Preserve the existing kind→icon→color mapping,
   title/body text, and 3000 ms duration exactly.

3. **The IGN search input row and the first search result need more top spacing.**
   In `src/MetadataPage.tsx`, the `Search IGN metadata` section renders the query
   input/Search button row (`editorSearchRowStyle`) flush to the panel title, and the
   results list (including the `No results yet.` / `Searching...` placeholder) sits
   flush under the input row. Add clear vertical breathing room above the search input
   row and above the first result/placeholder, using editor-scoped style values rather
   than ad-hoc inline magic numbers.

Intended outcome: category switches read as vertically centered dense rows; every
toast shows a larger, vertically centered status icon; and the IGN search input and
first result are visually separated from what precedes them. No behavior, handler,
state, backend, parsing, navigation, or toast-timing change.

Primary files: `src/metadataEditorStyles.ts`, `src/metadataEditorStyles.test.ts`,
`src/MetadataPage.tsx`, and `src/toast.tsx`. Rebuild and commit the `dist/` artifact
via the existing build. Do not touch `main.py`, `src/steam/`, QAM/`ContentPanel`
layout, or backend calls.

**Slug used throughout this plan:** `editor-polish-toggle-toast-search`

---

## Orchestration Contract

**Slug:** `editor-polish-toggle-toast-search`

**Plan file:**

```text
docs/plans/2026-07-16_editor-polish-toggle-toast-search.md
```

**Implementation branch:**

```text
feat/editor-polish-toggle-toast-search
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/editor-polish-toggle-toast-search_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/editor-polish-toggle-toast-search_finalized
```

**Review notes:**

```text
docs/review/editor-polish-toggle-toast-search-review-*.md
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
git checkout -b feat/editor-polish-toggle-toast-search
```

Commit this plan first:

```bash
git add docs/plans/2026-07-16_editor-polish-toggle-toast-search.md
git commit -m "docs(plan): add editor-polish-toggle-toast-search implementation plan"
```

---

## Implementation Tasks

1. **Baseline and preserve behavior.**
   - From the repository root, run `./run.sh scripts/decky doctor` and re-read
     `src/metadataEditorStyles.ts`, `src/metadataEditorStyles.test.ts`,
     `src/MetadataPage.tsx`, and `src/toast.tsx` before editing. Capture any
     pre-existing gate failure instead of retrying blindly.
   - Do not change any event handler, state transition, disabled condition, toast
     kind/text/duration, parsing call, result rendering, or navigation target. This
     is a presentation-only round.

2. **Center the native category toggle rows (TDD).**
   - In `src/metadataEditorStyles.ts`, extend the editor-scoped category-row rule
     (`.decky-metadata-editor__category-grid > div`) so the row's flex contents are
     vertically centered within the 36 px box: set `display: flex` and
     `align-items: center` (keep the existing `min-height`, `padding`, `margin`, and
     `box-sizing`). Do not target generated Steam class names and do not replace
     `ToggleField`. Keep the row a direct-child selector so only category toggles are
     affected.
   - First extend `src/metadataEditorStyles.test.ts` to assert the scoped category
     CSS now centers the row (e.g. the category-row block contains
     `align-items: center`), watch it fail, then implement until green. Do not weaken
     the existing category assertions.

3. **Enlarge and vertically center the toast icon.**
   - In `src/toast.tsx`, render each `logo` icon at a visibly larger size (use a
     size of about 28 px via the react-icons `size` prop) and vertically center it —
     wrap the icon in a container that fills the toast logo area height and centers
     its child (e.g. `display: flex; align-items: center; justify-content: center;
     height: 100%`), or apply an equivalent centering style directly to the icon.
     Keep the exact success/warning/error → icon → `colors.*` mapping, the
     `${TITLE} · ${heading}` title, the body, and `duration: DURATION`.
   - There is no existing `toast.test.*`. If the icon size/kind mapping is cleanly
     unit-testable without importing the Decky runtime, add a focused test;
     otherwise record in the session log that the toast change is verified on-device
     because `@decky/api`'s `toaster` is runtime-only, and do not fabricate a test
     that imports the live toaster.

4. **Add search input and first-result top spacing.**
   - In `src/metadataEditorStyles.ts`, add two narrowly-scoped exported style
     constants — one applied to the IGN search input/button row wrapper and one
     applied to the results/placeholder stack — that add clear top spacing
     (search input row: about 12 px above; results stack: about 12 px above the
     first result/placeholder). Prefer composing onto the existing
     `editorSearchRowStyle` (e.g. add `marginTop`) or exporting a dedicated wrapper
     style rather than adding inline magic numbers in the component.
   - In `src/MetadataPage.tsx`, apply those styles to the existing search input row
     `div` and to the existing results stack `div` (the one currently using
     `rowStackStyle` that holds the `Searching...` / `No results yet.` placeholders
     and the mapped results). Preserve the existing `busy` placeholder, empty-state
     text, result `FocusableButton` markup, `applyResult` handler, and focus order.
   - Extend `src/metadataEditorStyles.test.ts` to lock the new spacing values.

5. **Build, document, and keep scope tight.**
   - Run the focused Vitest during the red/green cycle, then the full orchestration
     quality gate. The build must regenerate and commit `dist/index.js` and
     `dist/index.js.map`.
   - Add `docs/agent_conversations/2026-07-16_editor-polish-toggle-toast-search.md`
     with the objective, files changed, design decisions (native-control/focus
     preservation, global toast scope), test/build results, and live Deck
     verification results.
   - Do not update README (no behavior/usage change). Do not touch `main.py`,
     `src/steam/`, QAM/`ContentPanel`, backend calls, or the `/tmp` prototype.

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

1. During TDD, run the focused style-contract test and record the initial expected
   failure followed by the passing result:

   ```bash
   ./run.sh npx vitest run src/metadataEditorStyles.test.ts
   ```

2. Run the repository quality gate and orchestration safety checks:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   git status --short
   ```

3. Live Deck verification is required for this Gaming Mode change. With the Deck
   reachable and deployment authorized, deploy through the committed workflow and at
   1280x800 confirm:
   - each category toggle's label and switch are vertically centered within the
     dense 36 px row, with no clipping and the two columns still aligned;
   - a triggered toast (e.g. after Save, or a warning/error path) shows a clearly
     larger status icon that is vertically centered in the toast, with the correct
     success/warning/error color and unchanged title/body/duration;
   - the IGN search input row has visible space above it (separated from the panel
     title) and the first result/placeholder has visible space above it (separated
     from the input row);
   - controller focus, traversal order, and all editor actions still behave exactly
     as before this round.

4. Exercise one success path that raises a toast (Save) and one warning/error toast
   path if readily reachable, to confirm the icon change renders for each kind.

If the Deck is unavailable or deployment is not authorized, do not claim the visual
work verified: record the exact deferred checks in the session log and leave them as
an explicit review blocker. Toast-icon size/centering and toggle centering may not be
reported verified on Vitest alone.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished editor-polish-toggle-toast-search
```

This writes:

```text
/tmp/Decky-Metadata/editor-polish-toggle-toast-search_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer editor-polish-toggle-toast-search`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/editor-polish-toggle-toast-search-review-*.md
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
   scripts/orchestration/clear-finished editor-polish-toggle-toast-search
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
   git add docs/review/editor-polish-toggle-toast-search-review-*.md
   git commit -m "docs(review): record editor-polish-toggle-toast-search review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished editor-polish-toggle-toast-search
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer editor-polish-toggle-toast-search` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed editor-polish-toggle-toast-search
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize editor-polish-toggle-toast-search
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/editor-polish-toggle-toast-search_finalized
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
scripts/orchestration/finalize editor-polish-toggle-toast-search
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/editor-polish-toggle-toast-search_finished
/tmp/Decky-Metadata/editor-polish-toggle-toast-search_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
