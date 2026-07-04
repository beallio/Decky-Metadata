# Plan: Decompose src/components.tsx into focused modules (components-tsx-decomposition)

## Context

`src/components.tsx` is **1,020 lines** and holds two screens (`Content` ~357,
`MetadataPage` ~687) plus shared hooks, inline styles, parsing helpers, and mutation flows.

**Intended outcome:** split into `ContentPanel.tsx`, `MetadataPage.tsx`, `metadataForm.ts`,
`useNonSteamGames.ts`, and `styles.ts`. **Behavior-preserving**, straight decomposition.

**⚠ Test coupling:** `tests/test_qam_controller_scroll.py` pins `components.tsx` by source text and
**will break** on a split. Coordinate with `behavioral-frontend-tests` (run that first, or update
that test here).

### Relevant files
`src/components.tsx` → new `src/*.tsx/.ts`, `src/index.tsx`/`contextMenuPatch.tsx` (imports),
`tests/test_qam_controller_scroll.py`, `dist/` rebuilt.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `components-tsx-decomposition`

---

## Orchestration Contract

**Slug:** `components-tsx-decomposition`

**Plan file:**

```text
docs/plans/2026-07-03_components-tsx-decomposition.md
```

**Implementation branch:**

```text
feat/components-tsx-decomposition
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/components-tsx-decomposition_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/components-tsx-decomposition_finalized
```

**Review notes:**

```text
docs/review/components-tsx-decomposition-review-*.md
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
git checkout -b feat/components-tsx-decomposition
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_components-tsx-decomposition.md
git commit -m "docs(plan): add components-tsx-decomposition implementation plan"
```

---

## Implementation Tasks

1. Extract the QAM panel (`Content`) and editor (`MetadataPage`) into their own files;
   move shared inline styles to `styles.ts`, form parse/serialize helpers to `metadataForm.ts`,
   and the games/metadata loading hook to `useNonSteamGames.ts`.
2. Preserve exports consumed by `src/index.tsx` and `src/contextMenuPatch.tsx` (routes, page
   component). No behavior/logic change.
3. Update or replace `tests/test_qam_controller_scroll.py` so it no longer greps a specific file's
   text (see `behavioral-frontend-tests`); if that plan already ran, just fix the path/anchors.
4. `tsc --noEmit` + `npm run build` green; rebuild `dist/`; session log.

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

```bash
./run.sh npx tsc --noEmit
./run.sh npm run build
./run.sh uv run --with pytest -- pytest -q     # updated scroll test passes
git status --short
```
- `components.tsx` is either gone or well under 1k lines; new files are focused.
- Import surface used by `index.tsx`/`contextMenuPatch.tsx` unchanged.

### Deferred — on-device
QAM panel and metadata editor render and behave identically (scan buttons, toggles, save/remove,
controller scroll).


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished components-tsx-decomposition
```

This writes:

```text
/tmp/Decky-Metadata/components-tsx-decomposition_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer components-tsx-decomposition`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/components-tsx-decomposition-review-*.md
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
   scripts/orchestration/clear-finished components-tsx-decomposition
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
   git add docs/review/components-tsx-decomposition-review-*.md
   git commit -m "docs(review): record components-tsx-decomposition review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished components-tsx-decomposition
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer components-tsx-decomposition` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed components-tsx-decomposition
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize components-tsx-decomposition
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/components-tsx-decomposition_finalized
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
scripts/orchestration/finalize components-tsx-decomposition
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/components-tsx-decomposition_finished
/tmp/Decky-Metadata/components-tsx-decomposition_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
